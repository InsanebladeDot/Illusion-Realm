"use client";

// 节点共用输入外壳，宿主注入参数和提交动作，结果由原任务队列处理。
import { CanvasMossComposition } from "../canvas-moss-composition";
import { resolveImageWorkflowSeries } from "@/utils/comfy/imageWorkflow";

import { useCanvasLoraTriggers } from "../use-canvas-lora-triggers";
import { LoraTriggerWordsButton } from "@/view/create/lora-trigger-words-button";
import { UpscaleOptions } from "@/components/create/upscale-options";
import { useId, useRef, useState } from "react";
import { canvasMegapixelPatch, isCanvasMinimax } from "../canvas-video-resolution";
import { VideoMegapixelPicker } from "./video-megapixel-picker";
import { useTranslation } from "@/i18n";
import { CanvasChip, SegmentedControl } from "./components";
import { GenerationPanelFrame } from "./generation-panel-frame";
import type { CanvasData } from "../canvas-model";
// 模板选择复用画布胶囊与公共级联菜单，生成是否可用仍取决于真实提交回调。
// 选择值交回节点原事务，不能修改创建页表单来冒充本节点已经选好。
// 默认模板名称与当前功能状态分开，选择模板本身不产生推理或上传。
import dynamic from "next/dynamic";
import { CanvasReferenceInputs } from "../canvas-reference-inputs";
import { CanvasPromptPreview } from "../canvas-prompt-preview";
import { CanvasVideoPrompt } from "../canvas-video-prompt";
import { OutputQualityPicker } from "./output-quality-picker";
import { VideoNumberPicker } from "./video-number-picker";
import { IMAGE_SIZE_PRESETS } from "@/data/imageSizes";
import { ParameterPopover } from "./parameter-popover";
import { canvasOutputDimensions, canvasOutputRatio, canvasPresetDimensions, canvasSizePatch } from "../canvas-output-size";
import { canvasInputRule } from "../canvas-input-rules";
import { appendToTabContent } from "@/utils/promptTabs";
const PromptTools = dynamic(() => import("@/view/create/prompt-tools").then(module => module.PromptTools), { ssr: false });
import { CanvasWorkflowPicker } from "../canvas-workflow-picker";
// 工具条直接复用创建页转换、复制与撤销，不用相似图标充当无动作的装饰。
// 每个面板有独立输入 ref 和上下文，异步结果不会写到另一个节点。
// 普通正文保留 textarea；视频直接接入原引用编辑器以维护装饰和光标。
import { PromptAssistantToolbar } from "@/components/prompt-assistant/prompt-assistant-toolbar";
const CanvasAudioControls = dynamic(() => import("../canvas-audio-controls").then(module => module.CanvasAudioControls), { ssr: false });

interface PanelProps {
  // 节点身份交给宿主打开唯一侧栏，不以当前全局高亮猜测编辑对象。
  // 只用于动作路由，不在表单里建立另一份节点数据。
  // 文本和视频也可使用同一面板，但只有图片设置需要该侧栏目标。
  nodeId: string;
  data: CanvasData;
  onChange: (patch: Partial<CanvasData>) => void;
  onToggle: () => void;
  onSubmit?: () => void;
  busy?: boolean;
  model?: string;
}

// 比例与批量共用参数浮层，选项确认进节点事务，打开菜单不会发起生成。
// batchActive 只控制入口标签；旧节点缺数量时显示 ×1，不自动写盘。
interface OptionProps { ratio: string; disabled?: boolean; onChange: (value: string) => void; batch?: boolean; display?: string }
function ImageRatioPicker({ ratio, disabled, onChange, batch = false, display }: OptionProps) {
  const { t } = useTranslation();
  const [batchActive, setBatchActive] = useState(false);
  const label = t(batch ? "canvas.generationCount" : "canvas.ratio");
  // 比例复用创作页清单，显示冒号、存储斜杠；不复用其训练分桶像素。
  const options = batch ? ["1", "2", "4", "6"].map(id => ({ id, label: `×${id}` })) : IMAGE_SIZE_PRESETS.map(preset => ({ id: preset.id.replace(":", "/"), label: preset.label }));
  return <ParameterPopover marker={batch ? "batch" : "ratio"} label={batch ? batchActive || ratio !== "1" ? `×${ratio}` : t("canvas.batch") : `${label}·${display ?? ratio.replace("/", ":")}`} icon={batch ? undefined : "crop"} disabled={disabled} onOpen={() => setBatchActive(true)}>{close =>
      <div className={batch ? undefined : "hy-ratio-options"}><SegmentedControl label={label} items={options} value={ratio} onChange={value => { onChange(value); close(); }} /></div>
    }</ParameterPopover>;
}

function PromptGenerationPanel({ nodeId, data, onChange, onToggle, onSubmit, busy, model }: PanelProps) {
  // 三种媒体共用输入壳，类型只决定引用候选与参数入口。
  // 是否能执行仍由宿主提供的 onSubmit 决定，不保留无业务的音色占位。
  const { t } = useTranslation();
  const { kind, prompt } = data;
  const gptSovits = kind === "audio" && data.audioParameters?.engine === "gpt-sovits";
  const showPromptTools = kind === "image" || kind === "video";
  const loraIds = useCanvasLoraTriggers(data);
  // 译文写回前检查输入仍存在且可编辑，旧面板不能覆盖新草稿。
  const promptId = useId();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const writePrompt = (value: string) => {
    if (promptRef.current?.isConnected && !promptRef.current.disabled) onChange({ prompt: value.slice(0, 4000) });
  };
  // 比例和确切像素一起写入当前模板，避免显示与请求尺寸不一致。
  const changeRatio = (ratio: string) => {
    // MiniMax沿用面积预算改变构图，不把百万像素错当短边或对已经取整的尺寸再缩放。
    if (isCanvasMinimax(data)) { onChange(canvasMegapixelPatch(data, ratio, data.videoMegapixels ?? 1)); return; }
    // 视频保留合法短边档，图片保留 2048 长边档；其他自定义尺寸选快捷比例时回默认档。
    const video = kind === "video";
    const values = Object.values(canvasOutputDimensions(data));
    const current = video ? Math.min(...values) : Math.max(...values);
    const side = video ? ([480, 720, 1080].includes(current) ? current : 720) : current === 2048 ? 2048 : 1024;
    const next = canvasPresetDimensions(ratio, side, video);
    onChange({ ratio, ...canvasSizePatch({ ...data, ratio }, next.width, next.height) });
  };
  // 摘要按已确认像素判断，自定义尺寸不能假装选中某个固定比例。
  const dimensions = canvasOutputDimensions(data);
  const outputRatio = canvasOutputRatio(data, dimensions);
  const localImageEdit = kind === "image" && !data.remoteImage && (data.workflow === "anima-edit" || data.workflow === "minimax-image-edit");
  const [rw, rh] = outputRatio.split("/").map(Number);
  const matchesRatio = Math.abs(dimensions.width / dimensions.height - rw / rh) < .02;
  const minimax = isCanvasMinimax(data);
  const fixedRatio = matchesRatio || minimax && (data.videoMegapixels !== undefined || !data.videoOutput);
  const imageRatio = fixedRatio ? outputRatio : "custom";
  const ratioDisplay = fixedRatio ? undefined : t("create.imageSizeSection.custom");
  const disabledChip = (label: string) => <CanvasChip key={label} disabled reason={t("canvas.unavailable")}>{label}</CanvasChip>;
  // 按钮与 Shift+Enter 共用提交检查；空提示词、忙碌或无执行回调都不提交。
  const submit = () => { if (prompt.trim() && !busy && onSubmit) onSubmit(); };
  // 参数浮层消费自己的快捷键；输入法组词时不把 Shift+Enter 当生成。
  const options = <>
      {/* 工作流与模型参数区 */}
      {kind === "image" || kind === "video" ? <CanvasWorkflowPicker nodeId={nodeId} data={data} onChange={onChange} disabled={busy} /> : kind === "audio" ? <CanvasAudioControls nodeId={nodeId} data={data} busy={busy} onChange={onChange} /> : disabledChip(model || t("canvas.model"))}
      {(kind === "video" || kind === "image" && !localImageEdit) && <ImageRatioPicker ratio={imageRatio} display={ratioDisplay} disabled={busy} onChange={changeRatio} />}
      {minimax ? <VideoMegapixelPicker data={data} disabled={busy} onChange={onChange} /> : (kind === "video" || kind === "image" && !localImageEdit) && <OutputQualityPicker data={data} disabled={busy} onChange={onChange} />}
      {/* 视频帧率区：复用数字浮层，FPS 不等于总帧数。 */}
      {kind === "video" && <VideoNumberPicker marker="fps" label={t("canvas.videoFpsLabel")} value={data.videoFps ?? 24} step={1} presets={[10, 20, 25, 30, 60]} formatPreset={String} format={value => `${value} FPS`} disabled={busy} onChange={videoFps => onChange({ videoFps })} />}
      {/* 视频时长区：预设与自定义共用字段。 */}
      {kind === "video" && <VideoNumberPicker marker="duration" label={t("canvas.videoDurationLabel")} value={data.videoDuration ?? 5} step={0.1} presets={[2, 5, 10]} format={value => t("canvas.videoSeconds", { value: value.toFixed(1) })} disabled={busy} onChange={videoDuration => onChange({ videoDuration })} />}
  </>;
  const actions = <>
    {kind === "image" && canvasInputRule(data)?.min === 0 && <ImageRatioPicker batch ratio={String(data.batchSize ?? 1)} disabled={busy} onChange={value => onChange({ batchSize: Number(value) as CanvasData["batchSize"] })} />}
    {(kind === "image" || kind === "video") && <CanvasWorkflowPicker nodeId={nodeId} settingsOnly data={data} onChange={onChange} disabled={busy} />}
    {!gptSovits && (kind === "image" || kind === "video" || kind === "audio") && <CanvasPromptPreview nodeId={nodeId} data={data} onChange={onChange} disabled={busy} />}
    {/* 节点生成操作区：单独打开超分开关，确认值仍写回当前节点。 */}
    {kind === "image" && <ParameterPopover marker="post-upscale" icon="expand"
      label={data.upscale?.enabled ? `${t("canvas.upscale")} ×${data.upscale.scale}` : t("canvas.upscale")} disabled={busy}>
      {() => <div className="px-2.5 py-1.5"><UpscaleOptions compact value={data.upscale} disabled={busy} onChange={upscale => onChange({ upscale })} /></div>}
    </ParameterPopover>}
  </>;
  return <GenerationPanelFrame kind={kind} options={options} actions={actions} details={minimax ? <output className="hy-output-pixels" data-canvas-video-pixels>{dimensions.width} × {dimensions.height} px</output> : undefined} busy={busy} disabled={!prompt.trim() || !onSubmit || busy === true} available={Boolean(onSubmit)} onToggle={onToggle} onSubmit={submit}>
    {(kind === "image" || kind === "video" || kind === "audio") && <CanvasReferenceInputs nodeId={nodeId} data={data} onChange={onChange} />}
    {/* 素材标签库：只在图片和视频挂载，音频仍可添加参考录音。 */}
    {showPromptTools && <PromptTools series={resolveImageWorkflowSeries(data.workflow ?? "anima")} advancedPrompt={false} tone="neutral" mediaLayout={kind !== "image"} onApply={text => onChange({ prompt: appendToTabContent(prompt, text).slice(0, 4000) })} />}
    {showPromptTools && !busy && <LoraTriggerWordsButton ids={loraIds} onApplied={() => {}} target={{ read: () => prompt, append: text => onChange({ prompt: appendToTabContent(prompt, text).slice(0, 4000) }) }} />}
    {kind === "text" ? <div className="hy-panel-tools">{disabledChip(t("canvas.quickPrompts"))}</div> : null}
    {/* 构图只对本地 Moss 生效，入口放在节点提示词旁。 */}
    {kind === "image" && data.workflow === "moss" && !data.remoteImage && !busy && <CanvasMossComposition key={nodeId} data={data} onChange={onChange} />}
    {/* 正文区：图片、视频、音频直接共用原引用编辑器。 */}
    {!gptSovits && (kind === "video" || kind === "image" || kind === "audio") ? <div className="hy-canvas-video-prompt" data-canvas-popover><CanvasVideoPrompt nodeId={nodeId} data={data} disabled={busy} onChangeData={onChange} onChange={prompt => onChange({ prompt })} /></div> : <div className="hy-canvas-prompt" data-canvas-popover>
      {/* GPT-SoVITS 把正文当台词直接朗读，不把音频附件替换成 MiniMax 引用标记。 */}
      <textarea ref={promptRef} data-gpt-sovits-text={gptSovits || undefined} aria-label={t(gptSovits ? "canvas.gptSovits.text" : "canvas.prompt")} value={prompt} maxLength={4000} disabled={busy} onChange={event => onChange({ prompt: event.target.value })} placeholder={t(gptSovits ? "canvas.gptSovits.textPlaceholder" : kind === "text" ? "canvas.promptText" : "canvas.promptAudio")} />
      {!gptSovits && !busy && <PromptAssistantToolbar appearance="neutral" contextId={`canvas-prompt-${promptId}`} read={() => promptRef.current?.value.trim() ?? ""} write={writePrompt} />}
    </div>}
  </GenerationPanelFrame>;
}

// 音频与图片共用节点输入壳和提交箭头，侧栏仅负责原表单的参数部分。
export function GenerationPanel(props: PanelProps) {
  return <PromptGenerationPanel {...props} />;
}
