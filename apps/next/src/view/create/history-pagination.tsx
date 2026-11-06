"use client";

// side：真实文件分页；不改变已选图片、浏览目录和生成输出目标。
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "@/i18n";

interface HistoryPaginationProps { count: number; page: number; pages: number; onChange: (page: number) => void }
export function HistoryPagination({ count, page, pages, onChange }: HistoryPaginationProps) {
  const { t } = useTranslation();
  return <footer data-history-pagination className="flex h-[54px] shrink-0 items-center gap-2 border-t border-border px-4 text-xs text-muted-foreground">
    <span className="min-w-0 flex-1 truncate">{t("create.workspace.totalFiles", { count })}</span>
    <button type="button" aria-label={t("create.workspace.previousPage")} disabled={page === 0} onClick={() => onChange(page - 1)} className="flex h-8 w-6 items-center justify-center rounded disabled:opacity-35 hover:bg-muted"><ChevronLeft size={14} /></button>
    <span data-history-page className="rounded-lg border border-border px-3 py-1.5 tabular-nums text-foreground">{page + 1} / {pages}</span>
    <button type="button" aria-label={t("create.workspace.nextPage")} disabled={page >= pages - 1} onClick={() => onChange(page + 1)} className="flex h-8 w-6 items-center justify-center rounded disabled:opacity-35 hover:bg-muted"><ChevronRight size={14} /></button>
  </footer>;
}
