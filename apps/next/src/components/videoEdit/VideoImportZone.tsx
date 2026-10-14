"use client";

import { Film, Loader2, Plus } from "lucide-react";
import { useTranslation } from "@/i18n";

type VideoImportZoneProps = {
  clipCount: number;
  loading: boolean;
  isDesktop: boolean;
  summary?: string;
  onPick: () => void;
};

export function VideoImportZone({
  clipCount,
  loading,
  isDesktop,
  summary,
  onPick,
}: VideoImportZoneProps) {
  const { t } = useTranslation();

  if (clipCount > 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-300">
          <Film className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {summary ?? <>{t("toolBox.videoEdit.importZone.addedPrefix")} {clipCount}{" "}
              {t("toolBox.videoEdit.importZone.clipUnit")}</>}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("toolBox.videoEdit.importZone.reorderHint")}
          </p>
        </div>
        <button
          type="button"
          onClick={onPick}
          disabled={!isDesktop || loading}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/40 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          {t("toolBox.videoEdit.importZone.continueAdd")}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={!isDesktop || loading}
      className="flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-background p-12 text-center transition-colors hover:border-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? (
        <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
      ) : (
        <Plus className="h-12 w-12 text-muted-foreground" />
      )}
      <span className="text-lg font-medium text-foreground">
        {loading
          ? t("toolBox.videoEdit.importZone.reading")
          : t("toolBox.videoEdit.importZone.pick")}
      </span>
      <span className="text-sm text-muted-foreground">
        {t("toolBox.videoEdit.importZone.pickHint")}
      </span>
    </button>
  );
}
