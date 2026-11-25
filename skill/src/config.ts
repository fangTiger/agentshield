import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createPublicClient, http, isAddress, type PublicClient } from "viem";
import type { Address } from "viem";
import { deployments } from "./deployments.js";

export const mainnetPending = "主网部署信息尚未内置，可设置 network=testnet 试用";

interface FileConfig {
  network?: keyof typeof deployments;
  agentIdAddress?: string;
  registryAddress?: string;
  deploymentBlock?: string | number;
  relayerUrl?: string;
  rpcUrl?: string;
  autoReport?: boolean;
}

export async function readJson<T>(path: string): Promise<T | undefined> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`无法读取 JSON 文件 ${path}。`);
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `.shield-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function loadConfig(dataDir: string, env: NodeJS.ProcessEnv) {
  const file = await readJson<FileConfig>(join(dataDir, "config.json"));
  const network = env.AGENTSHIELD_NETWORK ?? file?.network ?? "mainnet";
  if (network !== "mainnet" && network !== "testnet") {
    throw new Error("network 必须为 mainnet 或 testnet。");
  }
  const defaults = deployments[network];
  return {
    network,
    agentIdAddress: env.AGENTSHIELD_AGENT_ID_ADDRESS ?? file?.agentIdAddress ?? defaults.agentIdAddress,
    registryAddress: env.AGENTSHIELD_REGISTRY_ADDRESS ?? file?.registryAddress ?? defaults.registryAddress,
    deploymentBlock: String(env.AGENTSHIELD_DEPLOYMENT_BLOCK ?? file?.deploymentBlock ?? defaults.deploymentBlock),
    relayerUrl: env.AGENTSHIELD_RELAYER_URL ?? file?.relayerUrl ?? defaults.relayerUrl,
    rpcUrl: env.AGENTSHIELD_RPC_URL ?? file?.rpcUrl ?? defaults.rpcUrl,
    autoReport: file?.autoReport ?? true,
  };
}

export async function setAutoReport(dataDir: string, autoReport: boolean): Promise<void> {
  const path = join(dataDir, "config.json");
  const file = await readJson<FileConfig>(path);
  await writeJson(path, { ...file, autoReport });
}

export type Config = Awaited<ReturnType<typeof loadConfig>>;
export type ChainClient = Pick<PublicClient,
  "getChainId" | "readContract" | "getBlockNumber" | "getLogs" | "estimateGas">;

export interface Chain {
  client: ChainClient;
  registry: Address;
}

export function connectChain(config: Config, client?: ChainClient): Chain {
  if (config.network === "mainnet" && !config.registryAddress) throw new Error(mainnetPending);
  if (!isAddress(config.registryAddress) || !config.rpcUrl) {
    throw new Error("请在 ~/.agentshield/config.json 中配置有效的 registryAddress 和 RPC 地址 rpcUrl。");
  }
  return {
    client: client ?? createPublicClient({ transport: http(config.rpcUrl) }),
    registry: config.registryAddress,
  };
}

export function deploymentBlock(config: Config): bigint {
  if (config.network === "mainnet" && !config.deploymentBlock) throw new Error(mainnetPending);
  if (!/^\d+$/u.test(config.deploymentBlock)) {
    throw new Error("请在 ~/.agentshield/config.json 中配置部署区块 deploymentBlock。");
  }
  return BigInt(config.deploymentBlock);
}

export function relayerUrl(config: Config): string {
  if (!config.relayerUrl) {
    throw new Error(config.network === "mainnet" ? mainnetPending
      : "请在 ~/.agentshield/config.json 中配置中继地址 relayerUrl。");
  }
  return config.relayerUrl;
}
