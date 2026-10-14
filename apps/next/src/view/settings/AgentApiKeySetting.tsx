"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useAgentSecretStore } from "@/stores/useAgentSecretStore";
import { useToastStore } from "@/stores/useToastStore";
import { useIsElectronEnvironment } from "@/hooks/useIsElectronEnvironment";
import { INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";
import { SiliconFlowSetupHelp } from "./siliconflow-setup-help";

const BUTTON_BASE =
  "inline-flex h-9 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

/**
 * 设置页的「Agent → API Key」区块。
 *
 * 三条设计要点：
 * 1. **显示的是状态而不是密钥**：主进程只回「有没有 / 从哪来 / 怎么存的 / 尾 4 位」
 *    （见 `stores/useAgentSecretStore`），所以这里永远拿不到原值，也就没法把它渲染出来；
 * 2. **保存后立刻清空输入框**：明文只在这次调用里存在一瞬，不留在一个 React state 里；
 * 3. 拿不到系统加密能力（`protection === "plain"`）时**明说**，不装作已经加密了。
 */
export function AgentApiKeySetting() {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.show);
  const status = useAgentSecretStore((state) => state.status);
  const loaded = useAgentSecretStore((state) => state.loaded);
  const refresh = useAgentSecretStore((state) => state.refresh);
  const save = useAgentSecretStore((state) => state.save);
  const clear = useAgentSecretStore((state) => state.clear);
  const isDesktop = useIsElectronEnvironment();
  const [draft, setDraft] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSave = useCallback(async () => {
    const value = draft.trim();
    if (!value) {
      showToast(t("settings.agentSection.empty"), "error");
      return;
    }

    setBusy(true);
    try {
      await save(value);
      // 明文不再留在组件里
      setDraft("");
      setRevealed(false);
      showToast(t("settings.agentSection.saved"), "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  }, [draft, save, showToast, t]);

  const handleClear = useCallback(async () => {
    setBusy(true);
    try {
      await clear();
      setDraft("");
      showToast(t("settings.agentSection.cleared"), "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  }, [clear, showToast, t]);

  /** 状态行：未配置 / 已配置（尾号）/ 由 `.env` 提供——三者互斥，别叠着说 */
  const statusText = !status.configured
    ? t("settings.agentSection.statusMissing")
    : status.source === "env"
      ? t("settings.agentSection.statusFromEnv", { tail: status.tail })
      : t("settings.agentSection.statusConfigured", { tail: status.tail });

  return (
    <div className="space-y-3">
      {/* 界面：硅基流动官网入口与注册配置指引。 */}
      <SiliconFlowSetupHelp />
      <div className="flex items-center gap-2">
        <span
          data-agent-key-status={status.configured ? "configured" : "missing"}
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            status.configured ? "bg-green-500" : "bg-amber-500"
          )}
        />
        <p className="text-xs text-muted-foreground">
          {loaded ? statusText : t("settings.defaultPathLoading")}
        </p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="agent-api-key"
          className="text-sm font-medium text-foreground"
        >
          {t("settings.agentSection.keyLabel")}
        </label>
        <div className="relative">
          <input
            id="agent-api-key"
            type={revealed ? "text" : "password"}
            value={draft}
            autoComplete="off"
            spellCheck={false}
            disabled={!isDesktop || busy}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("settings.agentSection.keyPlaceholder")}
            className={cn(
              "flex h-10 w-full rounded-xl bg-background px-3 py-2 pr-10 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              INPUT_BORDER_CLASS
            )}
          />
          <button
            type="button"
            onClick={() => setRevealed((previous) => !previous)}
            aria-label={
              revealed
                ? t("settings.agentSection.hide")
                : t("settings.agentSection.reveal")
            }
            title={
              revealed
                ? t("settings.agentSection.hide")
                : t("settings.agentSection.reveal")
            }
            className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {revealed ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-agent-key-save
            disabled={!isDesktop || busy}
            onClick={() => void handleSave()}
            className={cn(BUTTON_BASE, "bg-accent-fill text-accent-fill-foreground hover:bg-accent-fill/90")}
          >
            {t("settings.agentSection.save")}
          </button>
          <button
            type="button"
            data-agent-key-clear
            disabled={!isDesktop || busy || !status.configured}
            onClick={() => void handleClear()}
            className={cn(BUTTON_BASE, "hover:bg-muted")}
          >
            {t("settings.agentSection.clear")}
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          {t("settings.agentSection.envHint")}
        </p>
        {status.configured && status.protection === "plain" ? (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            {t("settings.agentSection.plainWarning")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
