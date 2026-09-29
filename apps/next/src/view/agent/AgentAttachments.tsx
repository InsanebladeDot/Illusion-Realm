"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  ImagePreviewOverlay,
  type ImagePreviewItem,
} from "@/components/ImagePreviewOverlay";
import { useTranslation } from "@/i18n";
import { useAgentStore, type AgentAttachment } from "@/stores/useAgentStore";
import { cn } from "@/utils/cn";

/** 附件 id：时间戳 + 序号 + 随机后缀（同一批选入也不会撞） */
function createAttachmentId(index: number): string {
  return `att-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * 打开系统图片选择框（多选）。
 *
 * 为什么动态建 `input` 而不是挂一个隐藏 input + ref：调用点不止一处（+ 菜单、将来的拖拽），
 * 动态创建省掉 ref 传递，也不会在 DOM 里长期留一个空 input。
 * 取消选择时浏览器**不会**派发 change，所以用 window 的 focus 兜底 resolve([])，
 * 否则这个 Promise 会一直挂着（调用方 `await` 之后就再也不往下走了）。
 */
export function pickImageFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve([]);
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/bmp,image/avif";
    input.multiple = true;
    input.style.display = "none";
    document.body.appendChild(input);

    let settled = false;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };

    input.addEventListener(
      "change",
      () => finish(Array.from(input.files ?? [])),
      { once: true }
    );
    window.addEventListener(
      "focus",
      () => {
        // 给 change 一点时间（Windows 上 focus 有时先于 change 到达）
        window.setTimeout(() => finish([]), 400);
      },
      { once: true }
    );

    input.click();
  });
}

/**
 * File 列表 → 附件项：预览用 object URL，路径用 Electron 的 `getPathForFile`
 * （浏览器语义下取不到路径，记 null —— 那时附件只在本地展示，不影响使用）。
 */
export function filesToAttachments(files: File[]): AgentAttachment[] {
  return files.map((file, index) => ({
    id: createAttachmentId(index),
    name: file.name,
    filePath: window.electronAPI?.getPathForFile?.(file) ?? null,
    previewUrl: URL.createObjectURL(file),
    size: file.size,
  }));
}

/**
 * 附件缩略图网格（composer 的待发附件与消息里的已发附件共用）。
 *
 * 传 `onRemove` 时每张右上角出现移除按钮（composer 用）；不传就是只读展示（消息里用）。
 * 点缩略图打开大图预览层 —— 那里可以缩放 / 翻页（复用 `ImagePreviewOverlay`）。
 */
export function AgentImageThumbnails({
  attachments,
  onRemove,
  className,
}: {
  attachments: AgentAttachment[];
  onRemove?: (attachmentId: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const previewItems: ImagePreviewItem[] = useMemo(
    () =>
      attachments.map((item) => ({
        key: item.id,
        src: item.previewUrl,
        alt: item.name,
      })),
    [attachments]
  );

  if (attachments.length === 0) return null;

  return (
    <div
      data-agent-attachments
      data-agent-attachment-count={attachments.length}
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {attachments.map((item, index) => (
        <div key={item.id} className="group relative">
          <button
            type="button"
            data-agent-attachment={item.name}
            title={`${item.name} · ${t("agent.composer.attachmentPreview")}`}
            aria-label={t("agent.composer.attachmentPreview")}
            onClick={() => setPreviewIndex(index)}
            className="block h-14 w-14 overflow-hidden rounded-lg border border-border/60 bg-muted/30 transition-opacity hover:opacity-90"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.previewUrl}
              alt={item.name}
              className="h-full w-full object-cover"
            />
          </button>
          {onRemove ? (
            <button
              type="button"
              data-agent-attachment-remove={item.id}
              aria-label={t("agent.composer.attachmentRemove")}
              title={t("agent.composer.attachmentRemove")}
              onClick={() => onRemove(item.id)}
              className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-foreground/80 text-background opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      ))}

      <ImagePreviewOverlay
        items={previewItems}
        index={previewIndex ?? 0}
        onIndexChange={setPreviewIndex}
        open={previewIndex !== null}
        onOpenChange={(next) => {
          if (!next) setPreviewIndex(null);
        }}
      />
    </div>
  );
}

/**
 * 输入框上方的附件条：计数 + 缩略图（可移除、可点开预览）。
 * 没有附件时整条不渲染，避免占位把 composer 顶高。
 */
export function AgentAttachmentStrip() {
  const { t } = useTranslation();
  const attachments = useAgentStore((state) => state.attachments);
  const removeAttachment = useAgentStore((state) => state.removeAttachment);

  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-1 pb-1.5 pt-1">
      <span className="text-[11px] text-muted-foreground">
        {t("agent.composer.attachmentCount", { count: attachments.length })}
      </span>
      <AgentImageThumbnails attachments={attachments} onRemove={removeAttachment} />
    </div>
  );
}
