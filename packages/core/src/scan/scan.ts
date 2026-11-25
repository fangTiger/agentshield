import { createHash } from "node:crypto";
import { comparePaths, isSkillContentPath, readSkillFiles } from "./input.js";
import { rulesVersion, staticEvidence } from "./rules.js";
import type { ScanEvidence, ScanOptions, ScanResult, ScanRiskLevel, SkillFile } from "./types.js";

export const levelLabels = { high: "高风险", suspicious: "可疑", none: "未发现风险" } as const;

function communitySignals(externalHits: ScanOptions["externalHits"], confirmed: boolean): ScanResult["communitySignals"] {
  if (externalHits === undefined) return { queried: false, note: "未查询社区信号" };
  const hits = [...externalHits];
  if (confirmed) {
    return { queried: true, hits, note: "社区已确认风险，建议不要安装。" };
  }
  return { queried: true, hits };
}

function redlineStatus(evidence: readonly ScanEvidence[]): ScanResult["redlines"] {
  const redlines = { R1: false, R2: false, R3: false, R4: false, R5: false, R6: false };
  for (const { ruleId } of evidence) {
    if (ruleId !== "review-injection") redlines[ruleId] = true;
  }
  return redlines;
}

/** 按文件路径排序并统一换行，计算 D9 定义的 SHA-256 内容哈希。 */
export function hashSkillFiles(files: readonly SkillFile[]): ScanResult["contentHash"] {
  const hash = createHash("sha256");
  for (const { path, content } of files.filter(({ path }) => isSkillContentPath(path)).sort(comparePaths)) {
    hash.update(path).update("\0").update(content.replace(/\r\n?/gu, "\n"));
  }
  return `0x${hash.digest("hex")}`;
}

/** 对已读取的文件做离线扫描，支持复用同一批文件创建 LLM 审查包。 */
export function scanSkillFiles(
  files: readonly SkillFile[], options: Pick<ScanOptions, "externalHits"> = {},
): ScanResult {
  const matches = staticEvidence(files.filter(({ path }) => isSkillContentPath(path)).sort(comparePaths));
  const evidence = matches.map(({ severity: _severity, ...finding }) => finding);
  const { externalHits } = options;
  const confirmed = externalHits?.some((hit) => hit.kind === "community" && hit.status === "社区确认") ?? false;
  const level: ScanRiskLevel = confirmed || matches.some(({ severity }) => severity === "high") ? "high"
    : matches.length || externalHits?.length ? "suspicious" : "none";
  return {
    level, levelLabel: levelLabels[level], contentHash: hashSkillFiles(files),
    rulesVersion, redlines: redlineStatus(evidence), evidence, communitySignals: communitySignals(externalHits, confirmed),
  };
}

/** 读取 Skill 并生成静态红线报告。 */
export async function scanSkill(input: string | URL, options: ScanOptions = {}): Promise<ScanResult> {
  return scanSkillFiles(await readSkillFiles(input, options), options);
}
