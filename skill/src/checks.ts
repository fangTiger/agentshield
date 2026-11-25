import { realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import {
  buildReviewPacket, checkAuth, hashSkillFiles, mergeLlmVerdict, readSkillFiles, scanSkillFiles,
  type AuthCheckOptions, type AuthCommunityTarget, type AuthExternalHit, type ScanOptions,
} from "@agentshield/core";
import {
  addressId, domainId, readSignals, TargetType, VoteType, type RiskTarget,
} from "@agentshield/core/chain";
import { keccak256, stringToHex } from "viem";
import { connectChain, mainnetPending, type Chain, type ChainClient, type Config } from "./config.js";
import { loadIdentity } from "./identity.js";
import { readLogins } from "./login.js";
import { buildVote, submitAnonymous } from "./vote.js";

interface CheckContext {
  config: Config;
  client?: ChainClient;
  dataDir: string;
  offline: boolean;
  now: number;
  send: typeof fetch;
  expandUrl?: AuthCheckOptions["expandUrl"];
  download?: ScanOptions["download"];
}

function communityChain(context: CheckContext): Chain | undefined {
  if (context.offline || !context.config.rpcUrl || !context.config.registryAddress) return undefined;
  return connectChain(context.config, context.client);
}

async function communityHits(chain: Chain, target: RiskTarget, excerpt: string): Promise<AuthExternalHit[]> {
  const { dangerVotes, seedCount, status } = await readSignals(chain.client, chain.registry, target);
  const source = `AgentShield Registry ${chain.registry}`;
  const hits: AuthExternalHit[] = [];
  if (dangerVotes) {
    const statusLabel = status === 3 ? "有争议" : status === 2 ? "社区确认" : "待验证";
    hits.push({ kind: "community", excerpt, source, confirmations: Number(dangerVotes), status: statusLabel });
  }
  if (seedCount) {
    hits.push({ kind: "intel", excerpt, source, detail: `链上种子计数 ${seedCount}。` });
  }
  return hits;
}

async function autoReport(
  context: CheckContext, chain: Chain | undefined, target: RiskTarget | undefined, evidence: unknown,
) {
  if (context.offline || !context.config.autoReport) return undefined;
  const identity = await loadIdentity(context.dataDir);
  if (!identity) return { message: "加入 AgentShield 后即可参与共享社区信号。" };
  if (!target) return { message: "未找到可上报的风险对象。" };
  if (!chain) {
    return { message: context.config.network === "mainnet" && !context.config.registryAddress
      ? mainnetPending : "未匿名上报，请在 config.json 中配置 Registry 和 RPC。" };
  }
  try {
    const evidenceHash = keccak256(stringToHex(JSON.stringify(evidence)));
    const vote = await buildVote(chain, context.config, identity, { ...target, voteType: VoteType.Danger, evidenceHash });
    return await submitAnonymous(chain, context.config, vote, context.send);
  } catch (error) {
    return { message: `未匿名上报。${(error as Error).message}` };
  }
}

function domainTarget(domain: string): RiskTarget {
  return { targetType: TargetType.DOMAIN, id: domainId(domain) };
}

export async function check(input: string, context: CheckContext, pageUrl?: string) {
  const chain = communityChain(context);
  let queried = false;
  let targets: readonly AuthCommunityTarget[] = [];
  let addressChainId: number | undefined;
  const result = await checkAuth(input, {
    recentLocalLogins: await readLogins(context.dataDir), now: context.now, pageUrl,
    intel: { cacheDir: join(context.dataDir, "intel") },
    expandUrl: context.offline ? async () => undefined : context.expandUrl,
    lookupCommunity: async (candidates) => {
      targets = candidates;
      if (!chain || !candidates.length) return [];
      try {
        const chainId = candidates.some((target) => "address" in target) ? await chain.client.getChainId() : undefined;
        addressChainId = chainId;
        const hits = await Promise.all(candidates.map((target) => {
          if ("domain" in target) return communityHits(chain, domainTarget(target.domain), target.domain);
          if (chainId === undefined) return [];
          const riskTarget = { targetType: TargetType.ADDRESS, id: addressId(chainId, target.address) };
          return communityHits(chain, riskTarget, target.address);
        }));
        queried = true;
        return hits.flat();
      } catch {
        return [];
      }
    },
  });

  // 本机登录时序只能说明授权请求的风险，社区上报的对象须由证据明确指向。
  const evidence = result.evidence.filter(({ level, ruleId }) => level === "high" && !ruleId.startsWith("external."));
  const target = targets.find((candidate) => {
    if ("address" in candidate) {
      return evidence.some(({ excerpt }) => excerpt.toLowerCase().includes(candidate.address));
    }
    if (candidate.official) return false;
    return evidence.some(({ ruleId, excerpt }) => {
      const url = ruleId === "auth.embedded-on-nonofficial-page" ? pageUrl
        : ruleId.startsWith("domain.") ? excerpt : undefined;
      return url && URL.canParse(url) && new URL(url).hostname.replace(/\.$/u, "") === candidate.domain;
    });
  });
  let riskTarget: RiskTarget | undefined;
  if (target && "domain" in target) {
    riskTarget = domainTarget(target.domain);
  } else if (target && addressChainId !== undefined) {
    riskTarget = { targetType: TargetType.ADDRESS, id: addressId(addressChainId, target.address) };
  }
  const report = evidence.length ? await autoReport(context, chain, riskTarget, evidence) : undefined;
  return { ...result, communitySignals: { queried, note: queried ? undefined : "未查询社区信号" }, autoReport: report };
}

async function excludeLocalIdentity(input: string, dataDir: string): Promise<void> {
  if (/^[a-z][\w+.-]*:\/\//iu.test(input)) return;
  let identity: string;
  try {
    identity = await realpath(join(dataDir, "identity.json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  const path = relative(await realpath(input), identity);
  if (!isAbsolute(path) && path !== ".." && !path.startsWith(".." + sep)) {
    throw new Error("扫描路径包含本机身份文件，请指定 Skill 自身所在目录。");
  }
}

export async function scan(
  input: string, context: CheckContext, reviewPacket: boolean, verdict: string | undefined,
) {
  await excludeLocalIdentity(input, context.dataDir);
  const files = await readSkillFiles(input, { download: context.download });
  const chain = communityChain(context);
  const contentHash = hashSkillFiles(files);
  const target = { targetType: TargetType.SKILL, id: contentHash } as const;
  let hits: AuthExternalHit[] | undefined;
  if (chain) {
    try {
      hits = await communityHits(chain, target, contentHash);
    } catch {
      // 保留静态规则报告并标明社区信号未查询。
    }
  }
  const baseline = scanSkillFiles(files, { externalHits: hits });
  const result = verdict === undefined ? baseline : mergeLlmVerdict(baseline, verdict);
  let localResult = result;
  if (result.level === "high" && hits?.length) {
    const staticResult = scanSkillFiles(files);
    localResult = verdict === undefined ? staticResult : mergeLlmVerdict(staticResult, verdict);
  }
  const report = localResult.level === "high"
    ? await autoReport(context, chain, target, localResult.evidence) : undefined;
  return {
    ...result, autoReport: report,
    reviewPacket: reviewPacket ? buildReviewPacket(result, files) : undefined,
  };
}

export async function localStatus(context: CheckContext) {
  const identity = await loadIdentity(context.dataDir);
  const chain = communityChain(context);
  const logins = await readLogins(context.dataDir);
  return {
    network: context.config.network, localIdentity: Boolean(identity),
    autoReport: context.config.autoReport, registry: chain?.registry,
    message: context.config.network === "mainnet"
      && (!context.config.registryAddress || !context.config.deploymentBlock || !context.config.relayerUrl)
      ? mainnetPending : undefined,
    recentLocalLogins: logins.filter((time) => time <= context.now && context.now - time <= 600_000).length,
  };
}
