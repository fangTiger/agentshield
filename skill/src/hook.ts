import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readSkillFiles, scanSkillFiles, type ScanOptions } from "@agentshield/core";
import { parse, quote } from "shell-quote";
import { readJson, writeJson } from "./config.js";

interface HookMatcher {
  matcher?: string;
  hooks: { type: string; command?: string }[];
}

interface Settings {
  hooks?: { PreToolUse?: HookMatcher[] };
}

const bundlePath = fileURLToPath(new URL("../bin/shield.mjs", import.meta.url));
const hookCommand = quote(["node", bundlePath, "hook", "run"]);

export async function installHook(cwd: string): Promise<void> {
  const path = join(cwd, ".claude", "settings.json");
  const settings = await readJson<Settings>(path) ?? {};
  const previous = settings.hooks?.PreToolUse ?? [];
  let updated = false;
  const hooks = previous.map((matcher) => {
    if (matcher.matcher !== "Bash") return matcher;
    return { ...matcher, hooks: matcher.hooks.map((hook) => {
      if (hook.type !== "command" || hook.command !== "shield hook run") return hook;
      updated = true;
      return { ...hook, command: hookCommand };
    }) };
  });
  if (hooks.some(({ matcher, hooks: commands }) =>
    matcher === "Bash" && commands.some(({ type, command }) => type === "command" && command === hookCommand))) {
    if (!updated) return;
  } else {
    hooks.push({ matcher: "Bash", hooks: [{ type: "command", command: hookCommand }] });
  }
  await writeJson(path, { ...settings, hooks: { ...settings.hooks, PreToolUse: hooks } });
}

interface InstallTarget {
  input: string;
  directory: string;
  branch?: string;
}

function commandTargets(command: string, cwd: string): InstallTarget[] {
  const targets: InstallTarget[] = [];
  const cloneOptions = new Set([
    "--depth", "-b", "--branch", "-o", "--origin", "--filter", "-c", "--config",
    "--reference", "--reference-if-able", "--shallow-since", "--shallow-exclude", "-j", "--jobs",
  ]);
  const runners = new Set(["npx", "pnpx", "bunx", "pnpm", "npm", "yarn"]);
  let directory = cwd;
  let words: string[] = [];

  function inspect() {
    const [program, action] = words;
    if (program === "cd" && action && words.length === 2) {
      directory = resolve(directory, action);
      return;
    }
    let gitAction = 1;
    let gitDirectory = directory;
    if (program === "git") {
      while (words[gitAction] === "-C" && words[gitAction + 1]) {
        gitDirectory = resolve(gitDirectory, words[gitAction + 1]);
        gitAction += 2;
      }
    }
    if (program === "git" && words[gitAction] === "clone") {
      let branch: string | undefined;
      for (let index = gitAction + 1; index < words.length; index++) {
        const option = words[index];
        if (!option.startsWith("-")) {
          targets.push({ input: option, directory: gitDirectory, branch });
          return;
        }
        if (option === "-b" || option === "--branch") branch = words[index + 1];
        if (option.startsWith("--branch=")) branch = option.slice("--branch=".length);
        if (cloneOptions.has(option)) index++;
      }
    }
    const skillIndex = runners.has(program) ? words.findIndex((word) => /^skills(?:@[^\s]+)?$/u.test(word)) : 0;
    if (skillIndex >= 0 && /^skills(?:@[^\s]+)?$/u.test(words[skillIndex])
      && words[skillIndex + 1] === "add") {
      const input = words.slice(skillIndex + 2).find((word) => !word.startsWith("-"));
      if (input) targets.push({ input, directory });
    }
  }

  for (const line of command.split("\n")) {
    for (const token of parse(line, (name) => "$" + name)) {
      if (typeof token === "string") {
        words.push(token);
      } else {
        inspect();
        words = [];
      }
    }
    inspect();
    words = [];
  }
  return targets;
}

function scanInput({ input, directory }: InstallTarget): string {
  const local = resolve(directory, input);
  if (existsSync(local) || /^\.{0,2}\//u.test(input)) return local;
  const repo = input.replace(/^git@github\.com:/u, "").replace(/^ssh:\/\/git@github\.com\//u, "");
  return /^[\w.-]+\/[\w.-]+$/u.test(repo) ? "https://github.com/" + repo : input;
}

async function scanTarget(target: InstallTarget, download?: ScanOptions["download"]) {
  const input = scanInput(target);
  const tree = /^(https:\/\/github\.com\/[\w.-]+\/[\w.-]+)\/tree\/([^/]+)(?:\/(.+?))?\/?$/u.exec(input);
  const branch = tree ? decodeURIComponent(tree[2]) : target.branch;
  const files = await readSkillFiles(tree?.[1] ?? input, {
    download: branch ? async (url) => {
      url.pathname = url.pathname.replace(/HEAD$/u, encodeURIComponent(branch));
      if (download) return download(url);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`下载 Skill 失败（HTTP ${response.status}）。`);
      return new Uint8Array(await response.arrayBuffer());
    } : download,
  });
  if (!tree?.[3]) return scanSkillFiles(files);
  const prefix = decodeURIComponent(tree[3]).replace(/\/+$/u, "") + "/";
  const selected = files.filter(({ path }) => path.startsWith(prefix))
    .map(({ path, content }) => ({ path: path.slice(prefix.length), content }));
  if (!selected.length) throw new Error("未找到 Skill 子目录。");
  return scanSkillFiles(selected);
}

export async function runHook(json: string, fallbackCwd: string, download?: ScanOptions["download"]) {
  const event = JSON.parse(json) as {
    hook_event_name: string; tool_name: string; tool_input?: { command?: string }; cwd?: string;
  };
  if (event.hook_event_name !== "PreToolUse" || event.tool_name !== "Bash" || !event.tool_input?.command) return;
  const targets = commandTargets(event.tool_input.command, event.cwd ?? fallbackCwd);
  let failed = false;
  for (const target of targets) {
    let result;
    try {
      result = await scanTarget(target, download);
    } catch {
      failed = true;
      continue;
    }
    if (result.level === "high") {
      const redlines = Object.entries(result.redlines).filter(([, hit]) => hit).map(([rule]) => rule).join("、");
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse", permissionDecision: "ask",
          permissionDecisionReason: `AgentShield 扫描发现高风险，命中红线 ${redlines}。请核对后决定是否继续安装。`,
        },
      };
    }
  }
  if (failed) return { systemMessage: "AgentShield 未能完成 Skill 安装前扫描，请核对安装来源。" };
}
