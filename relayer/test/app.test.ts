import { verifyProof, type SemaphoreProof } from "@semaphore-protocol/proof";
import { BaseError, ContractFunctionRevertedError, encodeErrorResult, toHex } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRelayer } from "../src/routes.js";
import { agentShieldRegistryAbi } from "../src/abi.js";

vi.mock("@semaphore-protocol/proof", { spy: true });

const address = "0x0000000000000000000000000000000000000001";
const txHash = toHex(42, { size: 32 });
const sourceId = toHex(15, { size: 32 });
const vote = {
  targetType: 2,
  id: toHex(1, { size: 32 }),
  voteType: 0,
  evidenceHash: toHex(0, { size: 32 }),
  proof: {
    merkleTreeDepth: 2,
    merkleTreeRoot: "10",
    nullifier: "11",
    message: "12",
    scope: "13",
    points: ["1", "2", "3", "4", "5", "6", "7", "8"],
  } satisfies SemaphoreProof,
};

function setup(limits = { maxQps: 10, dailyGasBudget: 1_000_000n }) {
  const publicClient = {
    chain: undefined,
    readContract: vi.fn().mockResolvedValue(false),
    simulateContract: vi.fn().mockResolvedValue({ request: {} }),
    estimateContractGas: vi.fn().mockResolvedValue(400_000n),
    getBlockNumber: vi.fn().mockResolvedValue(10_001n),
    multicall: vi.fn(),
    getLogs: vi.fn().mockResolvedValue([]),
    getBlock: vi.fn(),
  };
  const walletClient = { writeContract: vi.fn().mockResolvedValue(txHash) };
  vi.mocked(verifyProof).mockResolvedValue(true);
  const app = createRelayer({
    publicClient,
    walletClient,
    account: privateKeyToAccount(generatePrivateKey()),
    registryAddress: address,
    deploymentBlock: 1n,
    ...limits,
  });
  const post = (body: unknown = vote) => app.request("/vote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { app, post, publicClient, walletClient };
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("POST /vote", () => {
  it("证明无效时返回 400，且不请求链", async () => {
    const { post, publicClient, walletClient } = setup();
    vi.mocked(verifyProof).mockResolvedValue(false);

    expect((await post()).status).toBe(400);
    expect(publicClient.readContract).not.toHaveBeenCalled();
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it("Semaphore 无法解析证明时返回 400", async () => {
    const { post, publicClient } = setup();
    vi.mocked(verifyProof).mockReset();

    expect((await post({ ...vote, proof: {} })).status).toBe(400);
    expect(publicClient.readContract).not.toHaveBeenCalled();
  });

  it("nullifier 已使用时返回 409，且不模拟或发送", async () => {
    const { post, publicClient, walletClient } = setup();
    publicClient.readContract.mockResolvedValue(true);

    expect((await post()).status).toBe(409);
    expect(publicClient.readContract).toHaveBeenCalledExactlyOnceWith({
      address, abi: agentShieldRegistryAbi, functionName: "usedNullifiers", args: [BigInt(vote.proof.nullifier)],
    });
    expect(publicClient.simulateContract).not.toHaveBeenCalled();
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it("模拟失败时返回解码后的合约错误名", async () => {
    const { post, publicClient, walletClient } = setup();
    const abi = agentShieldRegistryAbi;
    const data = encodeErrorResult({ abi, errorName: "InvalidScope" });
    const revert = new ContractFunctionRevertedError({ abi, data, functionName: "vote" });
    publicClient.simulateContract.mockRejectedValue(new BaseError("模拟失败", { cause: revert }));

    const response = await post();

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ errorName: "InvalidScope" });
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it("单笔预计 gas 超出每日预算时返回 429", async () => {
    const { post, walletClient } = setup({ maxQps: 10, dailyGasBudget: 399_999n });

    expect((await post()).status).toBe(429);
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it("并发请求共享预算，UTC 跨日后恢复", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-24T23:59:59Z"));
    const { post, walletClient } = setup({ maxQps: 10, dailyGasBudget: 400_000n });

    const responses = await Promise.all([post(), post()]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 429]);
    expect(await responses.find(({ status }) => status === 200)?.json()).toEqual({ txHash });
    expect(walletClient.writeContract).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ gas: 400_000n }),
    );
    vi.setSystemTime(new Date("2026-11-25T00:00:00Z"));
    expect((await post()).status).toBe(200);
  });

  it("并发请求超过全局 QPS 时返回 429", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { app, post } = setup({ maxQps: 2, dailyGasBudget: 1_000_000n });

    const responses = await Promise.all(Array.from({ length: 12 }, () => post()));
    expect(responses.map(({ status }) => status).sort()).toEqual([
      200, 200, ...Array<number>(10).fill(429),
    ]);
    expect((await app.request("/api/stats")).status).toBe(429);
  });
});

describe("GET /api/stats", () => {
  it("允许任意来源跨域读取统计，投票接口不返回 CORS 响应头", async () => {
    const { app } = setup();
    const headers = { origin: "https://dashboard.example" };
    const stats = await app.request("/api/stats", { headers });
    expect(stats.headers.get("access-control-allow-origin")).toBe("*");

    const preflight = await app.request("/api/stats", {
      method: "OPTIONS", headers: { ...headers, "access-control-request-method": "GET" },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toBe("GET");

    const vote = await app.request("/vote", { method: "POST", headers });
    expect(vote.headers.has("access-control-allow-origin")).toBe(false);
  });

  it("分段聚合登记和对象计数、统计 24 小时内的投票并缓存结果", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-24T12:00:00Z"));
    const { app, publicClient } = setup();
    const id = vote.id;
    const targetType = vote.targetType;
    const event = (eventName: string, args: object, blockNumber: bigint) => ({
      eventName, args, blockNumber, transactionHash: txHash,
    });
    publicClient.getLogs
      .mockResolvedValueOnce([
        event("Joined", { account: address, commitment: 1n }, 100n),
        event("Seeded", { targetType, id, sourceId }, 5_000n),
        event("Voted", { targetType, id, voteType: 1, evidenceHash: vote.evidenceHash, nullifier: 1n }, 5_000n),
      ])
      .mockResolvedValueOnce([
        event("Voted", { targetType, id, voteType: 0, evidenceHash: vote.evidenceHash, nullifier: 2n }, 5_001n),
        event("Seeded", { targetType, id, sourceId }, 5_002n),
        event("Appealed", { targetType, id, appellant: address, evidenceURI: "ipfs://test" }, 5_002n),
      ])
      .mockResolvedValueOnce([event("Seeded", { targetType: 0, id, sourceId }, 10_001n)]);
    const firstDangerAt = Date.now() / 1_000 - 86_400;
    publicClient.multicall.mockResolvedValue([
      [1n, 1n, 2n, BigInt(firstDangerAt), 1n, 1],
      [0n, 0n, 1n, 0n, 0n, 0],
    ]);
    publicClient.getBlock.mockImplementation(async ({ blockNumber }) => ({
      timestamp: BigInt(Date.now() / 1000) - 86_400n + (blockNumber === 5_000n ? -1n : 0n),
    }));

    const [first, cached] = await Promise.all([
      app.request("/api/stats"),
      app.request("/api/stats"),
    ]);
    expect(first.status).toBe(200);
    const stats = await first.json();
    expect(stats).toEqual({
      joinedCount: 1,
      votesLast24h: 1,
      targets: [
        {
          targetType, id, dangerVotes: 1, falsePositiveVotes: 1, seedCount: 2, appealCount: 1,
          status: 1, firstDangerAt, firstVoteAt: firstDangerAt - 1, sources: [sourceId],
          appeals: [{ evidenceURI: "ipfs://test", transactionHash: txHash }],
        },
        {
          targetType: 0, id, dangerVotes: 0, falsePositiveVotes: 0, seedCount: 1, appealCount: 0,
          status: 0, firstDangerAt: 0, firstVoteAt: 0, sources: [sourceId], appeals: [],
        },
      ],
    });
    expect(await cached.json()).toEqual(stats);
    expect(publicClient.multicall).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      blockNumber: 10_001n,
      contracts: [
        { address, abi: agentShieldRegistryAbi, functionName: "signalsOf", args: [targetType, id] },
        { address, abi: agentShieldRegistryAbi, functionName: "signalsOf", args: [0, id] },
      ],
    }));
    expect(publicClient.getLogs.mock.calls.map(([{ fromBlock, toBlock }]) => [fromBlock, toBlock]))
      .toEqual([[1n, 5_000n], [5_001n, 10_000n], [10_001n, 10_001n]]);
    const response = await app.request(`/api/target?type=${targetType}&id=${id}`, {
      headers: { origin: "https://dashboard.example" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toContain("max-age=60");
    expect(await response.json()).toEqual({
      targetType, id, status: 1, dangerVotes: 1, falsePositiveVotes: 1, seedCount: 2, firstDangerAt, appealCount: 1,
      votes: [
        { voteType: 1, evidenceHash: vote.evidenceHash, transactionHash: txHash, blockNumber: 5_000 },
        { voteType: 0, evidenceHash: vote.evidenceHash, transactionHash: txHash, blockNumber: 5_001 },
      ],
      seeds: [{ sourceId, transactionHash: txHash }, { sourceId, transactionHash: txHash }],
      appeals: [{ evidenceURI: "ipfs://test", transactionHash: txHash }],
    });
    expect(publicClient.getLogs).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(60_000);
    expect((await app.request("/api/stats")).status).toBe(200);
    expect(publicClient.getLogs).toHaveBeenCalledTimes(6);
  });
});

describe("GET /api/target", () => {
  it("拒绝无效参数，不请求链", async () => {
    const { app, publicClient } = setup();
    for (const query of ["", `?type=3&id=${vote.id}`, "?type=0&id=0x01"]) {
      expect((await app.request(`/api/target${query}`)).status).toBe(400);
    }
    expect(publicClient.getBlockNumber).not.toHaveBeenCalled();
  });

  it("没有对象记录时返回 404，并与统计共享扫描结果", async () => {
    const { app, publicClient } = setup();
    const [missing, stats] = await Promise.all([
      app.request(`/api/target?type=0&id=${vote.id}`),
      app.request("/api/stats"),
    ]);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: expect.any(String) });
    expect(stats.status).toBe(200);
    expect(publicClient.getBlockNumber).toHaveBeenCalledTimes(1);
    expect(publicClient.multicall).not.toHaveBeenCalled();
  });
});
