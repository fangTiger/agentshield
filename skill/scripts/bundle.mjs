import { chmod, copyFile, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { build } from "esbuild";

const skillDir = fileURLToPath(new URL("../", import.meta.url));
const coreDist = fileURLToPath(new URL("../../packages/core/dist/", import.meta.url));
const ruleFiles = new Map([
  [join(coreDist, "auth/phrases.js"), "phrases.yaml"],
  [join(coreDist, "scan/rules.js"), "redlines.yaml"],
]);
const sharpWasm = "@img/sharp-wasm32/sharp.node";
const sharpLib = join(dirname(createRequire(import.meta.url).resolve(sharpWasm)), "lib");
const sharpBinary = (await readdir(sharpLib)).find((file) => file.endsWith(".node.wasm"));
if (!sharpBinary) throw new Error("找不到 Sharp 的 WebAssembly 文件。");
const { metafile } = await build({
  absWorkingDir: skillDir,
  stdin: {
    // Sharp 与 Semaphore 的工作线程从同一个 CLI 文件启动。
    contents: `
      import { isMainThread, workerData } from "node:worker_threads";
      if (workerData === "em-pthread") await import("${sharpWasm}");
      else if (!isMainThread) await import("web-worker");
      export { runCli } from "./src/index.ts";
    `,
    resolveDir: skillDir,
  },
  outfile: "bin/shield.mjs",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  charset: "ascii",
  metafile: true,
  plugins: [{
    name: "sharp-wasm",
    setup(build) {
      build.onResolve({ filter: /^\.\/sharp\.mjs$/ }, ({ resolveDir }) => {
        if (basename(dirname(resolveDir)) === "sharp") {
          return build.resolve(sharpWasm, { resolveDir: skillDir, kind: "import-statement" });
        }
      });
    },
  }, {
    name: "inline-rule-yaml",
    setup(build) {
      build.onLoad({ filter: /(?:phrases|rules)\.js$/ }, async ({ path }) => {
        const yamlFile = ruleFiles.get(path);
        if (!yamlFile) return;

        const resolveDir = dirname(path);
        const [source, yaml] = await Promise.all([
          readFile(path, "utf8"),
          readFile(join(resolveDir, yamlFile), "utf8"),
        ]);
        // 只在打包时替换规则读取，core 仍可独立运行。
        const readRules = `readFileSync(new URL("./${yamlFile}", import.meta.url), "utf8")`;
        if (!source.includes(readRules)) throw new Error(`无法内联规则文件 ${yamlFile}，未找到读取表达式。`);
        return { contents: source.replace(readRules, () => JSON.stringify(yaml)), resolveDir };
      });
    },
  }],
  banner: {
    js: [
      "#!/usr/bin/env node",
      'import { createRequire as bundleRequire } from "node:module";',
      'import { dirname as bundleDirname } from "node:path";',
      'import { fileURLToPath as bundleFilePath } from "node:url";',
      "const require = bundleRequire(import.meta.url);",
      "const __filename = bundleFilePath(import.meta.url);",
      "const __dirname = bundleDirname(__filename);",
    ].join("\n"),
  },
});

const packageDirs = new Set(Object.keys(metafile.inputs).flatMap((input) => {
  const directory = /^(.*\bnode_modules\/(?:@[^/]+\/)?[^/]+)\//u.exec(input)?.[1];
  return directory ? [resolve(skillDir, directory)] : [];
}));
const notices = new Set([await readFile(new URL("../../LICENSE", import.meta.url), "utf8")]);
const licenses = [];
for (const directory of [...packageDirs].sort()) {
  const { name, version, license, repository } = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  const source = (typeof repository === "string" ? repository : repository?.url)
    ?.replace(/^git\+|^https:(?=https:\/\/)/u, "");
  licenses.push(`${name}@${version} · ${license ?? "见上游"}${source ? " · " + source : ""}`);
  for (const file of (await readdir(directory)).sort()) {
    if (/^(?:licen[cs]es?|copying|notice)(?:\.(?:txt|md))?$/iu.test(file)) {
      const text = await readFile(join(directory, file), "utf8");
      notices.add(text.trim() + "\n");
    }
  }
}

await Promise.all([
  chmod(new URL("../bin/shield.mjs", import.meta.url), 0o755),
  copyFile(join(sharpLib, sharpBinary), new URL("../bin/" + sharpBinary, import.meta.url)),
  writeFile(new URL("../bin/THIRD_PARTY_NOTICES.txt", import.meta.url), [
    "打包依赖及上游源码（精确版本见下表和仓库的 pnpm-lock.yaml）",
    ...licenses.sort(),
    "",
    "许可证及版权声明",
    ...notices,
  ].join("\n")),
  ...Array.from(ruleFiles.values(), (file) => rm(
    new URL("../bin/" + file, import.meta.url), { force: true },
  )),
]);
