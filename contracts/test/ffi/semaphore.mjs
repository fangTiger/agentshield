import { existsSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { Group } from "@semaphore-protocol/group";
import { Identity } from "@semaphore-protocol/identity";
import { generateProof } from "@semaphore-protocol/proof";

const depth = 2;
// Semaphore 4.14.5 的证明库仍使用 4.13.0 版电路。
const artifactVersion = "4.13.0";
const cache = fileURLToPath(new URL(`../../cache/semaphore/${artifactVersion}/`, import.meta.url));
const [action, signer, members, message, scope] = process.argv.slice(2);

// 这些固定身份只用于测试。
const identities = [0, 1, 2].map((index) => new Identity(`agentshield-foundry-test-${index}`));

async function artifact(extension) {
  const filename = `semaphore-${depth}.${extension}`;
  const path = join(cache, filename);
  if (existsSync(path)) return path;

  const response = await globalThis.fetch(`https://snark-artifacts.pse.dev/semaphore/${artifactVersion}/${filename}`);
  if (!response.ok) throw new Error(`下载电路文件 ${filename} 失败（HTTP ${response.status}）`);

  await mkdir(cache, { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, new Uint8Array(await response.arrayBuffer()));
  await rename(temporaryPath, path);
  return path;
}

let values;
if (action === "commitments") {
  values = identities.map((identity) => identity.commitment);
} else if (action === "prove") {
  const group = new Group(members.split(",").map(BigInt));
  const [wasm, zkey] = await Promise.all([artifact("wasm"), artifact("zkey")]);
  const proof = await generateProof(identities[Number(signer)], group, message, scope, depth, { wasm, zkey });
  values = [proof.merkleTreeDepth, proof.merkleTreeRoot, proof.nullifier, proof.message, proof.scope, ...proof.points];
} else {
  throw new Error("未知的测试命令");
}

// 两种返回值均由静态 uint256 字组成。输出写完即退出，关闭 snarkjs 的工作线程。
const encoded = values.map((value) => BigInt(value).toString(16).padStart(64, "0")).join("");
process.stdout.write(`0x${encoded}`, () => process.exit(0));
