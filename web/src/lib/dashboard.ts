import { type GetLogsReturnType, type Hex, type PublicClient } from "viem";
import { appealed, blockRanges, joined, readSignal, seeded, voted, type Deployment, type Signal, type Target } from "./registry";

export type { Deployment } from "./registry";

const allEvents = [joined, voted, seeded, appealed] as const;
type RegistryLog = GetLogsReturnType<undefined, typeof allEvents, true>[number];

interface Vote {
  blockNumber: bigint;
  voteType: number;
  evidenceHash: Hex;
  transactionHash: Hex;
}

interface Seed {
  sourceId: Hex;
  transactionHash: Hex;
}

interface Appeal {
  evidenceURI: string;
  transactionHash: Hex;
}

interface TargetHistory {
  target: Target;
  votes: Vote[];
  seeds: Seed[];
  appeals: Appeal[];
}

interface RelayerStats {
  joinedCount: number;
  votesLast24h: number;
  targets: (Signal & { sources: Hex[]; firstVoteAt?: number; appeals?: Appeal[] })[];
}

interface RelayerTarget extends Signal {
  votes: (Omit<Vote, "blockNumber"> & { blockNumber: number })[];
  seeds: Seed[];
  appeals: Appeal[];
}

type TimestampReader = (blockNumber: bigint) => Promise<number>;

function targetKey({ targetType, id }: Target) {
  return `${targetType}:${id.toLowerCase()}`;
}

function timestampReader(client: PublicClient): TimestampReader {
  const timestamps = new Map<bigint, Promise<number>>();
  return (blockNumber) => {
    let result = timestamps.get(blockNumber);
    if (!result) {
      result = client.getBlock({ blockNumber }).then(({ timestamp }) => Number(timestamp));
      timestamps.set(blockNumber, result);
    }
    return result;
  };
}

async function readRelayer<T>(url: string | undefined, path: string): Promise<{ status: number; data: T } | undefined> {
  if (!url) return;
  try {
    const response = await fetch(`${url.replace(/\/+$/, "")}${path}`, {
      cache: "no-store", signal: AbortSignal.timeout(15_000),
    });
    if (response.ok || response.status === 404) return { status: response.status, data: await response.json() };
  } catch {
    // 中继不可用时，读取同一个信号库的链上事件。
  }
}

async function collectHistory(
  client: PublicClient,
  deployment: Deployment,
  head: bigint,
  target?: Target,
) {
  const history = new Map<string, TargetHistory>();
  let joinedCount = 0;
  const requests: (() => Promise<RegistryLog[]>)[] = [...blockRanges(deployment, head)].flatMap((range) => {
    const options = { ...range, address: deployment.address, strict: true } as const;
    return target ? [
      () => client.getLogs({ ...options, event: voted, args: target }),
      () => client.getLogs({ ...options, event: seeded, args: target }),
      () => client.getLogs({ ...options, event: appealed, args: target }),
    ] : [() => client.getLogs({ ...options, events: allEvents })];
  });

  const maxConcurrent = 4;
  for (let index = 0; index < requests.length; index += maxConcurrent) {
    const logs = await Promise.all(requests.slice(index, index + maxConcurrent).map((request) => request()));
    for (const log of logs.flat()) {
      if (log.eventName === "Joined") {
        joinedCount += 1;
        continue;
      }
      const { targetType, id } = log.args;
      const key = targetKey({ targetType, id });
      let entry = history.get(key);
      if (!entry) {
        entry = { target: { targetType, id }, votes: [], seeds: [], appeals: [] };
        history.set(key, entry);
      }
      const { blockNumber, transactionHash } = log;
      // 只保留展示需要的字段，不保留发送者、申诉地址、身份承诺或 nullifier。
      switch (log.eventName) {
        case "Voted":
          entry.votes.push({ blockNumber, transactionHash, voteType: log.args.voteType, evidenceHash: log.args.evidenceHash });
          break;
        case "Seeded":
          entry.seeds.push({ transactionHash, sourceId: log.args.sourceId });
          break;
        case "Appealed":
          entry.appeals.push({ transactionHash, evidenceURI: log.args.evidenceURI });
          break;
      }
    }
  }
  return { joinedCount, history };
}

async function countRecentVotes(votes: Vote[], timestamp: TimestampReader, cutoff: number) {
  const blocks = votes.map(({ blockNumber }) => blockNumber).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  let start = 0;
  let end = blocks.length;
  while (start < end) {
    const middle = Math.floor((start + end) / 2);
    if (await timestamp(blocks[middle]) < cutoff) start = middle + 1;
    else end = middle;
  }
  return blocks.length - start;
}

async function firstVoteTime(signal: Signal, entry: TargetHistory | undefined, timestamp: TimestampReader) {
  const first = entry?.votes[0];
  return first ? timestamp(first.blockNumber) : signal.firstDangerAt;
}

export async function readDashboard(
  getClient: () => PublicClient,
  deployment: Deployment | undefined,
  relayerUrl: string | undefined,
  view: "overview" | "catalog",
) {
  const stats = (await readRelayer<RelayerStats>(relayerUrl, "/api/stats"))?.data;
  if (Number.isFinite(stats?.joinedCount) && Number.isFinite(stats?.votesLast24h)
    && Array.isArray(stats?.targets) && stats.targets.every((target) =>
      Number.isFinite(target?.status) && Number.isFinite(target.firstDangerAt) && Array.isArray(target.sources))) {
    const targets = stats.targets.map((target) => ({
      ...target, firstVoteAt: target.firstVoteAt ?? target.firstDangerAt, appeals: target.appeals ?? [],
    }));
    return { ...stats, targets, source: "relayer" as const };
  }

  if (!deployment) throw new Error("尚未配置合约部署信息。");
  const client = getClient();
  const cutoff = Math.floor(Date.now() / 1_000) - 86_400;
  const head = await client.getBlockNumber();
  const timestamp = timestampReader(client);
  const { address } = deployment;

  const { joinedCount, history } = await collectHistory(client, deployment, head);
  const entries = [...history.values()];
  const [votesLast24h, signals] = await Promise.all([
    countRecentVotes(entries.flatMap(({ votes }) => votes), timestamp, cutoff),
    Promise.all(entries.map(({ target }) => readSignal(client, address, target, head))),
  ]);
  const targets = await Promise.all(signals.map(async (signal) => {
    const entry = view === "catalog" ? history.get(targetKey(signal)) : undefined;
    return {
      ...signal, firstVoteAt: await firstVoteTime(signal, entry, timestamp),
      sources: [...new Set(entry?.seeds.map(({ sourceId }) => sourceId))], appeals: entry?.appeals ?? [],
    };
  }));

  return { joinedCount, votesLast24h, targets, source: "rpc" as const };
}

export async function readTarget(
  getClient: () => PublicClient,
  deployment: Deployment | undefined,
  target: Target,
  relayerUrl?: string,
) {
  const { targetType, id } = target;
  const path = `/api/target?type=${targetType}&id=${id.toLowerCase()}`;
  const relayed = await readRelayer<RelayerTarget>(relayerUrl, path);
  if (relayed?.status === 404) return null;
  const detail = relayed?.data;
  if (detail?.targetType === targetType && detail.id === id.toLowerCase() && Number.isFinite(detail.status)
    && Number.isFinite(detail.firstDangerAt) && Array.isArray(detail.votes)
    && Array.isArray(detail.seeds) && Array.isArray(detail.appeals)) return detail;

  if (!deployment) throw new Error("尚未配置合约部署信息。");
  const client = getClient();
  const head = await client.getBlockNumber();
  const signal = await readSignal(client, deployment.address, target, head);
  if (!(signal.dangerVotes || signal.falsePositiveVotes || signal.seedCount || signal.appealCount)) return null;
  const { history } = await collectHistory(client, deployment, head, target);
  const entry = history.get(targetKey(target));
  const firstVoteAt = await firstVoteTime(signal, entry, timestampReader(client));

  return {
    ...signal, firstVoteAt,
    votes: entry?.votes.map(({ voteType, evidenceHash, transactionHash }) => ({ voteType, evidenceHash, transactionHash })) ?? [],
    seeds: entry?.seeds ?? [],
    appeals: entry?.appeals ?? [],
  };
}
