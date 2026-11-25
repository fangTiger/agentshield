import type { AuthIntelOptions } from "../intel/auth.js";

export type AuthRiskLevel = "high" | "suspicious" | "unknown" | "none";

/** 字符串可传链接、文本或带常见图片扩展名的现有本地路径。也可用 image 字段指定图片。 */
export type AuthCheckInput = URL | string | Buffer | { image: string | Buffer };

export interface AuthEvidence {
  ruleId: string;
  excerpt: string;
  explanation: string;
  level: AuthRiskLevel;
}

export type AuthExternalHit = {
  source: string;
  excerpt: string;
} & (
  | { kind: "intel"; observedAt?: string; detail?: string }
  | { kind: "community"; confirmations: number; status: "待验证" | "社区确认" | "有争议" }
);

export type AuthCommunityTarget =
  | { domain: string; official: boolean }
  | { address: `0x${string}` };

export interface AuthCheckOptions {
  /** 上层 Skill 记录的本机登录发起时间，单位为 Unix 毫秒。 */
  recentLocalLogins: readonly number[];
  /** 上层已经查到的情报或社区信号。 */
  externalHits?: readonly AuthExternalHit[];
  /** 按已解析的主机名和地址查询社区信号。 */
  lookupCommunity?: (targets: readonly AuthCommunityTarget[]) => Promise<readonly AuthExternalHit[]>;
  /** 启用本地名单查询，可同时显式启用 GoPlus 在线查询。 */
  intel?: AuthIntelOptions;
  /** 发现该链接或二维码的页面地址，由调用方提供。 */
  pageUrl?: string | URL;
  /** 返回展开后的 URL，无法展开时返回 undefined。 */
  expandUrl?: (url: URL) => Promise<URL | undefined>;
  /** 判定时使用的 Unix 毫秒时间戳，默认取当前时间。 */
  now?: number;
}

export interface AuthCheckResult {
  level: AuthRiskLevel;
  levelLabel: "高风险" | "可疑" | "未知" | "未发现风险";
  evidence: AuthEvidence[];
  boundaryNote: string;
  /** 二维码解码原文。 */
  decodedText?: string;
}
