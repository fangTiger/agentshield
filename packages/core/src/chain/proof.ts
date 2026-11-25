import { Group } from "@semaphore-protocol/group";
import type { Identity } from "@semaphore-protocol/identity";
import type { SemaphoreProof } from "@semaphore-protocol/proof";
import { getAbiItem, type Address, type Hex, type PublicClient } from "viem";
import { registryAbi } from "./abi.js";
import { voteMessage, voteScope, type RiskTarget, type VoteType } from "./encoding.js";

const joinedEvent = getAbiItem({ abi: registryAbi, name: "Joined" });
const blocksPerQuery = 5000n;

export async function rebuildGroup(
  client: Pick<PublicClient, "getBlockNumber" | "getLogs">, registry: Address, deploymentBlock: bigint,
): Promise<Group> {
  const latest = await client.getBlockNumber();
  const members: bigint[] = [];
  for (let fromBlock = deploymentBlock; fromBlock <= latest; fromBlock += blocksPerQuery) {
    const last = fromBlock + blocksPerQuery - 1n;
    const logs = await client.getLogs({
      address: registry, event: joinedEvent, strict: true, fromBlock, toBlock: last < latest ? last : latest,
    });
    logs.sort((a, b) => a.blockNumber === b.blockNumber
      ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1);
    members.push(...logs.map(({ args }) => args.commitment));
  }
  return new Group(members);
}

export interface Vote extends RiskTarget {
  voteType: VoteType;
  evidenceHash: Hex;
}

export interface ProvenVote extends Vote {
  proof: SemaphoreProof;
}

export async function proveVote(
  identity: Identity, group: Group, chainId: number | bigint, registry: Address, vote: Vote,
  artifacts?: Parameters<typeof import("@semaphore-protocol/proof").generateProof>[5]
): Promise<ProvenVote> {
  if (group.indexOf(identity.commitment) < 0) {
    throw new Error("本机身份尚未加入 AgentShield。若已登记，请从加密备份恢复对应身份。");
  }
  const { generateProof } = await import("@semaphore-protocol/proof");
  const message = voteMessage(vote.voteType, vote.evidenceHash);
  const scope = voteScope(chainId, registry, vote.targetType, vote.id);
  const proof = await generateProof(identity, group, message, scope, undefined, artifacts);
  return { ...vote, proof };
}

export function toContractProof(proof: SemaphoreProof) {
  const [a0, a1, b0, b1, b2, b3, c0, c1] = proof.points;
  return {
    merkleTreeDepth: BigInt(proof.merkleTreeDepth),
    merkleTreeRoot: BigInt(proof.merkleTreeRoot),
    nullifier: BigInt(proof.nullifier),
    message: BigInt(proof.message),
    scope: BigInt(proof.scope),
    points: [BigInt(a0), BigInt(a1), BigInt(b0), BigInt(b1), BigInt(b2), BigInt(b3), BigInt(c0), BigInt(c1)] as const,
  };
}
