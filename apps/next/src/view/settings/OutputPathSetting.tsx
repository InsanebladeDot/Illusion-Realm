"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, FolderOpen, RotateCcw } from "lucide-react";
import { OUTPUT_PATH_SETTING } from "@/types/settings";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useToastStore } from "@/stores/useToastStore";
import { useIsElectronEnvironment } from "@/hooks/useIsElectronEnvironment";
import { useTranslation } from "@/i18n";
import {
  getDefaultOutputPath,
  openPathInExplorer,
  resolveEffectiveOutputPath,
  selectLocalFolder,
} from "@/utils/electronBridge";
import { INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

export function OutputPathSetting() {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.show);
  const outputPath = useSettingsStore((state) => state.outputPath);
  const setOutputPath = useSettingsStore((state) => state.setOutputPath);
  const [defaultPath, setDefaultPath] = useState("");
  const isDesktop = useIsElectronEnvironment();

  useEffect(() => {
    if (!isDesktop) return;
    getDefaultOutputPath().then((path) => {
      if (path) setDefaultPath(path);
    });
  }, [isDesktop]);

  const handleBrowse = useCallback(async () => {
    if (!isDesktop) {
      showToast(t("settings.electron.selectFolder"));
      return;
    }

    const selected = await selectLocalFolder();
    if (!selected) return;
    setOutputPath(selected);
    showToast(t("settings.outputPath.updated"));
  }, [isDesktop, setOutputPath, showToast, t]);

  const handleReset = useCallback(() => {
    setOutputPath("");
    showToast(t("settings.outputPath.reset"));
  }, [setOutputPath, showToast, t]);

  const handleOpenInExplorer = useCallback(async () => {
    if (!isDesktop) {
      showToast(t("settings.electron.openFolder"));
      return;
    }

    const effectivePath = await resolveEffectiveOutputPath(outputPath);
    if (!effectivePath) {
      showToast(t("settings.outputPath.unresolved"));
      return;
    }

    const opened = await openPathInExplorer(effectivePath);
    if (!opened) {
      showToast(t("settings.outputPath.openFailed"));
    }
  }, [isDesktop, outputPath, showToast, t]);

  const displayPath = outputPath || defaultPath || t("settings.defaultPathLoading");

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium text-foreground">
          {OUTPUT_PATH_SETTING.label}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {OUTPUT_PATH_SETTING.description}
        </p>
      </div>
      <div className="flex w-full min-w-0 flex-col gap-2 sm:max-w-xl sm:flex-1">
        <div
          className={cn(
            "flex min-h-10 items-center rounded-xl bg-muted/30 px-3 py-2 text-xs text-muted-foreground",
            INPUT_BORDER_CLASS
          )}
          title={displayPath}
        >
          <span className="truncate">{displayPath}</span>
        </div>
        {!outputPath && defaultPath && (
          <p className="text-[11px] text-muted-foreground">
            {t("settings.outputPath.defaultHint")}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!isDesktop}
            onClick={handleBrowse}
            className={cn(
              "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition-all",
              "bg-accent-fill text-accent-fill-foreground hover:bg-accent-fill/90 active:scale-[0.98]",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            <FolderOpen className="h-4 w-4 shrink-0" />
            {t("settings.outputPath.chooseFolder")}
          </button>
          <button
            type="button"
            disabled={!isDesktop || !displayPath}
            onClick={handleOpenInExplorer}
            className={cn(
              "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition-all",
              INPUT_BORDER_CLASS,
              "bg-background text-foreground hover:bg-muted active:scale-[0.98]",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            <ExternalLink className="h-4 w-4 shrink-0" />
            {t("settings.outputPath.openInExplorer")}
          </button>
          {outputPath ? (
            <button
              type="button"
              disabled={!isDesktop}
              onClick={handleReset}
              className={cn(
                "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition-all",
                INPUT_BORDER_CLASS,
                "bg-background text-foreground hover:bg-muted active:scale-[0.98]",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              <RotateCcw className="h-4 w-4 shrink-0" />
              {t("settings.resetDefault")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
