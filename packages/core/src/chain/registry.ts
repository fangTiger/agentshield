import type { Address, PublicClient } from "viem";
import { registryAbi } from "./abi.js";
import type { RiskTarget } from "./encoding.js";

export function readCommitment(
  client: Pick<PublicClient, "readContract">, registry: Address, account: Address,
): Promise<bigint> {
  return client.readContract({ address: registry, abi: registryAbi, functionName: "commitmentOf", args: [account] });
}

export async function readSignals(
  client: Pick<PublicClient, "readContract">, registry: Address, { targetType, id }: RiskTarget,
) {
  const [dangerVotes, falsePositiveVotes, seedCount, firstDangerAt, appealCount, status] = await client.readContract({
    address: registry, abi: registryAbi, functionName: "signalsOf", args: [targetType, id],
  });
  return { dangerVotes, falsePositiveVotes, seedCount, firstDangerAt, appealCount, status };
}

export function isNullifierUsed(
  client: Pick<PublicClient, "readContract">, registry: Address, nullifier: bigint,
): Promise<boolean> {
  return client.readContract({ address: registry, abi: registryAbi, functionName: "usedNullifiers", args: [nullifier] });
}
