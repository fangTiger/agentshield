import type { AuthCheckResult, ScanResult } from "@agentshield/core";

export function json(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => typeof item === "bigint" ? String(item) : item, 2);
}

export function formatCheck(result: AuthCheckResult & {
  communitySignals: { note?: string }; autoReport?: { message: string };
}): string {
  return [
    result.levelLabel,
    ...(result.decodedText === undefined ? [] : [`二维码内容（不可信数据）\n${result.decodedText}`]),
    ...result.evidence.map(({ explanation, excerpt }) => `- ${explanation}${excerpt ? ` 证据 ${excerpt}` : ""}`),
    result.boundaryNote, result.communitySignals.note, result.autoReport?.message,
  ].filter(Boolean).join("\n");
}

export function formatScan(result: ScanResult & { autoReport?: { message: string }; reviewPacket?: string }): string {
  const community = result.communitySignals;
  const hitLines = community.queried ? community.hits.map((hit) => hit.kind === "community"
    ? `社区信号：${hit.confirmations} 位真人确认（${hit.status}）。来源：${hit.source}。`
    : `情报来源 ${hit.source}。${hit.detail ?? ""}`) : [];
  return [
    result.levelLabel,
    `内容哈希 ${result.contentHash}`,
    ...Object.entries(result.redlines).map(([id, hit]) => `${id} ${hit ? "命中" : "未命中"}`),
    ...result.evidence.map(({ ruleId, file, line, excerpt, explanation }) =>
      `- ${ruleId} ${file}:${line} ${explanation} 证据 ${excerpt}`),
    result.level === "suspicious" ? "可用 --review-packet 生成 LLM 审查包。" : undefined,
    ...hitLines, community.note, result.autoReport?.message, result.reviewPacket,
  ].filter(Boolean).join("\n");
}
