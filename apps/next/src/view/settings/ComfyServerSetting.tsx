"use client";

import { useSettingsStore } from "@/stores/useSettingsStore";
import { useTranslation } from "@/i18n";
import { INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

export function ComfyServerSetting() {
  const { t } = useTranslation();
  const comfyServerUrl = useSettingsStore((state) => state.comfyServerUrl);
  const setComfyServerUrl = useSettingsStore((state) => state.setComfyServerUrl);

  return (
    <div className="space-y-2">
      <label
        htmlFor="comfy-server-url"
        className="text-sm font-medium text-foreground"
      >
        {t("settings.comfySection.address")}
      </label>
      <input
        id="comfy-server-url"
        type="text"
        value={comfyServerUrl}
        onChange={(event) => setComfyServerUrl(event.target.value)}
        placeholder="127.0.0.1:8188"
        className={cn(
          "flex h-10 w-full rounded-xl bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          INPUT_BORDER_CLASS
        )}
      />
      <p className="text-xs text-muted-foreground">
        {t("settings.comfySection.hint")}
      </p>
    </div>
  );
}
