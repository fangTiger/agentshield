import { keccak256, stringToHex, type Hex } from "viem";

export const targetTypes = ["域名", "地址", "Skill"] as const;
export const targetIdentifiers = ["域名哈希", "链 ID 与地址的哈希", "内容哈希"] as const;
export const statuses = ["无社区状态", "待验证", "社区确认", "有争议"] as const;

const sources = new Map(
  ["ScamSniffer", "MetaMask eth-phishing-detect", "AgentShield 主动扫描"]
    .map((name) => [keccak256(stringToHex(name)), name]),
);

export function sourceLabel(sourceId: Hex) {
  return sources.get(sourceId.toLowerCase() as Hex) ?? sourceId;
}

export function formatTime(timestamp: number) {
  if (!timestamp) return "暂无投票";
  return new Date(timestamp * 1_000).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}
