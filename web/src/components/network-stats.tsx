"use client";

import { readDashboard } from "../lib/dashboard";
import { browserRpc, deployment, relayerUrl } from "../lib/config";
import { classifySignal, statusDisplay } from "../lib/status-display";
import { DataNotice, useRegistryRead } from "./data-state";

function loadOverview() {
  return readDashboard(browserRpc, deployment, relayerUrl, "overview");
}

const number = new Intl.NumberFormat("zh-CN");

export function NetworkStats() {
  const result = useRegistryRead(deployment || relayerUrl ? loadOverview : undefined, 60_000);
  const stats = result.state === "ready" ? result.data : undefined;
  const counts = { clear: 0, pending: 0, confirmed: 0, disputed: 0, seed: 0 };
  for (const target of stats?.targets ?? []) counts[classifySignal(target)]++;
  const totals = [
    { label: "已登记真人数", value: stats?.joinedCount },
    { label: "风险对象数", value: stats?.targets.length },
    { label: `${statusDisplay.confirmed.label}数`, value: stats && counts.confirmed, tone: statusDisplay.confirmed.tone },
    { label: "24 小时新增票数", value: stats?.votesLast24h },
  ] as const;

  return (
    <section aria-labelledby="network-title" className="network-section">
      <div className="network-heading">
        <h2 id="network-title" className="kick">网络统计</h2>
        {stats && <span className="tg outline">{stats.source === "relayer" ? "中继聚合 · 链上状态" : "链上 RPC"}</span>}
      </div>
      {result.state !== "ready" && <DataNotice state={result.state} />}
      <dl className="kp">
        {totals.map(({ label, value, ...metric }) => (
          <div key={label} className={"tone" in metric ? metric.tone : undefined}>
            <dt>{label}</dt><dd>{value === undefined ? "—" : number.format(value)}</dd>
          </div>
        ))}
      </dl>
      <dl className="status-totals">
        {(["pending", "disputed", "seed", "clear"] as const).map((key) => {
          const { label, tone } = statusDisplay[key];
          return <div key={key}><dt className={`ly ${tone}`}>{label}</dt><dd>{stats ? number.format(counts[key]) : "—"}</dd></div>;
        })}
      </dl>
      <p className="note">登记人数统计参与 AgentShield 的 Agent ID 持有者。种子信号单独计数。</p>
    </section>
  );
}
