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

interface VideoModelSelectProps {
  workflowId: string; overrides: VideoModelOverrides;
  onChange: (overrides: VideoModelOverrides) => void; disabled: boolean;
}

/** 主模型复用图片页卡片与本地弹窗；工作流仍是基础，仅覆盖它的 UNet 文件名。 */
export function VideoModelSelect({ workflowId, overrides, onChange, disabled }: VideoModelSelectProps) {
  const { t } = useTranslation();
  const models = useSettingsStore((state) => state.models);
  const paths = useSettingsStore((state) => state.paths);
  const server = useSettingsStore((state) => state.comfyServerUrl);
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const slot = useMemo(() => getVideoModelSlots(getVideoWorkflowTemplate(workflowId)).find((item) => item.category === "diffusionModels"), [workflowId]);
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
    {/* 界面：视频「模型」卡片，Minimax 工作流只展示 Minimax 本地模型 */}
    <ModelCoverSelect name={display.name} cover={display.cover} label={t("create.page.model")} onClick={() => setOpen(true)} disabled={disabled || selecting} />
    {open && <ModelSelectDialog open selected={display.selected} series="minimax" onOpenChange={setOpen} onSelect={(model) => { void select(model); }} />}
  </div>;
}
