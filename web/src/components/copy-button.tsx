"use client";

import { useState } from "react";

export function CopyButton({ label, text }: { label: string; text: string }) {
  const [result, setResult] = useState<{ copied: true } | { copied: false; value: string }>();

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setResult({ copied: true });
    } catch {
      setResult({ copied: false, value: text });
    }
  }

  return (
    <div className="copy-control">
      <button className="button secondary" type="button" onClick={copy}>{label}</button>
      {result && (result.copied
        ? <p role="status">已复制。</p>
        : <>
          <p role="status">剪贴板不可用，请长按下方文本复制。</p>
          <textarea aria-label={label} readOnly value={result.value} rows={2}
            onFocus={(event) => event.currentTarget.select()} />
        </>)}
    </div>
  );
}
