"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
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
import { RangeSlider } from "@/view/create/RangeSlider";
import { OptionSelect } from "@/view/create/OptionSelect";
import { getImageWorkflowDefaults } from "@/utils/comfy/imageWorkflow";
import { clampSeed, generateRandomSeed } from "@/utils/seed";
import { ACCENT_FOCUS_RING_CLASS, INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

export function AdvancedSettings({ series = "anima" }: { series?: "anima" | "sdxl" }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
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
    <div
      className={cn(
        "hidden min-w-0 w-full max-w-full overflow-hidden rounded-xl md:block",
        open && "bg-muted/30 dark:bg-muted/20"
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "inline-flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
          open && "rounded-b-none"
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Settings className="h-4 w-4 shrink-0" />
          <span className="truncate">{t("create.advancedSettings.title")}</span>
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-4 px-3 pb-3 pt-2">
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

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">
                {t("create.advancedSettings.steps")}
              </label>
              <button
                type="button"
                className="focus:outline-none"
                aria-label={t("create.advancedSettings.stepsHint")}
              >
                <Info className="h-4 w-4 cursor-pointer text-muted-foreground opacity-80 hover:text-foreground hover:opacity-100" />
              </button>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <RangeSlider
                min={STEPS_MIN}
                max={STEPS_MAX}
                value={steps}
                onChange={(value) => setAdvancedSettings({ steps: value })}
              />
              <input
                type="number"
                min={STEPS_MIN}
                max={STEPS_MAX}
                aria-label={t("create.advancedSettings.steps")}
                value={steps}
                onChange={(event) =>
                  setAdvancedSettings({
                    steps: Math.min(
                      STEPS_MAX,
                      Math.max(STEPS_MIN, Number(event.target.value))
                    ),
                  })
                }
                className={cn(
                  "h-8 w-16 shrink-0 rounded-md bg-background text-center text-sm shadow-none focus-visible:outline-none focus-visible:ring-1",
                  ACCENT_FOCUS_RING_CLASS,
                  INPUT_BORDER_CLASS
                )}
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">
                {t("create.advancedSettings.cfgRatio")}
              </label>
              <button
                type="button"
                className="focus:outline-none"
                aria-label={t("create.advancedSettings.cfgHint")}
              >
                <Info className="h-4 w-4 cursor-pointer text-muted-foreground opacity-80 hover:text-foreground hover:opacity-100" />
              </button>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <RangeSlider
                min={CFG_MIN}
                max={CFG_MAX}
                step={CFG_STEP}
                value={cfg}
                onChange={(value) => setAdvancedSettings({ cfg: value })}
              />
              <input
                type="number"
                min={CFG_MIN}
                max={CFG_MAX}
                step={CFG_STEP}
                aria-label="CFG"
                value={cfg.toFixed(1)}
                onChange={(event) =>
                  setAdvancedSettings({
                    cfg: Math.min(
                      CFG_MAX,
                      Math.max(CFG_MIN, Number(event.target.value))
                    ),
                  })
                }
                className={cn(
                  "h-8 w-16 shrink-0 rounded-md bg-background text-center text-sm shadow-none focus-visible:outline-none focus-visible:ring-1",
                  ACCENT_FOCUS_RING_CLASS,
                  INPUT_BORDER_CLASS
                )}
              />
            </div>
          </div>

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
          </div>
        </div>
      </div>

      <PresetPromptDialog
        open={presetDialogOpen}
        selectedPresetId={selectedPresetId}
        customPresets={customPresets}
        onCustomPresetsChange={setCustomPresets}
        onOpenChange={setPresetDialogOpen}
        onSave={setSelectedPresetId}
      />
    </div>
  );
}
