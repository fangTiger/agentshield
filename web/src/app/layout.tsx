import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteHeader } from "../components/site-header";
import { chain } from "../lib/config";
import { themeStorageKey } from "../lib/site-settings";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AgentShield · 风险信号观测台", template: "%s · AgentShield" },
  description: "为 Binance Agentic Wallet 用户设计的授权体检、Skill 红线扫描与社区风险信号工具。",
};

const themeScript = `(() => {
  let saved;
  try { saved = localStorage.getItem(${JSON.stringify(themeStorageKey)}); } catch {}
  document.documentElement.dataset.theme = saved === "light" || saved === "dark"
    ? saved
    : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" data-theme="light" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <a className="skip-link" href="#main">跳至内容</a>
        <SiteHeader isTestnet={chain.id === 97} />
        <main id="main" className="shell">{children}</main>
        <footer className="site-footer shell">
          <span className="footer-brand">AgentShield</span>
          <span>独立社区项目 · BNB Smart Chain</span>
        </footer>
      </body>
    </html>
  );
}
