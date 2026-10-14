"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Languages, Loader2, SlidersHorizontal, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/i18n";
import { usePromptAssistantStore } from "@/stores/usePromptAssistantStore";
import { useToastStore } from "@/stores/useToastStore";
import { copyText } from "@/utils/charactersFormat";
import { AssistantMenu } from "./assistant-menu";
import { AssistantSettings } from "./assistant-settings";
import { usePromptTransform, type PromptTarget } from "./use-prompt-transform";
export function PromptAssistantToolbar(target: PromptTarget) {
  const router = useRouter();
  const { t } = useTranslation(); const anchor = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false); const [menu, setMenu] = useState(false); const [settings, setSettings] = useState(false);
  const transform = usePromptTransform(target); const closeMenu = useCallback(() => setMenu(false), []);
  useEffect(() => { void usePromptAssistantStore.getState().load().catch(() => useToastStore.getState().show(t("create.promptAssistant.failed"))); }, [t]);
  const configure = (mode: "connection" | "preset") => { setMenu(false); if (mode === "connection") router.push("/settings#prompt-keys"); else setSettings(true); };
  const copy = async () => { if (await copyText(target.read())) useToastStore.getState().show(t("create.promptAssistant.copied")); };
  const iconClass = "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stroke disabled:opacity-40";
  return <>
    <div ref={anchor} data-prompt-assistant={target.contextId} className="absolute bottom-1.5 right-2 flex items-center rounded-full border border-border/50 bg-background/65 p-0.5 shadow-sm backdrop-blur-md" onPointerEnter={() => setExpanded(true)} onPointerLeave={() => setExpanded(false)} onFocus={() => setExpanded(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false); }}>
      <button type="button" data-assistant-options title={t("create.promptAssistant.title")} aria-label={t("create.promptAssistant.title")} aria-haspopup="menu" aria-expanded={menu} className={iconClass} onClick={() => setMenu(value => !value)}><SlidersHorizontal size={15} /></button>
      <div data-assistant-actions data-expanded={expanded || menu || transform.busy} className={`flex overflow-hidden transition-[max-width,opacity] duration-200 motion-reduce:transition-none ${expanded || menu || transform.busy ? "max-w-24 opacity-100" : "max-w-0 opacity-0"}`} inert={!expanded && !menu && !transform.busy}>
        <button type="button" title={t("create.promptAssistant.copy")} aria-label={t("create.promptAssistant.copy")} className={iconClass} onClick={() => void copy()}><Copy size={14} /></button>
        <button type="button" data-assistant-undo title={t("create.promptAssistant.undo")} aria-label={t("create.promptAssistant.undo")} disabled={!transform.canUndo || transform.busy} className={iconClass} onClick={transform.revert}><Undo2 size={14} /></button>
        <button type="button" data-assistant-translate title={t(transform.busy ? "create.promptAssistant.busy" : "create.promptAssistant.translate")} aria-label={t("create.promptAssistant.translate")} disabled={transform.busy} className={iconClass} onClick={() => void transform.run()}>{transform.busy ? <Loader2 size={15} className="animate-spin" /> : <Languages size={15} />}</button>
      </div>
    </div>
    {menu && <AssistantMenu anchor={anchor} onClose={closeMenu} onConfigure={configure} />}
    {settings && <AssistantSettings onClose={() => setSettings(false)} />}
    {transform.pending && <div data-assistant-result className="absolute inset-x-1 bottom-10 z-10 max-h-48 overflow-auto rounded-lg border border-border bg-background/95 p-3 text-xs shadow-lg backdrop-blur-md"><p className="mb-1 font-medium">{t("create.promptAssistant.result")}</p><p className="whitespace-pre-wrap break-words text-muted-foreground">{transform.pending.after}</p><div className="mt-2 flex gap-3"><button type="button" onClick={transform.applyPending} className="text-primary">{t("create.promptAssistant.apply")}</button><button type="button" onClick={transform.discard}>{t("create.promptAssistant.discard")}</button></div></div>}
  </>;
}
