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
// 反向预设仍按 id 直接写入，共用输入只负责外观、可编辑表面与助手。
// 不传 value，防止预设弹窗命令式写入在下一次渲染时被覆盖。
// 负面词沿用原 72px 最小高度，正向输入则使用默认 144px。
import { PromptInput } from "@/components/prompt-input";

/** 反向提示词编辑器 id（生成时按 id 读取内容） */
export const NEGATIVE_PROMPT_EDITOR_ID = "negative-prompt-editor";

/**
 * 反向提示词区域：
 * - 输入框限高 + 可滚动 + 隐藏滚动条
 * - 顶部提供「反向提示词预设」入口（样式与高级设置里的预设提示词卡片一致）
 * - 选择预设后直接写入输入框，仍可手动修改
 */
// 受控模式供编辑工作区复用；普通文生图保留默认 DOM 读取契约。
// 每个实例使用独立 id，预设与助手不会写入其他模式的正文。
// undefined 才允许默认填充，受控空串是有效草稿。
// onValueChange 将预设和手动输入同步到真实生成参数。
// 禁用同时覆盖输入和预设应用，任务运行时不能覆盖冻结输入。
// 限长只用于编辑工作流，不改变普通图片生成的文本容量。
// 受控空文本是用户明确清空，不允许挂载effect自动补回默认预设。
// 外部未提供value时才保留普通图片页通过DOM读取正文的既有方式。
// 两个路径复用同一预设弹窗，不维护第二份内置词条或自定义列表。
// fixedInputHeight 供蒙版工作区锁定当前 72px 输入高度。
// 默认关闭，普通文生图仍随文本增长到原有限高。
// 固定高度只作用于编辑表面，不固定预设栏或折叠提示的外层高度。
// 长文仍由公共 overflow-y-auto 内部滚动，不裁掉内容或改写草稿。
// 不把折叠状态暴露给父级，避免动画高度与额外状态不同步。
interface NegativePromptProps { editorId?: string; value?: string; onValueChange?: (value: string) => void; disabled?: boolean; maxLength?: number; fixedInputHeight?: boolean }

// 既有预设弹窗继续提供内置与自建预设，不建立第二套数据。
// 折叠只改变显示，受控草稿仍由调用者拥有。
// 助手通过 PromptInput 的统一回调写回，无需复制工具条逻辑。
// 可选固定输入只改变布局，不改变预设、助手与受控值的共同契约。
// 72px 与既有最小高度相同，展开后保留用户当前看到的紧凑尺寸。
// 收起仍由下方公共 CollapsiblePanel 保留 DOM 和文本选择相关状态。
export function NegativePromptSection({ editorId = NEGATIVE_PROMPT_EDITOR_ID, value, onValueChange, disabled = false, maxLength, fixedInputHeight = false }: NegativePromptProps = {}) {
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
    // effect 在 DOM 提交后直接写入，不等待可见性相关的 rAF；折叠编辑器也能收到预设。
    if (value !== undefined || readEditableText(editorId)) return;
    const preset =
      allPresets.find((item) => item.id === (lastPresetId ?? DEFAULT_NEGATIVE_PRESET_ID)) ??
      BUILTIN_NEGATIVE_PRESETS[0];
    if (preset?.negative) {
      setEditableText(editorId, preset.negative);
    }
    // 仅在挂载时执行一次：之后的修改以输入框内容为准
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label className="text-sm font-medium" htmlFor={editorId}>
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
                  disabled={disabled} onClick={() => setDialogOpen(true)}
                  className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Settings2 className="h-3 w-3" />
                  {t("create.negativePromptSection.presetEntry")}
                </button>
              </div>
            </div>

            {/* 界面：与正向提示词复用输入和助手，原预设入口及默认词填充逻辑保持有效。
                固定 id 是生成读取和预设写入的共同目标，不能换成 wrapper 的 id。
                正文不绑定 React state，折叠、语言切换和弹窗返回都不会清空内容。
                最小高度沿用原版，长负面词仍由公共限高滚动样式承载。
                容器由共享组件负责相对定位，工具条不会漂移到整个表单右下角。
                深浅主题沿用统一背景和边框，避免编辑功能与图片功能样式分叉。 */}
            {/* 蒙版页锁定既有输入高度，长内容在内部滚动；普通页面保持自动增长。 */}
            {/* h 控制使用高度，min-h 与原尺寸一致，公共最大高度不影响此固定值。 */}
            {/* 此样式不影响折叠过渡，父画布可以接收面板实际释放的空间。 */}
            <PromptInput id={editorId} value={value} onValueChange={onValueChange} disabled={disabled} maxLength={maxLength} minHeight="min-h-[72px]" className={fixedInputHeight ? "h-[72px]" : undefined} data-placeholder={t("create.negativePromptSection.placeholder")} />
          </div>
        </CollapsiblePanel>
      </div>

      <NegativePromptPresetDialog
        open={dialogOpen}
        selectedPresetId={activePresetId}
        onOpenChange={setDialogOpen}
        onApply={(negative, presetId) => {
          // 弹窗可能早于任务打开，应用时再次检查锁定状态。
          // 空预设允许主动清空，不偷偷恢复默认负面词。
          // 限长与手动输入一致，避免 UI 和提交内容不一致。
          if (disabled) return;
          setActivePresetId(presetId);
          rememberPreset(presetId);
          const next = maxLength === undefined ? negative : negative.slice(0, maxLength);
          if (value === undefined) setEditableText(editorId, next); else onValueChange?.(next);
        }}
      />
    </>
  );
}
