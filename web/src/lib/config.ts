import { createPublicClient, http, isAddress, type Address } from "viem";
import { bsc, bscTestnet } from "viem/chains";
import type { Deployment } from "./registry";

function addressFrom(value: string | undefined): Address | undefined {
  return value && isAddress(value, { strict: false }) ? value : undefined;
}

export const registryAddress = addressFrom(process.env.NEXT_PUBLIC_REGISTRY_ADDRESS);
const fromBlock = process.env.NEXT_PUBLIC_DEPLOYMENT_BLOCK?.trim();
export const chain = process.env.NEXT_PUBLIC_CHAIN_ID === "97" ? bscTestnet : bsc;
export const deployment: Deployment | undefined = registryAddress && fromBlock && /^\d+$/.test(fromBlock)
  ? { address: registryAddress, fromBlock: BigInt(fromBlock) }
  : undefined;

export const relayerUrl = process.env.NEXT_PUBLIC_RELAYER_URL;
export const agentIdAddress = addressFrom(process.env.NEXT_PUBLIC_AGENT_ID_ADDRESS)
  ?? (chain.id === bsc.id ? "0x60b9262456de011f7d15a54cdd8c48baaa8b022f" : undefined);
export const poseidonAddress = addressFrom(process.env.NEXT_PUBLIC_POSEIDON_T3_ADDRESS);

export function browserRpc() {
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
  if (!rpcUrl) throw new Error("尚未配置链上 RPC。");
  return createPublicClient({
    chain,
    transport: http(rpcUrl, { timeout: 30_000, retryCount: 2 }),
    batch: { multicall: { batchSize: 4_096 } },
  });
}

export const explorer = chain.blockExplorers.default.url;
