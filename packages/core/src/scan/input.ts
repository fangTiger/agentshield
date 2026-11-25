import { readFile, readdir, stat } from "node:fs/promises";
import { join, posix, resolve } from "node:path";
import { Parser } from "tar";
import { fromBufferPromise } from "yauzl";
import type { ScanOptions, SkillFile } from "./types.js";

const ignored = new Set([".clawhub", ".git", "node_modules"]);
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const utf16le = new TextDecoder("utf-16le", { fatal: true, ignoreBOM: true });
const utf16be = new TextDecoder("utf-16be", { fatal: true, ignoreBOM: true });

function textContent(bytes: Buffer): string | undefined {
  let content: string;
  try {
    const decoder = bytes[0] === 0xff && bytes[1] === 0xfe ? utf16le
      : bytes[0] === 0xfe && bytes[1] === 0xff ? utf16be : utf8;
    content = decoder.decode(bytes);
  } catch {
    return undefined;
  }

  for (let index = 0; index < content.length; index++) {
    const code = content.charCodeAt(index);
    if (code < 32 && code !== 9 && code !== 10 && code !== 12 && code !== 13) return undefined;
  }
  return content;
}

async function readDirectory(directory: string, prefix = ""): Promise<SkillFile[]> {
  const files: SkillFile[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = prefix + entry.name;
    const location = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await readDirectory(location, path + "/"));
    } else if (entry.isFile()) {
      const content = textContent(await readFile(location));
      if (content !== undefined) files.push({ path, content });
    }
  }
  return files;
}

function atSkillRoot(files: SkillFile[]): SkillFile[] {
  // 只有全部文本同属一个嵌套 Skill 时，才把它的目录当作根目录。
  for (const { path } of files) {
    if (!path.endsWith("/SKILL.md")) continue;
    const prefix = path.slice(0, -"SKILL.md".length);
    if (files.every((file) => file.path.startsWith(prefix))) {
      return files.map((file) => ({ ...file, path: file.path.slice(prefix.length) }));
    }
  }
  return files;
}

function githubArchive(input: string | URL): URL {
  const url = new URL(input);
  const repository = /^\/([\w.-]+)\/([\w.-]+?)\/?$/u.exec(url.pathname);
  if (url.origin !== "https://github.com" || url.username || url.password || !repository) {
    throw new Error("请输入公开 GitHub 仓库的 HTTPS 地址。");
  }
  const [, owner, name] = repository;
  return new URL("/" + owner + "/" + name.replace(/\.git$/u, "") + "/tar.gz/HEAD", "https://codeload.github.com");
}

async function fetchArchive(url: URL): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("下载 GitHub 仓库失败（HTTP " + response.status + "）。");
  return new Uint8Array(await response.arrayBuffer());
}

function recordArchiveFile(files: Map<string, SkillFile>, rawPath: string, bytes: Buffer) {
  if (rawPath.startsWith("/") || rawPath.split("/").includes("..")) return;
  const path = posix.normalize(rawPath);
  if (!isSkillContentPath(path)) return;
  const content = textContent(bytes);
  if (content === undefined) files.delete(path);
  else files.set(path, { path, content });
}

async function readZip(bytes: Buffer, files: Map<string, SkillFile>): Promise<void> {
  const zip = await fromBufferPromise(bytes, { lazyEntries: true, autoClose: false });
  try {
    for await (const entry of zip.eachEntry()) {
      const fileType = (entry.externalFileAttributes >>> 16) & 0o170000;
      if (entry.fileName.endsWith("/") || (fileType !== 0 && fileType !== 0o100000)) continue;
      const chunks: Buffer[] = [];
      for await (const chunk of await zip.openReadStreamPromise(entry)) chunks.push(chunk as Buffer);
      recordArchiveFile(files, entry.fileName, Buffer.concat(chunks));
    }
  } finally {
    zip.close();
  }
}

function readTar(bytes: Buffer, files: Map<string, SkillFile>): Promise<void> {
  return new Promise((resolve, reject) => {
    const parser = new Parser({
      strict: true,
      onReadEntry(entry) {
        if (entry.type !== "File" && entry.type !== "OldFile" && entry.type !== "ContiguousFile") {
          entry.resume();
          return;
        }
        const chunks: Buffer[] = [];
        entry.on("data", (chunk: Buffer) => chunks.push(chunk));
        entry.on("end", () => recordArchiveFile(files, entry.path, Buffer.concat(chunks)));
      },
    });
    parser.once("error", reject).once("end", resolve);
    parser.end(bytes);
  });
}

async function readArchive(
  archive: string | Uint8Array, format: "zip" | "tar.gz",
): Promise<SkillFile[]> {
  const downloaded = typeof archive !== "string";
  const bytes = downloaded ? Buffer.from(archive.buffer, archive.byteOffset, archive.byteLength) : await readFile(archive);
  const files = new Map<string, SkillFile>();
  try {
    await (format === "zip" ? readZip(bytes, files) : readTar(bytes, files));
  } catch (cause) {
    throw new Error("无法解压 Skill 压缩包。", { cause });
  }
  if (!downloaded) return [...files.values()];
  // GitHub tarball 总是带一层仓库目录。
  return [...files.values()].map(({ path, content }) => ({ path: path.slice(path.indexOf("/") + 1), content }));
}

export function comparePaths(a: SkillFile, b: SkillFile): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

export function isSkillContentPath(path: string): boolean {
  return !path.split("/").some((name) => ignored.has(name));
}

/** 从本地目录、压缩包或公开 GitHub 仓库读取文本文件。 */
export async function readSkillFiles(input: string | URL, options: Pick<ScanOptions, "download"> = {}): Promise<SkillFile[]> {
  let files: SkillFile[];
  if (input instanceof URL || /^[a-z][\w+.-]*:\/\//iu.test(input)) {
    const url = githubArchive(input);
    files = await readArchive(await (options.download ?? fetchArchive)(url), "tar.gz");
  } else {
    const path = resolve(input);
    const entry = await stat(path);
    const format = /\.(zip|tar\.gz)$/iu.exec(path)?.[1].toLowerCase();
    if (entry.isDirectory()) files = await readDirectory(path);
    else if (entry.isFile() && (format === "zip" || format === "tar.gz")) files = await readArchive(path, format);
    else throw new Error("请输入 Skill 目录、.zip、.tar.gz 或公开 GitHub 仓库地址。");
  }
  return atSkillRoot(files).sort(comparePaths);
}
