/** Extract selectable loader slots from video templates; reuse local scanner paths and ComfyUI relative-name conversion. */
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
export function getVideoModelSlots(prompt: ComfyApiPrompt): VideoModelSlot[] {
  const counts: Record<string, number> = {};
  return Object.entries(prompt).flatMap(([id, node]) => {
    const loader = LOADERS[node.class_type];
    const value = loader && node.inputs[loader.input];
    if (typeof value !== "string") return [];
    counts[node.class_type] = (counts[node.class_type] ?? 0) + 1;
    const audio = node.class_type === "VAELoader" && Object.values(prompt).some((consumer) => consumer.class_type === "VAEDecodeAudio" && Array.isArray(consumer.inputs.vae) && consumer.inputs.vae[0] === id);
    const video = node.class_type === "VAELoader" && Object.values(prompt).some((consumer) => consumer.class_type === "VAEDecode" && Array.isArray(consumer.inputs.vae) && consumer.inputs.vae[0] === id);
    const label = audio ? "create.videoModels.audioVae" : video ? "create.videoModels.videoVae" : loader.label;
    return [{ ...loader, label, id, defaultName: value, position: loader.category === "loras" ? counts[node.class_type] : undefined }];
  });
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
