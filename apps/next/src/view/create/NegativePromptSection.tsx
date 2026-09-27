"use client";

import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { CollapsiblePanel } from "@/components/CollapsiblePanel";
import {
  BUILTIN_NEGATIVE_PRESETS,
  DEFAULT_NEGATIVE_PRESET_ID,
} from "@/data/negativePresetPrompts";
import { useNegativePresetStore } from "@/stores/useNegativePresetStore";
import { useTranslation } from "@/i18n";
import { readEditableText, setEditableText } from "@/utils/promptEditor";
import { NegativePromptPresetDialog } from "@/view/create/NegativePromptPresetDialog";
import { PromptCollapseButton } from "@/view/create/PromptCollapseButton";
import {
  ACCENT_FOCUS_RING_CLASS,
  INPUT_BORDER_CLASS,
  PROMPT_EDITOR_SCROLL_CLASS,
} from "@/utils/layout";
import { cn } from "@/utils/cn";

/** 反向提示词编辑器 id（生成时按 id 读取内容） */
export const NEGATIVE_PROMPT_EDITOR_ID = "negative-prompt-editor";

/**
 * 反向提示词区域：
 * - 输入框限高 + 可滚动 + 隐藏滚动条
 * - 顶部提供「反向提示词预设」入口（样式与高级设置里的预设提示词卡片一致）
 * - 选择预设后直接写入输入框，仍可手动修改
 */
export function NegativePromptSection() {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const lastPresetId = useNegativePresetStore((state) => state.lastPresetId);
  const rememberPreset = useNegativePresetStore((state) => state.rememberPreset);
  const customPresets = useNegativePresetStore((state) => state.customPresets);
  const [activePresetId, setActivePresetId] = useState(
    lastPresetId ?? DEFAULT_NEGATIVE_PRESET_ID
  );

  const allPresets = [...BUILTIN_NEGATIVE_PRESETS, ...customPresets];
  const activePreset = allPresets.find((preset) => preset.id === activePresetId);

  /** 首次进入：把默认预设填进输入框（用户此前手动写过内容时不覆盖） */
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (readEditableText(NEGATIVE_PROMPT_EDITOR_ID)) return;
      const preset =
        allPresets.find((item) => item.id === (lastPresetId ?? DEFAULT_NEGATIVE_PRESET_ID)) ??
        BUILTIN_NEGATIVE_PRESETS[0];
      if (preset?.negative) {
        setEditableText(NEGATIVE_PROMPT_EDITOR_ID, preset.negative);
      }
    });
    return () => window.cancelAnimationFrame(frame);
    // 仅在挂载时执行一次：之后的修改以输入框内容为准
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label className="hidden text-sm font-medium md:block">
            {t("create.negativePromptSection.title")}
          </label>
          <PromptCollapseButton
            collapsed={collapsed}
            onToggle={() => setCollapsed((prev) => !prev)}
            label={t("create.negativePromptSection.title")}
          />
        </div>

        {/* 收起 / 展开：内容不卸载（反向提示词的预设内容不随 React 状态保存），
            用 CollapsiblePanel 做自然的高度 + 透明度过渡 */}
        <CollapsiblePanel
          open={collapsed}
          stateAttribute="data-negative-collapsed-hint"
          durationMs={260}
        >
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="w-full rounded-lg bg-muted/40 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/60"
          >
            {t("create.negativePromptSection.collapsedPrefix")}
            {activePreset?.name ?? t("create.negativePromptSection.none")}
            {t("create.negativePromptSection.collapsedSuffix")}
          </button>
        </CollapsiblePanel>

        <CollapsiblePanel
          open={!collapsed}
          stateAttribute="data-negative-editor-panel"
        >
          <div className="space-y-1.5">
            <div className="w-full min-w-0 space-y-1.5 rounded-md bg-muted/50 p-2 text-left text-[11px] text-muted-foreground">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[10px] font-medium text-foreground/70">
                  {t("create.negativePromptSection.inUse")}
                  <span className="text-foreground/90">
                    {activePreset?.name ?? t("create.negativePromptSection.noPreset")}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setDialogOpen(true)}
                  className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Settings2 className="h-3 w-3" />
                  {t("create.negativePromptSection.presetEntry")}
                </button>
              </div>
            </div>

            <div
              id={NEGATIVE_PROMPT_EDITOR_ID}
              className={cn(
                /** 见 PromptSection 同处的说明：深色下的底色走 `--background`，别再借 primary-foreground */
                "min-h-[72px] whitespace-pre-wrap break-words rounded-lg bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1",
                PROMPT_EDITOR_SCROLL_CLASS,
                ACCENT_FOCUS_RING_CLASS,
                INPUT_BORDER_CLASS
              )}
              contentEditable
              suppressContentEditableWarning
              data-placeholder={t("create.negativePromptSection.placeholder")}
            />
          </div>
        </CollapsiblePanel>
      </div>

      <NegativePromptPresetDialog
        open={dialogOpen}
        selectedPresetId={activePresetId}
        onOpenChange={setDialogOpen}
        onApply={(negative, presetId) => {
          setActivePresetId(presetId);
          rememberPreset(presetId);
          setEditableText(NEGATIVE_PROMPT_EDITOR_ID, negative);
        }}
      />
    </>
  );
}
