import type { IntelLookupResult } from "./types.js";

export type GoPlusTarget = { site: URL } | { address: string };
export interface GoPlusOptions {
  timeoutMs?: number;
}

const api = "https://api.gopluslabs.io/api/v1/";
const addressFlags = [
  "honeypot_related_address", "phishing_activities", "blackmail_activities", "stealing_attack",
  "fake_kyc", "malicious_mining_activities", "darkweb_transactions", "cybercrime",
  "money_laundering", "financial_crime", "blacklist_doubt", "mixer", "sanctioned",
  "gas_abuse", "reinit", "fake_standard_interface", "fake_token",
];

/** 查询 GoPlus 的网站或 BSC 地址情报，仅发起一次请求。 */
export async function queryGoPlus(
  target: GoPlusTarget, { timeoutMs = 5_000 }: GoPlusOptions = {},
): Promise<IntelLookupResult> {
  const site = "site" in target;
  const excerpt = site ? target.site.hostname.replace(/\.$/u, "") : target.address.trim().toLowerCase();
  const url = new URL(site ? "phishing_site" : "address_security/" + encodeURIComponent(excerpt), api);
  url.searchParams.set(site ? "url" : "chain_id", site ? target.site.href : "56");

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
    if (response.ok) {
      const { code, result } = await response.json() as { code: number; result: Record<string, unknown> | null };
      if (code === 1 && result && typeof result === "object") {
        const fields = site ? ["phishing_site"] : addressFlags;
        const known = fields.some((field) => /^(?:0|1)$/u.test(String(result[field])));
        const flags = fields.filter((field) => result[field] === 1 || result[field] === "1");
        if (!site && Number(result.number_of_malicious_contracts_created) > 0) {
          flags.push("number_of_malicious_contracts_created");
        }
        if (known || flags.length) {
          const observedAt = new Date().toISOString();
          const detail = site ? undefined : `地址风险标记：${flags.join("、")}。`;
          return {
            hits: flags.length ? [{ kind: "intel", source: "GoPlus", excerpt, observedAt, ...(detail ? { detail } : {}) }] : [],
            notes: [],
          };
        }
      }
    }
  } catch {
    // 超时、网络错误和不可解析的响应都视为本次查询未完成。
  }
  return { hits: [], notes: ["GoPlus 未查询"] };
}
