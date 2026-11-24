"use client";

/** 音频页脚复用原数字浮层和参数入口；引用类型决定模板默认秒数，参数仍归当前节点。 */
import { useNodeConnections, useNodesData } from "@xyflow/react";
import { useTranslation } from "@/i18n";
import { audioWorkflowDefaults } from "@/utils/comfy/audio-workflow";
import { canvasAudioReferences } from "./canvas-audio-parameters";
import { useCanvasEditorActions } from "./canvas-editor-context";
import type { CanvasData, CanvasNode } from "./canvas-model";
import { IconButton, SegmentedControl } from "./reference-ui/components";
import { VideoNumberPicker } from "./reference-ui/video-number-picker";
import { ParameterPopover } from "./reference-ui/parameter-popover";
import { GPT_SOVITS_NAME } from "@/utils/comfy/gpt-sovits-workflow";
import { CanvasReferenceVoicePicker } from "./canvas-reference-voice-picker";

interface Props { nodeId: string; data: CanvasData; busy?: boolean; onChange: (patch: Partial<CanvasData>) => void }

export function CanvasAudioControls({ nodeId, data, busy, onChange }: Props) {
  const { t } = useTranslation(), actions = useCanvasEditorActions();
  const connections = useNodeConnections({ id: nodeId, handleType: "target" });
  const sources = useNodesData<CanvasNode>(connections.map(item => item.source));
  // 无参考和有参考模板分别默认4秒、5秒，界面读数与请求使用同一个模板来源。
  const reference = Boolean(canvasAudioReferences(data, sources)[0]);
  const seconds = data.audioParameters?.durationSeconds ?? audioWorkflowDefaults(reference).durationSeconds;
  const engine = data.audioParameters?.engine ?? "minimax";
  const engines = [{ id: "minimax", label: "MiniMax H3" }, { id: "gpt-sovits", label: GPT_SOVITS_NAME }];
  return <>
    {/* 节点页脚：用原参数浮层切换引擎，旧工程缺省 MiniMax。 */}
    <ParameterPopover marker="audio-engine" label={engine === "gpt-sovits" ? GPT_SOVITS_NAME : "MiniMax H3"} disabled={busy}>
      {close => <div className="hy-ratio-options"><SegmentedControl items={engines} value={engine} label={t("canvas.workflow")} onChange={value => {
        if (value === "minimax" || value === "gpt-sovits") onChange({ audioParameters: { ...data.audioParameters, engine: value } });
        close();
      }} /></div>}
    </ParameterPopover>
    <CanvasReferenceVoicePicker nodeId={nodeId} disabled={busy} current={data.audioParameters?.reference?.name} />
    {/* 音频时长：直接使用视频既有的2/5/10秒和自定义浮层，不再在侧栏放第二份。 */}
    {engine === "minimax" && <VideoNumberPicker marker="audio-duration" label={t("create.audio.duration")} value={seconds} step={0.1} presets={[2, 5, 10]} format={value => t("canvas.videoSeconds", { value: value.toFixed(1) })} disabled={busy} onChange={durationSeconds => onChange({ audioParameters: { ...data.audioParameters, durationSeconds } })} />}
    <div data-canvas-workflow><IconButton icon="settings" label={t("canvas.parameters")} disabled={busy} onClick={() => actions.openImageSettings(nodeId)} /></div>
  </>;
}
