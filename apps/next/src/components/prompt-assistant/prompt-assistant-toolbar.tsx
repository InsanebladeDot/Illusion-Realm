"use client";

/** 转译工具栏复用提示卡片和模型弹窗；正文回调、撤销与历史保留原来的输入框边界。 */

import { HoverTip } from "@/components/hover-tip";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Languages, Loader2, SlidersHorizontal, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/i18n";
import { usePromptAssistantStore } from "@/stores/usePromptAssistantStore";
import { useAgentProviderStore } from "@/stores/use-agent-provider-store";
import { useToastStore } from "@/stores/useToastStore";
import { copyText } from "@/utils/charactersFormat";
import { AssistantMenu } from "./assistant-menu";
import { AgentModelDialog } from "@/components/agent-model-dialog";
import type { AgentProvider } from "@illusion-realm/shared";
import { AssistantSettings } from "./assistant-settings";
import { AssistantHistory } from "./assistant-history";
import { usePromptTransform, type PromptTarget } from "./use-prompt-transform";
import { usePromptImages } from "./use-prompt-images";
import { useModelImageCapability } from '@/hooks/use-model-image-capability';
import { imageCapabilityHint, promptModelId } from '@/utils/provider-image-capability';
import { PromptSpeechText } from "@/components/prompt-speech-text";
type ToolbarProps = PromptTarget & {
  appearance?: "neutral";
  // 有画幅就能转译构图 JSON；这个开关只控制快捷入口。
};
export function PromptAssistantToolbar(target: ToolbarProps) {
  const router = useRouter();
  const { t } = useTranslation(); const anchor = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false); const [menu, setMenu] = useState(false); const [settings, setSettings] = useState<string | null>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [modelProvider, setModelProvider] = useState<AgentProvider | null>(null);
  const preferences = usePromptAssistantStore(state => state.preferences);
  const fallbackModel = useAgentProviderStore(state => preferences.provider === 'custom' ? '' : state.preferences.models[preferences.provider]);
  const imageCapability = useModelImageCapability(preferences.provider, promptModelId(preferences, fallbackModel) || undefined);
  const applyModel = async (provider: AgentProvider, model: string) => {
    await usePromptAssistantStore.getState().save(current => ({ provider, model, models: { ...current.models, [provider]: model } }));
  };
  // 查看历史没有写盘工作，无需像批量改名那样阻止用户取消或按 Escape。
  const closeHistory = useCallback(() => { setHistoryOpen(false); anchor.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, []);
  const { input: imageInput, ...images } = usePromptImages(target.contextId, target.imageSources, imageCapability === true);
  // 图片和开关也属于发送快照；等待时换图，应像修改正文一样进入冲突确认。
  const transform = usePromptTransform({ ...target, imageSources: images.enabled ? images.sources : undefined,
    referenceKey: target.imageSources ? JSON.stringify([target.referenceKey, images.enabled, images.sources]) : target.referenceKey });
  const closeMenu = useCallback(() => setMenu(false), []);
  useEffect(() => { void usePromptAssistantStore.getState().load().catch(() => useToastStore.getState().show(t("create.promptAssistant.failed"))); }, [t]);
  const configure = (mode: "connection" | "preset", presetId?: string) => { setMenu(false); if (mode === "connection") router.push("/settings#prompt-keys"); else setSettings(presetId ?? null); };
  const copy = async () => { if (await copyText(target.read())) useToastStore.getState().show(t("create.promptAssistant.copied")); };
  const iconClass = "flex h-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stroke disabled:opacity-40";
  const iconButtonClass = `${iconClass} w-7`;
  const optionsLabel = t("create.promptAssistant.title");
  return <>
    {target.imageSources && <input ref={imageInput} type="file" accept="image/*" multiple hidden disabled={imageCapability !== true} data-assistant-image-input onChange={event => { images.add(event.target.files); event.target.value = ""; }} />}
    <div ref={anchor} data-prompt-assistant={target.contextId} className="absolute bottom-1.5 right-2 flex items-center rounded-full border border-border/50 bg-background/65 p-0.5 shadow-sm backdrop-blur-md" onPointerEnter={() => setExpanded(true)} onPointerLeave={() => setExpanded(false)} onFocus={() => setExpanded(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false); }}>
      <HoverTip asChild label={optionsLabel}>
        <button type="button" data-assistant-options aria-label={optionsLabel} aria-haspopup="menu" aria-expanded={menu}
          className={iconButtonClass}
          onClick={() => setMenu(value => !value)}>
          <SlidersHorizontal size={15} aria-hidden />
        </button>
      </HoverTip>
      <div data-assistant-actions data-expanded={expanded || menu || transform.busy} className={`flex overflow-hidden transition-[max-width,opacity] duration-200 motion-reduce:transition-none ${expanded || menu || transform.busy ? "max-w-24 opacity-100" : "max-w-0 opacity-0"}`} inert={!expanded && !menu && !transform.busy}>
        <HoverTip asChild label={(t("create.promptAssistant.copy")) ?? ""}><button type="button" aria-label={t("create.promptAssistant.copy")} className={iconButtonClass} onClick={() => void copy()}><Copy size={14} /></button></HoverTip>
        <HoverTip asChild label={(t("create.promptAssistant.undo")) ?? ""}><button type="button" data-assistant-undo aria-label={t("create.promptAssistant.undo")} disabled={!transform.canUndo || transform.busy} className={iconButtonClass} onClick={transform.revert}><Undo2 size={14} /></button></HoverTip>
        <HoverTip asChild label={(t(transform.busy ? "create.promptAssistant.busy" : "create.promptAssistant.translate")) ?? ""}><button type="button" data-assistant-translate aria-label={t("create.promptAssistant.translate")} disabled={transform.busy} className={iconButtonClass} onClick={() => void transform.run()}>{transform.busy ? <Loader2 size={15} className="animate-spin" /> : <Languages size={15} />}</button></HoverTip>
      </div>
    </div>
    {menu && <AssistantMenu supportsComposition={!!target.compositionSize} mossPresetScope={!!target.mossPresetScope} images={target.imageSources ? { disabled: imageCapability !== true, disabledReason: imageCapabilityHint(imageCapability), enabled: images.enabled, items: images.items, toggle: images.toggle, upload: images.open, remove: images.remove } : undefined} appearance={target.appearance} anchor={anchor} onClose={closeMenu} onConfigure={configure} onModels={provider => { setMenu(false); setModelProvider(provider); }} onHistory={() => { setMenu(false); setHistoryOpen(true); }} />}
    {modelProvider && <AgentModelDialog provider={modelProvider} models={preferences.models ?? { glm: preferences.model }} onApply={applyModel} onClose={() => setModelProvider(null)} />}
    {historyOpen && <AssistantHistory onClose={closeHistory} />}
    {settings !== undefined && <AssistantSettings presetId={settings ?? undefined} mossPresetScope={!!target.mossPresetScope} onClose={() => setSettings(undefined)} />}
    {transform.pending && <div data-assistant-result className="absolute inset-x-1 bottom-10 z-10 max-h-48 overflow-auto rounded-lg border border-border bg-background/95 p-3 text-xs shadow-lg backdrop-blur-md"><p className="mb-1 font-medium">{t("create.promptAssistant.result")}</p><p className="whitespace-pre-wrap break-words text-muted-foreground"><PromptSpeechText text={transform.pending.after} /></p><div className="mt-2 flex gap-3"><button type="button" onClick={transform.applyPending} className="text-primary">{t("create.promptAssistant.apply")}</button><button type="button" onClick={transform.discard}>{t("create.promptAssistant.discard")}</button></div></div>}
  </>;
}
