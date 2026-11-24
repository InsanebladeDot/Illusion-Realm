"use client";

/** 只把当前节点的LoRA身份交给原创作页按钮，旁车读取和触发词去重仍用原实现。 */
import { useSettingsStore } from "@/stores/useSettingsStore";
import { makeLocalLoraId } from "@/utils/localModelResources";
import { toComfyRelativeModelName } from "@/utils/comfy/comfyModelPath";
import { getVideoLoras } from "@/utils/comfy/video-workflow-loras";
import { getCanvasVideoWorkflowTemplate } from "./canvas-video-workflow";
import { ANIMA_EDIT_DEFAULTS } from "@/utils/comfy/anima-edit-workflow";
import { MINIMAX_IMAGE_EDIT_DEFAULTS } from "@/utils/comfy/minimax-image-edit-workflow";
import type { CanvasData } from "./canvas-model";

export function useCanvasLoraTriggers(data: CanvasData) {
  const models = useSettingsStore(state => state.models);
  const root = useSettingsStore(state => state.paths.lorasPath || (state.paths.searchPath ? `${state.paths.searchPath}/loras` : ""));
  const workflow = data.workflow ?? (data.kind === "video" ? "minimax" : "anima");
  if (workflow === "anima" || workflow === "sdxl" || workflow === "moss" || workflow === "anima-edit" && data.workflowLoras?.[workflow] !== undefined)
    return data.workflowLoras?.[workflow]?.map(item => item.extensionId) ?? [];
  const names = workflow === "anima-edit" ? ANIMA_EDIT_DEFAULTS.loras
    : workflow === "minimax-image-edit" ? data.workflowLoras?.[workflow] ?? MINIMAX_IMAGE_EDIT_DEFAULTS.loras
    : workflow === "minimax" || workflow === "minimax-reference" ? data.workflowLoras?.[workflow] ?? getVideoLoras(getCanvasVideoWorkflowTemplate(data)) : [];
  const normalize = (value: string) => value.replaceAll("\\", "/").toLowerCase();
  const files = models.filter(model => model.type === "lora").flatMap(model => model.versions);
  return names.flatMap(item => {
    const matches = files.filter(file => normalize(toComfyRelativeModelName(file.filePath, root) ?? "") === normalize(item.name));
    return matches.length === 1 ? [makeLocalLoraId(matches[0].filePath)] : [];
  });
}
