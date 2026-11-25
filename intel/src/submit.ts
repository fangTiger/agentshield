import { env as processEnv } from "node:process";
import { registryAbi } from "../../packages/core/dist/chain/abi.js";
import type { Address, Hex } from "../../packages/core/node_modules/viem/_types/index.js";
import type { Seed } from "./seeds.js";
import { accounts, viem } from "./viem.js";

interface SubmitOptions {
  batchSize?: number;
  broadcast?: boolean;
  env?: NodeJS.ProcessEnv;
  log?: (message: string) => void;
}

function estimateGas(batch: Seed[]) {
  const data = viem.encodeFunctionData({ abi: registryAbi, functionName: "seedBatch", args: [batch] });
  // 交易基础成本、按字节计算的 calldata，以及首次写入和事件的近似成本。
  const calldataGas = data.slice(2).match(/../gu)!.reduce((gas, byte) => gas + (byte === "00" ? 4 : 16), 0);
  return 21_000 + calldataGas + 26_000 * batch.length;
}

export async function submitSeeds(seeds: Seed[], {
  batchSize = 50, broadcast = false, env = processEnv, log = console.log,
}: SubmitOptions = {}) {
  const { SEEDER_PRIVATE_KEY, REGISTRY_ADDRESS, RPC } = env;
  if (broadcast && (!SEEDER_PRIVATE_KEY || !REGISTRY_ADDRESS || !RPC)) {
    throw new Error("广播需要同时提供 SEEDER_PRIVATE_KEY、REGISTRY_ADDRESS 和 RPC。");
  }

  const batches = Math.ceil(seeds.length / batchSize);
  if (!broadcast) {
    let total = 0;
    for (let index = 0; index < batches; index++) {
      const items = seeds.slice(index * batchSize, (index + 1) * batchSize);
      const gas = estimateGas(items);
      total += gas;
      log(`方案预览｜批次 ${index + 1}/${batches}：${items.length} 条，预估 gas ${gas}。`);
    }
    log(`方案预览合计：${seeds.length} 条，${batches} 批，预估 gas ${total}（离线估算）。`);
    return;
  }

  const account = accounts.privateKeyToAccount(SEEDER_PRIVATE_KEY as Hex);
  const transport = viem.http(RPC);
  const wallet = viem.createWalletClient({ account, transport });
  const client = viem.createPublicClient({ transport });
  for (let index = 0; index < batches; index++) {
    const items = seeds.slice(index * batchSize, (index + 1) * batchSize);
    const { request } = await client.simulateContract({
      account, address: REGISTRY_ADDRESS as Address, abi: registryAbi, functionName: "seedBatch", args: [items],
    });
    const hash = await wallet.writeContract(request);
    log(`批次 ${index + 1}/${batches} 已发送：${hash}。`);
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`批次 ${index + 1} 执行失败：${hash}。`);
  }
}
