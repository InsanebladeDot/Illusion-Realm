"use client";

/** Prompt credentials share the encrypted IPC facade; changing endpoints resets the key draft. */
import { useEffect, useState } from "react";
// 共享凭据说明可直达原 Agent 配置，模型选择仍只维护一个入口。
// 使用现有 Next 链接和设置锚点，不新建站点配置路由。
import Link from "next/link";
import { useIsElectronEnvironment } from "@/hooks/useIsElectronEnvironment";
import { useTranslation } from "@/i18n";
import { usePromptAssistantStore } from "@/stores/usePromptAssistantStore";
import { useToastStore } from "@/stores/useToastStore";
import { assistantError, clearPromptSecret, promptSecretStatus, savePromptSecret } from "@/utils/prompt-assistant";
import type { PromptConnection, PromptSecretStatus } from "@illusion-realm/shared";

const INPUT = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";
function usePromptCredential(connection: PromptConnection) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<PromptSecretStatus | null>(null);
  const [draft, setDraft] = useState(""); const [busy, setBusy] = useState(false);
  const { provider, baseUrl } = connection;
  useEffect(() => {
    let active = true;
    void promptSecretStatus({ provider, baseUrl }).then(value => { if (active) setStatus(value); })
      .catch(error => { if (active) useToastStore.getState().show(assistantError(error)); });
    return () => { active = false; };
  }, [provider, baseUrl]);
  const update = async (clear: boolean) => {
    setBusy(true);
    try {
      setStatus(clear ? await clearPromptSecret(connection) : await savePromptSecret(connection, draft));
      setDraft(""); useToastStore.getState().show(t(clear ? "create.promptAssistant.deletedKey" : "create.promptAssistant.saved"));
    } catch (error) { useToastStore.getState().show(assistantError(error)); }
    finally { setBusy(false); }
  };
  return { status, draft, setDraft, busy, update };
}

function PromptCredentialForm({ connection }: { connection: PromptConnection }) {
  const { t } = useTranslation(); const desktop = useIsElectronEnvironment();
  const { status, draft, setDraft, busy, update } = usePromptCredential(connection);
  return <div className="space-y-3" data-prompt-key-provider={connection.provider}>
    <p title={t(status?.configured ? "create.promptAssistant.keyConfigured" : "create.promptAssistant.keyMissing")} data-prompt-key-status={status?.configured ? "configured" : "missing"} className="text-xs text-muted-foreground">{status?.configured ? t("settings.agentSection.statusConfigured", { tail: status.tail }) : t("create.promptAssistant.keyMissing")}</p>
    <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); if (desktop && !busy && draft.trim()) void update(false); }}>
      <div className="min-w-0 basis-full sm:basis-auto sm:flex-1"><input data-assistant-api-key aria-label={t("create.promptAssistant.apiKey")} type="password" autoComplete="off" spellCheck={false} maxLength={4096} value={draft} onChange={event => setDraft(event.target.value)} disabled={!desktop || busy} placeholder={t("create.promptAssistant.apiKey")} className={INPUT} /></div>
      <button data-assistant-save type="submit" disabled={!desktop || busy || !draft.trim()} className="rounded-xl bg-accent-fill px-4 py-2 text-sm text-accent-fill-foreground disabled:opacity-50">{t("create.promptAssistant.save")}</button>
      <button data-assistant-clear type="button" disabled={!desktop || busy || !status?.configured} onClick={() => void update(true)} className="rounded-xl border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50">{t("create.promptAssistant.clearKey")}</button>
    </form>
    <p className="text-xs text-muted-foreground">{t("create.promptAssistant.keyHint")}</p>
    {status?.protection === "plain" && <p className="text-xs text-amber-600 dark:text-amber-400">{t("settings.agentSection.plainWarning")}</p>}
  </div>;
}

function CustomPromptConnection() {
  const { t } = useTranslation(); const preferences = usePromptAssistantStore(state => state.preferences);
  const [baseUrl, setBaseUrl] = useState(preferences.baseUrl); const [model, setModel] = useState(preferences.customModel);
  const [busy, setBusy] = useState(false);
  const changed = baseUrl.trim() !== preferences.baseUrl || model.trim() !== preferences.customModel;
  const save = async () => {
    setBusy(true);
    try {
      if (!model.trim()) throw new Error("invalid");
      await promptSecretStatus({ provider: "custom", baseUrl: baseUrl.trim() });
      await usePromptAssistantStore.getState().save({ baseUrl: baseUrl.trim(), customModel: model.trim() });
      useToastStore.getState().show(t("create.promptAssistant.saved"));
    } catch (error) { useToastStore.getState().show(assistantError(error)); }
    finally { setBusy(false); }
  };
  return <div className="space-y-3 rounded-xl border border-border p-4">
    <h3 className="text-sm font-medium">{t("create.promptAssistant.customProvider")}</h3>
    <label className="block space-y-1 text-xs">{t("create.promptAssistant.endpoint")}<input data-assistant-endpoint disabled={busy} className={INPUT} value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" /></label>
    <label className="block space-y-1 text-xs">{t("create.promptAssistant.model")}<input data-assistant-model disabled={busy} className={INPUT} value={model} maxLength={200} onChange={event => setModel(event.target.value)} /></label>
    <button data-assistant-connection-save type="button" disabled={busy || !changed} onClick={() => void save()} className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted disabled:opacity-50">{t("settings.promptKeys.saveConnection")}</button>
    {changed ? <p className="text-xs text-muted-foreground">{t("settings.promptKeys.saveFirst")}</p> : <PromptCredentialForm key={preferences.baseUrl} connection={{ provider: "custom", baseUrl: preferences.baseUrl }} />}
  </div>;
}

export function PromptApiKeySetting() {
  const { t } = useTranslation(); const ready = usePromptAssistantStore(state => state.ready);
  useEffect(() => { void usePromptAssistantStore.getState().load().catch(error => useToastStore.getState().show(assistantError(error))); }, []);
  if (!ready) return <p className="text-xs text-muted-foreground">{t("create.promptAssistant.busy")}</p>;
  return <div className="space-y-4">
    <div className="space-y-3 rounded-xl border border-border p-4">
      <h3 className="text-sm font-medium">GLM</h3>
      <p className="text-xs text-muted-foreground">{t("settings.promptKeys.glmHint")}</p>
      <a href="https://docs.bigmodel.cn/cn/guide/start/api-key" target="_blank" rel="noopener noreferrer" className="text-xs text-foreground underline underline-offset-4">{t("create.promptAssistant.docs")}</a>
      <PromptCredentialForm connection={{ provider: "glm", baseUrl: "" }} />
      <p className="text-xs text-muted-foreground">{t("create.promptAssistant.freeHint")}</p>
    </div>
    {/* 提示词助手连接设置：Euzhi 复用原凭据表单，通过参数选择共享的 Agent 分区。 */}
    {/* 明确告知保存与清除会同步作用于 Agent，避免用户以为只是当前输入框的密钥。 */}
    {/* Grok 型号沿用 Agent 选择，不把同一供应商配置拆成两份普通用户数据。 */}
    {/* 与另外两组凭据表单各自挂载 hook：明文草稿、保存中和错误提示不在分区间串用。 */}
    {/* Agent 中已经填过密钥时，这里会读取同一状态，输入框仍保持空白而不回填原值。 */}
    {/* 保存只更换本站密钥，不改变当前提示词助手供应商，查看设置不应自动切站。 */}
    {/* 清除按钮沿用 busy 禁用，不能同时发起保存和清除两种互相覆盖的动作。 */}
    {/* 清除未配置密钥仍不可用，状态读取失败不能假装远端账户已经退出。 */}
    {/* 原凭据表单保留明文降级警示，复用 Agent 存储不意味着所有系统都具备加密能力。 */}
    {/* 链接只携带固定锚点，提示词原稿、预设指令和密钥都不进入 URL。 */}
    {/* #agent 由既有设置分类切换处理，进入后仍显示原站点切换和模型选择器。 */}
    {/* 这里只说明共享的 Grok 选择，不另建会与 Agent 分离的模型文本输入框。 */}
    {/* 相同表单获得明确 euzhi 参数，不能因 Agent 当前是硅基流动就读错凭据。 */}
    {/* 标题使用 Agent 同一服务商词条，名称和语言更新不用两处手工维护。 */}
    {/* 外框沿用设置页现有面板样式，深浅主题和窄屏换行均由原组件负责。 */}
    {/* 新区域不依赖 custom 端点是否有效，错误的自定义地址不会阻止 Euzhi 配置。 */}
    <div className="space-y-3 rounded-xl border border-border p-4">
      <h3 className="text-sm font-medium">{t("agent.providers.euzhi")}</h3>
      <p className="text-xs text-muted-foreground">{t("create.promptAssistant.euzhiShared")}</p>
      <Link href="/settings#agent" className="text-xs text-primary underline">{t("create.promptAssistant.euzhiManage")}</Link>
      <PromptCredentialForm connection={{ provider: "euzhi", baseUrl: "" }} />
    </div>
    <CustomPromptConnection />
  </div>;
}
