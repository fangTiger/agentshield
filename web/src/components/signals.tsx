"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Hex } from "viem";
import { browserRpc, deployment, explorer, relayerUrl } from "../lib/config";
import { readDashboard, readTarget } from "../lib/dashboard";
import { formatTime, sourceLabel, statuses, targetIdentifiers, targetTypes } from "../lib/labels";
import { classifySignal, statusDisplay } from "../lib/status-display";
import { DataNotice, useRegistryRead } from "./data-state";

function loadCatalog() {
  return readDashboard(browserRpc, deployment, relayerUrl, "catalog");
}

function TxLink({ hash }: { hash: Hex }) {
  return <a className="tx-link mono" href={`${explorer}/tx/${hash}`} title={hash}
    aria-label={`在 BscScan 查看交易 ${hash}`} target="_blank" rel="noreferrer">
    {hash.slice(0, 12)}…{hash.slice(-6)} <span aria-hidden="true">↗</span>
  </a>;
}

function StatusBadge({ signal }: { signal: { status: number; seedCount: number } }) {
  const { label, tone } = statusDisplay[classifySignal(signal)];
  return <span className={`ly ${tone}`}>{label}</span>;
}

function SeedSource({ id }: { id: Hex }) {
  const label = sourceLabel(id);
  return label === id ? <code className="id-text" title={id}>{id}</code> : <span className="source-name">{label}</span>;
}

function AppealTable({ appeals }: { appeals: { evidenceURI: string; transactionHash: Hex }[] }) {
  return <div className="tw" role="region" aria-label="申诉证据" tabIndex={0}>
    <table className="tb record-table">
      <thead><tr><th scope="col">证据 URI</th><th scope="col">交易</th></tr></thead>
      <tbody>
        {appeals.map(({ evidenceURI, transactionHash }, index) => (
          <tr key={`${transactionHash}:${index}`}>
            <td className="mono break-anywhere">{evidenceURI || "未填写证据 URI"}</td>
            <td><TxLink hash={transactionHash} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>;
}

function FilterGroup({ label, all, options, value, onChange }: {
  label: string;
  all: string;
  options: readonly string[];
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="filter-group">
      <span className="filter-label">{label}</span>
      <div className="seg" role="group" aria-label={label}>
        <button type="button" aria-pressed={value === null} onClick={() => onChange(null)}>{all}</button>
        {options.map((option, index) => (
          <button type="button" key={option} aria-pressed={value === index} onClick={() => onChange(index)}>{option}</button>
        ))}
      </div>
    </div>
  );
}

export function SignalCatalog() {
  const result = useRegistryRead(deployment || relayerUrl ? loadCatalog : undefined);
  const [type, setType] = useState<number | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const targets = result.state === "ready" ? result.data.targets : [];
  const filtered = targets.filter((target) =>
    (type === null || target.targetType === type) && (status === null || target.status === status));

  return (
    <section aria-label="风险对象">
      <div className="filters">
        <FilterGroup label="对象类型" all="全部类型" options={targetTypes} value={type} onChange={setType} />
        <FilterGroup label="社区状态" all="全部状态" options={statuses} value={status} onChange={setStatus} />
      </div>
      {result.state === "ready" && <p className="match-count" role="status">
        {filtered.length} / {targets.length} 个对象{status === 0 && " · 包含种子情报和无风险信号的对象"}
      </p>}
      {result.state !== "ready" ? <DataNotice state={result.state} /> : filtered.length === 0 ? (
        <p className="empty-state">{targets.length ? "没有符合筛选条件的对象。" : "链上暂无风险对象。"}</p>
      ) : (
        <div className="tw" role="region" aria-label="风险对象表" tabIndex={0}>
          <table className="tb catalog-table">
            <thead><tr>
              <th scope="col">风险对象</th><th scope="col">状态</th><th scope="col">危险票</th>
              <th scope="col">误报票</th><th scope="col">种子信号</th><th scope="col">种子来源</th>
              <th scope="col">首票时间</th><th scope="col">申诉</th>
            </tr></thead>
            <tbody>
              {filtered.map((signal) => {
                const { targetType, id, firstVoteAt, dangerVotes, falsePositiveVotes, seedCount, sources, appealCount } = signal;
                const href = `/signals/detail/?type=${targetType}&id=${id}`;
                return (
                  <tr key={`${targetType}:${id}`}>
                    <th scope="row">
                      <span className="object-type">{targetTypes[targetType]}</span>
                      <Link className="signal-link" href={href} prefetch={false}>
                        <code className="id-text" title={id}>{id}</code>
                        <span aria-hidden="true">↗</span>
                      </Link>
                    </th>
                    <td><StatusBadge signal={signal} /></td>
                    <td className="din">{dangerVotes}</td>
                    <td className="din">{falsePositiveVotes}</td>
                    <td className="din">{seedCount}</td>
                    <td>{sources.length ? sources.map((source) => <SeedSource id={source} key={source} />)
                      : <span className="muted">—</span>}</td>
                    <td className="table-time">{formatTime(firstVoteAt)}</td>
                    <td>{appealCount > 0 ? (
                      <details className="appeal-preview">
                        <summary>申诉记录（{appealCount}）</summary>
                        <ul className="ls">
                          {signal.appeals.map(({ evidenceURI, transactionHash }, index) => (
                            <li key={`${transactionHash}:${index}`}>
                              <span className="mono break-anywhere">{evidenceURI || "未填写证据 URI"}</span><br />
                              <TxLink hash={transactionHash} />
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : <span className="muted">暂无申诉记录</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TargetRecords({ targetType, id }: { targetType: number; id: Hex }) {
  const load = useCallback(() => readTarget(browserRpc, deployment, { targetType, id }, relayerUrl), [targetType, id]);
  const result = useRegistryRead(load);

  if (result.state !== "ready") return <DataNotice state={result.state} />;
  const signal = result.data;
  if (!signal) return <p className="empty-state">链上未找到这个对象的信号记录。</p>;
  const firstVoteAt = "firstVoteAt" in signal ? signal.firstVoteAt : undefined;
  const voteTime = firstVoteAt === undefined && signal.firstDangerAt === 0
    ? "暂无危险票"
    : formatTime(firstVoteAt ?? signal.firstDangerAt);

  return (
    <div className="g detail-records">
      <section className="cd detail-summary" aria-label="信号概况">
        <div className="detail-heading"><span className="tg outline">{targetTypes[targetType]}</span><StatusBadge signal={signal} /></div>
        <p className="note">{targetIdentifiers[targetType]}</p>
        <code className="detail-id id-text" title={id}>{id}</code>
        <dl className="kp detail-kp">
          <div><dt>危险票</dt><dd>{signal.dangerVotes}</dd></div>
          <div><dt>误报票</dt><dd>{signal.falsePositiveVotes}</dd></div>
          <div><dt>种子信号</dt><dd>{signal.seedCount}</dd></div>
          <div><dt>{firstVoteAt === undefined ? "首张危险票时间" : "首票时间"}</dt><dd className="vote-time">{voteTime}</dd></div>
        </dl>
      </section>
      <section className="cd record-panel">
        <h2>投票证据</h2>
        {signal.votes.length ? <div className="tw" role="region" aria-label="投票证据表" tabIndex={0}>
          <table className="tb record-table">
            <thead><tr><th scope="col">票型</th><th scope="col">证据哈希</th><th scope="col">交易</th></tr></thead>
            <tbody>
              {signal.votes.map(({ voteType, evidenceHash, transactionHash }, index) => (
                <tr key={`${transactionHash}:${index}`}>
                  <td>{voteType === 0 ? "危险票" : "误报票"}</td>
                  <td><code className="id-text" title={evidenceHash}>{evidenceHash}</code></td>
                  <td><TxLink hash={transactionHash} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div> : <p>暂无社区投票证据。</p>}
      </section>
      <div className="g c2">
        <section className="cd record-panel">
          <h2>种子信号来源</h2>
          {signal.seeds.length ? <div className="tw" role="region" aria-label="种子信号来源表" tabIndex={0}>
            <table className="tb record-table">
              <thead><tr><th scope="col">来源</th><th scope="col">交易</th></tr></thead>
              <tbody>
                {signal.seeds.map(({ sourceId, transactionHash }, index) => (
                  <tr key={`${transactionHash}:${index}`}>
                    <td><SeedSource id={sourceId} /></td>
                    <td><TxLink hash={transactionHash} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div> : <p>暂无种子信号。</p>}
        </section>
        <section className="cd record-panel">
          <h2>申诉记录 <span className="muted">（{signal.appealCount}）</span></h2>
          {signal.appeals.length ? <AppealTable appeals={signal.appeals} /> : <p>暂无申诉记录。</p>}
        </section>
      </div>
    </div>
  );
}

export function SignalDetail() {
  const params = useSearchParams();
  const type = params.get("type");
  const id = params.get("id");
  if (!type || !/^[012]$/.test(type) || !id || !/^0x[\da-f]{64}$/i.test(id)) {
    return <p className="empty-state">详情链接无效，请从信号库选择一个对象。</p>;
  }
  return <TargetRecords key={`${type}:${id}`} targetType={Number(type)} id={id as Hex} />;
}
