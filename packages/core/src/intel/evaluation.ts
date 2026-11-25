import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { phraseEvidence } from "../auth/phrases.js";
import { scanSkillFiles } from "../scan/scan.js";

export interface EvaluationSample {
  text: string;
  phishing: boolean;
  injection: boolean;
}

const datasets = [
  { name: "deepset/prompt-injections", textField: "text", labelField: "label", positive: 1, negative: 0 },
  { name: "Lakera/gandalf_ignore_instructions", textField: "text" },
  { name: "jackhhao/jailbreak-classification", textField: "prompt", labelField: "type", positive: "jailbreak", negative: "benign" },
] as const;

interface RowsPage {
  num_rows_total: number;
  rows: { row: Record<string, unknown> }[];
}

interface DatasetMetadata {
  sha: string;
  cardData?: { license?: string };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`评测数据拉取失败（HTTP ${response.status}）：${url}`);
  return await response.json() as T;
}

async function loadDataset(dataset: typeof datasets[number]) {
  const { name, textField } = dataset;
  const source = `https://huggingface.co/datasets/${name}`;
  const getPage = (offset: number) => fetchJson<RowsPage>(
    "https://datasets-server.huggingface.co/rows?" + new URLSearchParams({
      dataset: name, config: "default", split: "test", offset: String(offset), length: "100",
    }),
  );
  const [first, metadata] = await Promise.all([
    getPage(0), fetchJson<DatasetMetadata>(`https://huggingface.co/api/datasets/${name}`),
  ]);
  const offsets = Array.from({ length: Math.ceil(first.num_rows_total / 100) - 1 }, (_, index) => (index + 1) * 100);
  const pages = [first, ...await Promise.all(offsets.map(getPage))];
  const rows = pages.flatMap((page) => page.rows);
  if (!rows.length || rows.length !== first.num_rows_total || !metadata.sha) {
    throw new Error(`${name} 的测试分片或版本信息不完整。`);
  }
  const samples = rows.map(({ row }): EvaluationSample => {
    const text = row[textField];
    const label = "labelField" in dataset ? row[dataset.labelField] : undefined;
    if (typeof text !== "string" || ("labelField" in dataset && label !== dataset.positive && label !== dataset.negative)) {
      throw new Error(`${name} 的文本或标签格式无效。`);
    }
    const attack = "labelField" in dataset ? label === dataset.positive : true;
    return { text, phishing: attack, injection: attack };
  });
  return {
    name: `[${name}](${source})`,
    version: `[\`${metadata.sha.slice(0, 12)}\`](${source}/tree/${metadata.sha})`,
    license: metadata.cardData?.license ?? "数据集卡未注明",
    samples,
  };
}

function rates(samples: readonly EvaluationSample[], expected: "phishing" | "injection", detect: (text: string) => boolean) {
  let positives = 0;
  let truePositives = 0;
  let falsePositives = 0;
  for (const sample of samples) {
    const detected = detect(sample.text);
    if (sample[expected]) {
      positives++;
      if (detected) truePositives++;
    } else if (detected) {
      falsePositives++;
    }
  }
  const rate = (hits: number, total: number) =>
    total ? `${hits}/${total}（${(100 * hits / total).toFixed(1)}%）` : "不适用";
  return [rate(truePositives, positives), rate(falsePositives, samples.length - positives)];
}

/** 拉取测试分片并只将聚合结果写入评测报告。 */
export async function writeEvaluationReport(
  walletSamples: readonly EvaluationSample[], outputDir: string, now: Date = new Date(),
): Promise<string> {
  const sources = [
    ...await Promise.all(datasets.map(loadDataset)),
    { name: "Agentic Wallet 自建样本", version: "v1", license: "项目自建", samples: walletSamples },
  ];
  const rows = sources.map(({ name, version, license, samples }) => {
    const phishing = rates(samples, "phishing", (text) => phraseEvidence(text).length > 0);
    const injection = rates(samples, "injection", (text) => scanSkillFiles([{ path: "SKILL.md", content: text }])
      .evidence.some(({ ruleId }) => ruleId === "review-injection"));
    return `| ${[name, version, license, samples.length, ...phishing, ...injection].join(" | ")} |`;
  });
  const date = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  const report = [
    `# AgentShield 规则评测（${date}）`,
    "",
    "公开数据取自 Hugging Face datasets-server 的默认配置和完整测试分片。版本列记录运行时读取到的上游修订号。",
    "公开集沿用原始攻击与良性标签，分别送入两类规则。Lakera 测试分片只有攻击样本，因此误报率不适用。自建样本按两类规则分别标注。",
    "",
    "| 数据集 | 版本 | 许可证 | 样本数 | 授权话术检出率 | 授权话术误报率 | 审查者注入检出率 | 审查者注入误报率 |",
    "| --- | --- | --- | ---: | --- | --- | --- | --- |",
    ...rows,
    "",
    "检出率为命中的正例数除以正例总数，误报率为命中的负例数除以负例总数。授权话术只计话术规则，审查者注入只计静态 `review-injection` 证据。",
    "",
    "通用注入数据集覆盖提示词篡改和越狱等任务，与钱包钓鱼话术以及针对 Skill 审查者的指令存在领域差异，较低的检出率符合预期。自建样本用于检查特定场景，样本量有限。",
    "",
  ].join("\n");

  await mkdir(outputDir, { recursive: true });
  const path = join(outputDir, `${date}-report.md`);
  await writeFile(path, report);
  return path;
}
