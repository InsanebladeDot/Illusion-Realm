"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useAgentSecretStore } from "@/stores/useAgentSecretStore";
import { useToastStore } from "@/stores/useToastStore";
import { useIsElectronEnvironment } from "@/hooks/useIsElectronEnvironment";
import { INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";
// 设置页与 composer 共用服务商选择，不维护另一份模型配置。
// 凭据字段随站点重挂载，仅清除尚未保存的原文草稿。
// API Key 的持久化仍属于主进程，普通设置只记录 provider/model。
import { AgentProviderTabs } from "@/components/agent-provider-tabs";
import { AgentModelPicker } from "@/components/agent-model-picker";
import { useAgentProviderStore } from "@/stores/use-agent-provider-store";
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
function AgentCredentialFields() {
  // 该表单仍使用原有 Agent 密钥 UI，新增服务商只改变作用域和帮助入口。
  // provider 是当前非秘密偏好，不是网络地址，也不能作为文件路径提交。
  // draft 仅存在于本组件内存，切站通过 key 重挂载后立即丢弃。
  // 显示/隐藏按钮只作用于尚未保存的输入，无法读取已存密钥全文。
  // status 尾号来自主进程摘要，保存后不会用 draft 重新拼出状态文案。
  // env 来源提示只对硅基流动适用，Euzhi 从不复用旧 .env 中的密钥。
  // 保存和清除用同一 busy 状态阻止重复表单动作，不影响另一站正在运行的聊天。
  // 目录刷新独立于保存成功，网络暂不可达不意味着本地 key 未保存。
  // 新令牌可见模型可能不同，因此成功写入后需重新核对本站目录。
  // clear 后也刷新，让界面不继续显示上一把令牌的已授权标记。
  // 成功保存会清空输入并隐藏原文，不把测试截图或用户截图变成密钥泄漏。
  // 明文降级提示沿用实际 protection 字段，不因多站接入掩盖原存储限制。
  // 非 Electron 环境禁用写入按钮，避免浏览器看似成功却没有主进程存储。
  // 所有可见帮助文案仍走词条表，注释中的中文不计为 UI 文案逃逸。
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.show);
  const status = useAgentSecretStore((state) => state.status);
  const loaded = useAgentSecretStore((state) => state.loaded);
  const refresh = useAgentSecretStore((state) => state.refresh);
  const save = useAgentSecretStore((state) => state.save);
  const clear = useAgentSecretStore((state) => state.clear);
  const isDesktop = useIsElectronEnvironment();
  // 模型与密钥同用当前服务商，输入组件切换时由父级 key 重挂载清空。
  // 保存显式传 provider，await 后切换也不会写错凭据分区。
  // 现有硅基流动引导只在该服务商显示，Euzhi 使用自己的令牌入口。
  const provider = useAgentProviderStore(state => state.preferences.provider);
  const [draft, setDraft] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // 切换后重新查询本站状态，不能复用上一站的已配置标记。
    // 返回摘要只包含来源、保护方式和尾号，不含原文。
    // 偏好变化被列为依赖，设置页不会卡在旧站点状态。
    void refresh(provider);
  }, [provider, refresh]);

  const handleSave = useCallback(async () => {
    const value = draft.trim();
    if (!value) {
      showToast(t("settings.agentSection.empty"), "error");
      return;
    }

    setBusy(true);
    try {
      // 捕获调用时的站点，主进程限定密钥所属的存储目录。
      // 成功后原文立即清空，之后只展示状态尾号。
      // 不把凭据加入普通用户数据文档。
      await save(value, provider);
      // 新令牌可能有不同模型权限，保存后重新核对当前站点目录。
      // store 吞掉刷新异常并显示错误状态，保存成功不会被后续网络失败否定。
      // 请求只发给保存时捕获的 provider，另一站目录不必重复刷新。
      void useAgentProviderStore.getState().refresh(provider, true);
      // 明文不再留在组件里
      setDraft("");
      setRevealed(false);
      showToast(t("settings.agentSection.saved"), "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  }, [draft, save, provider, showToast, t]);

  const handleClear = useCallback(async () => {
    setBusy(true);
    try {
      // 只清本站凭据，保留另一个站点已经保存的配置。
      // 不删除聊天历史、目录缓存或其他本地资源。
      // 返回状态仍由同一服务商重新计算。
      await clear(provider);
      // 清除后账户可见性回到未核实，不保留上一把令牌的可用标记。
      // 公开价格仍可浏览，不会因为没有令牌而阻断模型选择。
      // 密钥已清除的结果不依赖这次目录联网是否成功。
      void useAgentProviderStore.getState().refresh(provider, true);
      setDraft("");
      showToast(t("settings.agentSection.cleared"), "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  }, [clear, provider, showToast, t]);

  /** 状态行：未配置 / 已配置（尾号）/ 由 `.env` 提供——三者互斥，别叠着说 */
  const statusText = !status.configured
    ? t("settings.agentSection.statusMissing")
    : status.source === "env"
      ? t("settings.agentSection.statusFromEnv", { tail: status.tail })
      : t("settings.agentSection.statusConfigured", { tail: status.tail });

  return (
    <div className="space-y-3">
      {/* 界面：硅基流动官网入口与注册配置指引。 */}
      {/* Euzhi 令牌必须选可用的 Grok 分组，公开目录不等于账户已获授权。 */}
      {/* 链接固定到服务商提供的站点，不拼入任何 API Key。 */}
      {/* 硅基流动继续保留现有图文配置帮助。 */}
      {provider === "siliconflow" ? <SiliconFlowSetupHelp /> : <div className="space-y-2 text-xs text-muted-foreground"><p>{t("agent.providers.euzhiHelp")}</p><a data-agent-provider-link href="https://euzhi.vip/console/token" target="_blank" rel="noopener noreferrer" className="text-primary underline">{t("agent.providers.tokenLink")}</a></div>}
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
          {/* 旧环境变量只作用于硅基流动，不会回落给 Euzhi。 */}
          {/* Euzhi 使用独立本地凭据，用户需要为该站单独填写。 */}
          {/* 提示随当前服务商变化，不宣称两站令牌互通。 */}
          {provider === "siliconflow" ? t("settings.agentSection.envHint") : t("agent.providers.keyIsolation")}
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

/**
 * 设置页复用站点切换与模型弹窗，凭据表单随 provider 重新挂载。
 * 重挂载只清理尚未保存的明文草稿，不会删除主进程已存密钥。
 * 站点切换失败保留原选择并显示固定提示，不把磁盘错误详情输出页面。
 * 保存中的表单回执仍属于原 provider，不通过当前全局选择重新定向。
 * 模型选择与 API Key 设置共用偏好，用户无需在两个地方重复挑选。
 * 页面结构保持原设置节锚点，Agent 缺钥提示仍可导航到这里。
 */
export function AgentApiKeySetting() {
  const provider = useAgentProviderStore(state => state.preferences.provider);
  const choose = useAgentProviderStore(state => state.choose); const { t } = useTranslation();
  const change = (value: "siliconflow" | "euzhi") => {
    void choose(value).catch(() => useToastStore.getState().show(t("agent.providers.saveFailed"), "error"));
  };
  return <div className="space-y-4"><AgentProviderTabs value={provider} onChange={change} /><AgentModelPicker /><AgentCredentialFields key={provider} /></div>;
}
