import { expect, it, vi } from "vitest";

it("将主机名、地址与 Skill 哈希编码为 Registry 的风险对象 ID", async () => {
  const { domainId, addressId, skillId, voteMessage, voteScope } = await import("../src/chain/index.js");
  const address = "0x0000000000000000000000000000000000000001";
  const hash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
  expect(domainId("BÜCHER.example.")).toBe(domainId("xn--bcher-kva.example"));
  expect(domainId("Example.COM.")).toBe("0x02438d3405cadd648e08dbff51bdbeb415913e642189100dc4a012064c870883");
  expect(addressId(56, address)).not.toBe(addressId(97, address));
  expect(skillId(hash)).toBe(hash);
  expect(voteScope(56, address, 2, hash)).not.toBe(voteScope(97, address, 2, hash));
  expect(voteMessage(0, hash)).not.toBe(voteMessage(1, hash));
});

it("按 5000 块分段读取 Joined 并依链上顺序构造群组", async () => {
  const { rebuildGroup } = await import("../src/chain/index.js");
  const registry = "0x0000000000000000000000000000000000000001";
  const client = {
    getBlockNumber: vi.fn(async () => 10002n),
    getLogs: vi.fn(async ({ fromBlock }: { fromBlock: bigint }) => fromBlock === 2n
      ? [
        { blockNumber: 100n, logIndex: 5, args: { commitment: 33n } },
        { blockNumber: 100n, logIndex: 4, args: { commitment: 11n } },
      ]
      : fromBlock === 5002n ? [{ blockNumber: 5003n, logIndex: 1, args: { commitment: 44n } }] : []),
  };
  const group = await rebuildGroup(client as never, registry, 2n);
  expect(client.getLogs.mock.calls.map(([range]) => range)).toMatchObject([
    { fromBlock: 2n, toBlock: 5001n }, { fromBlock: 5002n, toBlock: 10001n }, { fromBlock: 10002n, toBlock: 10002n },
  ]);
  expect(group.members).toEqual([11n, 33n, 44n]);
});

it("通过 Registry getter 读取投票使用状态", async () => {
  const { isNullifierUsed, registryAbi } = await import("../src/chain/index.js");
  const registry = "0x0000000000000000000000000000000000000001";
  const client = { readContract: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false) };
  expect(await isNullifierUsed(client, registry, 42n)).toBe(true);
  expect(await isNullifierUsed(client, registry, 42n)).toBe(false);
  expect(client.readContract).toHaveBeenCalledWith({
    address: registry, abi: registryAbi, functionName: "usedNullifiers", args: [42n],
  });
});
