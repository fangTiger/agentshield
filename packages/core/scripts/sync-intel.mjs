import { log } from "node:console";
import { argv } from "node:process";
import { syncIntel } from "../dist/index.js";

for (const { source, file, observedAt, status } of await syncIntel(argv[2])) {
  log(`${source} ${status} ${file}，数据时间 ${observedAt}`);
}
