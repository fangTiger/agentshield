import type { AuthExternalHit } from "../auth/types.js";

export type ScanRiskLevel = "high" | "suspicious" | "none";
export type RedlineId = "R1" | "R2" | "R3" | "R4" | "R5" | "R6";
export type ScanRuleId = RedlineId | "review-injection";

export interface SkillFile {
  /** 以 Skill 根目录为基准、用斜杠分隔的相对路径。 */
  path: string;
  content: string;
}

export interface ScanOptions {
  /** 调用方按内容哈希查到的结果。空数组表示已查询但无命中。 */
  externalHits?: readonly AuthExternalHit[];
  /** 返回公开 GitHub 仓库 tarball 的字节。 */
  download?: (url: URL) => Promise<Uint8Array>;
}

export interface LlmFinding {
  ruleId: ScanRuleId;
  file: string;
  line: number;
  excerpt: string;
}

export interface LlmVerdict {
  level: ScanRiskLevel;
  findings?: LlmFinding[];
}

export interface ScanEvidence extends LlmFinding {
  source: "static" | "llm";
  explanation: string;
}

export type CommunitySignals =
  | { queried: false; note: "未查询社区信号" }
  | { queried: true; hits: AuthExternalHit[]; note?: "社区已确认风险，建议不要安装。" };

export interface ScanResult {
  level: ScanRiskLevel;
  levelLabel: "高风险" | "可疑" | "未发现风险";
  contentHash: `0x${string}`;
  rulesVersion: number;
  redlines: Record<RedlineId, boolean>;
  evidence: ScanEvidence[];
  communitySignals: CommunitySignals;
}
