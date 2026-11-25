import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    "**/.cache/",
    "**/cache/",
    "**/out/",
    "**/.next/",
    "**/dist/",
    "**/broadcast/",
    "**/.vercel/",
    ".pnpm-store/",
    "contracts/lib/",
    "packages/core/test/fixtures/skills/",
    "web/next-env.d.ts",
    "skill/bin/shield.mjs",
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  { rules: { "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }] } },
);
