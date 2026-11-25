import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isAddress, type Address } from "viem";

const exec = promisify(execFile);
export type ExecBaw = (args: string[]) => Promise<unknown>;

export const execBaw: ExecBaw = async (args) => {
  try {
    const { stdout } = await exec("baw", args);
    return JSON.parse(stdout);
  } catch (error) {
    const failure = error as { code?: string; stdout?: string };
    if (failure.code === "ENOENT") throw new Error("未找到官方 baw CLI，请先安装。", { cause: error });
    if (failure.stdout) {
      try {
        return JSON.parse(failure.stdout);
      } catch {
        // 避免将可能含有登录参数的原始输出传入报错。
      }
    }
    throw new Error(`官方 baw ${args.slice(0, 2).join(" ")} 未完成。`, { cause: error });
  }
};

export async function callBaw<T>(run: ExecBaw, ...args: string[]): Promise<T> {
  const result = await run([...args, "--json"]) as {
    success: boolean; data?: T; error?: { message?: string };
  };
  if (!result.success || result.data === undefined) {
    // 登录阶段的原始错误数据可能包含登录参数。
    const detail = args[0] !== "auth" && result.error?.message ? ` ${result.error.message}` : "";
    throw new Error(`官方 baw ${args.slice(0, 2).join(" ")} 未完成。${detail}`);
  }
  return result.data;
}

export async function walletAddress(run: ExecBaw, chainId: number): Promise<Address> {
  const { status } = await callBaw<{ status: string }>(run, "wallet", "status");
  if (status === "CREATING") throw new Error("官方钱包正在创建，请在 App 内完成登录后再试。");
  if (status !== "CONNECTED") throw new Error("请先通过 shield login 发起官方登录，并在币安 App 中确认。");
  const { addresses } = await callBaw<{ addresses: { binanceChainId: string | number; address: string }[] }>(
    run, "wallet", "address",
  );
  const address = addresses.find(({ binanceChainId }) => Number(binanceChainId) === chainId)?.address;
  if (!address || !isAddress(address)) throw new Error(`官方钱包没有链 ${chainId} 的可用地址。`);
  return address;
}

export async function requireDeveloperMode(run: ExecBaw, now: number): Promise<void> {
  const { devMode } = await callBaw<{ devMode?: { enabled: boolean; expiresAt?: string | number | null } }>(
    run, "wallet", "settings",
  );
  const expiresAt = devMode?.expiresAt;
  let expiryMs = NaN;
  if (typeof expiresAt === "string") expiryMs = Date.parse(expiresAt);
  if (typeof expiresAt === "number") expiryMs = expiresAt * 1000;
  if (!devMode?.enabled || (expiresAt != null && (!Number.isFinite(expiryMs) || expiryMs <= now))) {
    throw new Error("开发者模式用于签署登记或公开投票。该模式只能在币安 App 内开启，建议把开发者模式额度设到最低。");
  }
}
