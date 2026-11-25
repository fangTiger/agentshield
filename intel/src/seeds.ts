import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { domainToASCII } from "node:url";
import { domainEvidence } from "../../packages/core/dist/auth/urls.js";
import { addressId, domainId, skillId, TargetType } from "../../packages/core/dist/chain/encoding.js";
import { isOfficialHost } from "../../packages/core/dist/intel/official-hosts.js";
import type { Address, Hex } from "../../packages/core/node_modules/viem/_types/index.js";
import { clawHubSkillUrl, type SkillScan } from "./skills.js";
import { viem } from "./viem.js";

interface Attribution {
  sourceName: string;
  sourceUrl: string;
}

interface FeedSource extends Attribution {
  observedAt: string;
}

export interface DomainMatch {
  domain: string;
  sources: FeedSource[];
}

export interface Ioc extends Attribution {
  type: "DOMAIN" | "ADDRESS";
  value: string;
}

export interface SkillReview {
  slug: string;
  contentHash: string;
  verdict: "malicious" | "false-positive";
  reason: string;
  reviewedAt: string;
  sourceUrl?: string;
}

export interface Seed {
  targetType: TargetType;
  id: Hex;
  sourceId: Hex;
  label: string;
  sourceUrl: string;
  sourceName?: string;
  review?: SkillReview;
}

interface Cache<T> {
  observedAt: string;
  data: T;
}

export async function filterDomains(cacheDir: string) {
  const [scamSniffer, metaMask] = await Promise.all([
    readFile(join(cacheDir, "scamsniffer-domains.json"), "utf8").then((text) => JSON.parse(text) as Cache<string[]>),
    readFile(join(cacheDir, "metamask-config.json"), "utf8").then((text) => JSON.parse(text) as Cache<{
      blacklist: string[];
      whitelist?: string[];
    }>),
  ]);

  const feeds = [
    {
      names: scamSniffer.data,
      sourceName: "ScamSniffer",
      sourceUrl: "https://github.com/scamsniffer/scam-database/blob/main/blacklist/domains.json",
      observedAt: scamSniffer.observedAt,
    },
    {
      names: metaMask.data.blacklist,
      sourceName: "MetaMask eth-phishing-detect",
      sourceUrl: "https://github.com/MetaMask/eth-phishing-detect/blob/main/src/config.json",
      observedAt: metaMask.observedAt,
    },
  ];

  const allow = new Set(metaMask.data.whitelist?.map((entry) => domainToASCII(entry).replace(/\.+$/u, "")));
  const matched = new Map<string, FeedSource[]>();
  for (const { names, ...source } of feeds) {
    const seen = new Set<string>();
    for (const entry of names) {
      // 不把名单中针对具体页面的记录扩大到整个域名。
      if (!/^[\p{L}\p{M}\d.-]+$/u.test(entry.trim())) continue;
      const domain = domainToASCII(entry.trim()).replace(/\.+$/u, "");
      if (!domain.includes(".") || seen.has(domain)) continue;
      seen.add(domain);

      if (source.sourceName === "MetaMask eth-phishing-detect") {
        const labels = domain.split(".");
        if (labels.some((_, index) => allow.has(labels.slice(index).join(".")))) continue;
      }
      if (isOfficialHost(domain) || domain.endsWith(".binance.com")) continue;
      const keyword = /binance|agentic|(?:^|[.-])agent[-.]?id(?=[.-]|$)/u.test(domain);
      // 「finance」与「binance」只差一个字母，普通金融词本身不作为仿冒证据。
      const brandHost = domain.replace(/(^|[.-])finance(?=[.-])/gu, "$1finances");
      if (!keyword && !domainEvidence(new URL("https://" + brandHost), domain)) continue;

      const sources = matched.get(domain);
      if (sources) sources.push(source);
      else matched.set(domain, [source]);
    }
  }
  const domains = [...matched].sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([domain, sources]) => ({ domain, sources }));
  const sources = feeds.map(({ names, ...source }) => ({ ...source, entries: names.length }));
  return { count: domains.length, sources, domains };
}

function iocTarget({ type, value }: Ioc): Pick<Seed, "targetType" | "id"> {
  switch (type) {
    case "DOMAIN":
      return { targetType: TargetType.DOMAIN, id: domainId(value) };
    case "ADDRESS": {
      const match = /^([1-9]\d*):(0x[\da-f]{40})$/iu.exec(value);
      if (!match) throw new Error("地址 IOC 必须包含链 ID，格式为「链 ID:0x 地址」。");
      return { targetType: TargetType.ADDRESS, id: addressId(BigInt(match[1]), match[2].toLowerCase() as Address) };
    }
    default:
      throw new Error(`不支持的 IOC 类型：${type}。`);
  }
}

export function pendingSkillReviews(scans: SkillScan[], reviews: SkillReview[]): SkillScan[] {
  return scans.filter((scan) => scan.level === "high" && !reviews.some((review) =>
    review.slug === scan.slug && review.contentHash === scan.contentHash));
}

export function makeSeeds(
  reviews: SkillReview[],
  domains: DomainMatch[],
  iocs: Ioc[],
): Seed[] {
  const seeds = new Map<string, Seed>();
  function add(
    target: Pick<Seed, "targetType" | "id">, label: string, { sourceName, sourceUrl }: Attribution, review?: SkillReview,
  ) {
    const sourceId = viem.keccak256(viem.stringToHex(sourceName));
    const key = `${target.targetType}:${target.id.toLowerCase()}:${sourceId}`;
    if (!seeds.has(key)) seeds.set(key, { ...target, sourceId, label, sourceUrl, ...(review && { sourceName, review }) });
  }
  for (const review of reviews) {
    if (review.verdict !== "malicious") continue;
    const { slug, contentHash } = review;
    const [owner, name] = slug.split("/");
    add({ targetType: TargetType.SKILL, id: skillId(contentHash) }, slug, {
      sourceName: "AgentShield 主动扫描（人工复核）", sourceUrl: review.sourceUrl ?? clawHubSkillUrl(owner, name),
    }, review);
  }
  for (const { domain, sources } of domains) {
    const target = { targetType: TargetType.DOMAIN, id: domainId(domain) };
    for (const source of sources) add(target, domain, source);
  }
  for (const ioc of iocs) add(iocTarget(ioc), ioc.value, ioc);
  return [...seeds.values()];
}
