import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Group } from "@semaphore-protocol/group";
import { Identity } from "@semaphore-protocol/identity";
import { generateProof } from "@semaphore-protocol/proof";
import {
  createPublicClient, createTestClient, createWalletClient, encodeAbiParameters, http, keccak256, parseAbi, toHex,
  type Address, type Hash,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { expect, it, vi } from "vitest";
import { agentShieldRegistryAbi as abi } from "../src/abi.js";
import { startRelayer } from "../src/server.js";

const exec = promisify(execFile);
const contractsRoot = fileURLToPath(new URL("../../contracts/", import.meta.url));

it.runIf(process.env.RUN_RELAYER_INTEGRATION === "true")(
  "真实证明经 HTTP 中继上链，重复投票返回 409，统计与链上一致",
  async () => {
    const artifacts = await mkdtemp(join(tmpdir(), "agentshield-relayer-"));
    const anvil = spawn("anvil", ["--host", "127.0.0.1", "--port", "0", "--accounts", "2", "--mnemonic-random"], {
      cwd: artifacts,
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    let server: ReturnType<typeof startRelayer> | undefined;

    try {
      const rpcUrl = await new Promise<string>((resolve, reject) => {
        let output = "";
        const read = (chunk: Buffer) => {
          output += chunk.toString();
          const port = output.match(/Listening on 127\.0\.0\.1:(\d+)/)?.[1];
          if (!port) return;
          anvil.stdout.off("data", read);
          anvil.stdout.resume();
          resolve(`http://127.0.0.1:${port}`);
        };
        anvil.once("error", reject);
        anvil.once("exit", () => reject(new Error("Anvil 提前退出")));
        anvil.stdout.on("data", read);
      });
      const transport = http(rpcUrl);
      const chain = foundry;
      const client = createPublicClient({ transport, chain });
      const wallet = createWalletClient({ transport, chain });
      const [member] = await wallet.getAddresses();
      const testClient = createTestClient({ transport, chain, mode: "anvil" });
      const deployerKey = generatePrivateKey();
      const deployer = privateKeyToAccount(deployerKey);
      await testClient.setBalance({ address: deployer.address, value: 10n ** 19n });
      const env = {
        ...process.env,
        FOUNDRY_OUT: join(artifacts, "out"),
        FOUNDRY_CACHE_PATH: join(artifacts, "cache"),
        FOUNDRY_BROADCAST: join(artifacts, "broadcast"),
        AGENT_ID_ADDRESS: "",
        RPC_URL: rpcUrl,
        CHAIN_ID: "31337",
        DEPLOYER_PRIVATE_KEY: deployerKey,
        SEEDER_ADDRESS: member,
        AGENTSHIELD_SEEDER: "0x0000000000000000000000000000000000000001",
        N: "3",
        T: "600",
      };

      const deploymentPath = join(artifacts, "31337.json");
      await exec(process.execPath, ["script/deploy.mjs", deploymentPath], { cwd: contractsRoot, env, timeout: 50_000 });
      const deployment = JSON.parse(await readFile(deploymentPath, "utf8")) as {
        chainId: number; registry: Address; deploymentBlock: string; deploymentTxHash: Hash;
        agentId: Address; mockAgentId: boolean; poseidonT3: Address; semaphore: Address; semaphoreVerifier: Address;
      };
      const { registry: address, agentId } = deployment;
      expect(deployment).toMatchObject({ chainId: 31337, mockAgentId: true });
      const registryReceipt = await client.getTransactionReceipt({ hash: deployment.deploymentTxHash });
      expect(registryReceipt).toMatchObject({ status: "success", blockNumber: BigInt(deployment.deploymentBlock) });
      for (const contract of [address, agentId, deployment.poseidonT3, deployment.semaphore, deployment.semaphoreVerifier]) {
        expect(await client.getCode({ address: contract })).toMatch(/^0x[0-9a-f]+$/i);
      }
      const mockAbi = parseAbi([
        "function claim()", "function balanceOf(address) view returns (uint256)",
        "error AlreadyClaimed()", "error ERC721InvalidOwner(address)",
      ]);
      const balance = () => client.readContract({ address: agentId, abi: mockAbi, functionName: "balanceOf", args: [member] });
      const claim = { account: member, address: agentId, abi: mockAbi, functionName: "claim" } as const;
      expect(await balance()).toBe(0n);
      expect((await client.waitForTransactionReceipt({ hash: await wallet.writeContract(claim) })).status).toBe("success");
      expect(await balance()).toBe(1n);
      await expect(client.simulateContract(claim)).rejects.toThrow("AlreadyClaimed");
      await expect(client.readContract({
        address: agentId, abi: mockAbi, functionName: "balanceOf", args: [toHex(0, { size: 20 })],
      })).rejects.toThrow("ERC721InvalidOwner");
      expect(await client.readContract({ address, abi, functionName: "T" })).toBe(600n);

      // 钱包仅使用本次本地 Anvil 的临时密钥和测试余额。
      const privateKey = generatePrivateKey();
      const relayerAddress = privateKeyToAccount(privateKey).address;
      await testClient.setBalance({ address: relayerAddress, value: 10n ** 18n });
      const relayerEnv = {
        PORT: "0",
        RPC_URL: rpcUrl,
        REGISTRY_ADDRESS: address,
        RELAYER_PRIVATE_KEY: privateKey,
        DEPLOYMENT_BLOCK: deployment.deploymentBlock,
        CHAIN_ID: String(deployment.chainId),
        RELAYER_MAX_QPS: "20",
        RELAYER_DAILY_GAS_BUDGET: "10000000",
      };
      server = startRelayer(relayerEnv);
      await once(server, "listening");
      const listenAddress = server.address();
      if (!listenAddress || typeof listenAddress === "string") throw new Error("中继缺少监听端口");
      const url = `http://127.0.0.1:${listenAddress.port}`;

      const identity = new Identity();
      const group = new Group([identity.commitment]);
      const joinHash = await wallet.writeContract({
        account: member, address, abi, functionName: "join", args: [identity.commitment],
      });
      expect((await client.waitForTransactionReceipt({ hash: joinHash })).status).toBe("success");

      const targetType = 2;
      const id = keccak256(toHex("本地集成测试"));
      const voteType = 0;
      const evidenceHash = toHex(0, { size: 32 });
      const scope = BigInt(keccak256(encodeAbiParameters(
        [{ type: "uint256" }, { type: "address" }, { type: "uint8" }, { type: "bytes32" }],
        [BigInt(foundry.id), address, targetType, id],
      ))) >> 8n;
      const message = BigInt(keccak256(encodeAbiParameters(
        [{ type: "uint8" }, { type: "bytes32" }], [voteType, evidenceHash],
      ))) >> 8n;
      const circuitPath = join(contractsRoot, "cache", "semaphore", "4.13.0", "semaphore-2");
      const wasm = `${circuitPath}.wasm`;
      const zkey = `${circuitPath}.zkey`;
      const proof = await generateProof(identity, group, message, scope, 2,
        existsSync(wasm) && existsSync(zkey) ? { wasm, zkey } : undefined);
      const body = { targetType, id, voteType, evidenceHash, proof };
      const vote = (payload = body) => fetch(`${url}/vote`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
        body: JSON.stringify(payload),
      });
      const signals = () => client.readContract({ address, abi, functionName: "signalsOf", args: [targetType, id] });

      const badScope = await vote({ ...body, targetType: 0 });
      expect(badScope.status).toBe(400);
      expect(await badScope.json()).toMatchObject({ errorName: "InvalidScope" });

      const [before] = await signals();
      const first = await vote();
      const sent = await first.json() as { txHash: Hash };
      expect(first.status, JSON.stringify(sent)).toBe(200);
      const receipt = await client.waitForTransactionReceipt({ hash: sent.txHash });
      expect(receipt.status).toBe("success");
      expect(receipt.from.toLowerCase()).toBe(relayerAddress.toLowerCase());
      expect((await signals())[0]).toBe(before + 1n);

      const duplicate = await vote();
      expect(duplicate.status).toBe(409);
      expect((await signals())[0]).toBe(before + 1n);

      const sourceId = keccak256(toHex("本地种子"));
      const seedHash = await wallet.writeContract({
        account: member, address, abi, functionName: "seedBatch",
        args: [[{ targetType, id, sourceId }]],
      });
      expect((await client.waitForTransactionReceipt({ hash: seedHash })).status).toBe("success");

      const headers = { origin: "https://dashboard.example" };
      const statsResponse = await fetch(`${url}/api/stats`, { headers });
      expect(statsResponse.status).toBe(200);
      expect(statsResponse.headers.get("access-control-allow-origin")).toBe("*");
      const [, , , firstDangerAt] = await signals();
      const summary = {
        targetType, id, dangerVotes: 1, falsePositiveVotes: 0, seedCount: 1, appealCount: 0,
        status: 1, firstDangerAt: Number(firstDangerAt),
      };
      const stats = {
        joinedCount: 1,
        votesLast24h: 1,
        targets: [{ ...summary, firstVoteAt: Number(firstDangerAt), sources: [sourceId], appeals: [] }],
      };
      expect(await statsResponse.json()).toEqual(stats);
      const target = await fetch(`${url}/api/target?type=${targetType}&id=${id}`, { headers });
      expect(target.status).toBe(200);
      expect(await target.json()).toEqual({
        ...summary,
        votes: [{ voteType, evidenceHash, transactionHash: sent.txHash, blockNumber: Number(receipt.blockNumber) }],
        seeds: [{ sourceId, transactionHash: seedHash }],
        appeals: [],
      });

      for (const [name, value] of Object.entries(relayerEnv)) vi.stubEnv(name, value);
      const { default: vercelApp } = await import("../src/app.js");
      const vercelStats = await vercelApp.fetch(new Request("https://relay.example/api/stats", { headers }));
      expect(vercelStats.status).toBe(200);
      expect(vercelStats.headers.get("access-control-allow-origin")).toBe("*");
      expect(await vercelStats.json()).toEqual(stats);
      expect(log.mock.calls).toEqual([[`匿名中继已启动，端口 ${listenAddress.port}`]]);
    } finally {
      vi.unstubAllEnvs();
      log.mockRestore();
      if (server) {
        const runningServer = server;
        await new Promise<void>((resolve) => runningServer.close(() => resolve()));
      }
      if (anvil.exitCode === null && anvil.signalCode === null && anvil.pid) {
        const exited = once(anvil, "exit");
        anvil.kill();
        await exited;
      }
      await rm(artifacts, { recursive: true, force: true });
    }
  },
  120_000,
);
