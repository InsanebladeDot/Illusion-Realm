"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@/i18n";
import { useToastStore } from "@/stores/useToastStore";
import { usePromptAssistantStore } from "@/stores/usePromptAssistantStore";
import { presetInstruction, transformPrompt } from "@/utils/prompt-assistant";
export interface PromptTarget { contextId: string; read: () => string; write: (value: string) => void }
interface Replacement { contextId: string; before: string; after: string }
export function usePromptTransform(target: PromptTarget) {
  const latest = useRef(target); const locked = useRef(false); const mounted = useRef(true);
  const [busy, setBusy] = useState(false); const [undo, setUndo] = useState<Replacement | null>(null); const [pending, setPending] = useState<Replacement | null>(null);
  useEffect(() => { latest.current = target; });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const notify = (message: string) => useToastStore.getState().show(message);
  const apply = (result: Replacement) => {
    if (latest.current.contextId !== result.contextId) return;
    const before = latest.current.read(); latest.current.write(result.after);
    setUndo({ ...result, before }); setPending(null); notify(t("create.promptAssistant.success"));
  };
  const run = async () => {
    if (locked.current) return; const before = target.read();
    if (!before.trim()) { notify(t("create.promptAssistant.empty")); return; }
    locked.current = true; setBusy(true);
    try {
      await usePromptAssistantStore.getState().load(); const preferences = usePromptAssistantStore.getState().preferences;
      const after = await transformPrompt({ ...preferences, model: preferences.provider === "glm" ? preferences.model : preferences.customModel, text: before, instruction: presetInstruction(preferences) });
      if (!mounted.current) return; const result = { contextId: target.contextId, before, after };
      if (latest.current.contextId === target.contextId && latest.current.read() === before) apply(result);
      else { setPending(result); notify(t("create.promptAssistant.conflict")); }
    } catch (error) { if (mounted.current) notify(error instanceof Error ? error.message : t("create.promptAssistant.failed")); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  const revert = () => {
    if (!undo || undo.contextId !== target.contextId) return;
    if (target.read() !== undo.after) { notify(t("create.promptAssistant.undoConflict")); return; }
    target.write(undo.before); setUndo(null);
  };
  return { busy, run, revert, canUndo: undo?.contextId === target.contextId, pending: pending?.contextId === target.contextId ? pending : null, applyPending: () => { if (pending) apply(pending); }, discard: () => setPending(null) };
}
