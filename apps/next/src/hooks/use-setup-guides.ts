"use client";

/** 只在清单打开时读取随包 Markdown，换语言或关闭时取消旧请求。 */
import { useEffect, useState } from "react";
import { SETUP_GUIDES } from "@/data/setup-checklist";
import { parseSetupGuide, type SetupGuideDocument } from "@/utils/setup-guide-markdown";
import type { Locale } from "@/i18n";

interface GuideResult { key: string; guides: SetupGuideDocument[]; failed: boolean }

export function useSetupGuides(locale: Locale) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<GuideResult | null>(null);
  const key = `${locale}/${attempt}`;
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]);
    const reads = SETUP_GUIDES.map(async guide => {
      const response = await fetch(`/guides/model-setup/${locale}/${guide.file}`, { signal });
      if (!response.ok) throw new Error("setup-guide-read-failed");
      return parseSetupGuide(guide.id, await response.text());
    });
    Promise.all(reads).then(guides => {
      if (!signal.aborted) setResult({ key, guides, failed: false });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ key, guides: [], failed: true });
    });
    return () => controller.abort();
  }, [locale, key]);
  // 旧语言的响应不能暂时冒充新语言；重试时也先展示读取状态。
  const current = result?.key === key ? result : null;
  return { guides: current?.guides ?? [], loading: !current, failed: current?.failed ?? false, retry: () => setAttempt(value => value + 1) };
}
