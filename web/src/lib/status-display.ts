import { statuses } from "./labels";

export const statusDisplay = {
  clear: { label: "无风险信号", tone: "ok" },
  pending: { label: statuses[1], tone: "l4" },
  confirmed: { label: statuses[2], tone: "no-tone" },
  disputed: { label: statuses[3], tone: "l1" },
  seed: { label: "种子情报", tone: "l6" },
} as const;

export function classifySignal({ status, seedCount }: { status: number; seedCount: number }) {
  switch (status) {
    case 1: return "pending";
    case 2: return "confirmed";
    case 3: return "disputed";
    default: return seedCount > 0 ? "seed" : "clear";
  }
}
