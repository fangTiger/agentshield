import type { AuthExternalHit } from "../auth/types.js";

export type IntelHit = Extract<AuthExternalHit, { kind: "intel" }> & { observedAt: string };

export interface IntelLookupResult {
  hits: IntelHit[];
  notes: ("情报可能过期" | "GoPlus 未查询")[];
}

export type IntelTarget = { domain: string } | { address: string };
