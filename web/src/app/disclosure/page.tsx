import type { Metadata } from "next";
import { DeploymentDetails } from "../../components/deployment-details";
import { SectionHeading } from "../../components/section-heading";

export const metadata: Metadata = { title: "安全与披露" };

const sources = [
  ["ScamSniffer", "GPL-3.0", "运行时拉取域名和地址名单，在本机使用。", "https://github.com/scamsniffer/scam-database/blob/main/LICENSE"],
  ["MetaMask eth-phishing-detect", "DBAD v1.2", "运行时拉取钓鱼情报，在本机使用。", "https://github.com/MetaMask/eth-phishing-detect/blob/main/LICENSE"],
  ["GoPlus Security API", "按 API 服务条款使用", "查询钓鱼网站和 BSC 地址风险。", "https://docs.gopluslabs.io/reference/api-overview"],
  ["ClawHub", "MIT（注册表）", "扫描公开 Skill，各 Skill 按自身许可证使用。", "https://github.com/openclaw/clawhub"],
  ["Semaphore v4", "MIT", "验证成员身份及零知识投票证明。", "https://github.com/semaphore-protocol/semaphore/blob/main/LICENSE"],
] as const;

export default function DisclosurePage() {
  return (
    <div className="page-section">
      <header className="page-heading">
        <h1>安全与披露</h1>
        <p>查看合约源码、种子权限、数据出处和社区信号的使用边界。</p>
      </header>
      <DeploymentDetails />
      <section className="numbered-section">
        <SectionHeading number="04" kicker="链上开销" title="主网 gas 实测" subtitle={<>BSC 主网 gas 价格为 <span className="din">0.05</span> gwei 时的实测值。</>} />
        <div className="g c3">
          <article className="cd">
            <h3>持有者加入 <code>join</code></h3>
            <p><strong className="gas-value">130,399</strong> gas</p>
            <p>约 0.0000065 BNB，由持有者支付一次。</p>
          </article>
          <article className="cd">
            <h3>匿名投票</h3>
            <p><strong className="gas-value">342,181</strong> gas</p>
            <p>由中继代付。</p>
          </article>
          <article className="cd">
            <h3>种子写入</h3>
            <p>每 50 条约 <strong className="gas-value">133 万</strong> gas</p>
            <p>由种子账户支付。</p>
          </article>
        </div>
      </section>
      <section className="numbered-section">
        <SectionHeading number="05" kicker="外部依赖" title="数据源与许可证" />
        <div className="tw" role="region" aria-label="数据源与许可证表" tabIndex={0}>
          <table className="tb license-table">
            <thead><tr><th scope="col">来源</th><th scope="col">许可证或条款</th><th scope="col">用途</th></tr></thead>
            <tbody>
              {sources.map(([name, license, usage, url]) => (
                <tr key={name}>
                  <th scope="row"><a href={url} target="_blank" rel="noreferrer">{name} <span aria-hidden="true">↗</span></a></th>
                  <td><span className="tg dashed">{license}</span></td>
                  <td>{usage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="numbered-section">
        <SectionHeading number="06" kicker="使用边界" title="风险与隐私" />
        <div className="cd">
          <ul className="ls">
            <li>社区投票和种子情报可能存在误报、遗漏或延迟。请结合证据独立判断。</li>
            <li>AgentShield 提供授权体检和 Skill 扫描，不拦截 App 内流程。扫码与确认仍由用户在官方 App 内完成。</li>
            <li>公开投票可在区块浏览器查到发送者。观测台只展示对应交易链接和证据。匿名投票的时间和网络元数据仍可能被用于关联。</li>
            <li>AgentShield 由独立社区团队维护，为 Binance Agentic Wallet 用户设计。</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
