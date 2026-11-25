import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { parse } from "yaml";
import { domainEvidence, extractUrls } from "../auth/urls.js";
import type { ScanEvidence, ScanRiskLevel, ScanRuleId, SkillFile } from "./types.js";

type Severity = Exclude<ScanRiskLevel, "none">;
type StaticEvidence = ScanEvidence & { severity: Severity };

interface StaticRule {
  id: ScanRuleId;
  severity: Severity;
  explanation: string;
  patterns: string[];
  disclosures?: { permission: string; pattern: string }[];
}

const { version, rules } = parse(readFileSync(new URL("./redlines.yaml", import.meta.url), "utf8")) as {
  version: number;
  rules: StaticRule[];
};
export const rulesVersion = version;
const compiledRules = rules.map(({ id, severity, explanation, patterns, disclosures }) => ({
  id,
  severity,
  explanation,
  patterns: patterns.map((pattern) => new RegExp(pattern, "gimu")),
  disclosures: disclosures?.map(({ permission, pattern }) => ({
    permission: new RegExp(permission, "iu"), pattern: new RegExp(pattern, "iu"),
  })) ?? [],
}));

const warning = /(?:\b(?:never|do\s+not|don['’]t|ignore\s+any)|禁止|严禁|切勿|不要|勿)$/iu;
const explicitConsent = /(?:\b(?:unless|only\s+if)\s+(?:the user|they)\s+explicitly\s+(?:asks?|requests?)\s+to|除非\s*用户明确(?:要求|请求))$/iu;
const sentenceBreak = /[。！？!?；;]|\.(?=\s|$)|[,，]\s*(?:但(?:是)?|but\b)/iu;
const brandContext = /币安|binance/iu;
const codeExtensions = new Set([".js", ".mjs", ".ts", ".py", ".sol", ".sh"]);
const cLikeTokens = /\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`/gu;
const pythonTokens = /#[^\r\n]*|"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/gu;
const shellTokens = /\\[^\r\n]|#[^\r\n]*|'[^']*'|"(?:\\[\s\S]|[^"\\])*"/gu;

function codeForMatching(content: string, extension: string): string {
  const tokens = extension === ".py" ? pythonTokens : extension === ".sh" ? shellTokens : cLikeTokens;
  // 保留偏移和换行，证据仍引用原文。Shell 还保留引号边界和双引号内的变量展开。
  return content.replace(tokens, (token) => {
    const quote = token[0];
    if (extension !== ".sh" || (quote !== '"' && quote !== "'")) return token.replace(/[^\r\n]/g, " ");
    const body = token.slice(1, -1);
    const masked = quote === '"' ? body.replace(/\\[^\r\n]|\$(?:\{\w+\}|\w+)|[^\r\n]/g, (part) =>
      part.startsWith("$") && part.length > 1 ? part : " ".repeat(part.length)) : body.replace(/[^\r\n]/g, " ");
    return quote + masked + quote;
  });
}

export function reviewCriteria(): string[] {
  return compiledRules.map(({ id, explanation }) => id + " " + explanation);
}

export function staticEvidence(files: readonly SkillFile[]): StaticEvidence[] {
  const disclosurePatterns = compiledRules.flatMap(({ disclosures }) => disclosures);
  const activeDisclosures = files.filter(({ path }) => /(?:^|\/)(?:SKILL|README)\.md$/iu.test(path))
    .flatMap(({ path, content }) => disclosurePatterns
      .filter(({ pattern }) => pattern.test(content))
      .map(({ permission }) => ({ permission, directory: path.slice(0, path.lastIndexOf("/") + 1) })));
  const evidence: StaticEvidence[] = [];

  for (const { path, content } of files) {
    const extension = extname(path).toLowerCase();
    const code = codeExtensions.has(extension) ? codeForMatching(content, extension) : undefined;
    const findings = new Map<string, StaticEvidence>();
    function add(ruleId: ScanRuleId, line: number, excerpt: string, explanation: string, severity: Severity): void {
      const key = ruleId + ":" + line;
      const previous = findings.get(key);
      if (previous && (previous.severity === "high" || severity === "suspicious")) return;
      findings.set(key, { ruleId, file: path, line, excerpt, explanation, severity, source: "static" });
    }

    for (const { id, severity, explanation, patterns } of compiledRules) {
      const input = severity === "high" ? code : content;
      if (input === undefined) continue;
      for (const pattern of patterns) {
        const breaks = content.matchAll(/\r\n?|\n/gu);
        let nextBreak = breaks.next().value;
        let line = 1;
        let start = 0;
        for (const match of input.matchAll(pattern)) {
          while (nextBreak && nextBreak.index < match.index) {
            start = nextBreak.index + nextBreak[0].length;
            nextBreak = breaks.next().value;
            line++;
          }
          const lead = (content.slice(start, match.index).split(sentenceBreak).at(-1) ?? "")
            .replace(/[\s\p{P}]+$/u, "");
          if (warning.test(lead) || (id === "R2" && explicitConsent.test(lead))) continue;
          const permission = match.groups?.permission;
          if (permission && activeDisclosures.some((disclosure) =>
            path.startsWith(disclosure.directory) && disclosure.permission.test(permission),
          )) continue;

          const end = match.index + match[0].length;
          const untilBreak = content.slice(end).search(/[\r\n]/u);
          add(id, line, content.slice(start, untilBreak < 0 ? undefined : end + untilBreak), explanation, severity);
        }
      }
    }

    for (const [index, excerpt] of content.split(/\r\n?|\n/u).entries()) {
      for (const { url, excerpt: link } of extractUrls(excerpt)) {
        const domain = domainEvidence(url, link);
        if (!domain || domain.level === "none") continue;
        if (domain.ruleId === "domain.brand-similar" && !brandContext.test(excerpt)) continue;
        add("R5", index + 1, excerpt, domain.explanation, "suspicious");
      }
    }
    evidence.push(...[...findings.values()].sort((a, b) => a.line - b.line));
  }
  return evidence;
}
