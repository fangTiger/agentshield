import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { domainId, isNullifierUsed, registryAbi, toContractProof, type ProvenVote } from "@agentshield/core/chain";
import {
  createPublicClient, createWalletClient, decodeFunctionData, http, parseAbi, type Address, type Hex,
} from "viem";
import { foundry } from "viem/chains";
import { expect, it } from "vitest";
import { runCli } from "../src/index.js";

const exec = promisify(execFile);
const contracts = fileURLToPath(new URL("../../contracts/", import.meta.url));
const verifierAbi = parseAbi([
  "function verifyProof(uint256 groupId, (uint256 merkleTreeDepth, uint256 merkleTreeRoot, uint256 nullifier, uint256 message, uint256 scope, uint256[8] points) proof) view returns (bool)",
]);
const agentIdAbi = parseAbi(["function mint(address holder)", "function balanceOf(address holder) view returns (uint256)"]);

it("在 Anvil 用部署脚本、模拟 Agent ID 和真实 Semaphore 验证加入及两类投票", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shield-anvil-"));
  const anvil = spawn("anvil", ["--host", "127.0.0.1", "--port", "0", "--accounts", "2"], {
    cwd: directory,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const exited = once(anvil, "close");
  try {
    let startup = "";
    for await (const chunk of anvil.stdout) {
      startup += chunk;
      if (/Listening on 127\.0\.0\.1:\d+/u.test(startup)) break;
    }
    const endpoint = startup.match(/Listening on (127\.0\.0\.1:\d+)/u)?.[1];
    if (!endpoint) throw new Error("Anvil 未返回本地 RPC 端口。");
    const rpcUrl = "http://" + endpoint;
    const publicClient = createPublicClient({ transport: http(rpcUrl), chain: foundry });
    const walletClient = createWalletClient({ transport: http(rpcUrl), chain: foundry });
    const [holder, relayAccount] = await walletClient.getAddresses();
    const foundryEnv = {
      ...process.env, FOUNDRY_OUT: join(directory, "out"), FOUNDRY_CACHE_PATH: join(directory, "cache"),
      FOUNDRY_BROADCAST: join(directory, "broadcast"),
    };
    const forge = (args: string[], env = foundryEnv) => exec("forge", args, { cwd: contracts, env, timeout: 60_000 });
    const deployFlags = ["--broadcast", "--unlocked", "--rpc-url", rpcUrl];
    const mock = await forge([
      "create", "test/AgentShieldRegistryTestBase.sol:MockAgentId", ...deployFlags, "--from", holder, "--json",
    ]);
    const agentId = JSON.parse(mock.stdout).deployedTo as Address;
    await publicClient.waitForTransactionReceipt({ hash: await walletClient.writeContract({
      address: agentId, account: holder, abi: agentIdAbi, functionName: "mint", args: [holder],
    }) });
    await forge(["script", "script/DeployAgentShield.s.sol:DeployAgentShield", ...deployFlags, "--slow", "--sender", holder], {
      ...foundryEnv, AGENT_ID_ADDRESS: agentId, AGENTSHIELD_SEEDER: holder,
    });
    const deployment = JSON.parse(await readFile(join(directory, "broadcast", "DeployAgentShield.s.sol", "31337", "run-latest.json"), "utf8"));
    const registry = deployment.transactions.find((tx: { contractName: string }) =>
      tx.contractName === "AgentShieldRegistry").contractAddress as Address;
    const deploymentReceipt = deployment.receipts.find((receipt: { contractAddress?: string }) =>
      receipt.contractAddress?.toLowerCase() === registry.toLowerCase());
    const deploymentBlock = String(BigInt(deploymentReceipt.blockNumber));
    await writeFile(join(directory, "config.json"), JSON.stringify({
      registryAddress: registry, deploymentBlock, rpcUrl, relayerUrl: "http://relay.invalid",
    }));

    const output: string[] = [];
    const previews = new Map<string, Hex>();
    let lastPreview: ReturnType<typeof decodeFunctionData<typeof registryAbi>> | undefined;
    let walletCalls = 0;
    const respond = (data: unknown) => ({ success: true, data });
    const execBaw = async ([area, action, ...args]: string[]) => {
      walletCalls++;
      const value = (option: string) => args[args.indexOf(option) + 1];
      if (area === "wallet" && action === "status") return respond({ status: "CONNECTED" });
      if (area === "wallet" && action === "address") {
        return respond({ addresses: [{ binanceChainId: "31337", address: holder }] });
      }
      if (area === "wallet" && action === "agent-id") {
        const balance = await publicClient.readContract({ address: agentId, abi: agentIdAbi, functionName: "balanceOf", args: [holder] });
        return respond({ claimed: balance > 0n });
      }
      if (area === "wallet" && action === "settings") return respond({ devMode: { enabled: true } });
      if (area === "contract-call" && action === "preview") {
        expect(value("--binanceChainId")).toBe("31337");
        expect(value("--from")).toBe(holder);
        expect(value("--to")).toBe(registry);
        expect(value("--value")).toBe("0");
        const data = value("--inputData") as Hex;
        lastPreview = decodeFunctionData({ abi: registryAbi, data });
        const estimatedGas = await publicClient.estimateGas({ account: holder, to: registry, data });
        const requestId = lastPreview.functionName + "-local";
        previews.set(requestId, data);
        return respond({ requestId, estimatedGas: String(estimatedGas), risks: {} });
      }
      if (area === "contract-call" && action === "execute") {
        const data = previews.get(value("--requestId"));
        if (!data) throw new Error("没有该预览。");
        const txHash = await walletClient.sendTransaction({ account: holder, to: registry, data });
        expect((await publicClient.waitForTransactionReceipt({ hash: txHash })).status).toBe("success");
        return respond({ status: "BROADCASTED", txHash });
      }
      throw new Error("意外的钱包调用。");
    };
    let received: ProvenVote | undefined;
    const relay: typeof fetch = async (url, options) => {
      expect(url).toBe("http://relay.invalid/vote");
      expect(options?.method).toBe("POST");
      const vote = JSON.parse(String(options?.body)) as ProvenVote;
      received = vote;
      expect(Object.keys(vote).sort()).toEqual(["evidenceHash", "id", "proof", "targetType", "voteType"]);
      const [groupId, semaphore] = await Promise.all([
        publicClient.readContract({ address: registry, abi: registryAbi, functionName: "groupId" }),
        publicClient.readContract({ address: registry, abi: registryAbi, functionName: "semaphore" }),
      ]);
      const proof = toContractProof(vote.proof);
      expect(await publicClient.readContract({
        address: semaphore, abi: verifierAbi, functionName: "verifyProof", args: [groupId, proof],
      })).toBe(true);
      const txHash = await walletClient.writeContract({
        address: registry, account: relayAccount, abi: registryAbi, functionName: "vote",
        args: [vote.targetType, vote.id, vote.voteType, vote.evidenceHash, proof],
      });
      expect((await publicClient.waitForTransactionReceipt({ hash: txHash })).status).toBe("success");
      return Response.json({ txHash });
    };
    const run = (args: string[]) => runCli(args, {
      client: publicClient, dataDir: directory, env: {}, execBaw, fetch: relay, write: (line) => output.push(line),
    });

    await run(["join"]);
    const { requestId, args, estimatedGas } = JSON.parse(output.at(-1)!);
    expect(lastPreview).toMatchObject({ functionName: "join", args: [BigInt(args[0])] });
    expect(BigInt(estimatedGas)).toBeGreaterThan(21_000n);
    const commitmentOf = () => publicClient.readContract({
      address: registry, abi: registryAbi, functionName: "commitmentOf", args: [holder],
    });
    expect(await commitmentOf()).toBe(0n);
    await run(["join", "--execute", requestId]);
    expect(await commitmentOf()).toBe(BigInt(args[0]));

    const callsBeforeAnonymous = walletCalls;
    await run(["vote", "--anon", "domain", "expected.example", "danger"]);
    expect(walletCalls).toBe(callsBeforeAnonymous);
    expect(output.at(-1)).toContain("已匿名上报");
    expect(await isNullifierUsed(publicClient, registry, BigInt(received!.proof.nullifier))).toBe(true);
    const anon = received!;

    await run(["vote", "--public", "domain", "another.example", "false-positive"]);
    expect(lastPreview).toMatchObject({ functionName: "vote", args: expect.arrayContaining([1]) });
    const publicVote = JSON.parse(output.at(-1)!);
    expect(publicVote).toMatchObject({ requestId: "vote-local", targetValue: "another.example", vote: "false-positive" });
    expect(await isNullifierUsed(publicClient, registry, BigInt(publicVote.args[4].nullifier))).toBe(false);
    await run(["vote", "--public", "--execute", publicVote.requestId]);
    expect(await isNullifierUsed(publicClient, registry, BigInt(publicVote.args[4].nullifier))).toBe(true);

    const fixture = fileURLToPath(new URL("../../packages/core/test/fixtures/skills/r6", import.meta.url));
    const reviewedScan = ["scan", fixture, "--merge-llm", '{"level":"high"}', "--json"];
    await run(["config", "auto-report", "off"]);
    await run(reviewedScan);
    expect(JSON.parse(output.at(-1)!)).toMatchObject({ level: "high" });
    expect(received).toBe(anon);
    await run(["config", "auto-report", "on"]);
    await run(["scan", fixture, "--json"]);
    expect(JSON.parse(output.at(-1)!)).toMatchObject({ level: "suspicious" });
    expect(received).toBe(anon);
    await run(reviewedScan);
    expect(JSON.parse(output.at(-1)!).autoReport).toMatchObject({ message: "已匿名上报。" });
    expect(received).toMatchObject({ targetType: 2, voteType: 0 });

    const staticFixture = fileURLToPath(new URL("../../packages/core/test/fixtures/skills/code", import.meta.url));
    await run(["scan", staticFixture, "--json"]);
    const staticScan = JSON.parse(output.at(-1)!);
    expect(staticScan).toMatchObject({
      level: "high", evidence: [expect.objectContaining({ source: "static" })],
      autoReport: { message: "已匿名上报。" },
    });
    expect(received).toMatchObject({ targetType: 2, id: staticScan.contentHash, voteType: 0 });

    const domainFixture = await readFile(new URL("../../packages/core/test/fixtures/skills/r5/domain.md", import.meta.url), "utf8");
    const riskyUrl = domainFixture.match(/https:\/\/[^\s。]+/u)![0];
    await run(["check", riskyUrl, "--json"]);
    expect(JSON.parse(output.at(-1)!).autoReport).toMatchObject({ message: "已匿名上报。" });
    expect(received).toMatchObject({ targetType: 0, id: domainId(new URL(riskyUrl).hostname), voteType: 0 });
    const { secret } = JSON.parse(await readFile(join(directory, "identity.json"), "utf8"));
    expect(JSON.stringify(received)).not.toContain(secret);
    expect(output.join(" ")).not.toContain(secret);
  } finally {
    anvil.kill();
    await exited;
    await rm(directory, { recursive: true, force: true });
  }
}, 120_000);
