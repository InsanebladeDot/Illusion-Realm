"use client";

import { useState } from "react";
import { ResourceDialogShell } from "@/components/ResourceDialogShell";
import { useTranslation } from "@/i18n";
import { usePromptAssistantStore } from "@/stores/usePromptAssistantStore";
import { useToastStore } from "@/stores/useToastStore";
import { assistantError } from "@/utils/prompt-assistant";
const INPUT = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent-stroke";
export function AssistantSettings({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(); const preferences = usePromptAssistantStore(state => state.preferences);
  const [busy, setBusy] = useState(false); const [name, setName] = useState(""); const [instruction, setInstruction] = useState("");
  const submit = async () => {
    setBusy(true);
    try {
      if (!name.trim() || !instruction.trim()) throw new Error("presetInvalid"); const id = crypto.randomUUID();
      await usePromptAssistantStore.getState().save({ presetId: id, presets: [...preferences.presets, { id, name: name.trim(), instruction: instruction.trim() }] });
      useToastStore.getState().show(t("create.promptAssistant.presetSaved")); onClose();
    } catch (error) { useToastStore.getState().show(error instanceof Error && error.message === "presetInvalid" ? t("create.promptAssistant.presetInvalid") : assistantError(error)); }
    finally { setBusy(false); }
  };
  return <ResourceDialogShell open title={t("create.promptAssistant.addPreset")} titleId="prompt-assistant-settings" onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <form className="mx-auto max-w-xl space-y-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label className="block space-y-1 text-sm">{t("create.promptAssistant.presetName")}<input data-assistant-preset-name autoFocus value={name} maxLength={80} onChange={event => setName(event.target.value)} className={INPUT} required /></label>
      <label className="block space-y-1 text-sm">{t("create.promptAssistant.instruction")}<textarea data-assistant-preset-instruction value={instruction} maxLength={8000} rows={7} onChange={event => setInstruction(event.target.value)} className={INPUT} required /></label>
      <div className="flex justify-end"><button data-assistant-save type="submit" disabled={busy} className="rounded-lg bg-accent-fill px-5 py-2 text-sm text-accent-fill-foreground disabled:opacity-50">{t(busy ? "create.promptAssistant.busy" : "create.promptAssistant.save")}</button></div>
    </form>
  </ResourceDialogShell>;
}
