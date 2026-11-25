import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { log } from "node:console";

const root = fileURLToPath(new URL("../", import.meta.url));
const { RPC_URL, DEPLOYER_PRIVATE_KEY, SEEDER_ADDRESS, CHAIN_ID, FOUNDRY_BROADCAST } = process.env;
if (!RPC_URL || !DEPLOYER_PRIVATE_KEY || !SEEDER_ADDRESS) {
  throw new Error("部署需要 RPC_URL、DEPLOYER_PRIVATE_KEY 和 SEEDER_ADDRESS");
}

const chainId = Number(execFileSync("cast", ["chain-id", "--rpc-url", RPC_URL], { encoding: "utf8" }).trim());
if (CHAIN_ID !== undefined && Number(CHAIN_ID) !== chainId) {
  throw new Error(`RPC 的链 ID 为 ${chainId}，与 CHAIN_ID=${CHAIN_ID} 不符`);
}
const script = "DeployAgentShield.s.sol";
const forgeEnv = { ...process.env };
delete forgeEnv.AGENTSHIELD_SEEDER;
execFileSync("forge", [
  "script", `script/${script}:DeployAgentShield`, "--rpc-url", RPC_URL,
  "--broadcast", "--slow", "--non-interactive",
], { cwd: root, env: forgeEnv, stdio: "inherit" });

// 使用广播回执中的真实部署区块，不使用脚本模拟时的区块。
const recordPath = resolve(root, FOUNDRY_BROADCAST ?? "broadcast", script, String(chainId), "run-latest.json");
const { transactions, receipts, libraries } = JSON.parse(await readFile(recordPath, "utf8"));
const contract = (name) => transactions.find(({ contractName }) => contractName === name);
const registry = contract("AgentShieldRegistry");
const receipt = receipts.find(({ transactionHash }) => transactionHash === registry.hash);
const [agentId, semaphore, n, t, seeder] = registry.arguments;
const poseidonLink = libraries.find((library) => library.includes(":PoseidonT3:"));

const deployment = {
  chainId,
  registry: registry.contractAddress,
  deploymentBlock: BigInt(receipt.blockNumber).toString(),
  deploymentTxHash: receipt.transactionHash,
  agentId,
  mockAgentId: Boolean(contract("MockAgentIdTestnet")),
  semaphore,
  semaphoreVerifier: contract("SemaphoreVerifier").contractAddress,
  poseidonT3: poseidonLink.split(":").at(-1),
  seeder,
  n,
  t,
};

const outputPath = process.argv[2] ?? resolve(root, "deployments", `${chainId}.json`);
const json = JSON.stringify(deployment, null, 2);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, json + "\n");
log(`已写入部署清单 ${outputPath}\n${json}`);
