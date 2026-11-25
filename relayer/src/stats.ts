import { getAbiItem, type Address, type Hex, type PublicClient } from "viem";
import { agentShieldRegistryAbi } from "./abi.js";

const chunkSize = 5_000n;
const cacheTtlMs = 60_000;
const events = [
  getAbiItem({ abi: agentShieldRegistryAbi, name: "Joined" }),
  getAbiItem({ abi: agentShieldRegistryAbi, name: "Voted" }),
  getAbiItem({ abi: agentShieldRegistryAbi, name: "Seeded" }),
  getAbiItem({ abi: agentShieldRegistryAbi, name: "Appealed" }),
] as const;

interface History {
  targetType: number;
  id: Hex;
  votes: { voteType: number; evidenceHash: Hex; transactionHash: Hex; blockNumber: bigint }[];
  seeds: { sourceId: Hex; transactionHash: Hex }[];
  appeals: { evidenceURI: string; transactionHash: Hex }[];
}

type StatsClient = Pick<PublicClient, "chain" | "getBlockNumber" | "getLogs" | "getBlock" | "multicall">;

function targetKey(targetType: number, id: string) {
  return `${targetType}:${id.toLowerCase()}`;
}

async function collectStats(client: StatsClient, address: Address, deploymentBlock: bigint) {
  const cutoff = BigInt(Math.floor(Date.now() / 1_000)) - 86_400n;
  const head = await client.getBlockNumber();
  const history = new Map<string, History>();
  const voteBlocks: bigint[] = [];
  let joinedCount = 0;

  for (let fromBlock = deploymentBlock; fromBlock <= head; fromBlock += chunkSize) {
    const end = fromBlock + chunkSize - 1n;
    const toBlock = end < head ? end : head;
    const logs = await client.getLogs({ address, events, fromBlock, toBlock, strict: true });
    for (const log of logs) {
      if (log.eventName === "Joined") {
        joinedCount += 1;
        continue;
      }

      const { targetType, id } = log.args;
      const key = targetKey(targetType, id);
      let entry = history.get(key);
      if (!entry) {
        entry = { targetType, id, votes: [], seeds: [], appeals: [] };
        history.set(key, entry);
      }
      const { transactionHash, blockNumber } = log;
      switch (log.eventName) {
        case "Voted": {
          const { voteType, evidenceHash } = log.args;
          entry.votes.push({ voteType, evidenceHash, transactionHash, blockNumber });
          voteBlocks.push(blockNumber);
          break;
        }
        case "Seeded":
          entry.seeds.push({ sourceId: log.args.sourceId, transactionHash });
          break;
        case "Appealed":
          entry.appeals.push({ evidenceURI: log.args.evidenceURI, transactionHash });
          break;
      }
    }
  }

  const timestamps = new Map<bigint, Promise<bigint>>();
  function timestampAt(blockNumber: bigint) {
    let timestamp = timestamps.get(blockNumber);
    if (!timestamp) {
      timestamp = client.getBlock({ blockNumber }).then((block) => block.timestamp);
      timestamps.set(blockNumber, timestamp);
    }
    return timestamp;
  }

  const entries = [...history.values()];
  const [signals, votesLast24h] = await Promise.all([
    entries.length ? client.multicall({
      allowFailure: false,
      blockNumber: head,
      batchSize: 8_192,
      deployless: !client.chain?.contracts?.multicall3,
      contracts: entries.map(({ targetType, id }) => ({
        address, abi: agentShieldRegistryAbi, functionName: "signalsOf", args: [targetType, id],
      } as const)),
    }) : [],
    countRecentVotes(voteBlocks, cutoff, timestampAt),
  ]);
  const records = await Promise.all(entries.map(async ({ targetType, id, votes, seeds, appeals }, index) => {
    const [dangerVotes, falsePositiveVotes, seedCount, firstDangerAt, appealCount, status] = signals[index];
    const signal = {
      targetType, id, status, dangerVotes: Number(dangerVotes), falsePositiveVotes: Number(falsePositiveVotes),
      seedCount: Number(seedCount), firstDangerAt: Number(firstDangerAt), appealCount: Number(appealCount),
    };
    const firstVote = votes[0];
    const firstVoteAt = firstVote?.voteType === 1
      ? Number(await timestampAt(firstVote.blockNumber))
      : signal.firstDangerAt;
    return {
      summary: { ...signal, firstVoteAt, sources: [...new Set(seeds.map(({ sourceId }) => sourceId))], appeals },
      detail: { ...signal, votes: votes.map((vote) => ({ ...vote, blockNumber: Number(vote.blockNumber) })), seeds, appeals },
    };
  }));
  return {
    stats: { joinedCount, votesLast24h, targets: records.map(({ summary }) => summary) },
    targets: new Map(records.map(({ detail }) => [targetKey(detail.targetType, detail.id), detail])),
  };
}

async function countRecentVotes(
  voteBlocks: bigint[],
  cutoff: bigint,
  timestampAt: (blockNumber: bigint) => Promise<bigint>,
) {
  // 区块时间按高度递增，找到 24 小时窗口内的第一票即可得到新增票数。
  voteBlocks.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  let start = 0;
  let end = voteBlocks.length;
  while (start < end) {
    const middle = Math.floor((start + end) / 2);
    if (await timestampAt(voteBlocks[middle]) < cutoff) start = middle + 1;
    else end = middle;
  }

  return voteBlocks.length - start;
}

export function createStatsReader(client: StatsClient, address: Address, deploymentBlock: bigint) {
  type Snapshot = Awaited<ReturnType<typeof collectStats>>;
  let cached: { snapshot: Snapshot; expiresAt: number } | undefined;
  let refresh: Promise<Snapshot> | undefined;
  async function readSnapshot() {
    if (cached && Date.now() < cached.expiresAt) return cached.snapshot;
    return refresh ??= collectStats(client, address, deploymentBlock)
      .then((snapshot) => {
        cached = { snapshot, expiresAt: Date.now() + cacheTtlMs };
        return snapshot;
      })
      .finally(() => {
        refresh = undefined;
      });
  }
  return {
    readStats: async () => (await readSnapshot()).stats,
    readTarget: async (targetType: number, id: string) => (await readSnapshot()).targets.get(targetKey(targetType, id)),
  };
}
