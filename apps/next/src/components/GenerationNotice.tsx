"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { DEFAULT_FOLDER_ID } from "@/data/historyFolders";
import { useGenerationNoticeStore } from "@/stores/useGenerationNoticeStore";
import { useHistoryFolderStore } from "@/stores/useHistoryFolderStore";
import { useTranslation } from "@/i18n";
import {
  resolvePageDirection,
  startPageNavigation,
} from "@/utils/pageTransition";
import { THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

/**
 * 全局生成状态通知（右上角）。
 *
 * - 生成中：宽屏显示变速转圈；所有宽度都显示 `生成中.` / `生成中..` / `生成中...` 循环
 * - 生成完成：短暂显示「图片已生成」，可点「查看图片」直接进入详情主区页
 * - 生成失败：短暂显示错误
 */
export function GenerationNotice() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const status = useGenerationNoticeStore((state) => state.status);
  const filePath = useGenerationNoticeStore((state) => state.filePath);
  const folderId = useGenerationNoticeStore((state) => state.folderId);
  const dismiss = useGenerationNoticeStore((state) => state.dismiss);
  const openFolder = useHistoryFolderStore((state) => state.openFolder);
  const requestOpenImage = useHistoryFolderStore(
    (state) => state.requestOpenImage
  );
  const [dots, setDots] = useState(1);

  useEffect(() => {
    if (status !== "generating") return;

    const timer = setInterval(() => {
      setDots((previous) => (previous % 3) + 1);
    }, 420);

    return () => clearInterval(timer);
  }, [status]);

  const openGeneratedImage = useCallback(() => {
    if (!filePath) return;

    openFolder(folderId ?? DEFAULT_FOLDER_ID);
    requestOpenImage(filePath);
    dismiss();

    if (pathname !== "/create") {
      startPageNavigation({
        href: "/create",
        push: () => router.push("/create"),
        direction: resolvePageDirection(pathname, "/create"),
      });
    }
  }, [
    dismiss,
    filePath,
    folderId,
    openFolder,
    pathname,
    requestOpenImage,
    router,
  ]);

  if (status === "idle") return null;

  return (
    <div
      data-generation-notice={status}
      className="pointer-events-none fixed right-4 top-[calc(var(--window-chrome-height,0px)+1rem)] z-[1001]"
    >
      <div
        className={cn(
          "pointer-events-auto flex min-h-10 items-center gap-2 rounded-xl bg-background/95 px-3 py-2 text-sm shadow-lg backdrop-blur",
          THIN_BORDER_CLASS
        )}
        role="status"
        aria-live="polite"
      >
        {status === "generating" ? (
          <>
            <Loader2 className="generation-spin hidden h-4 w-4 shrink-0 text-muted-foreground xl:block" />
            <span className="tabular-nums">
              {t("components.generationNotice.generating", {
                dots: ".".repeat(dots),
              })}
            </span>
          </>
        ) : null}

        {status === "success" ? (
          <>
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
            <span>{t("components.generationNotice.success")}</span>
            {filePath ? (
              <button
                type="button"
                onClick={openGeneratedImage}
                className="ml-1 shrink-0 rounded-md px-2 py-1 text-xs font-semibold underline underline-offset-2 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              >
                {t("components.generationNotice.view")}
              </button>
            ) : null}
          </>
        ) : null}

        {status === "error" ? (
          <>
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <span>{t("components.generationNotice.failed")}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
