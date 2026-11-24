"use client";

import { AlertTriangle, X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/utils/cn";
import { INPUT_BORDER_CLASS } from "@/utils/layout";

interface ConfirmActionDialogProps {
  closeLabel: string;
  title: string;
  description: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  confirmDisabled?: boolean;
  confirmButtonId?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children?: ReactNode;
}

/** 创作页删除卡片的通用外壳；确认内容和实际删除动作由调用方注入。 */
export function ConfirmActionDialog({
  closeLabel,
  title,
  description,
  cancelLabel,
  confirmLabel,
  confirmDisabled = false,
  confirmButtonId,
  busy = false,
  onCancel,
  onConfirm,
  children,
}: ConfirmActionDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  // 原生弹窗把焦点留在卡片内，退出时会把焦点还给打开弹窗的控件。
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    cancelRef.current?.focus();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={id}
      aria-describedby={`${id}-description`}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(event) => {
        if (busy || event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX >= rect.right || event.clientY < rect.top || event.clientY >= rect.bottom) onCancel();
      }}
      className={cn(
        "m-auto w-[calc(100%-1.5rem)] max-w-md max-h-[calc(100dvh-var(--window-chrome-height)-1.5rem)] overflow-auto rounded-xl border bg-background p-6 text-foreground shadow-lg backdrop:bg-black/50",
        INPUT_BORDER_CLASS,
      )}
    >
      {/* 确认卡片：说明、业务附加内容和操作按钮共用同一排版。 */}
      <div className="grid gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1.5">
            <h2 id={id} className="pr-5 text-lg font-semibold">{title}</h2>
            <div id={`${id}-description`} className="text-sm text-muted-foreground">{description}</div>
          </div>
        </div>
        {children}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            ref={cancelRef}
            onClick={onCancel}
            disabled={busy}
            className={cn(
              "inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium shadow-sm hover:bg-muted disabled:opacity-50",
              INPUT_BORDER_CLASS,
            )}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            id={confirmButtonId}
            disabled={confirmDisabled || busy}
            onClick={onConfirm}
            className="inline-flex h-9 items-center justify-center rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
        <button
          type="button"
          aria-label={closeLabel}
          onClick={onCancel}
          disabled={busy}
          className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 disabled:pointer-events-none"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </dialog>
  );
}
