#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, type ParseArgsConfig } from "node:util";
import { isMainThread } from "node:worker_threads";
import { syncIntel, type AuthCheckOptions, type ScanOptions } from "@agentshield/core";
import { isNullifierUsed, readCommitment } from "@agentshield/core/chain";
import { execBaw, requireDeveloperMode, walletAddress, type ExecBaw } from "./baw.js";
import { check, localStatus, scan } from "./checks.js";
import { connectChain, loadConfig, relayerUrl, setAutoReport, type ChainClient } from "./config.js";
import { formatCheck, formatScan, json } from "./format.js";
import { installHook, runHook } from "./hook.js";
import { askPassphrase, exportIdentity, importIdentity, loadIdentity } from "./identity.js";
import { login } from "./login.js";
import { executePreview, previewJoin, previewVote } from "./transactions.js";
import { buildVote, parseVote, submitAnonymous } from "./vote.js";

interface Dependencies {
  dataDir?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  client?: ChainClient;
  execBaw?: ExecBaw;
  write?: (line: string) => void;
  read?: () => Promise<string>;
  askPassphrase?: typeof askPassphrase;
  now?: () => number;
  fetch?: typeof fetch;
  expandUrl?: AuthCheckOptions["expandUrl"];
  download?: ScanOptions["download"];
}

const help = `AgentShield 授权体检与 Skill 扫描
  shield check <链接|文本|图片> [--json] [--offline] [--page-url <来源页面>]
  shield scan <路径|仓库> [--json] [--offline] [--review-packet | --merge-llm <JSON>]
  shield join [--execute <预览编号>]
  shield vote --anon|--public domain|address|skill <目标> danger|false-positive [--evidence-hash <哈希>]
  shield vote --public --execute <预览编号>
  shield identity export|import <备份路径>
  shield login
  shield status
  shield intel sync
  shield config auto-report on|off
  shield hook install`;

function options(command: string): NonNullable<ParseArgsConfig["options"]> {
  switch (command) {
    case "check": return { json: { type: "boolean" }, offline: { type: "boolean" }, "page-url": { type: "string" } };
    case "scan": return {
      json: { type: "boolean" }, offline: { type: "boolean" },
      "review-packet": { type: "boolean" }, "merge-llm": { type: "string" },
    };
    case "join": return { execute: { type: "string" } };
    case "vote": return {
      execute: { type: "string" }, anon: { type: "boolean" }, public: { type: "boolean" }, "evidence-hash": { type: "string" },
    };
    default: return {};
  }
}

async function readStdin(): Promise<string> {
  let text = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

export async function runCli(args: string[], dependencies: Dependencies = {}): Promise<void> {
  const [command, ...rest] = args;
  const cwd = dependencies.cwd ?? process.cwd();
  const dataDir = dependencies.dataDir ?? join(homedir(), ".agentshield");
  const env = dependencies.env ?? process.env;
  const write = dependencies.write ?? console.log;
  const run = dependencies.execBaw ?? execBaw;
  const now = dependencies.now ?? Date.now;
  const send = dependencies.fetch ?? fetch;
  const prompt = dependencies.askPassphrase ?? askPassphrase;
  if (!command || command === "--help" || rest.includes("--help")) {
    write(help);
    return;
  }
  let parsed;
  try {
    parsed = parseArgs({ args: rest, allowPositionals: true, options: options(command) });
  } catch {
    throw new Error(`命令参数不正确，请运行 shield ${command} --help 查看用法。`);
  }
  const { values, positionals } = parsed;
  const [input, argument] = positionals;
  const configured = () => loadConfig(dataDir, env);
  const context = async () => ({
    config: await configured(), dataDir, client: dependencies.client, now: now(),
    offline: values.offline === true, send, expandUrl: dependencies.expandUrl, download: dependencies.download,
  });
  const executeId = values.execute as string | undefined;

  switch (command) {
    case "check": {
      if (!input || positionals.length !== 1) throw new Error("请提供一个链接、文本或二维码图片路径。");
      const result = await check(input, await context(), values["page-url"] as string | undefined);
      write(values.json ? json(result) : formatCheck(result));
      return;
    }
    case "scan": {
      if (!input || positionals.length !== 1 || (values["review-packet"] && values["merge-llm"] !== undefined)) {
        throw new Error("请提供一个 Skill 路径或仓库，并选择一种审查操作。");
      }
      const result = await scan(input, await context(), values["review-packet"] === true, values["merge-llm"] as string | undefined);
      write(values.json ? json(result) : formatScan(result));
      return;
    }
    case "join": {
      if (positionals.length || executeId === "") throw new Error("用法：shield join [--execute <预览编号>]。");
      const result = executeId
        ? await executePreview(run, dataDir, "join", executeId)
        : await previewJoin(run, dataDir, connectChain(await configured(), dependencies.client), now());
      write(json(result));
      return;
    }
    case "vote": {
      if (Boolean(values.anon) === Boolean(values.public) || executeId === "") {
        throw new Error("请选择匿名投票 --anon 或公开投票 --public。");
      }
      if (executeId) {
        if (!values.public || positionals.length || values["evidence-hash"] !== undefined) {
          throw new Error("用法：shield vote --public --execute <预览编号>。");
        }
        write(json(await executePreview(run, dataDir, "vote", executeId)));
        return;
      }
      const vote = parseVote(positionals, values["evidence-hash"] as string | undefined);
      const config = await configured();
      const chain = connectChain(config, dependencies.client);
      if (values.anon) relayerUrl(config);
      const identity = await loadIdentity(dataDir);
      if (!identity) throw new Error("请先加入 AgentShield，或从加密备份恢复本机身份。");
      const chainId = await chain.client.getChainId();
      let result;
      if (values.public) {
        const from = await walletAddress(run, chainId);
        await requireDeveloperMode(run, now());
        if (await readCommitment(chain.client, chain.registry, from) !== identity.commitment) {
          throw new Error("当前钱包的登记承诺与本机身份不匹配，请使用登记该身份的钱包。");
        }
        const proven = await buildVote(chain, config, identity, vote, chainId);
        result = await isNullifierUsed(chain.client, chain.registry, BigInt(proven.proof.nullifier))
          ? { message: "本机身份已为该对象投过票。" }
          : { ...await previewVote(run, dataDir, chain, chainId, from, proven), target: input, targetValue: argument, vote: positionals[2] };
      } else {
        result = await submitAnonymous(chain, config, await buildVote(chain, config, identity, vote, chainId), send);
      }
      write(json(result));
      return;
    }
    case "identity": {
      if (!argument || positionals.length !== 2 || (input !== "export" && input !== "import")) {
        throw new Error("用法：shield identity export|import <备份路径>。");
      }
      if (input === "export") {
        await exportIdentity(dataDir, resolve(cwd, argument), prompt);
        write("加密备份已写入，请妥善保管备份和口令。");
      } else {
        await importIdentity(dataDir, resolve(cwd, argument), prompt);
        write("AgentShield 身份已从加密备份恢复。");
      }
      return;
    }
    case "login":
      if (!positionals.length) {
        await login(run, dataDir, write, now);
        return;
      }
      break;
    case "config":
      if (input === "auto-report" && (argument === "on" || argument === "off") && positionals.length === 2) {
        await setAutoReport(dataDir, argument === "on");
        write(argument === "on" ? "自动匿名上报已开启。" : "自动匿名上报已关闭。");
        return;
      }
      break;
    case "hook":
      if (input === "install" && positionals.length === 1) {
        await installHook(cwd);
        write("已在项目的 .claude/settings.json 中安装 AgentShield 扫描钩子。");
        return;
      }
      if (input === "run" && positionals.length === 1) {
        const output = await runHook(await (dependencies.read ?? readStdin)(), cwd, dependencies.download);
        if (output) write(json(output));
        return;
      }
      break;
    case "status":
      if (!positionals.length) {
        write(json(await localStatus(await context())));
        return;
      }
      break;
    case "intel":
      if (input === "sync" && positionals.length === 1) {
        write(json(await syncIntel(join(dataDir, "intel"), now)));
        return;
      }
  }
  throw new Error("命令参数不正确，请运行 shield --help 查看用法。");
}

if (isMainThread && process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let code = 0;
  try {
    await runCli(process.argv.slice(2));
  } catch (error) {
    code = 1;
    console.error((error as Error).message);
  }
  // Semaphore 证明库的工作线程可能仍存活，输出写完后退出。
  process.stdout.write("", () => process.stderr.write("", () => process.exit(code)));
}
