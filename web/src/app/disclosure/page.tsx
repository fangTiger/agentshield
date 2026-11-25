import type { Metadata } from "next";
import { DeploymentDetails } from "../../components/deployment-details";

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
      <div className="documentation">
        <section>
          <h2>合约地址与链上参数</h2>
          <DeploymentDetails />
          <p>社区确认要求危险票达到 N，至少为误报票的两倍，且首张危险票已满冷静期 T。误报票达到 N 且不少于危险票时，对象进入有争议状态。N 和 T 在部署时固定。</p>
        </section>
        <section>
          <h2>种子地址的权限</h2>
          <p><code>seeder</code> 是信号库唯一特权角色，只能通过 <code>seedBatch</code> 增加种子信号并记录来源，或通过 <code>renounceSeeder</code> 永久放弃权限。社区票数独立统计。信号库不可升级，拒收资产。任何人都可以提交申诉，申诉只添加记录。</p>
        </section>
        <section>
          <h2>数据源与许可证</h2>
          <ul className="license-list">
            {sources.map(([name, license, usage, url]) => (
              <li key={name}>
                <a className="text-link" href={url} target="_blank" rel="noreferrer">{name} <span aria-hidden="true">↗</span></a>
                <span className="license">{license}</span>
                <p>{usage}</p>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2>风险与隐私</h2>
          <ul className="risk-list">
            <li>社区投票和种子情报可能存在误报、遗漏或延迟。请结合证据独立判断。</li>
            <li>AgentShield 提供授权体检和 Skill 扫描，不拦截 App 内流程。扫码与确认仍由用户在官方 App 内完成。</li>
            <li>公开投票可在区块浏览器查到发送者。观测台只展示对应交易链接和证据。匿名投票的时间和网络元数据仍可能被用于关联。</li>
            <li>AgentShield 由独立社区团队维护，为 Binance Agentic Wallet 用户设计。</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
