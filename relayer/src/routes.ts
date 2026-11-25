import { verifyProof, type SemaphoreProof } from "@semaphore-protocol/proof";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  BaseError,
  ContractFunctionRevertedError,
  isHex,
  size,
  type Address,
  type Chain,
  type ContractFunctionArgs,
  type Hex,
  type LocalAccount,
  type PublicClient,
  type WalletClient,
} from "viem";
import { agentShieldRegistryAbi } from "./abi.js";
import { createStatsReader } from "./stats.js";

type VoteArgs = ContractFunctionArgs<typeof agentShieldRegistryAbi, "nonpayable", "vote">;

interface VoteBody {
  targetType: number;
  id: Hex;
  voteType: number;
  evidenceHash: Hex;
  proof: SemaphoreProof;
}

interface RelayerOptions {
  publicClient: Pick<PublicClient,
    "chain" | "readContract" | "simulateContract" | "estimateContractGas" | "getBlockNumber" | "getLogs" | "getBlock" | "multicall">;
  walletClient: Pick<WalletClient, "writeContract">;
  account: LocalAccount;
  registryAddress: Address;
  deploymentBlock: bigint;
  maxQps: number;
  dailyGasBudget: bigint;
  chain?: Chain;
}

export function createRelayer({
  publicClient, walletClient, account, registryAddress, deploymentBlock, maxQps, dailyGasBudget, chain,
}: RelayerOptions, app = new Hono()) {
  const { readStats, readTarget } = createStatsReader(publicClient, registryAddress, deploymentBlock);
  let currentSecond = -1;
  let requestsThisSecond = 0;
  let currentDay = -1;
  let reservedGas = 0n;

  app.onError((_error, c) => {
    console.log("匿名中继处理请求失败");
    return c.json({ error: "中继服务暂时不可用" }, 500);
  });

  app.use("/api/stats", cors({ origin: "*", allowMethods: ["GET"] }));
  app.use("/api/target", cors({ origin: "*", allowMethods: ["GET"] }));

  app.use(async (c, next) => {
    const second = Math.floor(Date.now() / 1_000);
    if (second !== currentSecond) {
      currentSecond = second;
      requestsThisSecond = 0;
    }
    if (requestsThisSecond >= maxQps) return c.json({ error: "超出全局请求频率" }, 429);
    requestsThisSecond += 1;
    await next();
  });

  app.post("/vote", async (c) => {
    let body: VoteBody;
    try {
      body = await c.req.json<VoteBody>();
      if (!await verifyProof(body.proof)) return c.json({ error: "证明无效" }, 400);
    } catch {
      return c.json({ error: "证明格式无效" }, 400);
    }

    const { targetType, id, voteType, evidenceHash, proof } = body;
    if (![0, 1, 2].includes(targetType) || ![0, 1].includes(voteType)
      || !isHex(id) || size(id) !== 32 || !isHex(evidenceHash) || size(evidenceHash) !== 32) {
      return c.json({ error: "投票参数无效" }, 400);
    }

    const nullifier = BigInt(proof.nullifier);
    const used = await publicClient.readContract({
      address: registryAddress, abi: agentShieldRegistryAbi, functionName: "usedNullifiers", args: [nullifier],
    });
    if (used) {
      return c.json({ error: "该证明已用于投票", errorName: "DuplicateVote" }, 409);
    }

    const [a0, a1, b0, b1, b2, b3, c0, c1] = proof.points;
    const args: VoteArgs = [targetType, id, voteType, evidenceHash, {
      merkleTreeDepth: BigInt(proof.merkleTreeDepth),
      merkleTreeRoot: BigInt(proof.merkleTreeRoot),
      nullifier,
      message: BigInt(proof.message),
      scope: BigInt(proof.scope),
      points: [BigInt(a0), BigInt(a1), BigInt(b0), BigInt(b1), BigInt(b2), BigInt(b3), BigInt(c0), BigInt(c1)],
    }];
    const vote = { address: registryAddress, abi: agentShieldRegistryAbi, functionName: "vote", account, args } as const;

    let simulation;
    let gas: bigint;
    try {
      simulation = await publicClient.simulateContract(vote);
      gas = await publicClient.estimateContractGas(vote);
    } catch (error) {
      const revert = error instanceof BaseError
        ? error.walk((cause) => cause instanceof ContractFunctionRevertedError)
        : undefined;
      const errorName = revert instanceof ContractFunctionRevertedError ? revert.data?.errorName : undefined;
      return c.json({ error: "投票模拟失败", errorName }, 400);
    }

    const day = Math.floor(Date.now() / 86_400_000);
    if (day !== currentDay) {
      currentDay = day;
      reservedGas = 0n;
    }
    if (reservedGas + gas > dailyGasBudget) return c.json({ error: "超出每日 gas 预算" }, 429);
    // 在发送前预留额度，使并发请求共享同一份预算。
    reservedGas += gas;
    const txHash = await walletClient.writeContract({ ...simulation.request, chain, gas });
    return c.json({ txHash });
  });

  app.get("/api/stats", async (c) => c.json(await readStats()));
  app.get("/api/target", async (c) => {
    const { type, id } = c.req.query();
    if (!type || !/^[012]$/.test(type) || !id || !/^0x[0-9a-f]{64}$/i.test(id)) {
      return c.json({ error: "对象参数无效" }, 400);
    }
    const target = await readTarget(Number(type), id);
    c.header("Cache-Control", "public, max-age=60");
    return target ? c.json(target) : c.json({ error: "链上未找到该对象的信号记录" }, 404);
  });
  return app;
}
