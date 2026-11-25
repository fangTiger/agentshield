import { expect, test } from "vitest";

test("可以加载 core 的入口模块", async () => {
  await expect(import("../src/index.js")).resolves.toBeDefined();
});
