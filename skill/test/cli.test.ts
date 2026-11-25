import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { quote } from "shell-quote";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { scanSkillFiles } from "../../packages/core/src/index.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { requireDeveloperMode } from "../src/baw.js";
import * as cli from "../src/index.js";

describe("开发者模式有效期", () => {
  const now = Date.UTC(2026, 11, 1, 13, 11, 9);
  const requireWithExpiry = (expiresAt: string | number | null) => requireDeveloperMode(
    async () => ({ success: true, data: { devMode: { enabled: true, expiresAt } } }), now,
  );

  it.each([
    ["未过期的 ISO 字符串", "2026-12-01T21:11:10+08:00"],
    ["未过期的秒级时间戳", now / 1000 + 1],
    ["无有效期", null],
  ])("%s允许继续", async (_label, expiresAt) => {
    await expect(requireWithExpiry(expiresAt)).resolves.toBeUndefined();
  });

  it.each([
    ["已过期的 ISO 字符串", "2026-12-01T21:11:08+08:00"],
    ["已过期的秒级时间戳", now / 1000 - 1],
    ["无法解析的时间", "无效日期"],
  ])("%s提示在 App 内开启", async (_label, expiresAt) => {
    await expect(requireWithExpiry(expiresAt)).rejects.toThrow(/开发者模式.*只能在币安 App 内开启.*最低/u);
  });
});

const bundlePath = fileURLToPath(new URL("../bin/shield.mjs", import.meta.url));

const registry = "0x0000000000000000000000000000000000000010";
const account = "0x0000000000000000000000000000000000000020";
const txHash = "0x" + "aa".repeat(32);
const config = {
  registryAddress: registry, rpcUrl: "http://localhost:8545", deploymentBlock: "1", relayerUrl: "http://localhost:3000",
};

describe("shield 命令行", () => {
  let root: string;
  let output: string[];
  let chain: ReturnType<typeof mockChain>;
  let baw: ReturnType<typeof mockBaw>;

  function mockChain() {
    return {
      getChainId: vi.fn(async () => 56),
      readContract: vi.fn(async ({ functionName }: { functionName: string }) =>
        functionName === "signalsOf" ? [7n, 0n, 0n, 0n, 0n, 2] : 0n),
      estimateGas: vi.fn(async () => 100_000n),
    };
  }

  function mockBaw() {
    return vi.fn(async (args: string[]) => {
      const responses: Record<string, unknown> = {
        "wallet status": { status: "CONNECTED" },
        "wallet address": { addresses: [{ binanceChainId: "56", address: account }] },
        "wallet agent-id": { claimed: true },
        "wallet settings": { devMode: { enabled: true } },
        "contract-call preview": { requestId: "join-123", parsedTx: {}, risks: {} },
        "contract-call execute": { status: "BROADCASTED", txHash },
      };
      return { success: true, data: responses[args.slice(0, 2).join(" ")] };
    });
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "shield-test-"));
    output = [];
    chain = mockChain();
    baw = mockBaw();
  });
  afterEach(async () => rm(root, { recursive: true, force: true }));

  async function run(args: string[], overrides: Partial<Parameters<typeof cli.runCli>[1]> = {}) {
    await cli.runCli(args, {
      dataDir: root, cwd: root, env: {}, client: chain as never, execBaw: baw,
      write: (line) => output.push(line), askPassphrase: async () => "一组测试口令", ...overrides,
    });
  }

  const last = () => JSON.parse(output.at(-1)!);

  it("在用户单独提交预览编号时才执行加入交易", async () => {
    await writeFile(join(root, "config.json"), JSON.stringify(config));
    await expect(run(["join", "--execute", "join-123"])).rejects.toThrow(/预览/u);
    await run(["join"]);
    expect(last()).toMatchObject({
      contract: registry, function: "join", args: [expect.stringMatching(/^\d+$/u)],
      estimatedGas: "100000", requestId: "join-123", risk: {},
    });
    expect(baw.mock.calls.map(([args]) => args.slice(0, 2))).toEqual([
      ["wallet", "status"], ["wallet", "address"], ["wallet", "agent-id"], ["wallet", "settings"],
      ["contract-call", "preview"],
    ]);
    expect(baw.mock.calls.at(-1)?.[0]).toEqual([
      "contract-call", "preview", "--binanceChainId", "56", "--from", account, "--to", registry,
      "--value", "0", "--inputData", expect.stringMatching(/^0x[0-9a-f]{72}$/u), "--json",
    ]);
    await run(["join", "--execute", "join-123"]);
    expect(baw.mock.calls.at(-1)?.[0]).toEqual(["contract-call", "execute", "--requestId", "join-123", "--json"]);
    expect(last()).toMatchObject({ txHash, explorerUrl: "https://bscscan.com/tx/" + txHash });
  });

  it.each([
    ["wallet agent-id", { claimed: false }, 0n, /钱包 → 首页横幅 → Agent ID/u],
    ["wallet settings", { devMode: { enabled: false } }, 0n, /只能在.*App.*最低/u],
    ["", {}, 1n, /已加入/u],
  ])("前置条件不满足时不发起预览（%s）", async (command, data, commitment, message) => {
    await writeFile(join(root, "config.json"), JSON.stringify(config));
    const fallback = mockBaw();
    baw.mockImplementation((args) => command === args.slice(0, 2).join(" ")
      ? Promise.resolve({ success: true, data }) : fallback(args));
    chain.readContract.mockResolvedValue(commitment);
    if (commitment) {
      await run(["join"]);
      expect(output.join(" ")).toMatch(message);
    } else {
      await expect(run(["join"])).rejects.toThrow(message);
    }
    expect(baw.mock.calls.flat().join(" ")).not.toContain("preview");
    await expect(stat(join(root, "identity.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("以 0600 保存身份并从加密备份恢复同一份身份", async () => {
    await writeFile(join(root, "config.json"), JSON.stringify(config));
    await run(["join"]);
    const identityPath = join(root, "identity.json");
    const backupPath = join(root, "backup.json");
    const saved = JSON.parse(await readFile(identityPath, "utf8"));
    expect((await stat(identityPath)).mode & 0o777).toBe(0o600);
    await run(["identity", "export", backupPath]);
    expect(await readFile(backupPath, "utf8")).not.toContain(saved.secret);
    expect(output.join(" ")).not.toContain(saved.secret);
    await unlink(identityPath);
    await expect(run(["identity", "import", backupPath], { askPassphrase: async () => "别的口令" }))
      .rejects.toThrow(/解密/u);
    await run(["identity", "import", backupPath]);
    expect(JSON.parse(await readFile(identityPath, "utf8"))).toEqual(saved);
    expect((await stat(identityPath)).mode & 0o777).toBe(0o600);
  });

  it("前台验证官方登录，仅记录本机时间", async () => {
    const url = "https://app.binance.com/uni-qr/AbCd1234";
    const pairing = "012345";
    const now = 1_800_000_000_000;
    await run(["check", "https://web3.binance.com/agent-login?_ul=sample", "--json", "--offline"], { now: () => now });
    expect(last()).toMatchObject({ level: "high", evidence: expect.arrayContaining([
      expect.objectContaining({ ruleId: "auth.no-recent-local-login" }),
    ]) });
    baw.mockImplementation(async (args) => {
      if (args[1] === "signin") return { success: true, data: { urlForWeb: url, pairingCode: pairing, qrCodeId: "test-id" } };
      expect(output.slice(-2)).toEqual([url, pairing]);
      expect(args).toEqual(["auth", "verify", "--qrCodeId", "test-id", "--json"]);
      expect(JSON.parse(await readFile(join(root, "logins.json"), "utf8"))).toEqual([now]);
      return { success: true, data: { status: "SUCCESS" } };
    });
    await run(["login"], { now: () => now });
    await run(["check", "https://web3.binance.com/agent-login?_ul=sample", "--json", "--offline"], { now: () => now });
    expect(last().level).toBe("suspicious");
  });

  it("使用配置文件、环境变量、社区信号与本地情报生成体检结论", async () => {
    await writeFile(join(root, "config.json"), JSON.stringify(config));
    await mkdir(join(root, "intel"));
    await writeFile(join(root, "intel", "scamsniffer-domains.json"), JSON.stringify({
      observedAt: new Date().toISOString(), data: ["suspect.example"],
    }));
    await run(["check", "https://suspect.example/", "--json"], {
      env: { AGENTSHIELD_REGISTRY_ADDRESS: account },
    });
    expect(chain.readContract).toHaveBeenCalledWith(expect.objectContaining({ address: account, functionName: "signalsOf" }));
    expect(last().evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ explanation: expect.stringContaining("社区信号：7 位真人确认（社区确认）") }),
      expect.objectContaining({ explanation: expect.stringContaining("ScamSniffer") }),
    ]));
  });

  it("仅因社区确认得到高风险的域名不请求匿名中继", async () => {
    await writeFile(join(root, "config.json"), JSON.stringify(config));
    await run(["join"]);
    await run(["join", "--execute", "join-123"]);
    const fetch = vi.fn();
    await run(["check", "https://neutral.example", "--json"], { fetch });
    expect(last()).toMatchObject({ level: "high", communitySignals: { queried: true } });
    expect(last().evidence.filter(({ level }: { level: string }) => level === "high"))
      .toEqual([expect.objectContaining({ ruleId: "external.community" })]);
    expect(fetch).not.toHaveBeenCalled();
    expect(last()).not.toHaveProperty("autoReport");
  });

  it("输出 LLM 审查包且合并时保留静态红线和离线说明", async () => {
    const path = fileURLToPath(new URL("../../packages/core/test/fixtures/skills/r6", import.meta.url));
    await run(["scan", path, "--review-packet", "--json", "--offline"]);
    expect(last()).toMatchObject({ level: "suspicious", reviewPacket: expect.stringContaining("待审查数据"), redlines: { R6: true } });
    await run(["scan", path, "--merge-llm", '{"level":"none"}', "--json", "--offline"]);
    expect(last()).toMatchObject({ level: "suspicious", redlines: { R6: true }, communitySignals: { queried: false } });
  });

  it.each([
    [2, "社区确认", "high", "高风险"],
    [1, "待验证", "suspicious", "可疑"],
  ])("社区状态码 %i 的扫描文字和 JSON 输出等级一致", async (status, label, level, levelLabel) => {
    await writeFile(join(root, "config.json"), JSON.stringify(config));
    const path = join(root, "skill");
    await mkdir(path);
    await writeFile(join(path, "SKILL.md"), "读取行情");
    chain.readContract.mockResolvedValue([7n, 0n, 0n, 0n, 0n, status]);

    await run(["scan", path, "--json"]);
    expect(last()).toMatchObject({ level, levelLabel, evidence: [] });
    expect(last()).not.toHaveProperty("autoReport");
    await run(["scan", path, "--merge-llm", '{"level":"none"}', "--json"]);
    expect(last()).toMatchObject({ level, levelLabel, evidence: [] });
    expect(last()).not.toHaveProperty("autoReport");
    await run(["scan", path]);
    expect(output.at(-1)?.split("\n")[0]).toBe(levelLabel);
    expect(output.at(-1)).toContain(`7 位真人确认（${label}）`);
  });

  it("只对升级后的高风险结论进入匿名上报流程", async () => {
    const path = fileURLToPath(new URL("../../packages/core/test/fixtures/skills/r6", import.meta.url));
    // 链上没有该 Skill 的社区信号
    chain.readContract.mockImplementation(async ({ functionName }: { functionName: string }) =>
      functionName === "signalsOf" ? [0n, 0n, 0n, 0n, 0n, 0] : 0n);
    await run(["scan", path, "--json"]);
    expect(last()).toMatchObject({ level: "suspicious", redlines: { R6: true } });
    expect(last()).not.toHaveProperty("autoReport");
    await run(["scan", path, "--merge-llm", '{"level":"high"}', "--json"]);
    expect(last()).toMatchObject({ level: "high", redlines: { R6: true }, autoReport: { message: expect.stringContaining("加入 AgentShield") } });
  });

  it("安装项目级 hook，并在高风险的 skills add 和 git clone 前请求确认", async () => {
    await mkdir(join(root, ".claude"));
    const settings = join(root, ".claude", "settings.json");
    await writeFile(settings, '{"permissions":{"allow":["Read"]},"hooks":{"Stop":[],"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"shield hook run"}]}]}}');
    await run(["hook", "install"]);
    await run(["hook", "install"]);
    expect(JSON.parse(await readFile(settings, "utf8"))).toEqual({
      permissions: { allow: ["Read"] },
      hooks: { Stop: [], PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: quote(["node", bundlePath, "hook", "run"]) }] }] },
    });
    const fixture = fileURLToPath(new URL("../../packages/core/test/fixtures/skills/code", import.meta.url));
    const archive = join(root, "skill.tar.gz");
    await promisify(execFile)("tar", ["-czf", archive, "-C", fixture, "."]);
    const fetchArchive = vi.fn(async (url: URL) => {
      const archivePath = url.pathname.endsWith("/main") ? join(root, "nested.tar.gz") : archive;
      return new Uint8Array(await readFile(archivePath));
    });
    const nested = join(root, "tree");
    await mkdir(join(nested, "repo", "demo"), { recursive: true });
    await writeFile(join(nested, "repo", "README.md"), "示例仓库");
    await writeFile(join(nested, "repo", "demo", "SKILL.md"), "测试 Skill");
    await writeFile(join(nested, "repo", "demo", "send-key.js"), await readFile(join(fixture, "send-key.js")));
    await promisify(execFile)("tar", ["-czf", join(root, "nested.tar.gz"), "-C", nested, "repo"]);
    for (const command of [
      "npx -y skills@latest add 'team/example'",
      "npx skills add https://github.com/team/example/tree/main/demo",
      "git -C /tmp clone --depth 1 --reference /tmp/mirror https://github.com/team/example.git",
    ]) {
      await run(["hook", "run"], { read: async () => JSON.stringify({
        hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command }, cwd: root,
      }), download: fetchArchive });
      expect(last()).toMatchObject({ hookSpecificOutput: {
        hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: expect.stringContaining("高风险"),
      } });
    }
    expect(fetchArchive).toHaveBeenCalledTimes(3);
  });

  it("公开投票使用本机身份对应的登记地址", async () => {
    await writeFile(join(root, "config.json"), JSON.stringify(config));
    await run(["join"]);
    await expect(run(["vote", "--public", "domain", "expected.example", "danger"]))
      .rejects.toThrow(/当前钱包.*本机身份/u);
    await expect(run(["vote", "--public", "--execute", "join-123"])).rejects.toThrow(/预览/u);
    expect(baw.mock.calls.filter(([args]) => args[0] === "contract-call")).toHaveLength(1);
  });

  it("避免把本机身份纳入扫描或审查包", async () => {
    const dataDir = join(root, ".agentshield");
    await mkdir(dataDir);
    const secret = "只在本机的测试身份";
    await writeFile(join(dataDir, "identity.json"), JSON.stringify({ secret }));
    await expect(run(["scan", root, "--review-packet", "--json", "--offline"], { dataDir }))
      .rejects.toThrow(/身份/u);
    expect(output.join(" ")).not.toContain(secret);
  });

  it("只有误报票时不产生社区危险命中", async () => {
    await writeFile(join(root, "config.json"), JSON.stringify(config));
    chain.readContract.mockResolvedValue([0n, 1n, 0n, 0n, 0n, 0]);
    await run(["check", "https://neutral.example", "--json"]);
    expect(last()).toMatchObject({ level: "none", evidence: [], communitySignals: { queried: true } });
  });

  it("第三方链接跳转到真实授权时不向短链主机名投票", async () => {
    await writeFile(join(root, "config.json"), JSON.stringify(config));
    await run(["join"]);
    const fetch = vi.fn();
    await run(["check", "https://bit.ly/test", "--json"], {
      fetch, expandUrl: async () => new URL("https://web3.binance.com/agent-login?_ul=sample"),
    });
    expect(last()).toMatchObject({ level: "high", autoReport: { message: "未找到可上报的风险对象。" } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("未写配置时默认使用内置主网部署信息", async () => {
    const mainnet = await readFile(new URL("../../contracts/deployments/56.json", import.meta.url), "utf8")
      .then((text) => JSON.parse(text));
    await run(["status"]);
    expect(last()).toMatchObject({ network: "mainnet", localIdentity: false, registry: mainnet.registry });
  });

  it("从所选网络读取内置部署信息，允许文件和环境变量覆盖", async () => {
    const testnet = await readFile(new URL("../../contracts/deployments/97.json", import.meta.url), "utf8")
      .then((text) => JSON.parse(text));
    await writeFile(join(root, "config.json"), JSON.stringify({ network: "mainnet", rpcUrl: "http://localhost:8545" }));
    const env = { AGENTSHIELD_NETWORK: "testnet", AGENTSHIELD_RELAYER_URL: "http://localhost:3000" };
    expect(await loadConfig(root, env)).toMatchObject({
      network: "testnet", registryAddress: testnet.registry, deploymentBlock: testnet.deploymentBlock,
      agentIdAddress: testnet.agentId, rpcUrl: "http://localhost:8545", relayerUrl: "http://localhost:3000",
    });
    await run(["status"], { env });
    expect(last()).toMatchObject({ network: "testnet", registry: testnet.registry });
  });

  it("切换自动上报时保留其它配置", async () => {
    await writeFile(join(root, "config.json"), JSON.stringify(config));
    await run(["config", "auto-report", "off"]);
    expect(JSON.parse(await readFile(join(root, "config.json"), "utf8"))).toMatchObject({ ...config, autoReport: false });
    await run(["config", "auto-report", "on"]);
    expect(JSON.parse(await readFile(join(root, "config.json"), "utf8"))).toMatchObject({ autoReport: true });
  });

  it("扫描 SKILL.md 时零命中", async () => {
    const markdown = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");
    expect(await scanSkillFiles([{ path: "SKILL.md", content: markdown }])).toMatchObject({ level: "none", evidence: [] });
  });
});
