"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "@/i18n";
import { isMinimaxWorkflow } from "@/data/videoForm";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { getVideoWorkflowTemplate } from "@/utils/comfy/videoWorkflow";
import { getVideoLoras, type VideoLora } from "@/utils/comfy/video-workflow-loras";
import { getVideoModelDisplay, selectedVideoModelName, type VideoModelSlot } from "@/utils/comfy/video-workflow-models";
import { makeLocalLoraId, parseLocalLoraId } from "@/utils/localModelResources";
import { SelectedExtensions } from "./selected-extensions";
import { ExtensionSelectDialog } from "./ExtensionSelectDialog";
import type { LocalModel } from "@/types/localModel";
import type { SettingsPaths } from "@/types/settings";
import { filterAndSortExtensions } from "@/data/extensions";
import type { ResourceSelectionOption } from "@/utils/resource-selection";

interface Props { workflowId: string; value?: VideoLora[]; disabled: boolean; onChange: Dispatch<SetStateAction<VideoLora[]>> }
function localSelection(loras: VideoLora[], slot: VideoModelSlot, models: LocalModel[], paths: SettingsPaths) {
  return loras.flatMap((lora) => {
    const file = getVideoModelDisplay(slot, lora.name, models, paths).selected.versionId;
    return file ? [makeLocalLoraId(file)] : [];
  });
}
function mergeSelection(ids: string[], loras: VideoLora[], slot: VideoModelSlot, models: LocalModel[], paths: SettingsPaths) {
  const selectedIds = localSelection(loras, slot, models, paths);
  const additions = ids.filter((id) => !selectedIds.includes(id)).flatMap((id) => {
    const file = parseLocalLoraId(id);
    return file ? [{ id: crypto.randomUUID(), name: selectedVideoModelName(slot, file, paths, null), strength: 1 }] : [];
  });
  return [...loras, ...additions];
}
export function VideoLoraSelect({ workflowId, value, disabled, onChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const models = useSettingsStore((state) => state.models);
  const paths = useSettingsStore((state) => state.paths);
  const resources = useMemo(() => filterAndSortExtensions("", models, paths, null, "minimax"), [models, paths]);
  const template = useMemo(() => getVideoWorkflowTemplate(workflowId), [workflowId]);
  // LoRA 不再预置在模板里；目录、名称转换仍使用共用的加载槽格式。
  const slot: VideoModelSlot = { id: "loras", input: "lora_name", category: "loras", label: "create.videoModels.lora", defaultName: "" };
  const loras = value ?? getVideoLoras(template);
  if (!isMinimaxWorkflow(workflowId)) return null;
  const selectedIds = localSelection(loras, slot, models, paths);
  const confirm = (items: ResourceSelectionOption[]) => onChange(mergeSelection(items.map((item) => item.id), loras, slot, models, paths));
  return <div data-video-loras title={t("create.videoModels.selectLora")} className="mt-4 min-w-0 px-2 sm:px-3">
    {/* 界面：「已选扩展 / 添加扩展」仅转换视频数据，不单独实现样式 */}
    <SelectedExtensions value={loras.map((lora) => ({ extensionId: lora.id, weight: lora.strength }))} disabled={disabled}
      displays={Object.fromEntries(loras.map((lora) => [lora.id, getVideoModelDisplay(slot, lora.name, models, paths)]))}
      onChange={(update) => onChange((current) => {
        const items = typeof update === "function" ? update(current.map((lora) => ({ extensionId: lora.id, weight: lora.strength }))) : update;
        return items.flatMap((item) => { const lora = current.find((entry) => entry.id === item.extensionId); return lora ? [{ ...lora, strength: item.weight }] : []; });
      })}
      onAdd={() => setOpen(true)} />
    {/* 弹窗：「选择扩展」支持同批勾选多个 Minimax LoRA，确认后应用 */}
    {open && <ExtensionSelectDialog open selectedIds={selectedIds} resources={resources} onOpenChange={setOpen} onConfirm={confirm} />}
  </div>;
}
