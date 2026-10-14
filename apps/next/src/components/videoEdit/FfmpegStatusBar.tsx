"use client";

import { AlertCircle, CheckCircle2, FolderSearch, RefreshCw } from "lucide-react";
import { useTranslation, type MessageKey } from "@/i18n";
import type { FfmpegStatus } from "@/types/electron-api";

/**
 * 来源标签：模块级常量里存**词条 key**，渲染时用组件里的 t 取文案。
 * 这里不能直接用模块级 t —— 会被组件内的 `const { t } = useTranslation()` 遮蔽，
 * 而且模块级求值会冻结在 import 时刻，切换语言后不会更新。
 */
const SOURCE_LABELS: Record<string, MessageKey> = {
  manual: "toolBox.videoEdit.ffmpeg.sourceManual",
  path: "toolBox.videoEdit.ffmpeg.sourcePath",
  common: "toolBox.videoEdit.ffmpeg.sourceCommon",
  bundled: "toolBox.videoEdit.ffmpeg.sourceBundled",
};

type FfmpegStatusBarProps = {
  status: FfmpegStatus | null;
  checking: boolean;
  isDesktop: boolean;
  onPickManually: () => void;
  onRedetect: () => void;
};

export function FfmpegStatusBar({
  status,
  checking,
  isDesktop,
  onPickManually,
  onRedetect,
}: FfmpegStatusBarProps) {
  const { t } = useTranslation();
  const ok = Boolean(status?.ffmpegPath);

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm ${
        ok
          ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300"
          : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      }`}
    >
      {ok ? (
        <CheckCircle2 className="h-4 w-4 shrink-0" />
      ) : (
        <AlertCircle className="h-4 w-4 shrink-0" />
      )}

      <div className="min-w-0 flex-1">
        {checking ? (
          <span>{t("toolBox.videoEdit.ffmpeg.checking")}</span>
        ) : ok ? (
          <>
            <p className="font-medium">
              {t("toolBox.videoEdit.ffmpeg.readyPrefix")}
              {status?.source && SOURCE_LABELS[status.source]
                ? t(SOURCE_LABELS[status.source])
                : t("toolBox.videoEdit.ffmpeg.unknownSource")}
              ）
            </p>
            <p className="truncate text-xs opacity-80" title={status?.ffmpegPath ?? ""}>
              {status?.ffmpegPath}
              {status?.version ? ` · ${status.version}` : ""}
            </p>
          </>
        ) : (
          <>
            <p className="font-medium">{t("toolBox.videoEdit.ffmpeg.missing")}</p>
            <p className="text-xs opacity-90">
              {t("toolBox.videoEdit.ffmpeg.installHint")}
              {isDesktop ? "" : t("toolBox.videoEdit.ffmpeg.desktopOnly")}。
            </p>
          </>
        )}
      </div>

      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onPickManually}
          disabled={!isDesktop}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-current/30 bg-background/60 px-3 text-xs font-medium transition-colors hover:bg-background disabled:opacity-50"
        >
          <FolderSearch className="h-3.5 w-3.5" />
          {t("toolBox.videoEdit.ffmpeg.pickManually")}
        </button>
        <button
          type="button"
          onClick={onRedetect}
          disabled={!isDesktop || checking}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-current/30 bg-background/60 px-3 text-xs font-medium transition-colors hover:bg-background disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
          {t("toolBox.videoEdit.ffmpeg.redetect")}
        </button>
      </div>
    </div>
  );
}
