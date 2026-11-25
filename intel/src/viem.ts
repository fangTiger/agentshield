import { createRequire } from "node:module";

// 与 core 共用工作区中已锁定的 viem 版本。
const require = createRequire(new URL("../../packages/core/package.json", import.meta.url));
export const viem = require("viem") as typeof import("../../packages/core/node_modules/viem/_types/index.js");
export const accounts = require("viem/accounts") as typeof import("../../packages/core/node_modules/viem/_types/accounts/index.js");
