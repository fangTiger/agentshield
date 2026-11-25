import Link from "next/link";
import { NetworkStats } from "../components/network-stats";

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero-content">
          <p className="eyebrow"><span className="eyebrow-mark" />风险信号观测台</p>
          <h1>核对授权<br />再装 Skill<span>。</span></h1>
          <p className="hero-summary">AgentShield 为 Binance Agentic Wallet 用户提供授权体检、Skill 红线扫描和链上社区风险信号。</p>
          <p className="boundary">不拦截 App 内流程。扫码、配对和确认由用户在 App 内完成。</p>
          <div className="actions">
            <Link className="button primary" href="/guide/">让你的 Agent 加入 <span aria-hidden="true">↗</span></Link>
            <Link className="button secondary" href="/signals/">浏览信号库</Link>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <span className="radar-axis" /><span className="radar-ring outer" /><span className="radar-ring middle" />
          <span className="radar-ring inner" /><span className="radar-core"><span className="brand-mark"><span /></span></span>
          <span className="radar-point first" /><span className="radar-point second" />
        </div>
      </section>
      <NetworkStats />
    </>
  );
}
