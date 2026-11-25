import { domainToASCII } from "node:url";

export interface MetaMaskConfig {
  blacklist: string[];
  whitelist: string[];
  fuzzylist: string[];
  tolerance: number;
}

export function normalizeDomain(domain: string): string {
  return domainToASCII(domain.trim()).replace(/\.$/u, "");
}

function matchesDomain(domain: string, domains: ReadonlySet<string>): boolean {
  for (let suffix = domain; suffix;) {
    if (domains.has(suffix)) return true;
    const dot = suffix.indexOf(".");
    if (dot === -1) return false;
    suffix = suffix.slice(dot + 1);
  }
  return false;
}

function fuzzyForm(domain: string): string {
  return domain.replace(/^www\./u, "").replace(/\.[^.]+$/u, "");
}

function editDistance(left: string, right: string): number {
  let row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const next = [i];
    for (let j = 1; j <= right.length; j++) {
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + Number(left[i - 1] !== right[j - 1]));
    }
    row = next;
  }
  return row[right.length];
}

export function buildMetaMaskLookup(config: MetaMaskConfig) {
  // 路径条目只针对特定页面，域名查询不能把它们当成整站命中。
  const blacklist = new Set(config.blacklist.filter((entry) => !/[/@?#]/u.test(entry)).map(normalizeDomain));
  const whitelist = new Set(config.whitelist.map(normalizeDomain));
  const fuzzy = config.fuzzylist.map((entry) => ({ name: entry, form: fuzzyForm(normalizeDomain(entry)) }));

  return (domain: string): { detail?: string } | undefined => {
    if (matchesDomain(domain, whitelist)) return undefined;
    if (matchesDomain(domain, blacklist)) return {};
    if (config.tolerance > 0) {
      const form = fuzzyForm(domain);
      const match = fuzzy.find((entry) => editDistance(form, entry.form) <= config.tolerance);
      if (match) return { detail: `模糊匹配 ${match.name}。` };
    }
  };
}
