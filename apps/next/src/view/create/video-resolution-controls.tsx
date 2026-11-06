"use client";

// 视频继续复用尺寸控件的布局、预设按钮和滑条，只替换计算策略。
// H3 的合法像素必须在界面上可见，不能到提交时才偷偷改变宽高。
// 状态仍由视频页面持有，切换工作流时不会把尺寸写进图片生成表单。
import { useMemo } from "react";
import { getVideoWorkflowTemplate } from "@/utils/comfy/videoWorkflow";
import { createVideoSizeSelection, getVideoResolutionDefaults, VIDEO_SIZE_MAX, VIDEO_SIZE_MIN, VIDEO_SIZE_STEP, type VideoResolutionSettings } from "@/utils/comfy/video-resolution";
import { useTranslation } from "@/i18n";
import { SizeSelector } from "./size-selector";
import type { ImageSizeInput } from "@/utils/imageSize";
import { IMAGE_SIZE_PRESETS } from "@/data/imageSizes";

/**
 * workflowId 选择当前模板，不以展示名称或目录拼写推断节点类型。
 * value 未传时只展示模板默认值，不在渲染期间调用 onChange 写父状态。
 * onChange 返回完整尺寸契约，父层无需再次理解对齐规则。
 * disabled 沿用生成期间的只读状态，避免提交中途更改表单。
 * 此适配层仅用于 MiniMax；其他系列的视频尺寸继续由各自模板决定。
 * 两种 H3 工作流都接同一适配层，不复制参考视频的尺寸实现。
 */
interface Props { workflowId?: string; value?: VideoResolutionSettings; disabled: boolean; onChange: (value: VideoResolutionSettings) => void }
/**
 * 模板只在工作流变化时读取；表单草稿优先于默认值。
 * 每次渲染都规范化草稿，让旧的 8 像素尺寸也显示真实提交结果。
 * 自定义输入与选择预设会重置缩放，沿用已有尺寸选择器的交互。
 * 改动单边时另一边采用当前显示尺寸，避免重置倍率后意外跳回旧值。
 * 缩放回调保留原始 customWidth/customHeight，不用已缩放结果作基准。
 * 预设按钮仍保留原始分桶标注，右上角则明确显示对齐后的实际尺寸。
 * 自定义提示和输入步进都来自同一组约束，防止文案与实现不同步。
 * fieldset 继续负责生成期间禁用，不另建可绕过禁用的输入入口。
 * 不在此上传或改写图片，原图与首尾帧的预处理由工作流节点负责。
 * 与图片共用底层 SizeSelector，主题、可访问标签和控件样式保持复用。
 */
export function VideoResolutionControls({ workflowId = "minimax", value, disabled, onChange }: Props) {
  const { t } = useTranslation();
  // 默认值与用户草稿分开，恢复模板和切换工作流不会互相覆盖。
  // getVideoWorkflowTemplate 返回克隆，读取尺寸不会污染导入的 JSON。
  // memo 的依赖只需工作流标识，不随提示词或模型选择反复重建模板。
  // selection 保留原始边长和倍率，宽高摘要读取独立的最终像素字段。
  const defaults = useMemo(() => getVideoResolutionDefaults(getVideoWorkflowTemplate(workflowId)), [workflowId]);
  const selection = createVideoSizeSelection(value ?? defaults);
  // 所有交互统一经过此函数，防止缩放按钮或预设绕过自定义限制。
  // patch 只覆盖本次变化，其余字段来自当前已规范化的表单。
  // createVideoSizeSelection 会重新计算最终像素，不能直接保留旧 width/height。
  // 父状态保存完整结果，提交时因此无需再推测用户操作的是哪种模式。
  const change = (patch: Partial<ImageSizeInput>) => onChange(createVideoSizeSelection({ ...selection, ...patch }));
  // 自定义输入框展示实际像素，所以修改时把显示尺寸作为新的 1 倍基准。
  // 未修改的一边也采用显示值，保证只改宽度不会让高度突然放大。
  // 按钮切入自定义时会同时传入两边，其行为与单边编辑共用这一入口。
  // 空值被数字输入转换为零后，会由统一约束回落最小合法边长。
  // 自定义分支显式重置倍率，避免用户输入 416 后又被上次 0.5 倍缩小。
  const custom = (patch: { width?: number; height?: number }) => change({ mode: "custom", scale: 1,
    customWidth: patch.width ?? selection.width, customHeight: patch.height ?? selection.height });
  return (
    /* 界面：视频「图片尺寸」，预设、自定义和缩放均按 H3 规则显示与提交 */
    <fieldset disabled={disabled} data-video-resolution className="min-w-0">
      <SizeSelector value={{ ...selection, customWidth: selection.width, customHeight: selection.height }} dimensions={selection}
        presets={IMAGE_SIZE_PRESETS} min={VIDEO_SIZE_MIN} max={VIDEO_SIZE_MAX} step={VIDEO_SIZE_STEP}
        // 视频把倍率上限注入共用 UI，双击编辑也遵守与滑条相同的范围。
        // 图片不传此约束，避免为了复用控件而复制两套输入和键盘逻辑。
        // 最终宽高仍由 H3 适配层按 32 像素对齐，不改为图片的 8 像素。
        hint={t("create.videoSettings.resolutionHint")} scale={selection.scale} scaleMax={1} onScaleChange={(scale) => change({ scale })}
        onPresetChange={(aspectRatio) => change({ mode: "preset", aspectRatio, scale: 1 })} onCustomSizeChange={custom} />
    </fieldset>
  );
}
