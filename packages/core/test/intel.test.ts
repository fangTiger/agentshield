import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { checkAuth, loadIntelCache, queryGoPlus, syncIntel } from "../src/index.js";

const observedAt = "2026-11-16T00:00:00.000Z";
const now = Date.parse(observedAt);
const week = 7 * 24 * 60 * 60 * 1000;
const address = "0x" + "aB".repeat(20);
const domain = "flagged.example";
const domainsUrl = "https://raw.githubusercontent.com/scamsniffer/scam-database/main/blacklist/domains.json";
const addressesUrl = "https://raw.githubusercontent.com/scamsniffer/scam-database/main/blacklist/address.json";
const metaMaskUrl = "https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/main/src/config.json";
let cacheDir: string;

beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), "agentshield-intel-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(cacheDir, { recursive: true, force: true });
});

function mockFeeds() {
  const feeds: Record<string, unknown> = {
    [domainsUrl]: [domain, "www.binance.com", "allowed.walletbrand.test"],
    [addressesUrl]: [address],
    [metaMaskUrl]: {
      version: 2, tolerance: 1,
      blacklist: [domain, "allowed.walletbrand.test"],
      whitelist: ["allowed.walletbrand.test"],
      fuzzylist: ["walletbrand.test"],
    },
  };
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
    const etag = '"test-version"';
    if (new Headers(options?.headers).get("If-None-Match") === etag) {
      return new Response(null, { status: 304 });
    }
    return Response.json(feeds[String(url)], { headers: { ETag: etag } });
  });
}

test("同步原始名单并返回同一域名的全部命中，地址忽略大小写", async () => {
  mockFeeds();
  const updates = await syncIntel(cacheDir, () => now);
  expect(updates.map(({ observedAt: time }) => time)).toEqual([observedAt, observedAt, observedAt]);
  expect(await readdir(cacheDir)).toHaveLength(3);
  const lookup = await loadIntelCache(cacheDir);
  expect(lookup({ domain: "FLAGGED.EXAMPLE." }, now)).toEqual({
    hits: [
      { kind: "intel", source: "ScamSniffer", excerpt: domain, observedAt },
      { kind: "intel", source: "MetaMask eth-phishing-detect", excerpt: domain, observedAt },
    ],
    notes: [],
  });
  expect(lookup({ address: address.toLowerCase() }, now).hits).toEqual([
    { kind: "intel", source: "ScamSniffer", excerpt: address.toLowerCase(), observedAt },
  ]);
  const report = await checkAuth(`请检查地址 ${address}`, { recentLocalLogins: [], now, intel: { cacheDir } });
  expect(report.evidence).toContainEqual(expect.objectContaining({ ruleId: "external.intel", excerpt: address.toLowerCase() }));
});

test("MetaMask 名单支持子域名、模糊匹配和仅对该来源生效的白名单", async () => {
  mockFeeds();
  await syncIntel(cacheDir, () => now);
  const lookup = await loadIntelCache(cacheDir);
  expect(lookup({ domain: "sub.flagged.example" }, now).hits.map(({ source }) => source))
    .toContain("MetaMask eth-phishing-detect");
  expect(lookup({ domain: "www.walletbrnd.test" }, now).hits).toMatchObject([
    { source: "MetaMask eth-phishing-detect", detail: expect.stringContaining("模糊匹配") },
  ]);
  expect(lookup({ domain: "allowed.walletbrand.test" }, now).hits.map(({ source }) => source))
    .toEqual(["ScamSniffer"]);
});

test("缓存超过七天时，有命中和无命中的查询都报告过期", async () => {
  mockFeeds();
  await syncIntel(cacheDir, () => now);
  const lookup = await loadIntelCache(cacheDir);
  expect(lookup({ domain }, now + week).notes).toEqual([]);
  expect(lookup({ domain }, now + week + 1).notes).toEqual(["情报可能过期"]);
  expect(lookup({ domain: "clean.test" }, now + week + 1)).toEqual({
    hits: [], notes: ["情报可能过期"],
  });
});

test("HTTP 304 保留名单并刷新获取时间", async () => {
  mockFeeds();
  await syncIntel(cacheDir, () => now);
  const updatedAt = now + week + 1;
  await syncIntel(cacheDir, () => updatedAt);
  const lookup = await loadIntelCache(cacheDir);
  expect(lookup({ domain }, updatedAt).notes).toEqual([]);
  expect(lookup({ domain }, updatedAt).hits.map((hit) => hit.observedAt)).toEqual([
    new Date(updatedAt).toISOString(), new Date(updatedAt).toISOString(),
  ]);
});

test("GoPlus 解析钓鱼网站和 BSC 地址风险", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.href === "https://api.gopluslabs.io/api/v1/phishing_site?url=https%3A%2F%2Fflagged.example%2F") {
      return Response.json({ code: 1, message: "OK", result: { phishing_site: 1, website_contract_security: [] } });
    }
    if (url.href === `https://api.gopluslabs.io/api/v1/address_security/${address.toLowerCase()}?chain_id=56`) {
      return Response.json({ code: 1, message: "ok", result: { stealing_attack: "1", contract_address: "1" } });
    }
    return new Response(null, { status: 404 });
  });
  for (const target of [{ site: new URL(`https://${domain}/`) }, { address }]) {
    expect(await queryGoPlus(target)).toMatchObject({
      hits: [{ source: "GoPlus", observedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/u) }],
      notes: [],
    });
  }
});

test("GoPlus 超时只请求一次，体检继续使用缓存并显示未查询", async () => {
  const fetch = mockFeeds();
  await syncIntel(cacheDir, () => now);
  fetch.mockReset().mockImplementation(async (_url, options) => {
    if (!options?.signal) throw new Error("请求应带超时信号");
    return new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
    });
  });
  const report = await checkAuth(`https://${domain}/?private=${address}`, {
    recentLocalLogins: [], now, intel: { cacheDir, goPlus: { timeoutMs: 5 } },
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(String(fetch.mock.calls[0][0])).toContain("url=https%3A%2F%2Fflagged.example%2F");
  expect(report).toMatchObject({
    level: "suspicious",
    evidence: expect.arrayContaining([
      expect.objectContaining({ explanation: "GoPlus 未查询" }),
      expect.objectContaining({ explanation: `情报源：ScamSniffer（数据时间 ${observedAt}）。` }),
    ]),
  });
});

test("普通合约地址不是 GoPlus 风险命中，API 错误照常降级", async () => {
  const fetch = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ code: 1, result: { contract_address: "1", phishing_activities: "0" } }))
    .mockResolvedValueOnce(Response.json({ code: 5006, result: null }));
  expect(await queryGoPlus({ address })).toEqual({ hits: [], notes: [] });
  expect(await queryGoPlus({ address })).toEqual({ hits: [], notes: ["GoPlus 未查询"] });
  expect(fetch).toHaveBeenCalledTimes(2);
});

test("官方主机名与外部名单冲突时保留白名单判定并显示人工复核提示", async () => {
  mockFeeds();
  await syncIntel(cacheDir, () => now);
  const options = { recentLocalLogins: [], now: now + week + 1, intel: { cacheDir } };
  const report = await checkAuth("https://www.binance.com/en/", options);
  expect(report.level).toBe("none");
  expect(report.evidence).toEqual([
    expect.objectContaining({ ruleId: "domain.official" }),
    expect.objectContaining({ ruleId: "external.intel-conflict", level: "none", explanation: expect.stringMatching(/ScamSniffer.*数据时间.*人工复核/u) }),
    expect.objectContaining({ explanation: "情报可能过期" }),
  ]);
  const auth = await checkAuth("https://www.binance.com/bapi/fe/qrcode/share_link_page/uni-qr/example", options);
  expect(auth.level).toBe("high");
  expect(auth.evidence).toContainEqual(expect.objectContaining({ ruleId: "auth.no-recent-local-login" }));
});

test("两个尾点不能把主机名归入官方白名单或官方域名的缓存项", async () => {
  mockFeeds();
  await syncIntel(cacheDir, () => now);
  const options = { recentLocalLogins: [], now, intel: { cacheDir } };
  const singleDot = await checkAuth("https://www.binance.com./en/", options);
  expect(singleDot.evidence.map(({ ruleId }) => ruleId)).toEqual(["domain.official", "external.intel-conflict"]);
  const doubleDot = await checkAuth("https://www.binance.com../en/", options);
  expect(doubleDot.evidence.map(({ ruleId }) => ruleId)).not.toContain("domain.official");
  expect(doubleDot.evidence.map(({ ruleId }) => ruleId)).not.toContain("external.intel-conflict");
});
