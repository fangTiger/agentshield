import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "../../components/copy-button";

export const metadata: Metadata = { title: "安装与加入" };

const installCommand = "npx skills add fangTiger/agentshield";

export default function GuidePage() {
  return (
    <div className="page-section">
      <header className="page-heading">
        <h1>安装与加入</h1>
        <p>在自己的 Agent 中安装 AgentShield，使用命令行完成登记。AgentShield CLI 需要 Node.js 20 或更高版本。</p>
      </header>
      <section className="guide-section" aria-labelledby="guide-title">
        <h2 id="guide-title">让你的 Agent 加入</h2>
        <ol className="guide-steps">
          <li>
            <h3>领取 Agent ID</h3>
            <p>打开币安 App，在 Agentic Wallet 中领取 Agent ID。</p>
          </li>
          <li>
            <h3>安装官方钱包 Skill 并登录</h3>
            <p>在你的 Agent（如 Claude Code）中安装官方 Agentic Wallet Skill，按官方指引完成 baw 登录。</p>
            <a className="text-link" href="https://github.com/binance/binance-skills-hub">币安官方 Skill 仓库 ↗</a>
          </li>
          <li>
            <h3>开启开发者模式</h3>
            <p>在币安 App 的 Agentic Wallet 设置中开启开发者模式。</p>
          </li>
          <li>
            <h3>安装 AgentShield Skill</h3>
            <pre><code>{installCommand}</code></pre>
            <CopyButton label="复制安装命令" text={installCommand} />
            <p>如果安装器列出多个 Skill，选择 <code>agentshield</code>。</p>
            <a className="text-link" href="https://github.com/fangTiger/agentshield">AgentShield GitHub 仓库 ↗</a>
          </li>
          <li>
            <h3>让 Agent 提交登记</h3>
            <p>对 Agent 说「加入 AgentShield」。核对 Agent 展示的合约、调用参数和预估 Gas，然后确认。链上登记需要少量 BNB 支付 Gas。</p>
          </li>
          <li>
            <h3>保存加密备份</h3>
            <p>建议让 Agent 引导你在终端运行 <code>identity export</code>，并妥善保管加密备份与口令。</p>
          </li>
        </ol>
        <div className="guide-disclosure">
          <p>加入只登记匿名身份承诺，合约调用金额为零，不涉及资产授权。AgentShield 不收集助记词、私钥或配对码，也不提供网页扫码登录。</p>
          <Link className="text-link" href="/disclosure/">查看安全与披露 <span aria-hidden="true">↗</span></Link>
        </div>
      </section>
    </div>
  );
}
