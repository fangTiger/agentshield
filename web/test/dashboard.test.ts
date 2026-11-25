import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createPublicClient, custom, encodeAbiParameters, encodeEventTopics, parseAbiItem,
  toFunctionSelector, toHex, type Hex,
} from "viem";
import { bsc } from "viem/chains";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readDashboard, readTarget, type Deployment } from "../src/lib/dashboard";

const registry = "0x0000000000000000000000000000000000000001";
const sender = "0x0000000000000000000000000000000000000002";
const deployment = { address: registry, fromBlock: 10n } satisfies Deployment;
const skill = toHex(42, { size: 32 });
const domain = toHex(43, { size: 32 });
const evidence = toHex(99, { size: 32 });
const source = toHex(32, { size: 32 });
const now = 1_800_000_000;
const relayerUrl = "https://relayer.example";
const relayedSkill = {
  targetType: 2, id: skill, dangerVotes: 1, falsePositiveVotes: 1, seedCount: 0, appealCount: 1,
  status: 1, firstDangerAt: now - 10,
};
const relayedAppeal = { evidenceURI: "ipfs://test-evidence", transactionHash: toHex(5_011, { size: 32 }) };

it("测试网构建使用测试网 RPC 链和 BscScan 链接", async () => {
  vi.stubEnv("NEXT_PUBLIC_CHAIN_ID", "97");
  vi.stubEnv("NEXT_PUBLIC_RPC_URL", "https://rpc.example");
  vi.stubEnv("NEXT_PUBLIC_AGENT_ID_ADDRESS", registry);
  try {
    const { agentIdAddress, browserRpc, explorer } = await import("../src/lib/config");
    const client = browserRpc();
    expect(client.chain?.id).toBe(97);
    expect(client.transport).toMatchObject({ timeout: 30_000, retryCount: 2 });
    expect(explorer).toBe("https://testnet.bscscan.com");
    expect(agentIdAddress).toBe(registry);
  } finally {
    vi.unstubAllEnvs();
  }
});
const joined = parseAbiItem("event Joined(address indexed account, uint256 commitment)");
const voted = parseAbiItem("event Voted(uint8 indexed targetType, bytes32 indexed id, uint8 voteType, bytes32 evidenceHash, uint256 nullifier)");
const seeded = parseAbiItem("event Seeded(uint8 indexed targetType, bytes32 indexed id, bytes32 indexed sourceId)");
const appealed = parseAbiItem("event Appealed(uint8 indexed targetType, bytes32 indexed id, address indexed appellant, string evidenceURI)");

function log(block: number, topics: readonly unknown[], data: Hex) {
  return {
    address: registry, topics, data, blockNumber: toHex(block), logIndex: "0x0",
    transactionHash: toHex(block, { size: 32 }), transactionIndex: "0x0",
    blockHash: toHex(block + 1, { size: 32 }), removed: false,
  };
}

const logs = [
  log(10, encodeEventTopics({ abi: [joined], eventName: "Joined", args: { account: sender } }),
    encodeAbiParameters([{ type: "uint256" }], [1n])),
  log(11, encodeEventTopics({ abi: [voted], eventName: "Voted", args: { targetType: 2, id: skill } }),
    encodeAbiParameters([{ type: "uint8" }, { type: "bytes32" }, { type: "uint256" }], [1, evidence, 1n])),
  log(12, encodeEventTopics({ abi: [voted], eventName: "Voted", args: { targetType: 2, id: skill } }),
    encodeAbiParameters([{ type: "uint8" }, { type: "bytes32" }, { type: "uint256" }], [0, evidence, 2n])),
  log(5_010, encodeEventTopics({ abi: [seeded], eventName: "Seeded", args: { targetType: 0, id: domain, sourceId: source } }), "0x"),
  log(5_011, encodeEventTopics({ abi: [appealed], eventName: "Appealed", args: { targetType: 2, id: skill, appellant: sender } }),
    encodeAbiParameters([{ type: "string" }], ["ipfs://test-evidence"])),
];

function setupRpc(head = 5_011, onLogs?: () => Promise<void>) {
  const ranges: [bigint, bigint][] = [];
  const request = vi.fn(async ({ method, params }: { method: string; params?: unknown[] }) => {
    switch (method) {
      case "eth_blockNumber":
        return toHex(head);
      case "eth_getLogs": {
        const { fromBlock, toBlock, topics } = params?.[0] as {
          fromBlock: Hex; toBlock: Hex; topics: (Hex | Hex[] | null)[];
        };
        ranges.push([BigInt(fromBlock), BigInt(toBlock)]);
        if (onLogs) await onLogs();
        return logs.filter((item) =>
          BigInt(item.blockNumber) >= BigInt(fromBlock) && BigInt(item.blockNumber) <= BigInt(toBlock) &&
          topics.every((topic, index) => topic === null || (Array.isArray(topic)
            ? topic.includes(item.topics[index] as Hex) : topic === item.topics[index])));
      }
      case "eth_getBlockByNumber":
        return { timestamp: toHex(BigInt(params?.[0] as Hex) < 12n ? now - 90_000 : now - 10) };
      case "eth_call": {
        const { data } = params?.[0] as { data: Hex };
        expect(data.slice(0, 10)).toBe(toFunctionSelector("signalsOf(uint8,bytes32)"));
        return encodeAbiParameters(
          [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint8" }],
          data.endsWith(domain.slice(2)) ? [0n, 0n, 1n, 0n, 0n, 0] : [1n, 1n, 0n, BigInt(now - 10), 1n, 1],
        );
      }
      default:
        throw new Error(`意外的 RPC 方法：${method}`);
    }
  });
  return { ranges, request, client: createPublicClient({ chain: bsc, transport: custom({ request }, { retryCount: 0 }) }) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("观测网页数据", () => {
  it("总览使用中继统计和状态，无需浏览器 RPC 或部署配置", async () => {
    const { client, request } = setupRpc();
    const getClient = vi.fn(() => client);
    const fetchStats = vi.fn(async () => Response.json({
      joinedCount: 7,
      votesLast24h: 4,
      targets: [{ ...relayedSkill, sources: [] }],
    }));
    vi.stubGlobal("fetch", fetchStats);

    const stats = await readDashboard(getClient, undefined, `${relayerUrl}/`, "overview");
    expect(fetchStats).toHaveBeenCalledWith("https://relayer.example/api/stats", expect.anything());
    expect(stats).toMatchObject({ source: "relayer", joinedCount: 7, votesLast24h: 4, targets: [{ id: skill, status: 1 }] });
    expect(getClient).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("中继失败后按 5000 块读取，保留种子来源并按区块时间统计 24 小时票数", async () => {
    const { client, ranges } = setupRpc();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    vi.spyOn(Date, "now").mockReturnValue(now * 1_000);

    const stats = await readDashboard(() => client, deployment, relayerUrl, "catalog");
    expect(ranges).toEqual([[10n, 5_009n], [5_010n, 5_011n]]);
    expect(stats).toMatchObject({ source: "rpc", joinedCount: 1, votesLast24h: 1, targets: [
      { id: skill, firstVoteAt: now - 90_000, status: 1, appeals: [{ evidenceURI: "ipfs://test-evidence" }] },
      { id: domain, firstVoteAt: 0, status: 0, sources: [source] },
    ] });
  });

  it("中继超时后继续读取链上统计", async () => {
    const { client } = setupRpc();
    vi.stubGlobal("fetch", vi.fn(async (_url: string, { signal }: RequestInit) => {
      if (!signal) throw new TypeError("缺少中继请求截止时间");
      signal.throwIfAborted();
      return Response.json({ joinedCount: 99, votesLast24h: 0, targets: [] });
    }));
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());

    const stats = await readDashboard(() => client, deployment, relayerUrl, "overview");
    expect(timeout).toHaveBeenCalledWith(15_000);
    expect(stats).toMatchObject({ source: "rpc", joinedCount: 1 });
  });

  it("详情公开证据、种子和申诉交易，省略事件中的参与者地址与 nullifier", async () => {
    const { client, request } = setupRpc();
    const result = await readTarget(() => client, deployment, { targetType: 2, id: skill });

    expect(result).toMatchObject({
      dangerVotes: 1, falsePositiveVotes: 1, status: 1, firstVoteAt: now - 90_000,
      votes: [{ evidenceHash: evidence, transactionHash: toHex(11, { size: 32 }) }, { evidenceHash: evidence }],
      appeals: [{ evidenceURI: "ipfs://test-evidence", transactionHash: toHex(5_011, { size: 32 }) }],
    });
    expect(JSON.stringify(result)).not.toContain(sender);
    expect(JSON.stringify(result)).not.toContain("nullifier");
    expect(request.mock.calls.map(([{ method }]) => method)).not.toContain("eth_getTransactionByHash");
  });

  it("目录使用中继提供的来源与申诉预览，无需浏览器 RPC", async () => {
    const { client, request } = setupRpc();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      joinedCount: 7,
      votesLast24h: 4,
      targets: [
        { ...relayedSkill, firstVoteAt: now - 90_000, sources: [], appeals: [relayedAppeal] },
        { targetType: 0, id: domain, dangerVotes: 0, falsePositiveVotes: 0, seedCount: 1, appealCount: 0,
          status: 0, firstDangerAt: 0, firstVoteAt: 0, sources: [source], appeals: [] },
      ],
    })));
    const stats = await readDashboard(() => client, deployment, relayerUrl, "catalog");
    expect(stats).toMatchObject({ source: "relayer", targets: [
      { id: skill, firstVoteAt: now - 90_000, appeals: [{ evidenceURI: "ipfs://test-evidence" }] },
      { id: domain, sources: [source] },
    ] });
    expect(request).not.toHaveBeenCalled();
  });

  it("详情使用中继记录，无需浏览器 RPC", async () => {
    const { client, request } = setupRpc();
    const detail = {
      ...relayedSkill,
      votes: [11, 12].map((blockNumber, index) => ({
        voteType: 1 - index, evidenceHash: evidence, transactionHash: toHex(blockNumber, { size: 32 }), blockNumber,
      })),
      seeds: [], appeals: [relayedAppeal],
    };
    const fetchTarget = vi.fn(async () => Response.json(detail));
    vi.stubGlobal("fetch", fetchTarget);
    const result = await readTarget(() => client, deployment, { targetType: 2, id: skill }, relayerUrl);

    expect(fetchTarget).toHaveBeenCalledWith(`${relayerUrl}/api/target?type=2&id=${skill}`, expect.anything());
    expect(result).toEqual(detail);
    expect(request).not.toHaveBeenCalled();
  });

  it("详情收到明确的 404 时直接显示无记录", async () => {
    const { client, request } = setupRpc();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "链上未找到该对象的信号记录" }, { status: 404 })));
    expect(await readTarget(() => client, deployment, { targetType: 2, id: skill }, relayerUrl)).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it("详情中继失败后回退，链上日志请求最多并发 4 次", async () => {
    let active = 0;
    let peak = 0;
    const { client, ranges } = setupRpc(25_011, async () => {
      peak = Math.max(peak, ++active);
      await Promise.resolve();
      active -= 1;
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    const result = await readTarget(() => client, deployment, { targetType: 2, id: skill }, relayerUrl);
    expect(result).toMatchObject({ firstVoteAt: now - 90_000, appeals: [relayedAppeal] });
    expect(ranges).toHaveLength(18);
    expect(peak).toBe(4);
  });
});

it("网页源码不含 Agent ID 名址解析或登记事件调用", () => {
  const src = new URL("../src", import.meta.url);
  const files = readdirSync(src, { recursive: true }).filter((name): name is string =>
    typeof name === "string" && /\.tsx?$/.test(name));
  expect(files.length).toBeGreaterThan(0);
  for (const name of files) {
    const path = join(src.pathname, name);
    expect(readFileSync(path, "utf8"), name).not.toMatch(/\b(?:ownerOfHandle|Registered)\b/);
  }
});
