"use client";

/** 转译菜单复用级联菜单；三站进入同一个模型弹窗，预设和历史保留原操作。 */

import { useId, useState, type RefObject } from "react";
import { useTranslation } from "@/i18n";
import { usePromptAssistantStore } from "@/stores/usePromptAssistantStore";
import { useToastStore } from "@/stores/useToastStore";
import type { AgentProvider } from "@illusion-realm/shared";
import { AGENT_PROVIDERS, AGENT_PROVIDER_LABELS } from "@/data/agent-providers";
import { CascadeMenu, type CascadeMenuItem } from "@/components/cascade-menu";
import { PresetReader, PresetViewButton, type PresetReading } from "./preset-reader";
import { AssistantImages, type AssistantImageOptions } from "./assistant-images";
import { HoverTip } from "@/components/hover-tip";
import { PROMPT_PRESETS, PROMPT_PRESET_GROUPS, builtInPresetInstruction, preferencesForPrompt, presetName, presetSelectionPatch } from "@/utils/prompt-assistant";
import { MOSS_COMPOSITION_PRESET } from "@/data/moss-composition-instruction";
interface MenuProps { supportsComposition: boolean; mossPresetScope: boolean; images?: AssistantImageOptions; appearance?: "neutral"; anchor: RefObject<HTMLDivElement | null>; onClose: () => void; onHistory: () => void; onModels: (provider: AgentProvider) => void; onConfigure: (mode: "connection" | "preset", presetId?: string) => void }
export function AssistantMenu({ images, appearance, supportsComposition, mossPresetScope, anchor, onClose, onConfigure, onHistory, onModels }: MenuProps) {
  const { t } = useTranslation();
  const readerId = useId();
  const [reading, setReading] = useState<PresetReading | null>(null);
  const storedPreferences = usePromptAssistantStore(state => state.preferences);
  const preferences = preferencesForPrompt(storedPreferences, supportsComposition, mossPresetScope);
  const save = usePromptAssistantStore(state => state.save);
  const choose = (patch: Parameters<typeof save>[0]) => { void save(patch).then(onClose).catch(() => useToastStore.getState().show(t("create.promptAssistant.failed"))); };
  const dismissReading = (restoreFocus: boolean) => {
    setReading(null);
    if (!restoreFocus || !reading) return;
    const trigger = reading.anchor.isConnected ? reading.anchor : anchor.current?.querySelector<HTMLButtonElement>("[data-assistant-options]");
    const restore = () => trigger?.focus({ preventScroll: true });
    // 大阅读页关闭后，菜单先解除不可交互状态，再把焦点交回原入口。
    if (reading.expanded) requestAnimationFrame(restore);
    else restore();
  };
  const toggleReadingSize = () => {
    if (!reading) return;
    const expanded = !reading.expanded;
    if (expanded && !document.querySelector("[data-app-main]")) return;
    const text = document.getElementById(readerId)?.querySelector<HTMLElement>("[data-preset-reader-text]");
    const travel = text ? text.scrollHeight - text.clientHeight : 0;
    // 两种宽度会重新折行，按已读比例恢复位置。
    const progress = text && travel > 0 ? text.scrollTop / travel : reading.progress;
    setReading({ ...reading, expanded, progress });
  };
  // 分类和自定义预设都从实际点到的「查看」定位，并读取同一份完整正文。
  const choosePreset = (id: string) => choose(presetSelectionPatch(id, mossPresetScope));
  const presetItem = (id: string, label: string, instruction: string): CascadeMenuItem => ({
    id,
    label,
    selected: preferences.presetId === id,
    action: () => choosePreset(id),
    hideTooltip: true,
    trailing: <PresetViewButton label={label} readerId={readerId} expandedTrigger={reading?.triggerId}
      onView={(anchor, triggerId) => setReading({ anchor, triggerId, label, instruction, presetId: id })} />,
  });
  const modelName = preferences.provider === "custom" ? preferences.customModel || t("create.promptAssistant.customProvider")
    : preferences.models?.[preferences.provider] || (preferences.provider === "glm" ? preferences.model : t(AGENT_PROVIDER_LABELS[preferences.provider]));
  const presetGroups = PROMPT_PRESET_GROUPS.map(group => ({
    id: `presets-${group.id}`,
    label: t(group.label),
    children: PROMPT_PRESETS.filter(preset => preset.group === group.id
      && (supportsComposition || preset.id !== MOSS_COMPOSITION_PRESET))
      .map(preset => presetItem(preset.id, t(preset.label), builtInPresetInstruction(preset))),
  }));
  const items: CascadeMenuItem[] = [
    { id: "provider", label: t("create.promptAssistant.providerModel"), description: t("create.promptAssistant.provider"), summary: modelName, children: AGENT_PROVIDERS.map(provider => ({
      id: provider, label: t(AGENT_PROVIDER_LABELS[provider]), selected: preferences.provider === provider,
      action: () => onModels(provider),
    })) },
    { id: "presets", label: t("create.promptAssistant.presets"), summary: presetName(preferences), children: [
      ...presetGroups,
      ...preferences.presets.map(preset => ({
        ...presetItem(preset.id, preset.name, preset.instruction),
        edit: () => onConfigure("preset", preset.id),
        editLabel: t("create.promptAssistant.editNamedPreset", { name: preset.name }),
        editTitle: t("create.promptAssistant.editPreset"),
      })),
      { id: "add", label: t("create.promptAssistant.addPreset"), action: () => onConfigure("preset") },
    ] },
    ...(images ? [{ id: "images", label: t("create.promptAssistant.useImages"), content: <AssistantImages {...images} /> }] : []),
  ];
  const footerClass = "rounded-md py-1 text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring";
  return <CascadeMenu anchor={anchor} items={items} appearance="compact" descriptionMode="tooltip" label={t("create.promptAssistant.title")} backLabel={t("create.promptAssistant.back")} onClose={onClose}
    detail={reading ? {
      expanded: reading.expanded, onEscape: reading.expanded ? toggleReadingSize : undefined, onClose: dismissReading,
      content: <PresetReader id={readerId} reading={reading} onToggleSize={toggleReadingSize}
        onClose={() => dismissReading(true)} onUse={() => choosePreset(reading.presetId)} />,
    } : undefined}
    heading={<div className="flex items-center justify-between text-xs"><span>{t("create.promptAssistant.menuTitle")}</span>{images && <span className="text-[10px] text-muted-foreground">{t("create.promptAssistant.currentNode")}</span>}</div>}
    footer={<div className="flex items-center justify-between border-t border-border px-2.5 pb-1 pt-2">
      <HoverTip asChild layer="window" label={t("create.promptAssistant.history.title")}><button type="button" role="menuitem" data-assistant-item="history" className={footerClass} onClick={onHistory}>{t("create.promptAssistant.transcreationHistory")}</button></HoverTip>
      <HoverTip asChild layer="window" label={t("create.promptAssistant.configure")}><button type="button" role="menuitem" data-assistant-item="settings" className={footerClass} onClick={() => onConfigure("connection")}>{t("create.promptAssistant.configure")}</button></HoverTip>
    </div>}
    attributes={{ "data-prompt-assistant-menu": true, ...(appearance === "neutral" ? { "data-canvas-theme": true } : {}) }} />;
}
