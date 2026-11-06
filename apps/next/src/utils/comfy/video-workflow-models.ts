/** 从工作流提取加载槽，复用本地扫描与 ComfyUI 相对路径，不修改模板原件。 */
import type { ComfyApiPrompt, ComfyModelLists } from "@/types/comfy";
import type { LocalModel } from "@/types/localModel";
import type { SettingsPaths } from "@/types/settings";
import { resolveComfyModelNameFromList, toComfyRelativeModelName } from "./comfyModelPath";
import { t, type MessageKey } from "@/i18n";
import { isMinimaxWorkflow } from "@/data/videoForm";

type LoaderCategory = "diffusionModels" | "clips" | "vaes" | "loras";
interface LoaderDefinition { input: string; category: LoaderCategory; label: MessageKey }
const LOADERS: Record<string, LoaderDefinition> = {
  UNETLoader: { input: "unet_name", category: "diffusionModels", label: "create.videoModels.unet" },
  CLIPLoader: { input: "clip_name", category: "clips", label: "create.videoModels.clip" },
  VAELoader: { input: "vae_name", category: "vaes", label: "create.videoModels.vae" },
  LoraLoaderModelOnly: { input: "lora_name", category: "loras", label: "create.videoModels.lora" },
};
export interface VideoModelSlot extends LoaderDefinition { id: string; defaultName: string; position?: number }
export type VideoModelOverrides = Record<string, string>;
// 同一个 VAE 解码节点也用于图片，标签必须由当前用途决定，不能一律叫视频 VAE。
// 节点 id 保留完整冒号前缀，覆盖时就像按座位号找人，不能只认相同文件名。
// 音频解码器仍优先标成音频 VAE，避免与 MiniMax 的视频潜空间混淆。
export function getVideoModelSlots(prompt: ComfyApiPrompt, mediaKind: "image" | "video" | "audio" = "video"): VideoModelSlot[] {
  const counts: Record<string, number> = {};
  return Object.entries(prompt).flatMap(([id, node]) => {
    const loader = LOADERS[node.class_type];
    const value = loader && node.inputs[loader.input];
    if (typeof value !== "string") return [];
    counts[node.class_type] = (counts[node.class_type] ?? 0) + 1;
    const audio = node.class_type === "VAELoader" && Object.values(prompt).some((consumer) => consumer.class_type === "VAEDecodeAudio" && Array.isArray(consumer.inputs.vae) && consumer.inputs.vae[0] === id);
    const video = node.class_type === "VAELoader" && Object.values(prompt).some((consumer) => consumer.class_type === "VAEDecode" && Array.isArray(consumer.inputs.vae) && consumer.inputs.vae[0] === id);
    const label = audio ? "create.videoModels.audioVae" : video && mediaKind !== "image" ? "create.videoModels.videoVae" : loader.label;
    return [{ ...loader, label, id, defaultName: value, position: loader.category === "loras" ? counts[node.class_type] : undefined }];
  });
}
// 四个入口只共用辅助加载器；主模型和 LoRA 仍由已有选择器管理。
// pixel_space 是音频图中的内部占位值，不是应从磁盘选择的 VAE 文件。
// 过滤在 UI 和提交端共用，防止界面没显示的节点被覆盖参数暗中改写。
// 这里识别的是节点的 class_type 与字符串输入，不按文件路径含 clip 等单词分类。
// 所以一个名称含 vae 的 LoRA 不会被错误展示在 VAE 下拉框。
// 同一个 class_type 可以出现多个节点，过滤不做按类型去重。
// 保留完整 id 让视频的音频与图像解码器各自对应正确的加载文件。
// 内部占位值严格比较，普通名称包含 pixel_space 字样的文件不会被一概屏蔽。
// 空结果代表本图无独立加载器，不能据此往图里插入虚构节点。
// 例如 checkpoint 内置输出已与采样器连好，额外新建加载器并不等于接通它。
// 返回槽的默认名来自当前 prompt，工作流 JSON 改名后界面自动跟随。
export function getWorkflowAuxiliarySlots(prompt: ComfyApiPrompt, mediaKind: "image" | "video" | "audio" = "video") {
  return getVideoModelSlots(prompt, mediaKind).filter(slot => (slot.category === "clips" || slot.category === "vaes") && slot.defaultName !== "pixel_space");
}
// 只接受本张图真实存在的 CLIP/VAE 槽，不把其他模式的节点号套到当前图。
// 像更换插座上的电器：先核对插座，再复用原有相对路径校验，不能重新接线。
// 空覆盖保持原模板文件名；非法主模型、LoRA 或内部占位节点会明确失败。
// 调用方提供的是本次独立 prompt，历史任务和导入 JSON 不会被这个操作改写。
// 允许集合先从最终图获取，不能以另一个模式的图作为校验参照。
// 所有键先核对完再开始赋值，未知槽不会只改前几个文件就继续生成。
// 空对象表示没有定制，而不是要求把所有 loader 的文件名清成空串。
// 路径合法性继续走已有函数，避免图片与音频新增两份不一致的正则。
// 嵌套相对目录是合法文件身份的一部分，不能只保留最后一段文件名。
// 绝对路径无法由 ComfyUI 的模型根目录解释，必须在构建阶段明确拒绝。
// 主模型和 LoRA 有独立入口，不允许把它们伪装成辅助设置绕过原规则。
// 未知键即使值为空也拒绝，能让跨工作流草稿误传尽早暴露。
// 此处不检查磁盘文件实际存在，服务端名称与客户端磁盘未必属于同一机器。
// 调用方负责传新克隆的 API 图，这个方法只修改该次请求中的输入值。
export function applyWorkflowAuxiliaryOverrides(prompt: ComfyApiPrompt, overrides: VideoModelOverrides = {}) {
  const slots = new Set(getWorkflowAuxiliarySlots(prompt).map(slot => slot.id));
  if (Object.keys(overrides).some(id => !slots.has(id))) throw new Error(t("create.videoModels.invalid"));
  applyVideoModelOverrides(prompt, overrides);
}
export function isVideoModelAllowed(slot: VideoModelSlot, name: string, workflowId?: string): boolean {
  return !isMinimaxWorkflow(workflowId) || (slot.category !== "diffusionModels" && slot.category !== "loras") || /^minimax[/\\]/i.test(name);
}
export function applyVideoModelOverrides(prompt: ComfyApiPrompt, overrides: VideoModelOverrides = {}, workflowId?: string) {
  const slots = getVideoModelSlots(prompt);
  for (const [id, name] of Object.entries(overrides)) {
    if (!name) continue;
    const slot = slots.find((item) => item.id === id);
    if (!slot || /^(?:[a-z]:|[/\\])|(?:^|[/\\])\.\.(?:[/\\]|$)/i.test(name)) throw new Error(t("create.videoModels.invalid"));
    if (!isVideoModelAllowed(slot, name, workflowId)) throw new Error(t("create.videoModels.incompatible"));
    prompt[id].inputs[slot.input] = name;
  }
}
function localLoaderRoots(category: LoaderCategory, paths: SettingsPaths): string[] {
  const search = paths.searchPath.replace(/[/\\]+$/, "");
  const base = paths.diffusionModelsPath.replace(/[/\\]+$/, "");
  const siblings = base.replace(/[/\\][^/\\]+$/, "");
  const directoryNames = category === "clips" ? ["clip", "text_encoders"] : category === "vaes" ? ["vae"] : category === "loras" ? ["loras"] : ["diffusion_models", "unet"];
  const explicit = category === "diffusionModels" ? paths.diffusionModelsPath : category === "loras" ? paths.lorasPath : "";
  return [explicit, ...directoryNames.flatMap((name) => [search && `${search}/${name}`, base && siblings !== base && `${siblings}/${name}`])].filter((value): value is string => typeof value === "string" && !!value);
}
export function getVideoModelNames(slot: VideoModelSlot, models: LocalModel[], paths: SettingsPaths, lists: ComfyModelLists | null, workflowId?: string): string[] {
  const roots = localLoaderRoots(slot.category, paths);
  const local = models.flatMap((model) => model.versions.flatMap((version) => {
    const name = roots.map((root) => toComfyRelativeModelName(version.filePath, root)).find(Boolean);
    return name ? [name] : [];
  }));
  // Exact server names take precedence over locally inferred separators. Minimax is listed first, other locations remain selectable.
  const unique = new Map<string, string>();
  for (const name of [...(lists?.[slot.category] ?? []), ...local]) {
    if (!isVideoModelAllowed(slot, name, workflowId)) continue;
    const key = name.replace(/\\/g, "/").toLowerCase();
    if (!unique.has(key)) unique.set(key, name);
  }
  return [...unique.values()].sort((left, right) => Number(/minimax/i.test(right)) - Number(/minimax/i.test(left)) || left.localeCompare(right));
}
export function selectedVideoModelName(slot: VideoModelSlot, filePath: string, paths: SettingsPaths, lists: ComfyModelLists | null) {
  return resolveComfyModelNameFromList(filePath, lists?.[slot.category] ?? [], localLoaderRoots(slot.category, paths));
}
export function getVideoModelDisplay(slot: VideoModelSlot, name: string, models: LocalModel[], paths: SettingsPaths) {
  const normalize = (value: string) => value.replace(/\\/g, "/").toLowerCase();
  for (const model of models) {
    const version = model.versions.find((item) => normalize(selectedVideoModelName(slot, item.filePath, paths, null)) === normalize(name));
    if (version) return { name: version.name, cover: model.iconPath ?? "", selected: { modelId: `local-checkpoint:${model.filePath}`, versionId: version.filePath } };
  }
  return { name: name.split(/[/\\]/).pop()?.replace(/\.(safetensors|gguf|ckpt|pt|bin)$/i, "") || name, cover: "", selected: { modelId: "", versionId: "" } };
}
