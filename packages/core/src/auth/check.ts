import { existsSync } from "node:fs";
import { lookupAuthIntel } from "../intel/auth.js";
import { isOfficialHost } from "../intel/official-hosts.js";
import { phraseEvidence } from "./phrases.js";
import { decodeQr } from "./qr.js";
import { expandShortLink } from "./redirect.js";
import type {
  AuthCheckInput, AuthCheckOptions, AuthCheckResult, AuthEvidence, AuthExternalHit, AuthRiskLevel,
} from "./types.js";
import { authLinkType, domainEvidence, extractUrls, isOfficialUrl, isShortLink, isWebUrl } from "./urls.js";

const levelLabels = { high: "高风险", suspicious: "可疑", unknown: "未知", none: "未发现风险" } as const;
const levelOrder: readonly AuthRiskLevel[] = ["high", "suspicious", "unknown", "none"];
const boundaryNote = "体检依据所提供的内容和信号。工具看不到 App 内的扫码、配对码和确认流程，请在 App 内自行核对。";
const imageExtension = /\.(?:png|apng|jpe?g|jpe|webp|gif|tiff?|avif|heic|heif|svg|jp2|jxl)$/iu;

const authTerms = /配对码|钱包(?:登录|授权)|登录授权|授权请求|授权钱包|\bpairing[ -]code\b|\bagent[\s/_-]+(?:login|signin|auth)|\b(?:agentic[\s/_-]+)?wallet[\s/_-]+(?:login|sign[\s-]*in|authoriz|connect)|\b(?:log[\s-]*in|sign[\s-]*in|authori[sz]e|connect)\b.{0,28}\b(?:agentic wallet|your wallet)\b/iu;
const chineseAgenticWallet = /(?:授权|登录|连接)\s*(?:币安\s*)?Agentic[ -]+Wallet\b|\bAgentic[ -]+Wallet\b.{0,24}(?:授权|登录|连接)/iu;
const pairingHint = /配对码|\bpairing[ -]code\b/iu;
const verifyPairing = "请核对 App 与本机 Agent 显示的配对码是否一致。";
const noLocalLogin = "本机近期没有发起过登录，除非你在其他设备上主动登录，否则请拒绝。";
const authorizationEffect = "扫码确认会让发起请求的 Agent 获得操作你钱包的权限。";

function imageInput(input: AuthCheckInput): Buffer | string | undefined {
  if (Buffer.isBuffer(input)) return input;
  if (typeof input === "string") {
    return imageExtension.test(input) && !input.includes("://") && existsSync(input) ? input : undefined;
  }
  return "image" in input ? input.image : undefined;
}

function authHint(text: string): string | undefined {
  return text.match(authTerms)?.[0] ?? text.match(chineseAgenticWallet)?.[0];
}

function authorizationEvidence(excerpt: string, recent: boolean, page: URL | undefined): AuthEvidence {
  if (page && isWebUrl(page) && !isOfficialUrl(page)) {
    return {
      ruleId: "auth.embedded-on-nonofficial-page", excerpt, level: "high",
      explanation: `官方登录授权链接出现在非白名单页面（${page.hostname}）。${authorizationEffect}${recent ? verifyPairing : noLocalLogin}`,
    };
  }
  if (recent) {
    return {
      ruleId: "auth.recent-local-login", excerpt, level: "suspicious",
      explanation: `本机近 10 分钟内发起过登录。${verifyPairing}${authorizationEffect}`,
    };
  }

  return {
    ruleId: "auth.no-recent-local-login", excerpt, level: "high",
    explanation: `这不是你本机近期发起的授权。${authorizationEffect}${noLocalLogin}`,
  };
}

function unknownAuthorization(excerpt: string, recent: boolean): AuthEvidence {
  return {
    ruleId: "auth.unknown-format", excerpt, level: "unknown",
    explanation: `授权请求格式尚未核实。只在你主动发起登录时，才在官方 App 内核对配对码。${recent ? "" : noLocalLogin}`,
  };
}

function externalEvidence(hit: AuthExternalHit): AuthEvidence {
  if (hit.kind === "community") {
    return {
      ruleId: "external.community", excerpt: hit.excerpt, level: hit.status === "社区确认" ? "high" : "suspicious",
      explanation: `社区信号：${hit.confirmations} 位真人确认（${hit.status}）。来源：${hit.source}。`,
    };
  }
  const source = `情报源：${hit.source}${hit.observedAt ? `（数据时间 ${hit.observedAt}）` : ""}。${hit.detail ?? ""}`;
  if (isOfficialHost(hit.excerpt.toLowerCase()) || (URL.canParse(hit.excerpt) && isOfficialUrl(new URL(hit.excerpt)))) {
    return {
      ruleId: "external.intel-conflict", excerpt: hit.excerpt, level: "none",
      explanation: `${source}外部情报与官方域名白名单冲突，请人工复核。`,
    };
  }
  return {
    ruleId: "external.intel", excerpt: hit.excerpt, level: "suspicious",
    explanation: source,
  };
}

/** 检查链接、文本或二维码图片中的钱包授权风险。 */
export async function checkAuth(input: AuthCheckInput, options: AuthCheckOptions): Promise<AuthCheckResult> {
  const now = options.now ?? Date.now();
  const recent = options.recentLocalLogins.some((timestamp) => timestamp <= now && now - timestamp <= 600_000);
  const page = options.pageUrl instanceof URL
    ? options.pageUrl
    : (options.pageUrl && URL.canParse(options.pageUrl) ? new URL(options.pageUrl) : undefined);
  const image = imageInput(input);
  const decodedText = image === undefined ? undefined : await decodeQr(image);
  const text = image !== undefined ? (decodedText ?? "") : String(input);
  const evidence = phraseEvidence(text);
  const links = extractUrls(text);
  const webUrls: URL[] = page && isWebUrl(page) ? [page] : [];
  if (image !== undefined && decodedText === undefined) {
    evidence.push({ ruleId: "qr.unreadable", excerpt: "", explanation: "无法识别二维码", level: "unknown" });
  }

  for (const { url, excerpt } of links) {
    if (isWebUrl(url)) webUrls.push(url);
    const domain = domainEvidence(url, excerpt);
    if (domain) evidence.push(domain);
    const appShortLink = authLinkType(url) === "app-short-link";
    if (appShortLink || isShortLink(url)) {
      let destination: URL | undefined;
      try {
        destination = await (options.expandUrl ?? expandShortLink)(url);
      } catch {
        // 网络错误与超时在报告中统一为无法展开。
      }
      if (!destination || !isWebUrl(destination) || destination.href === url.href
        || isShortLink(destination) || authLinkType(destination) === "app-short-link"
        || (appShortLink && authLinkType(destination) === "share-page")) {
        evidence.push({
          ruleId: "redirect.unresolved", excerpt, level: "unknown",
          explanation: "短链无法展开，未能确定最终落点。",
        });
        continue;
      }

      const destinationDomain = domainEvidence(destination, destination.href);
      webUrls.push(destination);
      if (destinationDomain) evidence.push(destinationDomain);
      if (authLinkType(destination)) {
        evidence.push(authorizationEvidence(excerpt, recent, page));
      } else if (authHint(destination.href)) {
        evidence.push(unknownAuthorization(destination.href, recent));
      }
    } else if (authLinkType(url)) {
      evidence.push(authorizationEvidence(excerpt, recent, page));
    } else if (authHint(excerpt)) {
      evidence.push(unknownAuthorization(excerpt, recent));
    }
  }

  const hint = authHint(text);
  if (hint && !evidence.some(({ ruleId }) => /^(?:auth\.|redirect\.)|^phrase\.pairing-code$/u.test(ruleId))) {
    const finding = unknownAuthorization(hint, recent);
    if (recent && pairingHint.test(hint)) finding.explanation += verifyPairing;
    evidence.push(finding);
  }

  evidence.push(...(options.externalHits ?? []).map(externalEvidence));
  const addressText = links.reduce((remaining, { excerpt }) => remaining.replaceAll(excerpt, " "), text);
  if (options.lookupCommunity) {
    const domains = new Map(webUrls.map((url) => [url.hostname.replace(/\.$/u, ""), isOfficialUrl(url)]));
    const addresses = new Set([...addressText.matchAll(/\b0x[0-9a-f]{40}\b/giu)].map(([address]) =>
      address.toLowerCase() as `0x${string}`));
    const hits = await options.lookupCommunity([
      ...[...domains].map(([domain, official]) => ({ domain, official })),
      ...[...addresses].map((address) => ({ address })),
    ]);
    evidence.push(...hits.map(externalEvidence));
  }
  if (options.intel) {
    const results = await lookupAuthIntel(addressText, webUrls, options.intel, now);
    evidence.push(...results.flatMap(({ hits }) => hits.map(externalEvidence)));
    for (const note of new Set(results.flatMap(({ notes }) => notes))) {
      evidence.push({ ruleId: "external.intel-note", excerpt: "", explanation: note, level: "none" });
    }
  }
  const level = levelOrder.find((candidate) => evidence.some((item) => item.level === candidate)) ?? "none";

  return {
    level,
    levelLabel: levelLabels[level],
    evidence,
    boundaryNote,
    ...(decodedText === undefined ? {} : { decodedText }),
  };
}
