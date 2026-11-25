import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DataNotice } from "../../../components/data-state";
import { SignalDetail } from "../../../components/signals";
import { deployment, relayerUrl } from "../../../lib/config";

export const metadata: Metadata = { title: "信号详情" };

export default function SignalPage() {
  return (
    <div className="page-section">
      <header className="page-heading">
        <Link className="text-link" href="/signals/"><span aria-hidden="true">← </span>返回信号库</Link>
        <h1>信号详情</h1>
      </header>
      {deployment || relayerUrl ? <Suspense fallback={<DataNotice state="loading" />}><SignalDetail /></Suspense>
        : <DataNotice state="undeployed" />}
    </div>
  );
}
