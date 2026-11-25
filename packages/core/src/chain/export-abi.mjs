import { readFile, writeFile } from "node:fs/promises";
import { URL } from "node:url";

const artifact = new URL("../../../../contracts/out/AgentShieldRegistry.sol/AgentShieldRegistry.json", import.meta.url);
const { abi } = JSON.parse(await readFile(artifact, "utf8"));

const source = [
  "// 由 export-abi.mjs 从 Foundry 产物生成。",
  "export const registryAbi = [",
  ...abi.map((item) => "  " + JSON.stringify(item) + ","),
  "] as const;",
  "",
].join("\n");
await writeFile(new URL("./abi.ts", import.meta.url), source);
