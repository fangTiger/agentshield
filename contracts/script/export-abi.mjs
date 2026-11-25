import { readFile, writeFile } from "node:fs/promises";
import { URL } from "node:url";

const artifactPath = new URL("../out/AgentShieldRegistry.sol/AgentShieldRegistry.json", import.meta.url);
const outputPath = new URL("../../relayer/src/abi.ts", import.meta.url);
const { abi } = JSON.parse(await readFile(artifactPath, "utf8"));

await writeFile(outputPath, [
  "// 由 contracts/script/export-abi.mjs 生成。",
  `export const agentShieldRegistryAbi = ${JSON.stringify(abi, null, 2)} as const;`,
  "",
].join("\n"));
