import { encodeAbiParameters, isHex, keccak256, size, stringToHex, type Address, type Hex } from "viem";

export const TargetType = { DOMAIN: 0, ADDRESS: 1, SKILL: 2 } as const;
export type TargetType = typeof TargetType[keyof typeof TargetType];
export const VoteType = { Danger: 0, FalsePositive: 1 } as const;
export type VoteType = typeof VoteType[keyof typeof VoteType];

export interface RiskTarget {
  targetType: TargetType;
  id: Hex;
}

export function normalizeHostname(hostname: string): string {
  const host = hostname.trim();
  const ipv6 = host.startsWith("[") && host.endsWith("]");
  if (/[/\\@#?%\s]/u.test(host) || (!ipv6 && host.includes(":")) || !URL.canParse("http://" + host)) {
    throw new Error("请输入有效的主机名。");
  }
  const ascii = new URL("http://" + host).hostname.replace(/\.+$/u, "");
  if (!ascii) throw new Error("请输入有效的主机名。");
  return ascii;
}

export function domainId(hostname: string): Hex {
  return keccak256(stringToHex(normalizeHostname(hostname)));
}

export function addressId(chainId: number | bigint, address: Address): Hex {
  return keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "address" }], [BigInt(chainId), address]));
}

export function skillId(contentHash: string): Hex {
  if (!isHex(contentHash) || size(contentHash) !== 32) throw new Error("内容哈希必须为 32 字节。");
  return contentHash;
}

export function voteScope(chainId: number | bigint, registry: Address, targetType: TargetType, id: Hex): bigint {
  const hash = keccak256(encodeAbiParameters(
    [{ type: "uint256" }, { type: "address" }, { type: "uint8" }, { type: "bytes32" }],
    [BigInt(chainId), registry, targetType, id],
  ));
  return BigInt(hash) >> 8n;
}

export function voteMessage(voteType: VoteType, evidenceHash: Hex): bigint {
  const hash = keccak256(encodeAbiParameters([{ type: "uint8" }, { type: "bytes32" }], [voteType, evidenceHash]));
  return BigInt(hash) >> 8n;
}
