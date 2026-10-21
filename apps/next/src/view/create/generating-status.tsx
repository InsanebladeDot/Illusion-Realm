"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n";

/** 界面：stage 中的生成状态；只更新文字，任务结束卸载时清理计时器。 */
export function GeneratingStatus() {
  const { t } = useTranslation();
  const [dots, setDots] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setDots(value => (value + 1) % 4), 420);
    return () => clearInterval(timer);
  }, []);
  return <div data-stage-generating className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm font-medium text-white">
    {/* 屏幕阅读器读固定状态；视觉省略号变化不反复播报。 */}
    <span role="status" className="sr-only">{t("create.page.generating", { dots: "" })}</span>
    <span aria-hidden="true" className="inline-block min-w-[7em] text-left">{t("create.page.generating", { dots: ".".repeat(dots) })}</span>
  </div>;
}
