"use client";

/** 节点直接挂创作页音频表单；仅把字段写回本节点，文件复制继续交给原画布导入器。 */
import { useNodeConnections, useNodesData } from "@xyflow/react";
import { AudioGenerationForm, type AudioGenerationFormState } from "@/view/create/audio-generation-form";
import { defaultAudioLoras } from "@/utils/comfy/audio-workflow";
import { useTranslation } from "@/i18n";
import { canvasAudioReferences } from "./canvas-audio-parameters";
import type { CanvasData, CanvasNode } from "./canvas-model";
import { CanvasLoraStatus } from "./canvas-lora-status";
import { CanvasGptSovitsSettings } from "./canvas-gpt-sovits-settings";

interface Props { nodeId: string; data: CanvasData; busy?: boolean; onChange: (patch: Partial<CanvasData>) => void }

export function CanvasAudioPanel({ nodeId, data, busy, onChange }: Props) {
  const { t } = useTranslation();
  const connections = useNodeConnections({ id: nodeId, handleType: "target" });
  const sources = useNodesData<CanvasNode>(connections.map(item => item.source));
  const references = canvasAudioReferences(data, sources), reference = references[0] ?? null;
  const invalid = references.length > 1 || references.some(item => !item);
  const row = data.audioParameters ?? {};
  const update = (patch: Partial<NonNullable<CanvasData["audioParameters"]>>) => onChange({ audioParameters: { ...row, ...patch } });
  if (row.engine === "gpt-sovits") return <CanvasGptSovitsSettings value={row.gptSovits} reference={reference?.name} invalid={invalid} disabled={busy} onChange={gptSovits => update({ gptSovits })} />;
  const patch: AudioGenerationFormState["patch"] = value => {
    // 提示词和附件由节点面板维护，侧栏只回写采样与模型参数。
    const { prompt, reference, ...parameters } = value;
    if (prompt !== undefined || reference !== undefined) return;
    if (Object.keys(parameters).length) update({ ...parameters,
      unetName: parameters.unetName === null ? undefined : parameters.unetName ?? row.unetName,
      steps: parameters.steps === null ? undefined : parameters.steps ?? row.steps, durationSeconds: parameters.durationSeconds === null ? undefined : parameters.durationSeconds ?? row.durationSeconds });
  };
  const state: AudioGenerationFormState = { prompt: data.prompt, reference, seed: row.seed ?? "0", random: row.random ?? true,
    loras: row.loras ?? defaultAudioLoras(), unetName: row.unetName ?? null, steps: row.steps ?? null, durationSeconds: row.durationSeconds ?? null,
    modelOverrides: row.modelOverrides ?? {}, error: invalid ? t("create.audio.invalidReference") : null, patch,
    setLoras: value => update({ loras: typeof value === "function" ? value(row.loras ?? defaultAudioLoras()) : value }),
    submit: () => {} };
  return <section className="flex min-h-0 flex-1 flex-col" data-canvas-audio-panel>
    {/* 音频参数：直接复用原表单的设置形态，正文、附件和提交留在节点下方。 */}
    <AudioGenerationForm state={state} active={!!busy} disabled={!!busy} variant="settings" />
    <CanvasLoraStatus names={defaultAudioLoras().map(item => item.name)} inherited={row.loras === undefined} />
  </section>;
}
