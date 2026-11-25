import Link from "next/link";
import { JoinCard } from "../components/join-card";
import { NetworkStats } from "../components/network-stats";
import { SectionHeading } from "../components/section-heading";

export default function Home() {
  return (
    <>
      <section className="cover">
        <div className="g c2 cover-intro">
          <div>
            <p className="kick">风险信号观测台</p>
            <h1>让 Agent 在授权和<br />装 Skill 之前<em>先体检</em></h1>
            <p className="lead">AgentShield 为 Binance Agentic Wallet 用户提供授权体检、Skill 红线扫描和链上社区风险信号。</p>
            <div className="actions">
              <Link className="button primary" href="/guide/">让你的 Agent 加入 <span aria-hidden="true">↗</span></Link>
              <Link className="button secondary" href="/signals/">浏览信号库</Link>
            </div>
          </div>
          <JoinCard kicker="把这句话发给你的 Agent" guideHref="/guide/" />
        </div>
        <NetworkStats />
      </section>

      <section className="numbered-section">
        <SectionHeading number="01" kicker="钱包授权" title="授权体检" subtitle="在确认钱包授权前核对对象和风险。" />
        <div className="g c2">
          <article className="cd ac l2">
            <h3>核对域名与地址</h3>
            <p>检查请求涉及的域名或地址，并核对已有的社区信号与公开情报。</p>
          </article>
          <article className="cd">
            <h3>确认仍在 App 内完成</h3>
            <p>不拦截 App 内流程。扫码、配对和确认由用户在 App 内完成。</p>
          </article>
        </div>
      </section>

      <section className="numbered-section">
        <SectionHeading number="02" kicker="安装前核对" title="Skill 红线扫描" subtitle="安装前检查 Skill 内容与已公开的风险信号。" />
        <div className="g c2">
          <article className="cd ac l1">
            <h3>检查 Skill 内容</h3>
            <p>扫描公开 Skill，核对权限披露等安全红线。</p>
          </article>
          <article className="cd">
            <h3>查看命中的证据</h3>
            <p>信号库按内容哈希记录 Skill 的社区票数、种子来源与申诉。</p>
          </article>
        </div>
      </section>

      <section className="numbered-section">
        <SectionHeading number="03" kicker="社区证据" title="链上社区信号" subtitle="域名、地址和 Skill 的投票证据、种子情报与申诉均可查阅。" />
        <div className="g c2">
          <article className="cd ac l4">
            <h3>匿名投票</h3>
            <p>持有 Agent ID 的参与者可选择匿名投票。观测台展示交易链接和证据。</p>
          </article>
          <article className="cd">
            <h3>门槛 N 与冷静期 T</h3>
            <p>社区确认要求危险票达到 N、至少为误报票的两倍，且首张危险票已满 T。种子信号单独计数。</p>
          </article>
        </div>
      </section>
    </>
  );
}
