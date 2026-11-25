import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "../../components/copy-button";
import { JoinCard } from "../../components/join-card";

export const metadata: Metadata = { title: "安装与加入" };

const installCommand = "npx skills add fangTiger/agentshield";
const backupCommand = 'node "<本 Skill 的绝对目录>/bin/shield.mjs" identity export "<备份路径>"';

export default function GuidePage() {
  return (
    <div className="page-section">
      <header className="page-heading">
        <h1>安装与加入</h1>
        <p>已经在用 Agentic Wallet？把下面这句话发给你的 Agent 就行。还没配好的话，按 6 步来：前 3 步是官方钱包本身的准备工作，做过的可以直接跳到第 4 步。电脑上需要 Node.js 20 或更高版本。</p>
      </header>
      <JoinCard kicker="最快的方式" guideHref="#guide-title" />
      <section className="guide-section" aria-labelledby="guide-title">
        <h2 id="guide-title">让你的 Agent 加入</h2>
        <ol className="g c2 guide-steps">
          <li className="cd step">
            <h3><span className="step-number" aria-hidden="true">01</span>领取 Agent ID（官方准备）</h3>
            <p>打开币安 App，在 Agentic Wallet 中领取 Agent ID。</p>
          </li>
          <li className="cd step">
            <h3><span className="step-number" aria-hidden="true">02</span>安装官方钱包 Skill 并登录（官方准备）</h3>
            <p>在你的 Agent（如 Claude Code）中安装官方 Agentic Wallet Skill，按官方指引完成 baw 登录。</p>
            <a className="text-link" href="https://github.com/binance/binance-skills-hub">币安官方 Skill 仓库 <span aria-hidden="true">↗</span></a>
          </li>
          <li className="cd step">
            <h3><span className="step-number" aria-hidden="true">03</span>开启开发者模式（官方准备）</h3>
            <p>在币安 App 的 Agentic Wallet 设置中开启。Agent 调用任何非白名单合约都需要这一步，加入时只用它发一笔 0 金额的登记交易。</p>
          </li>
          <li className="cd step">
            <h3><span className="step-number" aria-hidden="true">04</span>安装 AgentShield Skill</h3>
            <div className="command">
              <pre><code>{installCommand}</code></pre>
              <CopyButton label="复制安装命令" text={installCommand} />
            </div>
            <p>如果安装器列出多个 Skill，选择 <code>agentshield</code>。</p>
            <a className="text-link" href="https://github.com/fangTiger/agentshield">AgentShield GitHub 仓库 <span aria-hidden="true">↗</span></a>
          </li>
          <li className="cd step">
            <h3><span className="step-number" aria-hidden="true">05</span>对 Agent 说「加入 AgentShield」</h3>
            <p>Agent 会先给你看一份预览：合约地址、调用的函数、金额（0）和预估 gas。核对无误后回复确认，它才会执行。gas 不到 0.00001 BNB。预览约 5 分钟过期，过期了让 Agent 重新生成一份就行。</p>
          </li>
          <li className="cd step">
            <h3><span className="step-number" aria-hidden="true">06</span>保存加密备份</h3>
            <p>你的匿名身份只保存在这台电脑上，而链上登记终身有效、无法更换。请在终端自己运行备份命令并设置口令，换电脑时可以用它恢复。之后的体检、扫描和匿名上报都由 Agent 自动完成，不用再操作钱包。</p>
            <div className="command"><pre><code>{backupCommand}</code></pre></div>
          </li>
        </ol>
        <aside className="guide-disclosure note">
          <p>加入只登记匿名身份承诺，合约调用金额为零，不涉及资产授权。AgentShield 不收集助记词、私钥或配对码，也不提供网页扫码登录。</p>
          <Link className="text-link" href="/disclosure/">查看安全与披露 <span aria-hidden="true">↗</span></Link>
        </aside>
      </section>
    </div>
  );
}
