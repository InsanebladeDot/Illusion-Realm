"use client";

import { useState } from "react";
import {
  Check,
  Info,
  Settings,
} from "lucide-react";
import {
  CFG_MAX,
  CFG_MIN,
  CFG_STEP,
  RANDOM_SEED,
  SAMPLERS,
  SCHEDULERS,
  SEED_MAX,
  SEED_MIN,
  STEPS_MAX,
  STEPS_MIN,
} from "@/data/createForm";
import { DEFAULT_PRESET_ID, findPresetInAll } from "@/data/presetPrompts";
import type { PresetPromptOption } from "@/types/presetPrompt";
import { useCreateFormStore } from "@/stores/useCreateFormStore";
import { useTranslation } from "@/i18n";
import { PresetPromptDialog } from "@/view/create/PresetPromptDialog";
import { GenerationParameterControl } from "@/view/create/generation-parameter-control";
import { AdvancedSettingsSection } from "./advanced-settings-section";
import { OptionSelect } from "@/view/create/OptionSelect";
import { getImageWorkflowDefaults } from "@/utils/comfy/imageWorkflow";
import { clampSeed, generateRandomSeed } from "@/utils/seed";
import { ACCENT_FOCUS_RING_CLASS, INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

export function AdvancedSettings({ series = "anima" }: { series?: "anima" | "sdxl" }) {
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

  const resolvedSeed = seedMode === "random" ? RANDOM_SEED : customSeed;

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
      <AdvancedSettingsSection className="hidden md:block">
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

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">
                {t("create.advancedSettings.sampler")}
              </label>
              <button
                type="button"
                className="focus:outline-none"
                aria-label={t("create.advancedSettings.samplerHint")}
              >
                <Info className="h-4 w-4 cursor-pointer text-muted-foreground opacity-80 hover:text-foreground hover:opacity-100" />
              </button>
            </div>
            <OptionSelect
              value={sampler}
              options={SAMPLERS}
              ariaLabel={t("create.advancedSettings.sampler")}
              onChange={(value) => setAdvancedSettings({ sampler: value })}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">
                {t("create.advancedSettings.scheduler")}
              </label>
              <button
                type="button"
                className="focus:outline-none"
                aria-label={t("create.advancedSettings.schedulerHint")}
              >
                <Info className="h-4 w-4 cursor-pointer text-muted-foreground opacity-80 hover:text-foreground hover:opacity-100" />
              </button>
            </div>
            <OptionSelect
              value={scheduler}
              options={SCHEDULERS}
              ariaLabel={t("create.advancedSettings.scheduler")}
              onChange={(value) => setAdvancedSettings({ scheduler: value })}
            />
          </div>

          {/* 界面：「步数 / CFG 比例」整行与视频生成参数共用 */}
          <GenerationParameterControl
            name="steps" label={t("create.advancedSettings.steps")} hint={t("create.advancedSettings.stepsHint")}
            min={STEPS_MIN} max={STEPS_MAX} value={steps}
            onChange={(value) => setAdvancedSettings({ steps: value })}
          />
          <GenerationParameterControl
            name="cfg" label={t("create.advancedSettings.cfgRatio")} hint={t("create.advancedSettings.cfgHint")}
            inputAriaLabel="CFG" min={CFG_MIN} max={CFG_MAX} step={CFG_STEP} value={cfg} precision={1}
            onChange={(value) => setAdvancedSettings({ cfg: value })}
          />

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">
                {t("create.advancedSettings.seed")}
              </label>
              <button
                type="button"
                className="focus:outline-none"
                aria-label={t("create.advancedSettings.seedHint")}
              >
                <Info className="h-4 w-4 cursor-pointer text-muted-foreground opacity-80 hover:text-foreground hover:opacity-100" />
              </button>
            </div>
            <div className="flex min-w-0 gap-1">
              <div className="grid min-w-0 flex-1 grid-cols-2 rounded-md border border-transparent bg-muted p-0.5 shadow-none dark:border-border dark:bg-background">
                <button
                  type="button"
                  onClick={() => handleSeedModeChange("random")}
                  className={cn(
                    "rounded-sm text-sm transition-colors",
                    seedMode === "random"
                      ? "bg-background text-foreground shadow-sm dark:bg-muted"
                      : "bg-transparent text-muted-foreground"
                  )}
                >
                  {t("create.advancedSettings.random")}
                </button>
                <button
                  type="button"
                  onClick={() => handleSeedModeChange("custom")}
                  className={cn(
                    "rounded-sm text-sm transition-colors",
                    seedMode === "custom"
                      ? "bg-background text-foreground shadow-sm dark:bg-muted"
                      : "bg-transparent text-muted-foreground"
                  )}
                >
                  {t("create.advancedSettings.custom")}
                </button>
              </div>
              <input
                type="number"
                min={SEED_MIN}
                max={SEED_MAX}
                placeholder={
                  seedMode === "random"
                    ? t("create.advancedSettings.random")
                    : t("create.advancedSettings.seedPlaceholder")
                }
                value={seedMode === "custom" ? customSeed : ""}
                disabled={seedMode === "random"}
                onChange={(event) => handleCustomSeedChange(event.target.value)}
                aria-label={t("create.advancedSettings.seed")}
                data-seed-value={resolvedSeed}
                className={cn(
                  "h-9 min-w-0 flex-1 rounded-md bg-background text-sm shadow-none focus-visible:outline-none focus-visible:ring-1",
                  ACCENT_FOCUS_RING_CLASS,
                  INPUT_BORDER_CLASS
                )}
              />
            </div>
          </div>
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
