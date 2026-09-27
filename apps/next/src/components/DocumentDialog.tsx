"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslation } from "@/i18n";
import { PRIMARY_BUTTON_CLASS, THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type DocumentDialogProps = {
  open: boolean;
  /** 顶部小标题（如「更新公告」「提示词教程」） */
  eyebrow: string;
  title: string;
  titleId: string;
  onClose: () => void;
  children: ReactNode;
  /** 底部按钮区（默认只有一个「知道了」） */
  footer?: ReactNode;
  /** 主按钮文案 */
  confirmLabel?: string;
};

/**
 * 文档型弹框外壳（更新公告 / 提示词教程共用）：
 * 固定头部 + 可滚动正文 + 固定底部按钮，正文高度不超过 85dvh。
 */
export function DocumentDialog({
  open,
  eyebrow,
  title,
  titleId,
  onClose,
  children,
  footer,
  confirmLabel,
}: DocumentDialogProps) {
  const { t } = useTranslation();
  // 可选文案的回退值放在这里而不是解构默认值：默认值在 hook 之外求值，拿不到 t
  const confirmLabelText = confirmLabel ?? t("components.documentDialog.confirm");

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[88] bg-black/50" aria-hidden onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "fixed left-1/2 top-1/2 z-[89] flex max-h-[min(85dvh,calc(100vh-2rem))] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-background shadow-lg outline-none dark:bg-muted",
          THIN_BORDER_CLASS
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {eyebrow}
            </p>
            <h2 id={titleId} className="mt-1 text-base font-semibold leading-snug">
              {title}
            </h2>
          </div>
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={onClose}
            className="shrink-0 rounded-sm opacity-70 transition-opacity hover:opacity-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-gutter:stable]">
          {children}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border/60 px-5 py-4 sm:flex-row sm:justify-end">
          {footer ?? (
            <button
              type="button"
              onClick={onClose}
              className={cn(
                "inline-flex h-9 items-center justify-center rounded-xl px-4 text-sm font-medium shadow transition-colors",
                PRIMARY_BUTTON_CLASS
              )}
            >
              {confirmLabelText}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
