"use client";
import { HoverTip } from "@/components/hover-tip";


import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "@/i18n";
import { isMinimaxWorkflow } from "@/data/videoForm";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { getVideoWorkflowTemplate } from "@/utils/comfy/videoWorkflow";
import { getVideoLoras, type VideoLora } from "@/utils/comfy/video-workflow-loras";
import { isModelNameHidden } from "@/utils/local-model-visibility";
import { getVideoModelDisplay, localLoaderRoots, selectedVideoModelName, type VideoModelSlot } from "@/utils/comfy/video-workflow-models";
import { makeLocalLoraId, parseLocalLoraId } from "@/utils/localModelResources";
import { SelectedExtensions } from "./selected-extensions";
import { ExtensionSelectDialog } from "./ExtensionSelectDialog";
import type { LocalModel } from "@/types/localModel";
import type { SettingsPaths } from "@/types/settings";
import { filterAndSortExtensions } from "@/data/extensions";
import type { ResourceSelectionOption } from "@/utils/resource-selection";
// 音频复用同一个扩展展示、权重编辑与选择弹窗，只注入不同模板。
// templateOverride 是调用方已克隆的 API 图，不会写回视频模板注册表。
// 省略时保持原视频模式的默认模板选择行为。
import type { ComfyApiPrompt } from '@/types/comfy';

// 可选模板让同系列的音频工作流共享扩展能力，不复制一套 LoRA picker。
// workflowId 仍决定系列限制，音频传入 minimax 排除 Anima/SDXL LoRA。
// value 为空数组时表示用户明确移除，不能回落为模板默认项。
// 嵌套配置页可知道选择器是否展开，Escape 优先关闭最里面的选择会话。
// 这是打开状态通知，不把视频参数或内部草稿提升到另一份公共 store。
// 原创建页不传时完全保持旧行为，画布只用它保护外层配置页不被同时关闭。
// tone 只透传选择弹窗的外观，不改变系列筛选、名称转换及权重默认。
// 原创建页无需传入参数，继续使用原主题；画布才明确要求黑白灰表面。
// 展示复用与参数归属分开，不能因此把创建页 LoRA 草稿共享给画布。
interface Props { workflowId: string; value?: VideoLora[]; templateOverride?: ComfyApiPrompt; disabled: boolean; onChange: Dispatch<SetStateAction<VideoLora[]>>; onPickerOpenChange?: (open: boolean) => void; tone?: "neutral" }
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
// 新模板只影响缺省 LoRA 来源，资源筛选、卡片尺寸和确认事件仍走公共实现。
// 调用方应稳定传入模板引用，切换开关不会重复建立大型资源列表。
// 本组件不会修改图中的 UNet，也不会替用户自动选择不兼容模型。
export function VideoLoraSelect({ workflowId, value, templateOverride, disabled, onChange, onPickerOpenChange, tone }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // 打开和关闭都通知宿主，取消不能让外层一直误以为还有内层弹窗。
  // setOpen 仍归本组件，外层不能绕过选择器确认直接更改已选模型。
  // 通知是同步意图，Escape 同一事件里的父回调仍能识别旧的内层开启状态。
  const changeOpen = (next: boolean) => { setOpen(next); onPickerOpenChange?.(next); };
  const models = useSettingsStore((state) => state.models);
  const hidden = useSettingsStore(state => state.hiddenModelPaths);
  const paths = useSettingsStore((state) => state.paths);
  const resources = useMemo(() => filterAndSortExtensions("", models, paths, null, "minimax"), [models, paths]);
  // 音频使用自身模板中的加速 LoRA，视频默认行为不受影响。
  // 模板只用于提取默认值；生成时仍由各自的纯构建器独立克隆和校验。
  // useMemo 保持原有视频切换的缓存，不把模板按页面名称全局复用。
  const template = useMemo(() => templateOverride ?? getVideoWorkflowTemplate(workflowId), [workflowId, templateOverride]);
  // LoRA 不再预置在模板里；目录、名称转换仍使用共用的加载槽格式。
  const slot: VideoModelSlot = { id: "loras", input: "lora_name", category: "loras", label: "create.videoModels.lora", defaultName: "" };
  const loras = value ?? getVideoLoras(template);
  if (!isMinimaxWorkflow(workflowId)) return null;
  const selectedIds = localSelection(loras, slot, models, paths);
  const confirm = (items: ResourceSelectionOption[]) => onChange(mergeSelection(items.map((item) => item.id), loras, slot, models, paths));
  // 外层宿主统一负责留白，避免音频和视频嵌入模型区后出现双层内边距。
  // 共享选择器只展示扩展及其弹窗，不决定自己在表单中的位置。
  // 保留最小宽度约束，长模型名前缀仍交给已有卡片处理省略。
  return <HoverTip asChild layer="window" label={(t("create.videoModels.selectLora")) ?? ""}><div data-video-loras className="min-w-0">
    {/* 界面：「已选扩展 / 添加扩展」仅转换视频数据，不单独实现样式 */}
    <SelectedExtensions value={loras.map((lora) => ({ extensionId: lora.id, weight: lora.strength }))} disabled={disabled}
      displays={Object.fromEntries(loras.map(lora => {
        const display = getVideoModelDisplay(slot, lora.name, models, paths);
        const hiddenModel = isModelNameHidden(display.selected.versionId || lora.name, localLoaderRoots(slot.category, paths), hidden);
        return [lora.id, hiddenModel ? { name: t("toolBox.civitai.visibility.hiddenName"), cover: "" } : display];
      }))}
      onChange={(update) => onChange((current) => {
        const items = typeof update === "function" ? update(current.map((lora) => ({ extensionId: lora.id, weight: lora.strength }))) : update;
        return items.flatMap((item) => { const lora = current.find((entry) => entry.id === item.extensionId); return lora ? [{ ...lora, strength: item.weight }] : []; });
      })}
      onAdd={() => changeOpen(true)} />
    {/* 弹窗：「选择扩展」支持同批勾选多个 Minimax LoRA，确认后应用 */}
    {/* 取消、确认和 Escape 都经过同一关闭通知，避免外层残留错误层级。 */}
    {/* 原图片/视频选择状态仍分别由各自 onChange 持有，不因通知而合并。 */}
    {/* 不传通知的既有图片、视频和音频入口继续保持原来的生命周期。 */}
    {/* 中性主题由外层显式选择，选择器数据和确认回调继续沿用视频原适配。 */}
    {/* 内层资源窗口关闭后不保留主题副本，下次打开仍读取本次调用方参数。 */}
    {/* tone 不参与模型名称计算，白色主题不会误换选中的模型文件。 */}
    {open && <ExtensionSelectDialog tone={tone} open selectedIds={selectedIds} resources={resources} onOpenChange={changeOpen} onConfirm={confirm} />}
  </div></HoverTip>;
}
