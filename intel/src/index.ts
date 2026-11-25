import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { skillId, TargetType } from "../../packages/core/dist/chain/encoding.js";
import { syncIntel } from "../../packages/core/dist/index.js";
import { filterDomains, makeSeeds, pendingSkillReviews, type Ioc, type Seed, type SkillReview } from "./seeds.js";
import { scanBinance, scanClawHub } from "./skills.js";
import { submitSeeds } from "./submit.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const cache = join(root, ".cache");
const out = join(root, "out");
const { positionals, values } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    "limit": { type: "string", default: "500" },
    "delay-ms": { type: "string", default: "300" },
    "cache-dir": { type: "string", default: join(cache, "intel") },
    "batch-size": { type: "string", default: "50" },
    "broadcast": { type: "boolean" },
  },
});

function integer(value: string, name: string, minimum: number) {
  const number = Number(value);
  if (!/^\d+$/u.test(value) || !Number.isSafeInteger(number) || number < minimum) {
    throw new Error(`${name} 必须是大于或等于 ${minimum} 的整数。`);
  }
  return number;
}

async function readJson<T>(file: string) {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

async function save(file: string, data: unknown) {
  await mkdir(out, { recursive: true });
  await writeFile(join(out, file), JSON.stringify(data, null, 2) + "\n");
}

async function main() {
  const [command, ...extra] = positionals;
  if (extra.length || (values.broadcast && command !== "submit")) {
    throw new Error("请指定一个子命令，--broadcast 只适用于 submit。");
  }
  switch (command) {
    case "clawhub": {
      const limit = integer(values.limit, "--limit", 1);
      const delayMs = integer(values["delay-ms"], "--delay-ms", 0);
      const reviews = await readJson<SkillReview[]>(join(root, "reviewed-skills.json"));
      const report = await scanClawHub({
        limit, delayMs, cacheDir: join(cache, "clawhub"),
        onProgress: (done, listed) => console.log(`ClawHub 已处理 ${done}/${listed} 个。`),
      });
      await save("clawhub-scan.json", report);
      const pending = pendingSkillReviews(report.results, reviews);
      await save("review-queue.json", pending);
      console.log("待人工复核 " + pending.length + " 个。");
      const { high, suspicious, none } = report.levels;
      console.log(`ClawHub 目录 ${report.listed} 个，已扫描 ${report.results.length} 个（高风险 ${high}，可疑 ${suspicious}，未发现风险 ${none}），失败 ${report.errors.length} 个。`);
      if (report.stopped) throw new Error(report.stopped);
      break;
    }
    case "baseline": {
      const report = await scanBinance(join(cache, "binance-skills-hub"));
      await save("binance-baseline.json", report);
      const { high, suspicious, none } = report.levels;
      console.log(`币安基线 ${report.scanned} 个（高风险 ${high}，可疑 ${suspicious}，未发现风险 ${none}）。`);
      for (const result of report.results.filter((item) => item.redlines.length > 0)) {
        console.log(`${result.slug}：${result.redlines.join("、")}。`);
      }
      break;
    }
    case "sync": {
      const feeds = await syncIntel(values["cache-dir"]);
      for (const feed of feeds) console.log(`${feed.source} ${feed.status}，数据时间 ${feed.observedAt}。`);
      break;
    }
    case "domains": {
      const report = await filterDomains(values["cache-dir"]);
      await save("lookalike-domains.json", report);
      console.log(`仿冒域名候选 ${report.count} 个。`);
      if (report.sources.some(({ observedAt }) => Date.now() - Date.parse(observedAt) > 7 * 86_400_000)) {
        console.log("情报可能过期。");
      }
      break;
    }
    case "seeds": {
      const [reviews, { domains }, iocs] = await Promise.all([
        readJson<SkillReview[]>(join(root, "reviewed-skills.json")),
        readJson<Awaited<ReturnType<typeof filterDomains>>>(join(out, "lookalike-domains.json")),
        readJson<Ioc[]>(join(root, "iocs.json")),
      ]);
      const seeds = makeSeeds(reviews, domains, iocs);
      await save("seeds.json", seeds);
      console.log(`已生成 ${seeds.length} 条种子。`);
      break;
    }
    case "submit": {
      const batchSize = integer(values["batch-size"], "--batch-size", 1);
      const seeds = await readJson<Seed[]>(join(out, "seeds.json"));
      if (values.broadcast) {
        const reviews = await readJson<SkillReview[]>(join(root, "reviewed-skills.json"));
        const approved = new Set(reviews.filter(({ verdict }) => verdict === "malicious")
          .map(({ contentHash }) => skillId(contentHash)));
        if (seeds.some(({ targetType, id }) => targetType === TargetType.SKILL && !approved.has(id))) {
          throw new Error("种子清单含有未经人工确认为恶意的 Skill，请重新生成种子。");
        }
      }
      await submitSeeds(seeds, { batchSize, broadcast: values.broadcast });
      break;
    }
    default:
      throw new Error("请指定子命令：clawhub、baseline、sync、domains、seeds 或 submit。");
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
