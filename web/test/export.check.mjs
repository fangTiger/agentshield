import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { env } from "node:process";
import { test } from "node:test";
import { URL } from "node:url";
import { toEventSelector, toFunctionSelector } from "viem";

const output = new URL("../out/", import.meta.url);

test("静态导出包含首页、信号列表与详情、安装指南和披露页", () => {
  const pages = {
    "index.html": /不拦截 App 内流程/,
    "signals/index.html": /信号库/,
    "signals/detail/index.html": /信号详情/,
    "guide/index.html": /让你的 Agent 加入/,
    "disclosure/index.html": /DBAD v1\.2/,
  };
  for (const [name, content] of Object.entries(pages)) {
    assert.match(readFileSync(new URL(name, output), "utf8"), content);
  }
});

test("首页主入口指向 Agent 加入指南，静态导出没有网页加入路由", () => {
  const home = readFileSync(new URL("index.html", output), "utf8");
  const guide = readFileSync(new URL("guide/index.html", output), "utf8");
  assert.match(home, /class="button primary" href="\/guide\/">让你的 Agent 加入/);
  assert.match(guide, /npx skills add fangTiger\/agentshield/);
  assert.match(guide, /identity export/);
  assert.doesNotMatch(home + guide, /href="\/join\/?"/);
  assert.equal(existsSync(new URL("join/", output)), false);
});

test("首页和指南的静态 HTML 均展示一句话加入指令", () => {
  const prompt = "请从 GitHub 安装 fangTiger/agentshield 这个 Skill，然后帮我加入 AgentShield。";
  for (const name of ["index.html", "guide/index.html"]) {
    const html = readFileSync(new URL(name, output), "utf8");
    assert.ok(html.includes(`<code>${prompt}</code>`), name);
  }
});

test("各页面的网络标签与构建链 ID 一致，测试网横幅链接主网", () => {
  const isTestnet = env.NEXT_PUBLIC_CHAIN_ID === "97";
  for (const name of ["index.html", "guide/index.html", "signals/index.html", "signals/detail/index.html", "disclosure/index.html"]) {
    const html = readFileSync(new URL(name, output), "utf8");
    if (isTestnet) {
      assert.match(html, />测试网 · 演示数据</, name);
      assert.match(html, /这是测试网演示站，数据与主网无关。/, name);
      assert.match(html, /href="https:\/\/agentshield-bsc\.vercel\.app"/, name);
      assert.doesNotMatch(html, />BSC 主网</, name);
    } else {
      assert.match(html, />BSC 主网</, name);
      assert.doesNotMatch(html, /测试网 · 演示数据|这是测试网演示站/, name);
    }
  }
});

test("导出的浏览器代码不包含 Agent ID 名址查询或登记事件", () => {
  const forbidden = [
    /\b(?:ownerOfHandle|Registered)\b/,
    new RegExp(toFunctionSelector("ownerOfHandle(string)").slice(2), "i"),
    new RegExp(toEventSelector("Registered(bytes32,address,string)").slice(2), "i"),
  ];
  const assets = readdirSync(output, { recursive: true }).filter((name) => /\.(?:js|html)$/.test(name));
  assert.ok(assets.some((name) => name.endsWith(".js")));
  for (const name of assets) {
    const content = readFileSync(new URL(name, output), "utf8");
    for (const pattern of forbidden) assert.doesNotMatch(content, pattern, name);
  }
});
