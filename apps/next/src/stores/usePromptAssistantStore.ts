"use client";

/** Non-secret assistant preferences use the existing user document; load once and preserve custom instructions. */
import { create } from "zustand";
import type { PromptAssistantPreferences } from "@illusion-realm/shared";
import { PROMPT_DEFAULTS } from "@/utils/prompt-assistant";
import { createUserDataSectionPersistStorage, flushUserDataSave } from "@/utils/userDataStorage";
interface AssistantState { preferences: PromptAssistantPreferences; ready: boolean; load: () => Promise<void>; save: (patch: Partial<PromptAssistantPreferences>) => Promise<void> }
const storage = createUserDataSectionPersistStorage<PromptAssistantPreferences>("promptAssistant");
let loading: Promise<void> | null = null;
function normalize(value: Partial<PromptAssistantPreferences> | undefined): PromptAssistantPreferences {
  return { ...PROMPT_DEFAULTS, provider: value?.provider === "custom" ? "custom" : "glm",
    baseUrl: typeof value?.baseUrl === "string" ? value.baseUrl : PROMPT_DEFAULTS.baseUrl,
    model: typeof value?.model === "string" ? value.model : PROMPT_DEFAULTS.model,
    customModel: typeof value?.customModel === "string" ? value.customModel : "",
    presetId: typeof value?.presetId === "string" ? value.presetId : "translate",
    presets: Array.isArray(value?.presets) ? value.presets.filter(item => item && typeof item.id === "string" && typeof item.name === "string" && typeof item.instruction === "string").slice(0, 50) : [] };
}
export const usePromptAssistantStore = create<AssistantState>((set, get) => ({
  preferences: PROMPT_DEFAULTS, ready: false,
  load: () => {
    if (!loading) loading = (async () => { try { const value = await storage.getItem("promptAssistant"); set({ preferences: normalize(value?.state), ready: true }); } catch (error) { loading = null; throw error; } })();
    return loading;
  },
  save: async patch => {
    if (!get().ready) await get().load();
    const previous = get().preferences; const preferences = normalize({ ...previous, ...patch });
    try { await storage.setItem("promptAssistant", { state: preferences }); await flushUserDataSave(); set({ preferences }); }
    catch (error) { await storage.setItem("promptAssistant", { state: previous }); throw error; }
  },
}));
