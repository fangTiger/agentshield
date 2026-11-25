import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
