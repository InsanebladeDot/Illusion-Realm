"use client";

import { useMemo, useState } from "react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import { isMinimaxWorkflow } from "@/data/videoForm";
import { fetchComfyModelLists } from "@/api/comfyui";
import { getVideoWorkflowTemplate } from "@/utils/comfy/videoWorkflow";
import { getVideoModelDisplay, getVideoModelSlots, selectedVideoModelName, type VideoModelOverrides } from "@/utils/comfy/video-workflow-models";
import type { SelectedModel } from "@/types/model";
import { ModelCoverSelect } from "./model-cover-select";
import { ModelSelectDialog } from "./ModelSelectDialog";
// 同系列音频可以注入自己的模板，复用这张已有 UNet 卡片与选择弹窗。
// 这里只读取图的 loader 槽，不修改模板对象或提交远端任务。
// 省略模板时继续读取视频注册表，原有视频模式不受影响。
import type { ComfyApiPrompt } from '@/types/comfy';

interface VideoModelSelectProps {
  workflowId: string; overrides: VideoModelOverrides;
  onChange: (overrides: VideoModelOverrides) => void; disabled: boolean;
  // 模板决定默认 UNet 与节点 id，不由页面标签或文件显示名推测。
  // 音频两份模板有不同节点前缀，宿主按当前模板映射覆盖值。
  // 选中的文件仍经过既有模型路径转换和 MiniMax 系列过滤。
  templateOverride?: ComfyApiPrompt;
}

/** 主模型复用图片页卡片与本地弹窗；工作流仍是基础，仅覆盖它的 UNet 文件名。 */
// 音频复用与视频同一模型选择流程，仅扩展缺省模板的来源。
// overrides 仍按实际 loader id 寻址，不能把名称写入 LoRA 或 CLIP 节点。
// disabled 和 selecting 保留旧约束，异步选模失败继续走既有 toast。
export function VideoModelSelect({ workflowId, overrides, onChange, disabled, templateOverride }: VideoModelSelectProps) {
  const { t } = useTranslation();
  const models = useSettingsStore((state) => state.models);
  const paths = useSettingsStore((state) => state.paths);
  const server = useSettingsStore((state) => state.comfyServerUrl);
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  // 只提取 UNet 槽；两个 VAE 与文本编码器仍保留工作流默认设置。
  // 模板引用变化时重读节点 id，避免参考音频切换后写错旧图的 id。
  // 用户选择的模型名由宿主按业务字段保存，不绑定某个模板前缀。
  const slot = useMemo(() => getVideoModelSlots(templateOverride ?? getVideoWorkflowTemplate(workflowId)).find((item) => item.category === "diffusionModels"), [workflowId, templateOverride]);
  if (!isMinimaxWorkflow(workflowId) || !slot) return null;
  const display = getVideoModelDisplay(slot, overrides[slot.id] || slot.defaultName, models, paths);
  async function select(model: SelectedModel) {
    if (!slot || !model.versionId) return;
    setSelecting(true);
    try {
      const lists = await fetchComfyModelLists(server).catch(() => null);
      onChange({ ...overrides, [slot.id]: selectedVideoModelName(slot, model.versionId, paths, lists) });
    } catch { useToastStore.getState().show(t("create.videoModels.invalid")); }
    finally { setSelecting(false); }
  }
  return <div data-video-local-unet className="min-w-0" title={t("create.videoModels.selectLocal")}>
    {/* 界面：MiniMax「模型」卡片，视频与音频都只展示该系列本地模型 */}
    <ModelCoverSelect name={display.name} cover={display.cover} label={t("create.page.model")} onClick={() => setOpen(true)} disabled={disabled || selecting} />
    {open && <ModelSelectDialog open selected={display.selected} series="minimax" onOpenChange={setOpen} onSelect={(model) => { void select(model); }} />}
  </div>;
}
