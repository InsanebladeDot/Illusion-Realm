"use client";

/** 界面：内容访问开关；协议确认复用文档弹窗，确认前不写入偏好。 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DocumentDialog } from "@/components/DocumentDialog";
import { useTranslation } from "@/i18n";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { CONTENT_AGREEMENT_VERSION } from "@/types/content-access";

function useAgreementFocus(onClose: () => void) {
  useEffect(() => {
    const dialog = document.getElementById("civitai-content-agreement")?.closest<HTMLElement>('[role="dialog"]');
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.querySelector<HTMLElement>("button")?.focus();
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab" || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled)"));
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keyDown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", keyDown); trigger?.focus({ preventScroll: true }); };
  }, [onClose]);
}

function ContentAgreement({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [acknowledged, setAcknowledged] = useState(false);
  const accept = useSettingsStore((state) => state.acceptCivitaiContentAgreement);
  useAgreementFocus(onClose);
  return createPortal(<DocumentDialog open eyebrow={t("settings.contentAccess.title")} title={t("settings.contentAccess.agreementTitle")} titleId="civitai-content-agreement" onClose={onClose}
    footer={<><button type="button" onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm hover:bg-muted">{t("common.cancel")}</button><button data-nsfw-accept type="button" disabled={!acknowledged} onClick={() => { if (acknowledged) { accept(); onClose(); } }} className="rounded-xl bg-accent-fill px-4 py-2 text-sm text-accent-fill-foreground hover:bg-accent-fill/90 disabled:cursor-not-allowed disabled:opacity-50">{t("settings.contentAccess.accept")}</button></>}>
    <div className="space-y-4 text-sm leading-relaxed">
      <p className="text-xs text-muted-foreground">{t("settings.contentAccess.agreementVersion", { version: CONTENT_AGREEMENT_VERSION })}</p>
      {(["settings.contentAccess.age", "settings.contentAccess.content", "settings.contentAccess.lawful", "settings.contentAccess.scope"] as const).map((key) => <p key={key}>{t(key)}</p>)}
      <label className="flex items-start gap-3 rounded-xl bg-muted/50 p-3"><input data-nsfw-acknowledge type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1 shrink-0 accent-[var(--accent-fill)]" />{t("settings.contentAccess.acknowledge")}</label>
    </div>
  </DocumentDialog>, document.body);
}

export function CivitaiContentSetting() {
  const { t } = useTranslation();
  const enabled = useSettingsStore((state) => state.civitaiContentAccess.enabled);
  const disable = useSettingsStore((state) => state.disableCivitaiNsfw);
  const [open, setOpen] = useState(false);
  return <div className="space-y-3">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0"><p id="civitai-nsfw-label" className="text-sm font-medium">{t("settings.contentAccess.label")}</p><p id="civitai-nsfw-description" className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("settings.contentAccess.description")}</p></div>
      <button data-nsfw-toggle type="button" role="switch" aria-checked={enabled} aria-labelledby="civitai-nsfw-label" aria-describedby="civitai-nsfw-description" onClick={() => { if (enabled) disable(); else setOpen(true); }} className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${enabled ? "bg-accent-fill" : "bg-muted-foreground/30"}`}><span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background shadow-sm transition-transform ${enabled ? "translate-x-5" : "translate-x-0"}`} /></button>
    </div>
    <button type="button" onClick={() => setOpen(true)} className="text-xs text-primary underline-offset-4 hover:underline">{t("settings.contentAccess.viewAgreement")}</button>
    {/* 弹窗：NSFW 内容访问协议；每次打开重新勾选，不沿用上次草稿。 */}
    {open && <ContentAgreement onClose={() => setOpen(false)} />}
  </div>;
}
