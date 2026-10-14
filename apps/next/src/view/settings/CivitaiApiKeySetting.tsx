"use client";

/** Settings control for the Civitai download credential; the renderer handles only a masked status. */
import { useEffect, useState } from "react";
import { ExternalLink, Eye, EyeOff } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useToastStore } from "@/stores/useToastStore";
import { useIsElectronEnvironment } from "@/hooks/useIsElectronEnvironment";
import { clearCivitaiKey, getCivitaiKeyStatus, setCivitaiKey, type CivitaiKeyStatus } from "@/utils/electronBridge";
import { INPUT_BORDER_CLASS } from "@/utils/layout";

const EMPTY: CivitaiKeyStatus = { configured: false, protection: "", tail: "" };
function useCivitaiCredential() {
  const { t } = useTranslation();
  const toast = useToastStore((state) => state.show);
  const [status, setStatus] = useState(EMPTY);
  const [draft, setDraft] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; void getCivitaiKeyStatus().then((value) => { if (active) setStatus(value); }).catch(() => undefined); return () => { active = false; }; }, []);
  async function save() {
    if (!draft.trim()) return;
    setBusy(true);
    try { setStatus(await setCivitaiKey(draft)); setDraft(""); setRevealed(false); toast(t("settings.civitai.saved"), "success"); }
    catch { toast(t("settings.civitai.saveFailed"), "error"); }
    finally { setBusy(false); }
  }
  async function clear() {
    setBusy(true);
    try { setStatus(await clearCivitaiKey()); toast(t("settings.civitai.cleared"), "success"); }
    catch { toast(t("settings.civitai.saveFailed"), "error"); }
    finally { setBusy(false); }
  }
  return { status, draft, setDraft, revealed, setRevealed, busy, save, clear };
}

export function CivitaiApiKeySetting() {
  const { t } = useTranslation();
  const desktop = useIsElectronEnvironment();
  const { status, draft, setDraft, revealed, setRevealed, busy, save, clear } = useCivitaiCredential();
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">{t("settings.civitai.description")}</p>
    <a href="https://civitai.com/user/account" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-sky-600 hover:underline dark:text-sky-400">{t("settings.civitai.openAccount")}<ExternalLink size={12} /></a>
    <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{t("settings.civitai.steps")}</p>
    <div data-civitai-key-status={status.configured ? "configured" : "missing"} className="flex items-center gap-2 text-xs text-muted-foreground"><span className={`h-2 w-2 shrink-0 rounded-full ${status.configured ? "bg-green-500" : "bg-amber-500"}`} />{status.configured ? t("settings.civitai.configured", { tail: status.tail }) : t("settings.civitai.missing")}</div>
    {/* 界面：Civitai 下载密钥；只显示输入草稿，保存后清空。 */}
    <form onSubmit={(event) => { event.preventDefault(); if (desktop && !busy) void save(); }} className="flex flex-wrap gap-2">
      <div className="relative min-w-0 basis-full sm:basis-auto sm:flex-1">
        <input id="civitai-api-key" aria-label={t("settings.civitai.placeholder")} value={draft} onChange={(event) => setDraft(event.target.value)} type={revealed ? "text" : "password"} maxLength={4096} autoComplete="off" spellCheck={false} disabled={!desktop || busy} placeholder={t("settings.civitai.placeholder")} className={`h-10 w-full rounded-xl bg-background px-3 pr-10 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${INPUT_BORDER_CLASS}`} />
        <button type="button" aria-label={revealed ? t("settings.civitai.hide") : t("settings.civitai.show")} onClick={() => setRevealed((value) => !value)} className="absolute right-1 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground hover:bg-muted">{revealed ? <EyeOff size={16} /> : <Eye size={16} />}</button>
      </div>
      <button data-civitai-key-save type="submit" disabled={!desktop || busy || !draft.trim()} className="rounded-xl bg-accent-fill px-4 py-2 text-sm text-accent-fill-foreground transition-colors hover:bg-accent-fill/90 disabled:opacity-50">{t("settings.civitai.save")}</button>
      <button data-civitai-key-clear type="button" disabled={!desktop || busy || !status.configured} onClick={() => { void clear(); }} className="rounded-xl border border-border px-4 py-2 text-sm transition-colors hover:bg-muted disabled:opacity-50">{t("settings.civitai.clear")}</button>
    </form>
    {status.protection === "plain" && <p className="text-xs text-amber-600 dark:text-amber-400">{t("settings.civitai.plainWarning")}</p>}
  </div>;
}
