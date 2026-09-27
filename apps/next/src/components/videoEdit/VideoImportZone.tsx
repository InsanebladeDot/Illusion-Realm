"use client";

import { Film, Loader2, Plus } from "lucide-react";
import { useTranslation } from "@/i18n";

type VideoImportZoneProps = {
  clipCount: number;
  loading: boolean;
  isDesktop: boolean;
  onPick: () => void;
};

export function VideoImportZone({
  clipCount,
  loading,
  isDesktop,
  onPick,
}: VideoImportZoneProps) {
  const { t } = useTranslation();

  if (clipCount > 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Film className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">
            {t("toolBox.videoEdit.importZone.addedPrefix")} {clipCount}{" "}
            {t("toolBox.videoEdit.importZone.clipUnit")}
          </p>
          <p className="text-xs text-gray-500">
            {t("toolBox.videoEdit.importZone.reorderHint")}
          </p>
        </div>
        <button
          type="button"
          onClick={onPick}
          disabled={!isDesktop || loading}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
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
      className="flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-300 bg-white p-12 text-center transition-colors hover:border-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? (
        <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
      ) : (
        <Plus className="h-12 w-12 text-gray-400" />
      )}
      <span className="text-lg font-medium text-gray-700">
        {loading
          ? t("toolBox.videoEdit.importZone.reading")
          : t("toolBox.videoEdit.importZone.pick")}
      </span>
      <span className="text-sm text-gray-500">
        {t("toolBox.videoEdit.importZone.pickHint")}
      </span>
    </button>
  );
}
