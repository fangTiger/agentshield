import { createHash } from "node:crypto";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { readCommitment, registryAbi, toContractProof, type ProvenVote } from "@agentshield/core/chain";
import { encodeFunctionData, type Address, type Hex } from "viem";
import { callBaw, requireDeveloperMode, walletAddress, type ExecBaw } from "./baw.js";
import { readJson, writeJson, type Chain } from "./config.js";
import { getOrCreateIdentity } from "./identity.js";

type Operation = "join" | "vote";
interface Preview {
  requestId: string;
  gasLimit?: number | string;
  estimatedGas?: number | string;
  parsedTx?: { gasLimit?: number | string };
  simulationResult?: { gasLimit?: number | string; authorityChanges?: unknown };
  risks?: unknown;
  requireConfirmation?: boolean;
  expiresAt?: number;
}

function requestPath(dataDir: string, operation: Operation, requestId: string): string {
  const name = createHash("sha256").update(requestId).digest("hex");
  return join(dataDir, "previews", operation + "-" + name + ".json");
}

async function preview(
  run: ExecBaw, dataDir: string, { client, registry }: Chain, chainId: number, from: Address,
  operation: Operation, args: readonly unknown[], data: Hex,
) {
  const result = await callBaw<Preview>(
    run, "contract-call", "preview", "--binanceChainId", String(chainId), "--from", from,
    "--to", registry, "--value", "0", "--inputData", data,
  );
  if (!result.requestId) throw new Error("官方 baw 未返回可执行的预览编号。");
  const gas = result.estimatedGas ?? result.gasLimit ?? result.parsedTx?.gasLimit
    ?? result.simulationResult?.gasLimit ?? await client.estimateGas({ account: from, to: registry, data, value: 0n });
  await writeJson(requestPath(dataDir, operation, result.requestId), { chainId });
  return {
    contract: registry, function: operation, args, from, chainId, value: "0",
    estimatedGas: String(gas), requestId: result.requestId, risk: result.risks ?? null,
    parsedTx: result.parsedTx, authorityChanges: result.simulationResult?.authorityChanges,
    appConfirmation: result.requireConfirmation, expiresAt: result.expiresAt,
    message: "请先向用户展示预览详情，得到用户明确确认后再使用该预览编号。",
  };
}

export async function previewJoin(run: ExecBaw, dataDir: string, chain: Chain, now: number) {
  const chainId = await chain.client.getChainId();
  const from = await walletAddress(run, chainId);
  const { claimed } = await callBaw<{ claimed: boolean }>(run, "wallet", "agent-id");
  if (!claimed) throw new Error("请先在币安 App 的「钱包 → 首页横幅 → Agent ID」中领取 Agent ID。");
  await requireDeveloperMode(run, now);
  if (await readCommitment(chain.client, chain.registry, from) !== 0n) {
    return { message: "该钱包已加入 AgentShield。若本机身份丢失，请从加密备份恢复。" };
  }
  const { commitment } = await getOrCreateIdentity(dataDir);
  const args = [commitment] as const;
  const data = encodeFunctionData({ abi: registryAbi, functionName: "join", args });
  return preview(run, dataDir, chain, chainId, from, "join", args, data);
}

export async function previewVote(
  run: ExecBaw, dataDir: string, chain: Chain, chainId: number, from: Address, vote: ProvenVote,
) {
  const { targetType, id, voteType, evidenceHash, proof } = vote;
  const args = [targetType, id, voteType, evidenceHash, toContractProof(proof)] as const;
  const data = encodeFunctionData({ abi: registryAbi, functionName: "vote", args });
  return preview(run, dataDir, chain, chainId, from, "vote", args, data);
}

export async function executePreview(run: ExecBaw, dataDir: string, operation: Operation, requestId: string) {
  const path = requestPath(dataDir, operation, requestId);
  const pending = await readJson<{ chainId: number }>(path);
  if (!pending) throw new Error("未找到此命令对应的预览编号，请先生成预览。");
  await unlink(path);
  const { status, txHash, orderId } = await callBaw<{ status: string; txHash?: string; orderId?: string }>(
    run, "contract-call", "execute", "--requestId", requestId,
  );
  const explorer = pending.chainId === 56 ? "https://bscscan.com" : pending.chainId === 97 ? "https://testnet.bscscan.com" : undefined;
  return {
    status, txHash, orderId, explorerUrl: txHash && explorer ? `${explorer}/tx/${txHash}` : undefined,
    message: txHash ? "交易已广播。" : "请在币安 App 内查看交易状态并完成所需确认。",
  };
}
