"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { mainnetSiteUrl, themeStorageKey } from "../lib/site-settings";

const links = [
  { href: "/", label: "概览" },
  { href: "/signals/", label: "信号库" },
  { href: "/guide/", label: "安装指南" },
  { href: "/disclosure/", label: "安全与披露" },
];

export function SiteHeader({ isTestnet }: { isTestnet: boolean }) {
  const pathname = usePathname();

  function toggleTheme() {
    const root = document.documentElement;
    const theme = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = theme;
    try {
      localStorage.setItem(themeStorageKey, theme);
    } catch {
      // 存储不可用时仍可切换当前页面的主题。
    }
  }

  return (
    <header className="site-header">
      {isTestnet && (
        <div className="network-banner">
          <p className="shell">这是测试网演示站，数据与主网无关。<span>主网：<a href={mainnetSiteUrl}>{mainnetSiteUrl}</a></span></p>
        </div>
      )}
      <div className="shell nav-shell">
        <Link className="wordmark" href="/">AgentShield</Link>
        <nav aria-label="主导航">
          {links.map(({ href, label }) => {
            const current = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return <Link key={href} href={href}
              aria-current={current ? "page" : undefined}>{label}</Link>;
          })}
        </nav>
        <div className="header-controls">
          <span className={`tg network-tag ${isTestnet ? "filled" : "outline"}`}>
            {isTestnet ? "测试网 · 演示数据" : "BSC 主网"}
          </span>
          <button type="button" className="theme-button" onClick={toggleTheme}>
            <span className="to-dark"><span className="sr-only">切换到</span>深色</span>
            <span className="to-light"><span className="sr-only">切换到</span>浅色</span>
          </button>
        </div>
      </div>
    </header>
  );
}

