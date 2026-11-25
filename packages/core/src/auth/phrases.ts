import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { AuthEvidence } from "./types.js";

interface PhraseRule {
  id: string;
  explanation: string;
  zh: string[];
  en: string[];
}

const { rules } = parse(readFileSync(new URL("./phrases.yaml", import.meta.url), "utf8")) as {
  version: number;
  rules: PhraseRule[];
};
const compiledRules = rules.map(({ id, explanation, zh, en }) => ({
  id,
  explanation,
  patterns: [...zh, ...en].map((pattern) => new RegExp(pattern, "iu")),
}));
const warning = /^\s*(?:(?:请)?(?:不要|勿|切勿|禁止|别)|(?:never|do not|don't)\b)/iu;
const sentenceBreak = /[。！？!?；;\n]|\.(?=\s|$)|[,，]\s*(?:但(?:是)?|but\b)/iu;

export function phraseEvidence(text: string): AuthEvidence[] {
  const evidence: AuthEvidence[] = [];
  const sentences = text.split(sentenceBreak).filter((sentence) => !warning.test(sentence));

  for (const { id, explanation, patterns } of compiledRules) {
    for (const sentence of sentences) {
      if (!patterns.some((pattern) => pattern.test(sentence))) continue;

      evidence.push({ ruleId: `phrase.${id}`, excerpt: sentence, explanation, level: "high" });
      break;
    }
  }

  return evidence;
}
