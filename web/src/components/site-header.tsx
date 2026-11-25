"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

const links = [
  { href: "/", label: "概览" },
  { href: "/signals/", label: "信号库" },
  { href: "/guide/", label: "安装指南" },
  { href: "/disclosure/", label: "安全与披露" },
];

const themeEvent = "agentshield-theme";
const themeKey = "agentshield.theme";

function subscribe(listener: () => void) {
  window.addEventListener(themeEvent, listener);
  return () => window.removeEventListener(themeEvent, listener);
}

function readTheme() {
  return document.documentElement.dataset.theme === "light";
}

export function SiteHeader() {
  const pathname = usePathname();
  const isLight = useSyncExternalStore(subscribe, readTheme, () => false);

  function toggleTheme() {
    const theme = isLight ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(themeKey, theme);
    window.dispatchEvent(new Event(themeEvent));
  }

  return (
    <header className="site-header">
      <div className="shell nav-shell">
        <Link className="wordmark" href="/">
          <span className="brand-mark" aria-hidden="true"><span /></span>AgentShield
        </Link>
        <nav aria-label="主导航">
          {links.map(({ href, label }) => {
            const current = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return <Link key={href} href={href}
              aria-current={current ? "page" : undefined}>{label}</Link>;
          })}
        </nav>
        <button type="button" className="theme-button" onClick={toggleTheme}>
          <span aria-hidden="true">{isLight ? "◐" : "☼"}</span>
          {isLight ? "深色" : "浅色"}
        </button>
      </div>
    </header>
  );
}

