import { parseAbi, type Address, type Hex, type PublicClient } from "viem";

export interface Deployment {
  address: Address;
  fromBlock: bigint;
}

export interface Target {
  targetType: number;
  id: Hex;
}

export const registryAbi = parseAbi([
  "function signalsOf(uint8 targetType, bytes32 id) view returns (uint256 dangerVotes, uint256 falsePositiveVotes, uint256 seedCount, uint256 firstDangerAt, uint256 appealCount, uint8 status)",
  "function N() view returns (uint256)",
  "function T() view returns (uint256)",
  "function seeder() view returns (address)",
  "function semaphore() view returns (address)",
]);

export const [joined, voted, seeded, appealed] = parseAbi([
  "event Joined(address indexed account, uint256 commitment)",
  "event Voted(uint8 indexed targetType, bytes32 indexed id, uint8 voteType, bytes32 evidenceHash, uint256 nullifier)",
  "event Seeded(uint8 indexed targetType, bytes32 indexed id, bytes32 indexed sourceId)",
  "event Appealed(uint8 indexed targetType, bytes32 indexed id, address indexed appellant, string evidenceURI)",
]);

export async function readSignal(client: PublicClient, address: Address, target: Target, blockNumber: bigint) {
  const [dangerVotes, falsePositiveVotes, seedCount, firstDangerAt, appealCount, status] = await client.readContract({
    abi: registryAbi, address, blockNumber, functionName: "signalsOf", args: [target.targetType, target.id],
  });
  return {
    targetType: target.targetType, id: target.id, status, dangerVotes: Number(dangerVotes), falsePositiveVotes: Number(falsePositiveVotes),
    seedCount: Number(seedCount), firstDangerAt: Number(firstDangerAt), appealCount: Number(appealCount),
  };
}

export type Signal = Awaited<ReturnType<typeof readSignal>>;

export function* blockRanges({ fromBlock }: Deployment, head: bigint) {
  for (let start = fromBlock; start <= head; start += 5_000n) {
    const end = start + 4_999n;
    yield { fromBlock: start, toBlock: end < head ? end : head };
  }
}
