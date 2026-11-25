"use client";

import { useEffect, useState } from "react";

type RequestState<T> =
  | { state: "undeployed" | "loading" | "error" }
  | { state: "ready"; data: T };

export function useRegistryRead<T>(
  load: (() => Promise<T>) | undefined,
  refreshMs?: number,
) {
  const [result, setResult] = useState<RequestState<T>>({ state: load ? "loading" : "undeployed" });

  useEffect(() => {
    if (!load) return;
    const read = load;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function refresh() {
      try {
        const data = await read();
        if (active) setResult({ state: "ready", data });
      } catch {
        if (active) setResult({ state: "error" });
      } finally {
        if (active && refreshMs) timer = setTimeout(() => void refresh(), refreshMs);
      }
    }

    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [load, refreshMs]);

  return result;
}

const notices = {
  undeployed: { title: "尚未部署", text: "信号库部署信息可用后，这里将显示链上数据。" },
  loading: { title: "正在读取链上数据", text: "首次读取历史记录可能需要一点时间。" },
  error: { title: "暂时无法读取链上数据", text: "请检查网络与 RPC 配置后刷新页面。" },
};

export function DataNotice({ state }: { state: keyof typeof notices }) {
  const { title, text } = notices[state];
  return (
    <div className="data-notice" role="status">
      <span className={`notice-mark ${state}`} aria-hidden="true" />
      <div><strong>{title}</strong><p>{text}</p></div>
    </div>
  );
}
