"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@/i18n";
import { ThemeToggle } from "@/components/theme-toggle";

export function ToolPageFrame({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return <div className="flex h-full min-h-0 min-w-0 flex-col p-3 text-foreground sm:p-5 lg:p-6">
    {/* 界面：返回工具箱；每个工具独立展示 */}
    <div className="mb-3 flex shrink-0 items-center justify-between gap-2"><Link href="/tools" className="inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"><ArrowLeft size={14} />{t("toolBox.main.back")}</Link><ThemeToggle /></div>
    <div className="min-h-0 flex-1 overflow-auto">{children}</div>
  </div>;
}
