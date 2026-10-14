"use client";

/** Prompt credentials share the encrypted IPC facade; changing endpoints resets the key draft. */
import { useEffect, useState } from "react";
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
    <CustomPromptConnection />
  </div>;
}
