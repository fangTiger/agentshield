import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildMetaMaskLookup, normalizeDomain, type MetaMaskConfig } from "./metamask.js";
import type { IntelLookupResult, IntelTarget } from "./types.js";

const defaultCacheDir = join(homedir(), ".agentshield", "intel");
const staleAfter = 7 * 24 * 60 * 60 * 1000;
const scamSniffer = "https://raw.githubusercontent.com/scamsniffer/scam-database/main/blacklist/";
const domainFeed = { source: "ScamSniffer", file: "scamsniffer-domains.json", url: scamSniffer + "domains.json" };
const addressFeed = { source: "ScamSniffer", file: "scamsniffer-addresses.json", url: scamSniffer + "address.json" };
const metaMaskFeed = {
  source: "MetaMask eth-phishing-detect", file: "metamask-config.json",
  url: "https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/main/src/config.json",
};

interface CacheFile<T = unknown> {
  observedAt: string;
  etag?: string;
  data: T;
}

async function readCache<T>(path: string): Promise<CacheFile<T> | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as CacheFile<T>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function isStringList(data: unknown): data is string[] {
  return Array.isArray(data) && data.every((entry) => typeof entry === "string");
}

/** 从上游同步名单。上游支持 ETag 时，只下载有变化的名单。 */
export async function syncIntel(cacheDir = defaultCacheDir, clock: () => number = Date.now) {
  await mkdir(cacheDir, { recursive: true });
  const results = await Promise.allSettled([domainFeed, addressFeed, metaMaskFeed].map(async (feed) => {
    const path = join(cacheDir, feed.file);
    const previous = await readCache(path);
    const headers = previous?.etag ? { "If-None-Match": previous.etag } : undefined;
    const response = await fetch(feed.url, { headers, signal: AbortSignal.timeout(30_000) });
    const unchanged = response.status === 304 && previous;
    if (!unchanged && !response.ok) throw new Error(`${feed.source} 同步失败（${feed.file}，HTTP ${response.status}）。`);

    const data: unknown = unchanged ? previous.data : await response.json();
    const config = data as Partial<MetaMaskConfig> | null;
    const valid = feed === metaMaskFeed
      ? config && isStringList(config.blacklist) && isStringList(config.whitelist)
        && isStringList(config.fuzzylist) && typeof config.tolerance === "number"
      : isStringList(data);
    if (!valid) throw new Error(`${feed.source} 名单格式无效（${feed.file}）。`);

    const observedAt = new Date(clock()).toISOString();
    const etag = response.headers.get("etag") ?? (unchanged ? previous.etag : undefined);
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify({ observedAt, etag, data }));
      await rename(temporary, path);
    } finally {
      await rm(temporary, { force: true });
    }
    return { source: feed.source, file: feed.file, observedAt, status: unchanged ? "未变更" : "已下载" };
  }));
  return results.map((result) => {
    if (result.status === "rejected") throw result.reason;
    return result.value;
  });
}

/** 将本地名单加载一次，返回可重复查询域名或地址的函数。 */
export async function loadIntelCache(cacheDir = defaultCacheDir) {
  const [domainCache, addressCache, metaMaskCache] = await Promise.all([
    readCache<string[]>(join(cacheDir, domainFeed.file)),
    readCache<string[]>(join(cacheDir, addressFeed.file)),
    readCache<MetaMaskConfig>(join(cacheDir, metaMaskFeed.file)),
  ]);
  const domains = new Set(domainCache?.data.map(normalizeDomain));
  const addresses = new Set(addressCache?.data.map((address) => address.toLowerCase()));
  const lookupMetaMask = metaMaskCache && buildMetaMaskLookup(metaMaskCache.data);

  return (target: IntelTarget, now: number = Date.now()): IntelLookupResult => {
    const hits: IntelLookupResult["hits"] = [];
    const caches = "domain" in target ? [domainCache, metaMaskCache] : [addressCache];
    if ("domain" in target) {
      const excerpt = normalizeDomain(target.domain);
      if (excerpt && domainCache && domains.has(excerpt)) {
        hits.push({ kind: "intel", source: domainFeed.source, excerpt, observedAt: domainCache.observedAt });
      }
      const match = excerpt ? lookupMetaMask?.(excerpt) : undefined;
      if (metaMaskCache && match) {
        hits.push({ kind: "intel", source: metaMaskFeed.source, excerpt, observedAt: metaMaskCache.observedAt, ...match });
      }
    } else {
      const excerpt = target.address.trim().toLowerCase();
      if (addressCache && addresses.has(excerpt)) {
        hits.push({ kind: "intel", source: addressFeed.source, excerpt, observedAt: addressCache.observedAt });
      }
    }
    return {
      hits,
      notes: caches.some((cache) => cache && now - Date.parse(cache.observedAt) > staleAfter) ? ["情报可能过期"] : [],
    };
  };
}
