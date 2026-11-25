import { serve } from "@hono/node-server";
import { createConfiguredRelayer } from "./runtime.js";

export function startRelayer(env: NodeJS.ProcessEnv) {
  const app = createConfiguredRelayer(env);

  return serve({ fetch: app.fetch, port: Number(env.PORT ?? "3000") }, ({ port }) => {
    console.log(`匿名中继已启动，端口 ${port}`);
  });
}
