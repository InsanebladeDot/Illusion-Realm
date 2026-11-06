"use client";

import { useState, type ReactNode } from "react";
import {
  Check,
  Info,
  Settings,
} from "lucide-react";
import { DEFAULT_PRESET_ID, findPresetInAll } from "@/data/presetPrompts";
import type { PresetPromptOption } from "@/types/presetPrompt";
import { useCreateFormStore } from "@/stores/useCreateFormStore";
import { useTranslation } from "@/i18n";
import { PresetPromptDialog } from "@/view/create/PresetPromptDialog";
// 采样器到种子直接复用完整字段块，普通图片继续拥有自己的表单状态。
// 共用组件不决定工作流默认值，当前系列模板仍由本层读取。
// 原图预设选择与保存弹窗保留，不随参数块抽取而重置。
import { GenerationSamplingFields } from "./generation-sampling-fields";
import { AdvancedSettingsSection } from "./advanced-settings-section";
import { getImageWorkflowDefaults } from "@/utils/comfy/imageWorkflow";
import { clampSeed, generateRandomSeed } from "@/utils/seed";
import { cn } from "@/utils/cn";

export function AdvancedSettings({ series = "anima", children }: { series?: "anima" | "sdxl"; children?: ReactNode }) {
  const { t } = useTranslation();
  const [usePreset, setUsePreset] = useState(true);
  const samplerOverride = useCreateFormStore((state) => state.sampler);
  const schedulerOverride = useCreateFormStore((state) => state.scheduler);
  /** 未自定义时显示当前系列工作流模板自带的采样器 / 调度器 */
  const workflowDefaults = getImageWorkflowDefaults(series);
  const sampler = samplerOverride ?? workflowDefaults.samplerName;
  const scheduler = schedulerOverride ?? workflowDefaults.scheduler;
  const steps = useCreateFormStore((state) => state.steps);
  const cfg = useCreateFormStore((state) => state.cfg);
  const seedMode = useCreateFormStore((state) => state.seedMode);
  const customSeed = useCreateFormStore((state) => state.customSeed);
  const setAdvancedSettings = useCreateFormStore(
    (state) => state.setAdvancedSettings
  );
  const [selectedPresetId, setSelectedPresetId] = useState(DEFAULT_PRESET_ID);
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [customPresets, setCustomPresets] = useState<
    Record<string, PresetPromptOption[]>
  >({});

  const selectedPreset =
    findPresetInAll(selectedPresetId, customPresets) ??
    findPresetInAll(DEFAULT_PRESET_ID, customPresets)!;


  const handleSeedModeChange = (mode: "random" | "custom") => {
    setAdvancedSettings({
      seedMode: mode,
      ...(mode === "custom" ? { customSeed: generateRandomSeed() } : {}),
    });
  };

  const handleCustomSeedChange = (raw: string) => {
    if (raw === "") return;
    setAdvancedSettings({ customSeed: clampSeed(Number(raw)) });
  };

  return (
    <>
      {/* 界面：「高级设置」图片与视频共用折叠外壳 */}
      <AdvancedSettingsSection>
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium">
                {t("create.advancedSettings.presetPrompt")}
              </label>
              <button
                type="button"
                className="focus:outline-none"
                aria-label={t("create.advancedSettings.presetPromptHint")}
              >
                <Info className="h-4 w-4 cursor-pointer text-muted-foreground opacity-80 hover:text-primary hover:opacity-100" />
              </button>
            </div>
            <div className="flex items-center space-x-2 pb-1">
              <button
                type="button"
                role="checkbox"
                aria-checked={usePreset}
                onClick={() => setUsePreset((prev) => !prev)}
                className={cn(
                  "peer flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  usePreset && "bg-primary text-primary-foreground"
                )}
              >
                {usePreset && <Check className="h-3 w-3" />}
              </button>
              <label className="text-sm font-normal leading-none">
                {t("create.advancedSettings.usePreset")}
              </label>
            </div>
            <div className="w-full min-w-0 space-y-1.5 rounded-md bg-muted/50 p-2 text-left text-[11px] text-muted-foreground">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[10px] font-medium text-foreground/70">
                  {t("create.advancedSettings.inUse")}{" "}
                  <span className="text-foreground/90">{selectedPreset.name}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setPresetDialogOpen(true)}
                  className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Settings className="h-3 w-3" />
                  {t("create.advancedSettings.edit")}
                </button>
              </div>
              <div className="space-y-0.5">
                <p className="line-clamp-1">
                  <span className="font-medium text-foreground/70">
                    {t("create.advancedSettings.positivePrefix")}
                  </span>{" "}
                  {selectedPreset.positivePrefix}
                </p>
                <p className="line-clamp-1">
                  <span className="font-medium text-foreground/70">
                    {t("create.advancedSettings.negativePrefix")}
                  </span>{" "}
                  {selectedPreset.negativePrefix}
                </p>
              </div>
            </div>
          </div>

          {/* 界面：采样器、调度器、滑条及种子与编辑工作区复用整个参数块。 */}
          {/* 普通图片仍使用原领域 store，组件复用不混用两个模式的草稿。 */}
          {/* 随机模式保持原提交路径，实际种子仍由生成器逐张产生。 */}
          <GenerationSamplingFields sampler={sampler} scheduler={scheduler} steps={steps} cfg={cfg} seed={String(customSeed)} seedMode={seedMode} onSampler={sampler => setAdvancedSettings({ sampler })} onScheduler={scheduler => setAdvancedSettings({ scheduler })} onSteps={steps => setAdvancedSettings({ steps })} onCfg={cfg => setAdvancedSettings({ cfg })} onSeed={handleCustomSeedChange} onSeedMode={handleSeedModeChange} />
          {/* 界面：图片模式特有的高级选项，由创建页提供状态。 */}
          {children}
      </AdvancedSettingsSection>

      <PresetPromptDialog
        open={presetDialogOpen}
        selectedPresetId={selectedPresetId}
        customPresets={customPresets}
        onCustomPresetsChange={setCustomPresets}
        onOpenChange={setPresetDialogOpen}
        onSave={setSelectedPresetId}
      />
    </>
  );
}
