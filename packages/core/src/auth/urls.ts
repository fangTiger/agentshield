import { domainToUnicode } from "node:url";
import { parse } from "tldts";
import { isOfficialHost } from "../intel/official-hosts.js";
import type { AuthEvidence } from "./types.js";

const shortLinkHosts = new Set([
  "bit.ly", "bitly.com", "t.co", "tinyurl.com", "ow.ly", "is.gd", "cutt.ly",
  "rb.gy", "rebrand.ly", "buff.ly", "shorturl.at", "t.ly",
]);

const confusables: Record<string, string> = {
  а: "a", в: "b", с: "c", е: "e", і: "i", ј: "j", к: "k", м: "m", н: "h",
  о: "o", р: "p", ѕ: "s", т: "t", у: "y", х: "x", ӏ: "l", п: "n",
  α: "a", β: "b", ϲ: "c", ε: "e", ι: "i", κ: "k", ν: "v", ο: "o",
  ρ: "p", τ: "t", υ: "u", χ: "x", ı: "i", ł: "l",
};
const brand = "binance";
const officialDomainInText = /(?<![\p{L}\d-])binance(?:api)?\.com(?![\p{L}\d-])/iu;

export function isWebUrl(url: URL): boolean {
  return url.protocol === "https:" || url.protocol === "http:";
}

function hostname(url: URL): string {
  return url.hostname.replace(/\.$/u, "");
}

export function isOfficialUrl(url: URL): boolean {
  const host = hostname(url);
  const { domain } = parse(host);
  return isWebUrl(url) && isOfficialHost(host) && (domain === "binance.com" || domain === "binanceapi.com");
}

export function isShortLink(url: URL): boolean {
  return isWebUrl(url) && shortLinkHosts.has(hostname(url));
}

export function authLinkType(url: URL): "app-short-link" | "share-page" | "agent-login" | undefined {
  if (url.protocol !== "https:" || url.port || !isOfficialUrl(url)) return undefined;

  const host = hostname(url);
  if (host === "app.binance.com" && /^\/uni-qr\/.+/u.test(url.pathname)) {
    return "app-short-link";
  }
  if (host === "www.binance.com" && /^\/bapi\/fe\/qrcode\/share_link_page\/uni-qr\/[^/]+\/?$/u.test(url.pathname)) {
    return "share-page";
  }
  if (host === "web3.binance.com" && /^\/(?:[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*\/)?agent-login\/?$/u.test(url.pathname)) {
    return "agent-login";
  }
}

export function extractUrls(text: string): { url: URL; excerpt: string }[] {
  const trimmed = text.trim();
  if (!/\s/u.test(trimmed) && URL.canParse(trimmed) && /^[a-z][\w+.-]*:\/\//iu.test(trimmed)) {
    return [{ url: new URL(trimmed), excerpt: trimmed }];
  }

  const urls = [];
  const candidates = /[a-z][\w+.-]*:\/\/[^\s<>"'`，。！？；、（）【】《》]+/giu;
  for (const entry of text.matchAll(candidates)) {
    const excerpt = entry[0].replace(/[),.;!?\]}]+$/u, "");
    if (URL.canParse(excerpt)) urls.push({ url: new URL(excerpt), excerpt });
  }
  return urls;
}

function resemblesBrand(label: string): boolean {
  if (label.includes(brand)) return true;
  if (Math.abs(label.length - brand.length) > 1) return false;

  const [shorter, longer] = label.length <= brand.length ? [label, brand] : [brand, label];
  let index = 0;
  while (index < shorter.length && shorter[index] === longer[index]) index++;
  if (shorter.length < longer.length) {
    return shorter.slice(index) === longer.slice(index + 1);
  }
  return shorter.slice(index + 1) === longer.slice(index + 1) || (
    shorter[index] === longer[index + 1] && shorter[index + 1] === longer[index]
    && shorter.slice(index + 2) === longer.slice(index + 2)
  );
}

function decodeAscii(text: string): string {
  return text.replace(/%([0-7][\da-f])/giu, (_escape, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

export function domainEvidence(url: URL, excerpt: string): AuthEvidence | undefined {
  if (!isWebUrl(url)) return undefined;

  const host = hostname(url);
  if (isOfficialUrl(url)) {
    return {
      ruleId: "domain.official", level: "none", excerpt,
      explanation: "官方域名不代表这个授权是你本人发起的。",
    };
  }

  const { domain, domainWithoutSuffix, subdomain } = parse(host, { allowPrivateDomains: true });
  if (domain === "binance.com") return undefined;
  const actualDomain = domain ? `真实可注册域是 ${domain}。` : `实际主机名是 ${host}。`;

  const confusableLabel = domainToUnicode(host).split(/[.-]/u).some((label) => {
    const skeleton = Array.from(label, (character) => confusables[character] ?? character).join("");
    return skeleton !== label && skeleton.includes(brand);
  });
  if (confusableLabel) {
    return {
      ruleId: "domain.confusable", level: "high", excerpt,
      explanation: `同形字仿冒。主机名的 Punycode 形式为 ${host}。${actualDomain}`,
    };
  }

  if (subdomain && officialDomainInText.test(`${subdomain}.${domain}`)) {
    return {
      ruleId: "domain.subdomain", level: "high", excerpt,
      explanation: `仿冒官方域名。官方名称被放进了其他主机的子域名。${actualDomain}`,
    };
  }

  if ([url.username, url.password, url.pathname, url.search, url.hash]
    .some((part) => officialDomainInText.test(decodeAscii(part)))) {
    return {
      ruleId: "domain.url-impersonation", level: "high", excerpt,
      explanation: `URL 在主机名以外的位置展示了币安官方域名。${actualDomain}`,
    };
  }

  if (domainWithoutSuffix?.split("-").some(resemblesBrand)) {
    return {
      ruleId: "domain.brand-similar", level: "suspicious", excerpt,
      explanation: `可注册域的名称与币安品牌相似。${actualDomain}`,
    };
  }
}
