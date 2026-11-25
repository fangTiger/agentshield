import { join } from "node:path";
import { callBaw, type ExecBaw } from "./baw.js";
import { readJson, writeJson } from "./config.js";

export async function readLogins(dataDir: string): Promise<number[]> {
  return await readJson<number[]>(join(dataDir, "logins.json")) ?? [];
}

export async function login(run: ExecBaw, dataDir: string, write: (line: string) => void, now: () => number) {
  const response = await callBaw<{ status?: string; urlForWeb?: string; pairingCode?: string; qrCodeId?: string }>(
    run, "auth", "signin",
  );
  if (response.status === "ALREADY_CONNECTED") {
    write("官方钱包已连接。");
    return;
  }
  const { urlForWeb, pairingCode, qrCodeId } = response;
  if (!urlForWeb || !pairingCode || !qrCodeId) throw new Error("官方 baw 返回的登录信息不完整。");
  write(urlForWeb);
  write(pairingCode);
  const logins = await readLogins(dataDir);
  await writeJson(join(dataDir, "logins.json"), [...logins, now()]);
  const { status } = await callBaw<{ status: string }>(run, "auth", "verify", "--qrCodeId", qrCodeId);
  if (status !== "SUCCESS") throw new Error("官方钱包登录尚未完成，请在币安 App 中查看状态。");
  write("官方钱包登录已完成。");
}
