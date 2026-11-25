import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "{packages/*,skill,relayer,web,intel}/test/**/*.{test,spec}.?(c|m)[jt]s?(x)",
      "{test,tests}/**/*.{test,spec}.?(c|m)[jt]s?(x)",
    ],
    exclude: [...configDefaults.exclude, "**/{.cache,cache,out,.next,dist,broadcast}/**"],
  },
});
