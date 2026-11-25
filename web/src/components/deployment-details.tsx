"use client";

import { parseAbi, zeroAddress } from "viem";
import { agentIdAddress, browserRpc, deployment, explorer, poseidonAddress } from "../lib/config";
import { registryAbi, type Deployment } from "../lib/registry";
import { DataNotice, useRegistryRead } from "./data-state";
import { SectionHeading } from "./section-heading";

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
      <section className="numbered-section">
        <SectionHeading number="01" kicker="部署信息" title="合约地址" />
        {result.state !== "ready" && <DataNotice state={result.state} />}
        <div className="tw" role="region" aria-label="合约地址表" tabIndex={0}>
          <table className="tb contracts-table">
            <thead><tr><th scope="col">合约</th><th scope="col">链上地址</th><th scope="col">区块浏览器</th></tr></thead>
            <tbody>
              {contracts.map(([label, address]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{address ? <code>{address}</code> : <span className="muted">
                    {!deployment ? "尚未部署" : label === "PoseidonT3" ? "暂未公布" : "暂未读取"}
                  </span>}</td>
                  <td>{address && <a href={`${explorer}/address/${address}#code`} target="_blank" rel="noreferrer">
                    BscScan 源码验证 <span aria-hidden="true">↗</span>
                  </a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">部署区块 <span className="mono">{deployment?.fromBlock.toString() ?? "尚未部署"}</span></p>
      </section>
      <section className="numbered-section">
        <SectionHeading number="02" kicker="社区状态" title="N/T 参数" />
        <div className="cd">
          <dl className="kp parameters">
            <div><dt>N · 危险票门槛</dt><dd>{data ? `${data.threshold} 票` : "默认 3 票"}</dd></div>
            <div><dt>T · 冷静期</dt><dd>{data ? `${data.cooldown} 秒` : "默认 24 小时"}</dd></div>
          </dl>
          <p>社区确认要求危险票达到 N，至少为误报票的两倍，且首张危险票已满冷静期 T。误报票达到 N 且不少于危险票时，对象进入有争议状态。N 和 T 在部署时固定。</p>
        </div>
      </section>
      <section className="numbered-section">
        <SectionHeading number="03" kicker="特权角色" title="种子地址的权限" />
        <div className="cd">
          <p><code>seeder</code> 是信号库唯一特权角色，只能通过 <code>seedBatch</code> 增加种子信号并记录来源，或通过 <code>renounceSeeder</code> 永久放弃权限。社区票数独立统计。信号库不可升级，拒收资产。任何人都可以提交申诉，申诉只添加记录。</p>
          <p className="note">当前种子地址 {!data ? <span>—</span> : data.seeder === zeroAddress ? "已放弃种子权限" :
            <a className="mono break-anywhere" href={`${explorer}/address/${data.seeder}`} target="_blank" rel="noreferrer">{data.seeder}</a>}
          </p>
        </div>
      </section>
    </>
  );
}
