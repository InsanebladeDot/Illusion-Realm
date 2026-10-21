"use client";

// 写操作共用防重入、错误和 Retry-After 冷却；组件卸载后忽略结果。
import { useEffect, useRef, useState } from "react";
import { cloudRetrySeconds } from "@/utils/cloud-image-ui";
export function useCloudMutation(onSuccess: () => void) {
  const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null), [cooldown, setCooldown] = useState(0);
  const pending = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000); return () => clearTimeout(timer); }, [cooldown]);
  async function run(operation: () => Promise<unknown>) {
    if (pending.current || cooldown) return;
    pending.current = true; setBusy(true); setError(null);
    try { await operation(); if (alive.current) onSuccess(); }
    catch (failure) { if (alive.current) { setError(failure); setCooldown(cloudRetrySeconds(failure)); } }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  return { run, busy, error, cooldown };
}
