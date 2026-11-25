"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Hex } from "viem";
import { browserRpc, deployment, explorer, relayerUrl } from "../lib/config";
import { readDashboard, readTarget } from "../lib/dashboard";
import { formatTime, sourceLabel, statuses, targetIdentifiers, targetTypes } from "../lib/labels";
import { DataNotice, useRegistryRead } from "./data-state";

function loadCatalog() {
  return readDashboard(browserRpc, deployment, relayerUrl, "catalog");
}

function TxLink({ hash }: { hash: Hex }) {
  return <a className="tx-link mono" href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer">
    {hash.slice(0, 12)}…{hash.slice(-6)} <span aria-hidden="true">↗</span>
    <span className="sr-only">（在 BscScan 查看交易）</span>
  </a>;
}

function StatusPill({ status }: { status: number }) {
  return <span className={`status-pill status-${status}`}><span className="status-dot" />{statuses[status]}</span>;
}

function AppealList({ appeals }: { appeals: { evidenceURI: string; transactionHash: Hex }[] }) {
  return <ul className="record-list">
    {appeals.map(({ evidenceURI, transactionHash }, index) => (
      <li key={`${transactionHash}:${index}`}><span className="mono break-anywhere">{evidenceURI || "未填写证据 URI"}</span><TxLink hash={transactionHash} /></li>
    ))}
  </ul>;
}

export function SignalCatalog() {
  const result = useRegistryRead(deployment || relayerUrl ? loadCatalog : undefined);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const targets = result.state === "ready" ? result.data.targets : [];
  const filtered = targets.filter((target) =>
    (type === "" || target.targetType === Number(type)) && (status === "" || target.status === Number(status)));

  return (
    <section aria-label="风险对象">
      <div className="filters">
        <label>对象类型
          <select value={type} onChange={(event) => setType(event.target.value)}>
            <option value="">全部类型</option>
            {targetTypes.map((label, index) => <option key={label} value={index}>{label}</option>)}
          </select>
        </label>
        <label>社区状态
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">全部状态</option>
            {statuses.map((label, index) => <option key={label} value={index}>{label}</option>)}
          </select>
        </label>
        {result.state === "ready" && <span className="match-count" role="status">{filtered.length} / {targets.length} 个对象</span>}
      </div>
      {result.state !== "ready" ? <DataNotice state={result.state} /> : filtered.length === 0 ? (
        <p className="empty-state">{targets.length ? "没有符合筛选条件的对象。" : "链上暂无风险对象。"}</p>
      ) : (
        <ul className="signal-list">
          {filtered.map((signal) => {
            const { targetType, id, firstVoteAt, dangerVotes, falsePositiveVotes, status, seedCount, sources, appealCount } = signal;
            return (
              <li key={`${targetType}:${id}`} className="signal-row">
                <div className="signal-main">
                  <span className="type-label">{targetTypes[targetType]}</span>
                  <Link className="signal-link" href={`/signals/detail/?type=${targetType}&id=${id}`}>
                    <code title={id}>{id}</code><span aria-hidden="true">↗</span>
                  </Link>
                  <StatusPill status={status} />
                </div>
                <dl className="signal-counts">
                  <div><dt>危险票</dt><dd>{dangerVotes}</dd></div>
                  <div><dt>误报票</dt><dd>{falsePositiveVotes}</dd></div>
                  <div><dt>种子信号</dt><dd>{seedCount}</dd></div>
                  <div><dt>首票时间</dt><dd>{formatTime(firstVoteAt)}</dd></div>
                </dl>
                {sources.length > 0 && (
                  <p className="source-list"><span>种子来源</span>{sources.map((source) => <code key={source}>{sourceLabel(source)}</code>)}</p>
                )}
                {appealCount > 0 ? (
                  <details className="appeal-preview"><summary>申诉记录（{appealCount}）</summary><AppealList appeals={signal.appeals} /></details>
                ) : <p className="muted signal-note">暂无申诉记录</p>}
              </li>
            );
          })}
        </ul>
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
    <>
      <section className="detail-summary" aria-label="信号概况">
        <div className="detail-heading"><span className="type-label">{targetTypes[targetType]}</span><StatusPill status={signal.status} /></div>
        <p className="muted identifier-label">{targetIdentifiers[targetType]}</p>
        <p className="mono break-anywhere detail-id">{id}</p>
        <dl className="signal-counts">
          <div><dt>危险票</dt><dd>{signal.dangerVotes}</dd></div>
          <div><dt>误报票</dt><dd>{signal.falsePositiveVotes}</dd></div>
          <div><dt>种子信号</dt><dd>{signal.seedCount}</dd></div>
          <div><dt>{firstVoteAt === undefined ? "首张危险票时间" : "首票时间"}</dt>
            <dd>{voteTime}</dd></div>
        </dl>
      </section>
      <section className="record-panel">
        <h2>投票证据</h2>
        {signal.votes.length ? <ul className="record-list">
          {signal.votes.map(({ voteType, evidenceHash, transactionHash }, index) => (
            <li key={`${transactionHash}:${index}`}>
              <span className="record-label">{voteType === 0 ? "危险票" : "误报票"}</span>
              <code className="break-anywhere">{evidenceHash}</code>
              <TxLink hash={transactionHash} />
            </li>
          ))}
        </ul> : <p className="muted">暂无社区投票证据。</p>}
      </section>
      <section className="record-panel">
        <h2>种子信号来源</h2>
        {signal.seeds.length ? <ul className="record-list">
          {signal.seeds.map(({ sourceId, transactionHash }, index) => (
            <li key={`${transactionHash}:${index}`}><span className="break-anywhere">{sourceLabel(sourceId)}</span><TxLink hash={transactionHash} /></li>
          ))}
        </ul> : <p className="muted">暂无种子信号。</p>}
      </section>
      <section className="record-panel">
        <h2>申诉记录 <span className="muted">（{signal.appealCount}）</span></h2>
        {signal.appeals.length ? <AppealList appeals={signal.appeals} /> : <p className="muted">暂无申诉记录。</p>}
      </section>
    </>
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
