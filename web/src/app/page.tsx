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
            <p className="kick">给 Agentic Wallet 用户的防骗 Skill</p>
            <h1>扫码、装 Skill 前，<br />让 Agent <em>先查一遍</em></h1>
            <p className="lead">现在的骗局不再直接要你的私钥，而是骗你扫一个码、输一个配对码，或者装一个会偷偷转账的 Skill。AgentShield 装在你的 Agent 里，遇到这些时刻会先检查，有问题直接告诉你。</p>
            <div className="actions">
              <Link className="button primary" href="/guide/">让你的 Agent 加入 <span aria-hidden="true">↗</span></Link>
              <Link className="button secondary" href="/signals/">看看大家标记了什么</Link>
            </div>
          </div>
          <JoinCard kicker="把这句话发给你的 Agent" guideHref="/guide/" />
        </div>
        <NetworkStats />
      </section>

      <section className="numbered-section">
        <SectionHeading
          number="01"
          kicker="场景一 · 有人让你扫码或输入配对码"
          title="授权之前，先弄清是谁在要权限"
          subtitle="把链接、二维码截图或聊天记录交给 Agent，它会告诉你这个域名是不是仿冒的、这套说辞是不是常见骗局。"
        />
        <div className="g c3">
          <article className="cd ac l5">
            <h3>拆穿仿冒域名</h3>
            <p>像 binance-wallet-login.com 这种看着像官方的域名，还有同形字、多层子域名、短链跳转，都会拆开逐一核对。</p>
          </article>
          <article className="cd">
            <h3>识破诱导话术</h3>
            <p>「输入配对码领空投」「扫码完成验证」会被直接标出。配对码只应在你自己发起登录时，在官方 App 里核对。</p>
          </article>
          <article className="cd">
            <h3>最后一步仍由你决定</h3>
            <p>结论分为高风险、可疑、未发现风险，并列出证据。AgentShield 不拦截 App 内流程，扫码、配对和确认始终由你在 App 里自己完成。</p>
          </article>
        </div>
      </section>

      <section className="numbered-section">
        <SectionHeading
          number="02"
          kicker="场景二 · 你准备装一个第三方 Skill"
          title="装之前，先查它会不会背着你动钱"
          subtitle="Skill 一旦装上，就拥有你的 Agent 的全部权限。AgentShield 在安装前先扫一遍，命中红线就停下来问你。"
        />
        <div className="g c3">
          <article className="cd ac l4">
            <h3>6 条红线</h3>
            <p>网页扫码登录钱包、绕过你的确认、偷偷转账或索要无限授权、隐瞒合约特权、冒充币安官方、索要助记词或私钥。</p>
          </article>
          <article className="cd">
            <h3>指给你看原文</h3>
            <p>命中时列出文件、行号和原文，你自己就能判断真假，而不是只给一个看不懂的分数。</p>
          </article>
          <article className="cd">
            <h3>安装时自动触发</h3>
            <p>在 Claude Code 里可以装一个钩子，以后每次执行 skills add 都会先扫描，不用记着手动去查。</p>
          </article>
        </div>
      </section>

      <section className="numbered-section">
        <SectionHeading
          number="03"
          kicker="场景三 · 别人已经踩过的坑"
          title="一个人发现，所有人的 Agent 都会提醒"
          subtitle="持有 Agent ID 的真人可以匿名标记钓鱼域名、恶意地址和 Skill。标记记录在 BSC 链上，任何人都改不了。"
        />
        <div className="g c3">
          <article className="cd ac l2">
            <h3>一人一票，匿名</h3>
            <p>每个 Agent ID 只能登记一次。投票用零知识证明提交，链上看不出是谁投的。</p>
          </article>
          <article className="cd">
            <h3>不轻易冤枉人</h3>
            <p>至少 3 位真人标记，并过了 24 小时冷静期，才会显示「社区确认」。标错了可以投误报票或申诉。</p>
          </article>
          <article className="cd">
            <h3>开局就有情报</h3>
            <p>已收录 1,500 多个来自 MetaMask、ScamSniffer 等公开名单的仿冒域名，每条都注明来源。</p>
          </article>
        </div>
      </section>
    </>
  );
}
