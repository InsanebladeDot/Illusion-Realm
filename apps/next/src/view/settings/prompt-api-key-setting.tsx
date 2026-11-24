"use client";
import { HoverTip } from "@/components/hover-tip";


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

import { euzhiImageKeyStatus, saveEuzhiImageKey, clearEuzhiImageKey } from "@/utils/euzhi-images";

// 图片使用独立凭据动作，字段与错误恢复继续复用原表单，不能读 Agent 的同名站点。
type CredentialConnection = PromptConnection | { provider: "euzhi-images"; baseUrl: "" };
const INPUT = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";
function usePromptCredential(connection: CredentialConnection) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<PromptSecretStatus | null>(null);
  const [draft, setDraft] = useState(""); const [busy, setBusy] = useState(false);
  const { provider, baseUrl } = connection;
  useEffect(() => {
    let active = true;
    void (provider === "euzhi-images" ? euzhiImageKeyStatus() : promptSecretStatus({ provider, baseUrl })).then(value => { if (active) setStatus(value); })
      .catch(error => { if (active) useToastStore.getState().show(assistantError(error)); });
    return () => { active = false; };
  }, [provider, baseUrl]);
  const update = async (clear: boolean) => {
    setBusy(true);
    try {
      setStatus(connection.provider === "euzhi-images"
        ? clear ? await clearEuzhiImageKey() : await saveEuzhiImageKey(draft)
        : clear ? await clearPromptSecret(connection) : await savePromptSecret(connection, draft));
      setDraft(""); useToastStore.getState().show(t(clear ? "create.promptAssistant.deletedKey" : "create.promptAssistant.saved"));
    } catch (error) { useToastStore.getState().show(assistantError(error)); }
    finally { setBusy(false); }
  };
  return { status, draft, setDraft, busy, update };
}

function PromptCredentialForm({ connection }: { connection: CredentialConnection }) {
  const { t } = useTranslation(); const desktop = useIsElectronEnvironment();
  const { status, draft, setDraft, busy, update } = usePromptCredential(connection);
  return <div className="space-y-3" data-prompt-key-provider={connection.provider}>
    <HoverTip asChild layer="window" label={(t(status?.configured ? "create.promptAssistant.keyConfigured" : "create.promptAssistant.keyMissing")) ?? ""}><p data-prompt-key-status={status?.configured ? "configured" : "missing"} className="text-xs text-muted-foreground">{status?.configured ? t("settings.agentSection.statusConfigured", { tail: status.tail }) : t("create.promptAssistant.keyMissing")}</p></HoverTip>
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

function LegacyCustomConnection() {
  const provider = usePromptAssistantStore(state => state.preferences.provider);
  return provider === "custom" ? <CustomPromptConnection /> : null;
}

export function PromptApiKeySetting() {
  const { t } = useTranslation(); const ready = usePromptAssistantStore(state => state.ready);
  useEffect(() => { void usePromptAssistantStore.getState().load().catch(error => useToastStore.getState().show(assistantError(error))); }, []);
  if (!ready) return <p className="text-xs text-muted-foreground">{t("create.promptAssistant.busy")}</p>;
  return <div className="space-y-4">
    {/* 命名供应商统一到 Agent 配置；原自定义端点只为已有配置保留。 */}
    <p className="text-xs text-muted-foreground">{t("create.promptAssistant.sharedProviders")}</p>
    <Link href="/settings#agent" className="text-xs text-primary underline">{t("create.promptAssistant.manageProviders")}</Link>
    <LegacyCustomConnection />
  </div>;
}

// 设置页：同一个凭据表单接入图片专用分区，两个表单的草稿和 busy 各自独立。
// 说明保存仅发生在本机，不把“保存成功”误写成已经远端鉴权通过。
export function EuzhiImageApiKeySetting() {
  const { t } = useTranslation();
  return <div className="space-y-3" data-euzhi-image-key>
    <p className="text-xs text-muted-foreground">{t("settings.euzhiImages.description")}</p>
    {/* 图片生成设置：价格由站点和令牌分组决定，直接查看官方定价。 */}
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground">
      <a href="https://euzhi.vip/docs#image2" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{t("create.promptAssistant.docs")}</a>
      <a href="https://euzhi.vip/pricing" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{t("settings.euzhiImages.pricing")}</a>
    </div>
    <PromptCredentialForm connection={{ provider: "euzhi-images", baseUrl: "" }} />
  </div>;
}
