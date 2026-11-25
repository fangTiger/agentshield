import Link from "next/link";
import { CopyButton } from "./copy-button";

const joinPrompt = "请从 GitHub 安装 fangTiger/agentshield 这个 Skill，然后帮我加入 AgentShield。";

export function JoinCard({ kicker, guideHref }: { kicker: string; guideHref: string }) {
  return (
    <aside className="cd join-card" aria-label={kicker}>
      <p className="tg outline">{kicker}</p>
      <div className="command">
        <pre><code>{joinPrompt}</code></pre>
        <CopyButton label="复制指令" text={joinPrompt} />
      </div>
      <ul className="ls">
        <li>Agent 会先展示加入预览，你确认后才执行</li>
        <li>0 金额交易，约 13 万 gas，不涉及授权</li>
        <li>需要已领取 Agent ID、已登录官方 Agentic Wallet Skill 并开启开发者模式</li>
      </ul>
      <Link className="text-link" href={guideHref}>查看完整步骤 <span aria-hidden="true">→</span></Link>
    </aside>
  );
}
