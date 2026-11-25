import { createServer } from "node:http";
import { once } from "node:events";
import { afterAll, beforeAll, expect, test } from "vitest";
import { checkAuth } from "../src/index.js";

const appLink = "https://app.binance.com/uni-qr/AbCd1234";
const shortLink = "https://bit.ly/example";
const login = "https://web3.binance.com/agent-login?_ul=placeholder";
const options = { recentLocalLogins: [] };

let base: string;
const requests: string[] = [];
const server = createServer((request, response) => {
  const path = request.url ?? "/";
  requests.push(path);

  if (path === "/slow") return;
  if (path === "/missing-location") {
    response.writeHead(302).end();
    return;
  }
  if (path === "/app" && !request.headers["user-agent"]?.includes("Mobile")) {
    response.writeHead(400).end();
    return;
  }
  const destinations: Record<string, string> = {
    "/app": "./share-page",
    "/share-page": login,
    "/survey": "./non-auth",
    "/other-scheme": "binance://wallet/agent-login",
  };
  const hop = /^\/(five|six)\/(\d+)$/u.exec(path);
  if (hop) {
    const limit = hop[1] === "five" ? 5 : 6;
    const count = Number(hop[2]);
    if (count < limit) {
      response.writeHead(302, { location: `/${hop[1]}/${count + 1}` }).end();
      return;
    }
  }
  if (destinations[path]) {
    response.writeHead(302, { location: destinations[path] }).end();
    return;
  }
  if (path === "/bad-status") {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200).end("sample");
});

beforeAll(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("本地测试服务未启动");
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

const expandFrom = (path: string) => async () => {
  const { expandShortLink } = await import("../src/auth/redirect.js");
  return expandShortLink(new URL(path, base));
};

test("以移动端 UA 跟随相对跳转，uni-qr 最终指向官方登录时判为高风险", async () => {
  const report = await checkAuth(appLink, { ...options, expandUrl: expandFrom("/app") });
  expect(report.level).toBe("high");
  expect(report.evidence).toContainEqual(expect.objectContaining({
    ruleId: "auth.no-recent-local-login",
    excerpt: appLink,
  }));
  expect(requests).toContain("/share-page");
});

test("uni-qr 跳转到问卷时不认定为授权", async () => {
  const report = await checkAuth(appLink, { ...options, expandUrl: expandFrom("/survey") });
  expect(report.level).toBe("none");
  expect(report.evidence.some((item) => item.ruleId.startsWith("auth."))).toBe(false);
});

test("uni-qr 停在 BAPI 中转页时保持未知", async () => {
  const report = await checkAuth(appLink, {
    ...options,
    expandUrl: async () => new URL("https://www.binance.com/bapi/fe/qrcode/share_link_page/uni-qr/AbCd1234"),
  });
  expect(report.level).toBe("unknown");
});

test("已知短链可跟随五次跳转，第六次不访问", async () => {
  const resolved = await checkAuth(shortLink, { ...options, expandUrl: expandFrom("/five/0") });
  expect(resolved.level).toBe("none");
  expect(requests).toContain("/five/5");

  const unresolved = await checkAuth(shortLink, { ...options, expandUrl: expandFrom("/six/0") });
  expect(unresolved.level).toBe("unknown");
  expect(requests).not.toContain("/six/6");
});

test.each(["/missing-location", "/other-scheme", "/bad-status"])("无法展开短链时为未知 %s", async (path) => {
  const report = await checkAuth(shortLink, { ...options, expandUrl: expandFrom(path) });
  expect(report.level).toBe("unknown");
  expect(report.evidence.map((item) => item.ruleId)).toContain("redirect.unresolved");
});

test("三秒后结束无法完成的请求", async () => {
  const start = performance.now();
  const report = await checkAuth(shortLink, { ...options, expandUrl: expandFrom("/slow") });
  const duration = performance.now() - start;
  expect(report.level).toBe("unknown");
  expect(duration).toBeGreaterThanOrEqual(2_900);
  expect(duration).toBeLessThan(4_500);
}, 6_000);

test("注入的展开器失败时返回未知", async () => {
  const report = await checkAuth(appLink, {
    ...options,
    expandUrl: async () => { throw new Error("连接失败"); },
  });
  expect(report.level).toBe("unknown");
});
