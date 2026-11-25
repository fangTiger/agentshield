import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scrypt } from "node:crypto";
import { link, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { promisify } from "node:util";
import { Identity } from "@semaphore-protocol/identity";
import { readJson } from "./config.js";

const deriveKey = promisify(scrypt);
const identityFile = "identity.json";

interface Backup {
  version: 1;
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

export async function askPassphrase(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) throw new Error("请在终端中运行此命令并输入备份口令。");
  const output = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const terminal = createInterface({ input: process.stdin, output, terminal: true, historySize: 0 });
  process.stderr.write(prompt + " ");
  try {
    return await terminal.question("");
  } finally {
    terminal.close();
    process.stderr.write("\n");
  }
}

export async function loadIdentity(dataDir: string): Promise<Identity | undefined> {
  const file = await readJson<{ secret: string }>(join(dataDir, identityFile));
  if (!file) return undefined;
  if (typeof file.secret !== "string" || !file.secret) throw new Error("本机身份文件无效，请从加密备份恢复。");
  return Identity.import(file.secret);
}

async function saveIdentity(dataDir: string, secret: string): Promise<void> {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const temporary = join(dataDir, `.identity-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify({ secret }) + "\n", { flag: "wx", mode: 0o600 });
    // 完整写入后才公布文件名，且保留已经存在的身份。
    await link(temporary, join(dataDir, identityFile));
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function getOrCreateIdentity(dataDir: string): Promise<Identity> {
  const existing = await loadIdentity(dataDir);
  if (existing) return existing;
  const identity = new Identity();
  try {
    await saveIdentity(dataDir, identity.export());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      const concurrent = await loadIdentity(dataDir);
      if (concurrent) return concurrent;
    }
    throw error;
  }
  return identity;
}

export async function exportIdentity(dataDir: string, path: string, prompt: typeof askPassphrase): Promise<void> {
  const identity = await loadIdentity(dataDir);
  if (!identity) throw new Error("本机没有可备份的 AgentShield 身份。");
  const passphrase = await prompt("请输入新的备份口令。");
  if (!passphrase || passphrase !== await prompt("请再次输入备份口令。")) {
    throw new Error("备份口令不能为空，两次输入必须一致。");
  }
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(passphrase, salt, 32) as Buffer;
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(identity.export(), "utf8"), cipher.final()]);
  const backup: Backup = {
    version: 1, salt: salt.toString("base64"), iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64"),
  };
  await writeFile(path, JSON.stringify(backup) + "\n", { flag: "wx", mode: 0o600 });
}

export async function importIdentity(dataDir: string, path: string, prompt: typeof askPassphrase): Promise<void> {
  if (await loadIdentity(dataDir)) throw new Error("本机已有身份。请在丢失身份的设备上恢复备份。");
  const backup = await readJson<Backup>(path);
  if (backup?.version !== 1) throw new Error("未找到支持的 AgentShield 加密备份。");
  const passphrase = await prompt("请输入备份口令。");
  let secret: string;
  try {
    const key = await deriveKey(passphrase, Buffer.from(backup.salt, "base64"), 32) as Buffer;
    const cipher = createDecipheriv("aes-256-gcm", key, Buffer.from(backup.iv, "base64"), { authTagLength: 16 });
    cipher.setAuthTag(Buffer.from(backup.tag, "base64"));
    secret = Buffer.concat([cipher.update(Buffer.from(backup.ciphertext, "base64")), cipher.final()]).toString("utf8");
  } catch {
    throw new Error("无法解密身份备份，请核对口令和文件。");
  }
  await saveIdentity(dataDir, secret);
}
