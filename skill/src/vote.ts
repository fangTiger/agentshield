import type { Identity } from "@semaphore-protocol/identity";
import {
  addressId, domainId, isNullifierUsed, proveVote, rebuildGroup, skillId, TargetType, VoteType,
  type ProvenVote, type Vote,
} from "@agentshield/core/chain";
import { isAddress, zeroHash } from "viem";
import { deploymentBlock, relayerUrl, type Chain, type Config } from "./config.js";

export function parseVote(args: string[], evidenceHash: string | undefined): Vote {
  const [targetType, value, vote] = args;
  const voteType = vote === "danger" ? VoteType.Danger : vote === "false-positive" ? VoteType.FalsePositive : undefined;
  if (args.length !== 3 || voteType === undefined) {
    throw new Error("用法：shield vote --anon|--public domain|address|skill <目标> danger|false-positive。");
  }
  const hash = evidenceHash === undefined ? zeroHash : skillId(evidenceHash);
  if (targetType === "domain") return { targetType: TargetType.DOMAIN, id: domainId(value), voteType, evidenceHash: hash };
  if (targetType === "skill") return { targetType: TargetType.SKILL, id: skillId(value), voteType, evidenceHash: hash };
  if (targetType === "address") {
    const [chainId, address] = value.split(":");
    if (!/^\d+:0x[\da-f]{40}$/iu.test(value) || !isAddress(address)) {
      throw new Error("地址投票目标应为 <链 ID>:<地址>，例如使用 56: 作为 BSC 地址前缀。");
    }
    return { targetType: TargetType.ADDRESS, id: addressId(BigInt(chainId), address), voteType, evidenceHash: hash };
  }
  throw new Error("投票目标类型应为 domain、address 或 skill。");
}

export async function buildVote(
  { client, registry }: Chain, config: Config, identity: Identity, vote: Vote, chainId?: number,
): Promise<ProvenVote> {
  const group = await rebuildGroup(client, registry, deploymentBlock(config));
  return proveVote(identity, group, chainId ?? await client.getChainId(), registry, vote);
}

export async function submitAnonymous(
  chain: Chain, config: Config, vote: ProvenVote, send: typeof fetch,
): Promise<{ txHash?: string; message: string }> {
  if (await isNullifierUsed(chain.client, chain.registry, BigInt(vote.proof.nullifier))) {
    return { message: "本机身份已为该对象投过票。" };
  }
  const endpoint = relayerUrl(config);
  let response: Response;
  try {
    response = await send(endpoint.replace(/\/+$/u, "") + "/vote", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(vote),
    });
  } catch {
    throw new Error("无法连接匿名中继。");
  }
  if (!response.ok) throw new Error(`匿名中继未受理投票（HTTP ${response.status}）。`);
  const { txHash } = await response.json() as { txHash?: string };
  if (!txHash) throw new Error("匿名中继未返回交易哈希。");
  return { txHash, message: "已匿名上报。" };
}
