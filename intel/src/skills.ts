import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { promisify } from "node:util";
import { scanSkill, type RedlineId, type ScanRiskLevel } from "../../packages/core/dist/index.js";

const run = promisify(execFile);
const clawHub = "https://clawhub.ai";
const binance = "https://github.com/binance/binance-skills-hub";

export function clawHubSkillUrl(owner: string, slug: string): string {
  return clawHub + "/" + encodeURIComponent(owner) + "/skills/" + encodeURIComponent(slug);
}

interface SkillSource {
  slug: string;
  version: string | null;
  sourceUrl: string;
}

export interface SkillScan extends SkillSource {
  contentHash: string;
  level: ScanRiskLevel;
  redlines: RedlineId[];
  locations: { redline: RedlineId; file: string; line: number }[];
}

async function scan(source: SkillSource, path: string): Promise<SkillScan> {
  const { contentHash, level, redlines, evidence } = await scanSkill(path);
  return {
    ...source, contentHash, level,
    redlines: (Object.keys(redlines) as RedlineId[]).filter((id) => redlines[id]),
    locations: evidence.flatMap(({ ruleId, file, line }) => ruleId === "review-injection"
      ? [] : [{ redline: ruleId, file, line }]),
  };
}

function scanCounts(results: SkillScan[]) {
  const levels = { none: 0, suspicious: 0, high: 0 };
  for (const { level } of results) levels[level]++;
  return levels;
}

interface CatalogEntry {
  ownerHandle: string;
  slug: string;
  latestVersion: { version: string } | null;
}

interface GitHubHandoff {
  sourceRef: "public-github";
  archiveUrl: string;
  commit: string;
  path: string;
}

// 使用 ZIP 的 UTF-8 文件名，忽略 core 目录扫描也会跳过的符号链接。
const extractZip = `
from stat import S_ISLNK
from sys import argv
from zipfile import ZipFile

with ZipFile(argv[1]) as archive:
    for entry in archive.infolist():
        if not S_ISLNK(entry.external_attr >> 16):
            archive.extract(entry, argv[2])
`;

async function scanArchive(source: SkillSource, archive: string, cacheDir: string, handoff?: GitHubHandoff) {
  const directory = await mkdtemp(join(cacheDir, "unpack-"));
  try {
    await run("python3", ["-c", extractZip, archive, directory]);
    if (!handoff) return await scan(source, directory);

    const [entry, ...other] = await readdir(directory, { withFileTypes: true });
    if (!entry?.isDirectory() || other.length) throw new Error("GitHub 归档缺少单一仓库目录。");
    const root = await realpath(join(directory, entry.name));
    const skill = await realpath(resolve(root, handoff.path));
    const location = relative(root, skill);
    if (location === ".." || location.startsWith("../")) throw new Error("GitHub Skill 路径超出仓库目录。");
    return await scan({ ...source, version: handoff.commit }, skill);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function scanClawHub({ limit, delayMs, cacheDir, fetcher = fetch, onProgress }: {
  limit: number;
  delayMs: number;
  cacheDir: string;
  fetcher?: typeof fetch;
  onProgress?: (done: number, listed: number) => void;
}) {
  await mkdir(cacheDir, { recursive: true });
  let nextRequestAt = 0;
  let stopped: string | undefined;
  async function request(url: URL) {
    const now = Date.now();
    const requestAt = Math.max(nextRequestAt, now);
    nextRequestAt = requestAt + delayMs;
    await setTimeout(requestAt - now);
    if (stopped) throw new Error(stopped);
    const response = await fetcher(url, { signal: AbortSignal.timeout(30_000) });
    if (response.status === 429) {
      stopped = `扫描已暂停：${url.host} 返回 HTTP 429，Retry-After 为 ${response.headers.get("retry-after") ?? "未提供"}。`;
      throw new Error(stopped);
    }
    if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}）。`);
    return response;
  }

  async function saveArchive(response: Response, file: string) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    const temporary = file + "." + randomUUID();
    try {
      await writeFile(temporary, bytes);
      await rename(temporary, file);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  const catalog = new Map<string, CatalogEntry>();
  let cursor: string | null = null;
  do {
    const url = new URL("/api/v1/skills?limit=100&sort=createdAt", clawHub);
    if (cursor) url.searchParams.set("cursor", cursor);
    const page = await (await request(url)).json() as { items: CatalogEntry[]; nextCursor?: string | null };
    for (const item of page.items) {
      const key = `${item.ownerHandle}/${item.slug}`;
      if (!catalog.has(key)) catalog.set(key, item);
      if (catalog.size >= limit) break;
    }
    cursor = page.nextCursor ?? null;
  } while (cursor && catalog.size < limit);

  const entries = [...catalog.values()].entries();
  const outcomes: (SkillScan | (SkillSource & { message: string }))[] = [];
  let done = 0;

  async function scanEntry({ slug, ownerHandle, latestVersion }: CatalogEntry) {
    const version = latestVersion?.version ?? null;
    const source = { slug: `${ownerHandle}/${slug}`, version, sourceUrl: clawHubSkillUrl(ownerHandle, slug) };
    try {
      const url = new URL("/api/v1/download", clawHub);
      url.search = new URLSearchParams({ slug, owner: ownerHandle, ...(version ? { version } : {}) }).toString();
      const key = createHash("sha256").update(url.href).digest("hex");
      const zip = join(cacheDir, key + ".zip");
      if (version && await exists(zip)) return await scanArchive(source, zip, cacheDir);

      const response = await request(url);
      if (!response.headers.get("content-type")?.includes("application/json")) {
        await saveArchive(response, zip);
        return await scanArchive(source, zip, cacheDir);
      }

      const handoff = await response.json() as GitHubHandoff;
      const archiveUrl = new URL(handoff.archiveUrl);
      if (handoff.sourceRef !== "public-github" || archiveUrl.origin !== "https://api.github.com"
        || !/^\/repos\/[^/]+\/[^/]+\/zipball\/[a-f\d]{40}$/iu.test(archiveUrl.pathname)) {
        throw new Error("ClawHub 未返回固定提交的公开 GitHub 归档。");
      }
      const archiveKey = createHash("sha256").update(archiveUrl.href).digest("hex");
      const archive = join(cacheDir, archiveKey + ".github.zip");
      if (!await exists(archive)) await saveArchive(await request(archiveUrl), archive);
      return await scanArchive(source, archive, cacheDir, handoff);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ...source, message };
    }
  }
  async function worker() {
    for (const [index, item] of entries) {
      if (stopped) break;
      outcomes[index] = await scanEntry(item);
      done++;
      if (done % 50 === 0) onProgress?.(done, catalog.size);
    }
  }

  await Promise.all(Array.from({ length: 4 }, worker));
  const results = outcomes.filter((item) => "contentHash" in item);
  const errors = outcomes.filter((item) => "message" in item);
  return { listed: catalog.size, levels: scanCounts(results), results, errors, stopped };
}

export async function scanBinance(repository: string) {
  if (!await exists(join(repository, ".git"))) {
    await mkdir(dirname(repository), { recursive: true });
    await run("git", ["clone", "--depth", "1", "--", binance + ".git", repository]);
  }
  const { stdout: commit } = await run("git", ["-C", repository, "rev-parse", "HEAD"]);
  const version = commit.trim();
  const { stdout: fileList } = await run("git", ["-C", repository, "ls-files", "-z"]);
  const results = [];
  for (const file of fileList.split("\0").filter((file) => /(^|\/)SKILL\.md$/iu.test(file))) {
    const slug = dirname(file);
    const sourceUrl = `${binance}/tree/${version}/${slug}`;
    results.push(await scan({ slug, sourceUrl, version }, join(repository, slug)));
  }
  const levels = scanCounts(results);
  return { version, scanned: results.length, levels, falsePositives: levels.high, results };
}

async function exists(path: string) {
  try {
    await realpath(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return false;
  }
}
