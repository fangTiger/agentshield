import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteHeader } from "../components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AgentShield · 风险信号观测台", template: "%s · AgentShield" },
  description: "为 Binance Agentic Wallet 用户设计的授权体检、Skill 红线扫描与社区风险信号工具。",
};

const themeScript = 'try { if (localStorage.getItem("agentshield.theme") === "light") document.documentElement.dataset.theme = "light"; } catch {}';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <a className="skip-link" href="#main">跳至内容</a>
        <SiteHeader />
        <main id="main" className="shell">{children}</main>
        <footer className="site-footer shell">
          <span className="footer-brand">AgentShield</span>
          <span>独立社区项目 · BNB Smart Chain</span>
        </footer>
      </body>
    </html>
  );
}
