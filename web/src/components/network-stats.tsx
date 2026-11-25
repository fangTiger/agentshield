"use client";

import { readDashboard } from "../lib/dashboard";
import { browserRpc, deployment, relayerUrl } from "../lib/config";
import { statuses } from "../lib/labels";
import { DataNotice, useRegistryRead } from "./data-state";

function loadOverview() {
  return readDashboard(browserRpc, deployment, relayerUrl, "overview");
}

const number = new Intl.NumberFormat("zh-CN");

export function NetworkStats() {
  const result = useRegistryRead(deployment || relayerUrl ? loadOverview : undefined, 60_000);
  const stats = result.state === "ready" ? result.data : undefined;
  const totals = [
    ["已登记真人数", stats?.joinedCount],
    ["风险对象数", stats?.targets.length],
    ["24 小时新增票数", stats?.votesLast24h],
  ] as const;

  return (
    <section aria-labelledby="network-title" className="network-section">
      <div className="section-heading">
        <h2 id="network-title">网络统计</h2>
        {stats && <span className="data-origin"><span className="live-dot" />
          {stats.source === "relayer" ? "中继聚合 · 链上状态" : "链上 RPC"}
        </span>}
      </div>
      {result.state !== "ready" && <DataNotice state={result.state} />}
      <dl className="metric-grid">
        {totals.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value === undefined ? "—" : number.format(value)}</dd></div>
        ))}
      </dl>
      <dl className="status-grid">
        {statuses.map((label, status) => (
          <div key={label}>
            <dt><span className={`status-dot status-${status}`} />{label}</dt>
            <dd>{stats ? number.format(stats.targets.filter((target) => target.status === status).length) : "—"}</dd>
          </div>
        ))}
      </dl>
      <p className="data-caption">登记人数统计参与 AgentShield 的 Agent ID 持有者。种子信号单独计数。</p>
    </section>
  );
}
