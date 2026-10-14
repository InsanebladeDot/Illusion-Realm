"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  SETTINGS_PATH_LABELS,
  type SettingsPathKey,
} from "@/types/settings";
import { useIsElectronEnvironment } from "@/hooks/useIsElectronEnvironment";
import { useTranslation } from "@/i18n";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useToastStore } from "@/stores/useToastStore";
import { selectLocalFolder } from "@/utils/electronBridge";
import { countModelsByType } from "@/utils/localModelScanner";
import { INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";
import { PathSettingRow } from "@/view/settings/PathSettingRow";
import { OutputPathSetting } from "@/view/settings/OutputPathSetting";
import { UserDataPathSetting } from "@/view/settings/UserDataPathSetting";
import { ComfyServerSetting } from "@/view/settings/ComfyServerSetting";
import { AgentApiKeySetting } from "@/view/settings/AgentApiKeySetting";
import { LocalModelList } from "@/view/settings/LocalModelList";
import { useIsHydrated } from "@/hooks/useIsHydrated";
import { CivitaiApiKeySetting } from "@/view/settings/CivitaiApiKeySetting";
import { PromptApiKeySetting } from "@/view/settings/prompt-api-key-setting";

const PATH_KEYS: SettingsPathKey[] = [
  "searchPath",
  "checkpointPath",
  "lorasPath",
  "diffusionModelsPath",
];

type SettingsCategory = "all" | "tools" | "image" | "video" | "models" | "keys";

function useKeySettingsAnchor(setCategory: (value: SettingsCategory) => void) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const navigate = () => {
      const id = window.location.hash.slice(1);
      if (!["agent", "civitai-api-key", "prompt-keys"].includes(id)) return;
      setCategory("keys");
      clearTimeout(timer);
      timer = setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "center" }), 0);
    };
    navigate();
    window.addEventListener("hashchange", navigate);
    return () => { clearTimeout(timer); window.removeEventListener("hashchange", navigate); };
  }, [setCategory]);
}

export function SettingsPage() {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.show);
  const paths = useSettingsStore((state) => state.paths);
  const models = useSettingsStore((state) => state.models);
  const scanning = useSettingsStore((state) => state.scanning);
  const lastScannedAt = useSettingsStore((state) => state.lastScannedAt);
  const setPath = useSettingsStore((state) => state.setPath);
  const scanAllModels = useSettingsStore((state) => state.scanAllModels);
  const isHydrated = useIsHydrated();

  const isDesktop = useIsElectronEnvironment();
  const [category, setCategory] = useState<SettingsCategory>("all");
  useKeySettingsAnchor(setCategory);
  const show = (target: Exclude<SettingsCategory, "all">) => category === "all" || category === target;
  const categories = {
    all: t("settings.categories.all"), tools: t("settings.categories.tools"),
    image: t("settings.categories.image"), video: t("settings.categories.video"),
    models: t("settings.categories.models"), keys: t("settings.categories.keys"),
  };

  const counts = countModelsByType(models);

  const handleBrowse = useCallback(
    async (key: SettingsPathKey) => {
      if (!isDesktop) {
        showToast(t("settings.electron.selectFolder"));
        return;
      }

      const selected = await selectLocalFolder();
      if (!selected) return;

      setPath(key, selected);
      await useSettingsStore.getState().scanAllModels();
    },
    [isDesktop, setPath, showToast, t]
  );

  const handleRescan = useCallback(async () => {
    if (!isDesktop) {
      showToast(t("settings.electron.scanModels"));
      return;
    }

    await scanAllModels();
    showToast(t("settings.models.scanDone"));
  }, [isDesktop, scanAllModels, showToast, t]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t("settings.page.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("settings.page.description")}
        </p>
        {!isDesktop && (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            {t("settings.page.browserNotice")}
          </p>
        )}
      </header>

      <nav aria-label={t("settings.categories.label")} className="sticky top-[var(--window-chrome-height,0px)] z-20 -mx-1 overflow-x-auto rounded-xl border border-border bg-background/95 p-1 shadow-sm backdrop-blur">
        <div className="flex min-w-max gap-1">
          {(["all", "tools", "image", "video", "models", "keys"] as const).map((key) => (
            <button key={key} data-settings-category={key} type="button" onClick={() => setCategory(key)} aria-pressed={category === key}
              className={cn("rounded-lg px-3 py-2 text-sm transition-colors", category === key ? "bg-accent-fill text-accent-fill-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              {categories[key]}
            </button>
          ))}
        </div>
      </nav>

      {show("models") && <section
        className={cn(
          "space-y-6 rounded-2xl bg-background p-4 sm:p-6",
          INPUT_BORDER_CLASS
        )}
      >
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">{t("settings.pathSection.title")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("settings.pathSection.descriptionPrefix")}
            {" "}
            <code className="rounded bg-muted px-1 py-0.5">xx/xx/model.safetensors</code>
            ）。
          </p>
        </div>

        <div className="space-y-6">
          {PATH_KEYS.map((key) => {
            const meta = SETTINGS_PATH_LABELS[key];
            return (
              <PathSettingRow
                key={key}
                label={meta.label}
                description={meta.description}
                value={paths[key]}
                disabled={!isDesktop}
                onBrowse={() => handleBrowse(key)}
              />
            );
          })}
        </div>
      </section>}

      {show("keys") && <section className={cn("space-y-4 rounded-2xl bg-background p-4 sm:p-6", INPUT_BORDER_CLASS)}>
        <div><h2 className="text-base font-semibold text-foreground">{t("settings.civitai.title")}</h2><p className="mt-1 text-xs text-muted-foreground">{t("settings.civitai.subtitle")}</p></div>
        <CivitaiApiKeySetting />
      </section>}

      {show("keys") && <section id="prompt-keys" className={cn("scroll-mt-28 space-y-4 rounded-2xl bg-background p-4 sm:p-6", INPUT_BORDER_CLASS)}>
        {/* 界面：提示词助手的 GLM 与中转站密钥，分别保存。 */}
        <h2 className="text-base font-semibold text-foreground">{t("settings.promptKeys.title")}</h2>
        <p className="text-xs text-muted-foreground">{t("settings.promptKeys.description")}</p>
        <PromptApiKeySetting />
      </section>}

      {show("tools") && <section
        className={cn(
          "space-y-4 rounded-2xl bg-background p-4 sm:p-6",
          INPUT_BORDER_CLASS
        )}
      >
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">{t("settings.outputSection.title")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("settings.outputSection.description")}
          </p>
        </div>
        <OutputPathSetting />
      </section>}

      {show("tools") && <section
        className={cn(
          "space-y-4 rounded-2xl bg-background p-4 sm:p-6",
          INPUT_BORDER_CLASS
        )}
      >
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">{t("settings.userDataSection.title")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("settings.userDataSection.description")}
          </p>
        </div>
        <UserDataPathSetting />
      </section>}

      {show("image") && <section
        className={cn(
          "space-y-4 rounded-2xl bg-background p-4 sm:p-6",
          INPUT_BORDER_CLASS
        )}
      >
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">ComfyUI</h2>
          <p className="text-xs text-muted-foreground">
            {t("settings.comfySection.description")}
          </p>
        </div>
        <ComfyServerSetting />
      </section>}

      {/**
        id="agent" 是**链接锚点**：Agent 页在没有密钥时会提示「去设置里填写」，
        那条链接指向 /settings#agent —— 改这个 id 等于悄悄改坏那条提示的落点。
      */}
      {show("keys") && <section
        id="agent"
        className={cn(
          "space-y-4 rounded-2xl bg-background p-4 sm:p-6",
          INPUT_BORDER_CLASS
        )}
      >
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">
            {t("settings.agentSection.title")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("settings.agentSection.description")}
          </p>
        </div>
        <AgentApiKeySetting />
      </section>}

      {show("models") && <section
        className={cn(
          "space-y-4 rounded-2xl bg-background p-4 sm:p-6",
          INPUT_BORDER_CLASS
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {t("settings.models.title")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("settings.models.countPrefix")}{models.length}{t("settings.models.countMiddle")}{counts.checkpoint} · LoRA{" "}
              {counts.lora}）
              {isHydrated && lastScannedAt
                ? t("settings.models.lastScanned", {
                    time: new Date(lastScannedAt).toLocaleString("zh-CN"),
                  })
                : ""}
            </p>
          </div>
          <button
            type="button"
            disabled={!isDesktop || scanning}
            onClick={handleRescan}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-all active:scale-[0.98]",
              /** 主按钮走 accent token：深色下是中间调而不是纯白（见 globals.css 的 accent-fill） */
              "bg-accent-fill text-accent-fill-foreground hover:bg-accent-fill/90 disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <RefreshCw
              className={cn("h-4 w-4", scanning && "animate-spin")}
            />
            {t("settings.models.rescan")}
          </button>
        </div>

        <LocalModelList models={models} scanning={scanning} />
      </section>}
      {category === "video" && <section className={cn("rounded-2xl bg-background p-4 sm:p-6", INPUT_BORDER_CLASS)}>
        <h2 className="text-base font-semibold text-foreground">{t("settings.categories.videoTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("settings.categories.videoDescription")}</p>
      </section>}
    </div>
  );
}
