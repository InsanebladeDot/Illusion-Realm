"use client";

// 阈值变动延迟 150ms 再处理；用输入对象匹配结果，取消或切换原图后不展示过期结果。
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/i18n";
import { createCannyProcessor } from "@/utils/canny-processor";
import type { CannyOptions } from "@/utils/canny-types";
import type { CannySource } from "./use-canny-preview";

interface ConversionInput extends CannyOptions { source: CannySource; attempt: number }
type ConversionResult = { input: ConversionInput; success: true; blob: Blob; url: string } | { input: ConversionInput; success: false };

export function useCannyConversion(source: CannySource | null, enabled: boolean, { lower, upper, inverted }: CannyOptions) {
  const { t } = useTranslation(), [processor] = useState(createCannyProcessor), [attempt, setAttempt] = useState(0);
  const input = useMemo(() => source && enabled ? { source, lower, upper, inverted, attempt } : null, [source, enabled, lower, upper, inverted, attempt]);
  const [finished, setFinished] = useState<ConversionResult | null>(null);
  useEffect(() => () => processor.dispose(), [processor]);
  useEffect(() => {
    if (!input) return;
    const controller = new AbortController(); let outputUrl: string | undefined;
    const timer = window.setTimeout(() => {
      void processor.process(input.source.file, input, controller.signal).then(blob => {
        if (controller.signal.aborted) return;
        outputUrl = URL.createObjectURL(blob); setFinished({ input, success: true, blob, url: outputUrl });
      }).catch(() => { if (!controller.signal.aborted) setFinished({ input, success: false }); });
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); if (outputUrl) URL.revokeObjectURL(outputUrl); };
  }, [input, processor]);
  const current = input && finished?.input === input ? finished : null;
  return { result: current?.success ? current : null, processing: Boolean(input && !current), processingError: current?.success === false ? t("create.canny.processingFailed") : "", retry: () => setAttempt(value => value + 1) };
}
