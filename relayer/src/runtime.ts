import type { Hono } from "hono";
import { createPublicClient, createWalletClient, defineChain, getAddress, http, type Hex } from "viem";
import { nonceManager, privateKeyToAccount } from "viem/accounts";
import { bsc, bscTestnet, foundry } from "viem/chains";
import { createRelayer } from "./routes.js";

export function createConfiguredRelayer(env: NodeJS.ProcessEnv, app?: Hono) {
  function required(name: string, legacyName = name) {
    const value = env[name] ?? env[legacyName];
    if (!value) throw new Error(`缺少环境变量 ${name}`);
    return value;
  }

  const rpcUrl = required("RPC_URL", "RELAYER_RPC_URL");
  const transport = http(rpcUrl);
  const registryAddress = getAddress(required("REGISTRY_ADDRESS", "RELAYER_REGISTRY_ADDRESS"));
  const account = privateKeyToAccount(required("RELAYER_PRIVATE_KEY") as Hex, { nonceManager });
  const maxQps = Number(required("RELAYER_MAX_QPS"));
  if (!Number.isSafeInteger(maxQps) || maxQps < 0) {
    throw new Error("RELAYER_MAX_QPS 必须是非负整数");
  }
  const chainId = Number(env.CHAIN_ID);
  if (env.CHAIN_ID !== undefined && (!Number.isSafeInteger(chainId) || chainId <= 0)) {
    throw new Error("CHAIN_ID 必须是正整数");
  }
  const chain = env.CHAIN_ID === undefined ? undefined :
    [bsc, bscTestnet, foundry].find(({ id }) => id === chainId) ?? defineChain({
      id: chainId,
      name: `链 ${chainId}`,
      nativeCurrency: foundry.nativeCurrency,
      rpcUrls: { default: { http: [rpcUrl] } },
    });

  return createRelayer({
    publicClient: createPublicClient({ transport, chain }),
    walletClient: createWalletClient({ transport, chain, account }),
    account,
    registryAddress,
    deploymentBlock: BigInt(required("DEPLOYMENT_BLOCK", "RELAYER_DEPLOYMENT_BLOCK")),
    maxQps,
    dailyGasBudget: BigInt(required("RELAYER_DAILY_GAS_BUDGET")),
    chain,
  }, app);
}
