import type { Metadata } from "next";
import { SignalCatalog } from "../../components/signals";

export const metadata: Metadata = { title: "信号库" };

export default function SignalsPage() {
  return (
    <div className="page-section">
      <header className="page-heading">
        <h1>信号库</h1>
        <p>浏览链上社区投票、种子情报与申诉。域名和地址以链上标识哈希显示。</p>
      </header>
      <SignalCatalog />
    </div>
  );
}
