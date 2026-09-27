"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderOpen, RotateCcw } from "lucide-react";
import { USER_DATA_SETTING } from "@/types/userData";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useToastStore } from "@/stores/useToastStore";
import { useIsElectronEnvironment } from "@/hooks/useIsElectronEnvironment";
import { useTranslation } from "@/i18n";
import {
  getDefaultUserDataPath,
  selectLocalFolder,
} from "@/utils/electronBridge";
import { flushUserDataSave } from "@/utils/userDataStorage";
import { INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

export function UserDataPathSetting() {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.show);
  const userDataPath = useSettingsStore((state) => state.userDataPath);
  const setUserDataPath = useSettingsStore((state) => state.setUserDataPath);
  const [defaultPath, setDefaultPath] = useState("");
  const isDesktop = useIsElectronEnvironment();

  useEffect(() => {
    if (!isDesktop) return;
    getDefaultUserDataPath().then((path) => {
      if (path) setDefaultPath(path);
    });
  }, [isDesktop]);

  const handleBrowse = useCallback(async () => {
    if (!isDesktop) {
      showToast(t("settings.electron.selectPath"));
      return;
    }

    const selected = await selectLocalFolder();
    if (!selected) return;
    setUserDataPath(selected);
    await flushUserDataSave();
    showToast(t("settings.userDataPath.updated"));
  }, [isDesktop, setUserDataPath, showToast, t]);

  const handleReset = useCallback(async () => {
    setUserDataPath("");
    await flushUserDataSave();
    showToast(t("settings.userDataPath.reset"));
  }, [setUserDataPath, showToast, t]);

  const displayPath = userDataPath || defaultPath || t("settings.defaultPathLoading");

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium text-foreground">
          {USER_DATA_SETTING.label}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {USER_DATA_SETTING.description}
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
          <span className="truncate font-mono">{displayPath}</span>
        </div>
        {!userDataPath && defaultPath && (
          <p className="text-[11px] text-muted-foreground">
            {t("settings.userDataPath.defaultHint")}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!isDesktop}
            onClick={() => void handleBrowse()}
            className={cn(
              "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition-all",
              "bg-accent-fill text-accent-fill-foreground hover:bg-accent-fill/90 active:scale-[0.98]",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            <FolderOpen className="h-4 w-4 shrink-0" />
            {t("settings.userDataPath.chooseFolder")}
          </button>
          {userDataPath ? (
            <button
              type="button"
              disabled={!isDesktop}
              onClick={() => void handleReset()}
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
