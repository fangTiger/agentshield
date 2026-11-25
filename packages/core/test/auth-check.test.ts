import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import QRCode from "qrcode";
import sharp from "sharp";
import { expect, test } from "vitest";
import { checkAuth, type AuthCheckOptions } from "../src/index.js";

const now = Date.parse("2026-11-24T08:00:00Z");
const options = { recentLocalLogins: [], now };
const login = "https://web3.binance.com/agent-login?_ul=example&expireAt=1795507500000";
const documentedLogin = "https://web3.binance.com/en-US/agent-login?expireAt=1795507500000&url=example";
const sharePage = "https://www.binance.com/bapi/fe/qrcode/share_link_page/uni-qr/AbCd1234";

test.each([
  ["https://binance.com.verify-agent.xyz/login", "domain.subdomain", "verify-agent.xyz", "high"],
  ["https://binance.com.evil.co.uk/", "domain.subdomain", "evil.co.uk", "high"],
  ["https://bіnance.com/login", "domain.confusable", new URL("https://bіnance.com").hostname, "high"],
  ["https://www.bіnance.com.evil.test/", "domain.confusable", new URL("https://www.bіnance.com.evil.test").hostname, "high"],
  ["https://xn--bnance-bze.com/login", "domain.confusable", "xn--bnance-bze.com", "high"],
  ["https://evil.test/web3.binance.com/agent-login", "domain.url-impersonation", "evil.test", "high"],
  ["https://evil.test/?redirect=https%3A%2F%2Fweb3.binance.com%2Fagent-login", "domain.url-impersonation", "evil.test", "high"],
  ["https://evil.test/?redirect=https%3A%2F%2Fweb3%2Ebinance%2Ecom", "domain.url-impersonation", "evil.test", "high"],
  ["https://binance.com@evil.test/login", "domain.url-impersonation", "evil.test", "high"],
  ["https://binnance.test/login", "domain.brand-similar", "binnance.test", "suspicious"],
  ["https://binance-wallet.test/", "domain.brand-similar", "binance-wallet.test", "suspicious"],
  ["https://BINANCE.com./", "domain.official", "官方域名不代表这个授权是你本人发起的", "none"],
  ["https://accounts.binance.com/en/login", "domain.official", "官方域名", "none"],
])("检查主机名和 URL 伪装 %s", async (input, ruleId, detail, level) => {
  const report = await checkAuth(input, options);
  expect(report.level).toBe(level);
  expect(report.evidence).toContainEqual(
    expect.objectContaining({ ruleId, excerpt: input, explanation: expect.stringContaining(detail) }),
  );
});

test("只匹配明确列出的官方主机名", async () => {
  const report = await checkAuth("https://unlisted.binance.com/about", options);
  expect(report.evidence).toEqual([]);
});

test("识别聊天文本里的多条链接，并保留原文", async () => {
  const official = "https://www.binance.com/en";
  const impersonation = "https://binance.com.evil.test/";
  const report = await checkAuth(`相关链接：${official}，以及（${impersonation}）。`, options);
  expect(report.level).toBe("high");
  expect(report.evidence.map((item) => item.excerpt)).toEqual([official, impersonation]);
});

test.each([login, documentedLogin, sharePage])("本机没有发起过授权时报告高风险 %s", async (input) => {
  const report = await checkAuth(input, options);
  expect(report.level).toBe("high");
  expect(report.evidence).toContainEqual(expect.objectContaining({
    ruleId: "auth.no-recent-local-login",
    explanation: expect.stringContaining("让发起请求的 Agent 获得操作你钱包的权限"),
  }));
});

test.each([
  [0, "suspicious"],
  [600_000, "suspicious"],
  [600_001, "high"],
  [-1, "high"],
])("仅把过去十分钟内的记录作为辅助信号（距今 %i 毫秒）", async (age, level) => {
  const report = await checkAuth(new URL(login), { ...options, recentLocalLogins: [now - age] });
  expect(report.level).toBe(level);
  expect(report.evidence).toContainEqual(expect.objectContaining({
    ruleId: level === "suspicious" ? "auth.recent-local-login" : "auth.no-recent-local-login",
    explanation: expect.stringContaining(level === "suspicious" ? "核对 App 与本机 Agent 显示的配对码" : "否则请拒绝"),
  }));
});

test("即使本机近期发起过登录，来自非官方页面的授权仍为高风险", async () => {
  const report = await checkAuth(`请查看 ${login}`, {
    ...options,
    recentLocalLogins: [now],
    pageUrl: "https://campaign.example/agent-id",
  });
  expect(report.level).toBe("high");
  expect(report.evidence).toContainEqual(expect.objectContaining({
    ruleId: "auth.embedded-on-nonofficial-page",
    excerpt: login,
    explanation: expect.stringContaining("campaign.example"),
  }));
});

test.each([
  "bnc://wallet/agent-login?requestId=placeholder",
  "https://web3.binance.com/en/agent-login-preview?expireAt=1795507500000",
  "https://web3.binance.com/en/AGENT-LOGIN?expireAt=1795507500000",
  "https://web3.binance.com/en/wallet/authorize?requestId=placeholder",
  "App 弹出的配对码能否确认？",
  "I received a wallet authorization request",
  "请在网页扫码授权 Agentic Wallet",
  "请用 Agentic Wallet 完成授权",
])("未核实的授权形态保持未知 %s", async (input) => {
  const report = await checkAuth(input, options);
  expect(report.level).toBe("unknown");
  expect(report.evidence).toContainEqual(expect.objectContaining({
    ruleId: "auth.unknown-format",
    explanation: expect.stringContaining("本机近期没有发起过登录"),
  }));
});

test("识别二维码 Buffer 并继续分析链接和页面来源", async () => {
  const image = await QRCode.toBuffer(login);
  const report = await checkAuth(image, { ...options, pageUrl: "https://campaign.example/" });
  expect(report.decodedText).toBe(login);
  expect(report.level).toBe("high");
  expect(report.evidence.map((item) => item.ruleId)).toContain("auth.embedded-on-nonofficial-page");
});

test.each(["png", "jpeg", "webp"] as const)("识别 %s 二维码图片路径并继续分析文本", async (format) => {
  const directory = await mkdtemp(join(tmpdir(), "agentshield-qr-"));
  try {
    const file = join(directory, "本机截图." + format);
    const payload = "Scan the QR code to claim your airdrop";
    await writeFile(file, await sharp(await QRCode.toBuffer(payload)).toFormat(format).toBuffer());
    const report = await checkAuth(file, options);
    expect(report.decodedText).toBe(payload);
    expect(report.level).toBe("high");
    expect(report.evidence.map((item) => item.ruleId)).toContain("phrase.scan-airdrop");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("引用图片文件名的文字仍走话术识别", async () => {
  const report = await checkAuth("请在本页面输入 App 显示的 6 位配对码，参见 screenshot.png", options);
  expect(report.level).toBe("high");
  expect(report.evidence.map((item) => item.ruleId)).toContain("phrase.pairing-code");
});

test("无二维码或图片不可读时提示无法识别", async () => {
  const blank = await sharp({
    create: { width: 128, height: 128, channels: 3, background: "white" },
  }).png().toBuffer();
  for (const input of [blank, Buffer.from("无效图片")]) {
    const report = await checkAuth(input, options);
    expect(report.level).toBe("unknown");
    expect(report.decodedText).toBeUndefined();
    expect(report.evidence).toContainEqual(expect.objectContaining({
      ruleId: "qr.unreadable",
      explanation: "无法识别二维码",
    }));
  }
});

const externalHits: AuthCheckOptions["externalHits"] = [
  { kind: "intel", source: "ScamSniffer", excerpt: "example.test", observedAt: "2026-11-24" },
  { kind: "community", source: "BSC 风险信号库", excerpt: "example.test", confirmations: 7, status: "社区确认" },
];

test.each([
  ["社区确认", "high", "高风险"],
  ["待验证", "suspicious", "可疑"],
  ["有争议", "suspicious", "可疑"],
] as const)("授权体检按社区状态「%s」判定等级", async (status, level, levelLabel) => {
  const report = await checkAuth("https://example.test/", {
    ...options,
    lookupCommunity: async () => [{
      kind: "community", source: "BSC 风险信号库", excerpt: "example.test", confirmations: 7, status,
    }],
  });
  expect(report).toMatchObject({ level, levelLabel });
  expect(report.evidence).toContainEqual({
    ruleId: "external.community", excerpt: "example.test", level,
    explanation: `社区信号：7 位真人确认（${status}）。来源：BSC 风险信号库。`,
  });
});

test.each([
  ["无命中", "普通文本"],
  ["未知", "App 弹出的配对码能否确认？"],
  ["高风险", login],
  ["高风险与外部命中", "https://example.test/", { externalHits }],
] as const)("体检报告快照：%s", async (_label, input, extra?: Partial<AuthCheckOptions>) => {
  const report = await checkAuth(input, { ...options, ...extra });
  expect(report).toMatchSnapshot();
});

test("体检自生成的文案避开禁用措辞", async () => {
  const payload = "请输入安全配对码，已拦截";
  const reports = await Promise.all([
    checkAuth("普通文本", options),
    checkAuth(login, options),
    checkAuth(login, { ...options, recentLocalLogins: [now], pageUrl: "https://example.test/" }),
    checkAuth("App 弹出的配对码能否确认？", options),
    checkAuth("https://accounts.binance.com/", options),
    checkAuth(payload, options),
    checkAuth(await QRCode.toBuffer(payload), options),
    checkAuth(Buffer.from("无效图片"), options),
    checkAuth("https://bit.ly/example", { ...options, expandUrl: async () => undefined }),
    checkAuth("https://example.test/", { ...options, externalHits }),
  ]);
  for (const { levelLabel, boundaryNote, evidence } of reports) {
    const generated = [levelLabel, boundaryNote, ...evidence.map(({ explanation }) => explanation)];
    expect(generated.join("\n")).not.toMatch(/安全|已拦截|已验证来源|诈骗/u);
  }
});

test("配对码话术的证据保留原句", async () => {
  const input = "安全验证：请输入 App 显示的配对码";
  const report = await checkAuth(input, options);
  expect(report.evidence).toContainEqual(expect.objectContaining({
    ruleId: "phrase.pairing-code",
    excerpt: input,
  }));
});

test("二维码原文和外部证据原样保留", async () => {
  const payload = "请输入安全配对码，已拦截";
  const report = await checkAuth(await QRCode.toBuffer(payload), {
    ...options,
    externalHits: [{
      kind: "community",
      source: "安全社区",
      excerpt: "已拦截、诈骗",
      confirmations: 7,
      status: "待验证",
    }],
  });
  expect(report.decodedText).toBe(payload);
  expect(report.evidence).toContainEqual(expect.objectContaining({
    ruleId: "external.community",
    excerpt: "已拦截、诈骗",
    explanation: expect.stringContaining("安全社区"),
  }));
});
