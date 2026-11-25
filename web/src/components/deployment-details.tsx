"use client";

import { parseAbi, zeroAddress } from "viem";
import { agentIdAddress, browserRpc, deployment, explorer, poseidonAddress } from "../lib/config";
import { registryAbi, type Deployment } from "../lib/registry";
import { DataNotice, useRegistryRead } from "./data-state";

async function loadContracts({ address }: Deployment) {
  const client = browserRpc();
  const blockNumber = await client.getBlockNumber();
  const options = { abi: registryAbi, address, blockNumber } as const;
  const [threshold, cooldown, seeder, semaphore] = await Promise.all([
    client.readContract({ ...options, functionName: "N" }),
    client.readContract({ ...options, functionName: "T" }),
    client.readContract({ ...options, functionName: "seeder" }),
    client.readContract({ ...options, functionName: "semaphore" }),
  ]);
  const verifier = await client.readContract({
    abi: parseAbi(["function verifier() view returns (address)"]),
    address: semaphore, blockNumber, functionName: "verifier",
  });
  return { threshold, cooldown, seeder, semaphore, verifier };
}

const loadDeployment = deployment ? loadContracts.bind(undefined, deployment) : undefined;

export function DeploymentDetails() {
  const result = useRegistryRead(loadDeployment);
  const data = result.state === "ready" ? result.data : undefined;
  const contracts = [
    ["AgentShieldRegistry", deployment?.address],
    ["Agent ID（外部合约）", agentIdAddress],
    ["Semaphore v4", data?.semaphore],
    ["SemaphoreVerifier", data?.verifier],
    ["PoseidonT3", poseidonAddress],
  ] as const;

  return (
    <>
      {result.state !== "ready" && <DataNotice state={result.state} />}
      <dl className="disclosure-list">
        {contracts.map(([label, address]) => (
          <div key={label}><dt>{label}</dt><dd>
            {address ? <>
              <code className="break-anywhere">{address}</code>
              <a className="text-link" href={`${explorer}/address/${address}#code`} target="_blank" rel="noreferrer">
                BscScan 源码验证 <span aria-hidden="true">↗</span>
              </a>
            </> : <span className="muted">{!deployment ? "尚未部署" : label === "PoseidonT3" ? "暂未公布" : "暂未读取"}</span>}
          </dd></div>
        ))}
        <div><dt>部署区块</dt><dd className="mono">{deployment?.fromBlock.toString() ?? "尚未部署"}</dd></div>
        <div><dt>当前种子地址</dt><dd>
          {!data ? <span className="muted">—</span> : data.seeder === zeroAddress ? "已放弃种子权限" :
            <a className="text-link mono break-anywhere" href={`${explorer}/address/${data.seeder}`} target="_blank" rel="noreferrer">{data.seeder}</a>}
        </dd></div>
        <div><dt>N · 危险票门槛</dt><dd>{data ? `${data.threshold} 票` : "默认 3 票"}</dd></div>
        <div><dt>T · 冷静期</dt><dd>{data ? `${data.cooldown} 秒` : "默认 24 小时"}</dd></div>
      </dl>
    </>
  );
}
