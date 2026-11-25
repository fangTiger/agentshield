import { loadIntelCache } from "./cache.js";
import { queryGoPlus, type GoPlusOptions } from "./goplus.js";
import type { IntelLookupResult } from "./types.js";

export interface AuthIntelOptions {
  cacheDir?: string;
  goPlus?: GoPlusOptions;
}

export async function lookupAuthIntel(
  addressText: string, webUrls: readonly URL[], options: AuthIntelOptions, now: number,
): Promise<IntelLookupResult[]> {
  const sites = new Map(webUrls.map((url) => [url.hostname, new URL(url.origin)]));
  const addresses = new Set([...addressText.matchAll(/\b0x[0-9a-f]{40}\b/giu)].map(([address]) => address.toLowerCase()));
  if (!sites.size && !addresses.size) return [];

  const lookup = await loadIntelCache(options.cacheDir);
  const cached = [
    ...[...sites.keys()].map((domain) => lookup({ domain }, now)),
    ...[...addresses].map((address) => lookup({ address }, now)),
  ];
  if (!options.goPlus) return cached;

  // 只向网站情报服务发送来源站点，避免提交授权路径、参数或片段。
  const live = await Promise.all([
    ...[...sites.values()].map((site) => queryGoPlus({ site }, options.goPlus)),
    ...[...addresses].map((address) => queryGoPlus({ address }, options.goPlus)),
  ]);
  return [...cached, ...live];
}
