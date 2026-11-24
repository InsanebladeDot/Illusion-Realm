/** 核对创作页文生图的必备加载槽，默认路径和下载目录来自同一张清单。 */
import downloads from '@illusion-realm/shared/src/data/setup-downloads.json';
import type { ComfyApiPrompt } from '@/types/comfy';
import type { LocalModel, LocalModelVersion } from '@/types/localModel';
import type { SettingsPaths } from '@/types/settings';
import type { ImageWorkflowSeries } from './imageWorkflow';
import { toComfyRelativeModelName } from './comfyModelPath';
import { getVideoModelSlots, localLoaderRoots, type VideoModelOverrides } from './video-workflow-models';

const CORE_INPUTS = { unet_name: 'diffusion_models', clip_name: 'text_encoders', vae_name: 'vae', ckpt_name: 'checkpoints' } as const;
type CoreInput = keyof typeof CORE_INPUTS;
export type ImageCoreSlot = { id: string; input: CoreInput; name: string };
export type ImageModelIssue = 'directory' | 'checking' | 'missing';
export const IMAGE_MODEL_SERIES = ['anima', 'sdxl', 'moss'] as const;
export const normalizeImageModelName = (name: string) => name.replaceAll('\\', '/').toLowerCase();

/** 下载清单记录 models 下的位置，Loader 只收分类目录以内的相对路径。 */
export function alignImageModelDefaults(prompt: ComfyApiPrompt, series: ImageWorkflowSeries) {
  const group = downloads.groups.find(item => item.id === series);
  for (const slot of imageCoreSlots(prompt)) {
    const directory = CORE_INPUTS[slot.input];
    const file = downloads.files.find(item => group?.files.includes(item.id) && item.relativePath.startsWith(`${directory}/`));
    if (file) prompt[slot.id].inputs[slot.input] = file.relativePath.slice(directory.length + 1).replaceAll('/', '\\');
  }
  return prompt;
}

export function imageCoreSlots(prompt: ComfyApiPrompt): ImageCoreSlot[] {
  const slots: ImageCoreSlot[] = getVideoModelSlots(prompt, 'image').flatMap(slot => {
    if (slot.input !== 'unet_name' && slot.input !== 'clip_name' && slot.input !== 'vae_name') return [];
    return [{ id: slot.id, input: slot.input, name: slot.defaultName }];
  });
  for (const [id, node] of Object.entries(prompt)) {
    if (node.class_type === 'CheckpointLoaderSimple' && typeof node.inputs.ckpt_name === 'string') {
      slots.push({ id, input: 'ckpt_name', name: node.inputs.ckpt_name });
    }
  }
  return slots;
}

function slotRoots(input: CoreInput, paths: SettingsPaths) {
  if (input === 'ckpt_name') return [paths.checkpointPath, paths.searchPath && `${paths.searchPath}/checkpoints`].filter(Boolean);
  return localLoaderRoots(input === 'unet_name' ? 'diffusionModels' : input === 'clip_name' ? 'clips' : 'vaes', paths);
}

/** 像按书架位置找书，核对完整相对路径，不用其他目录的同名文件顶替。 */
export function imageCoreFiles(slot: ImageCoreSlot, models: LocalModel[], paths: SettingsPaths) {
  const roots = slotRoots(slot.input, paths);
  const names = new Map<string, { name: string; model: LocalModel; file: LocalModelVersion }>();
  for (const model of models) for (const file of model.versions) {
    if (file.bytes === 0) continue;
    const name = roots.map(root => toComfyRelativeModelName(file.filePath, root)).find(Boolean);
    if (name && !names.has(normalizeImageModelName(name))) names.set(normalizeImageModelName(name), { name, model, file });
  }
  return names;
}

export function imageCoreNames(slot: ImageCoreSlot, models: LocalModel[], paths: SettingsPaths) {
  return new Map([...imageCoreFiles(slot, models, paths)].map(([key, value]) => [key, value.name]));
}

function isRelativeModelName(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim()) && !/[:\u0000]|^[/\\]|(?:^|[/\\])\.\.(?:[/\\]|$)/.test(value);
}

/** 旧文档没有此段；忽略手工写入的绝对路径和无效值。 */
export function restoreImageModelChoices(value: unknown) {
  const choices: Partial<Record<ImageWorkflowSeries, VideoModelOverrides>> = {};
  if (!value || typeof value !== 'object') return choices;
  for (const series of IMAGE_MODEL_SERIES) {
    const slots: unknown = (value as Record<string, unknown>)[series];
    if (slots && typeof slots === 'object' && !Array.isArray(slots)) {
      choices[series] = Object.fromEntries(Object.entries(slots).filter(([id, name]) => /^[\d:]+$/.test(id) && isRelativeModelName(name)));
    }
  }
  return choices;
}

export function resolveImageCoreName(slot: ImageCoreSlot, value: string, paths: SettingsPaths) {
  if (/^(?:[a-z]:|[/\\])/i.test(value)) {
    return slotRoots(slot.input, paths).map(root => toComfyRelativeModelName(value, root)).find(Boolean) ?? undefined;
  }
  return isRelativeModelName(value) ? value.replaceAll('/', '\\') : undefined;
}

/** 主模型和辅助模型走各自已有的提交字段，保留节点 ID 作为覆盖键。 */
export function splitImageModelChoices(prompt: ComfyApiPrompt, choices: VideoModelOverrides = {}) {
  const mainSlot = imageCoreSlots(prompt).find(slot => slot.input === 'unet_name' || slot.input === 'ckpt_name');
  const auxiliary = { ...choices };
  const main = mainSlot ? auxiliary[mainSlot.id] || mainSlot.name : undefined;
  // 模板升级后旧节点号不再适用，也不能作为辅助加载器提交。
  const auxiliaryIds = new Set(imageCoreSlots(prompt).filter(slot => slot.input === 'clip_name' || slot.input === 'vae_name').map(slot => slot.id));
  return { main, auxiliary: Object.fromEntries(Object.entries(auxiliary).filter(([id]) => auxiliaryIds.has(id))), mainSlot };
}

export function imageCoreReadiness(prompt: ComfyApiPrompt, choices: VideoModelOverrides, models: LocalModel[], paths: SettingsPaths, scanning: boolean) {
  const slots = imageCoreSlots(prompt);
  const hasDirectory = Boolean(paths.searchPath.trim() || slots.some(slot => slotRoots(slot.input, paths).length));
  if (!hasDirectory) return { issue: 'directory' as const, missing: [] };
  if (scanning) return { issue: 'checking' as const, missing: [] };
  const missing = slots.flatMap(slot => {
    const value = choices[slot.id] || slot.name;
    const name = resolveImageCoreName(slot, value, paths);
    return name && imageCoreFiles(slot, models, paths).has(normalizeImageModelName(name)) ? [] : [value];
  });
  return { issue: missing.length ? 'missing' as const : null, missing };
}

/** 从同一相对名恢复卡片版本身份，供选择框和编辑页的主动同步使用。 */
export function selectedImageCoreModel(slot: ImageCoreSlot, name: string, models: LocalModel[], paths: SettingsPaths) {
  const match = imageCoreFiles(slot, models, paths).get(normalizeImageModelName(name));
  if (!match) return;
  return { modelId: `local-checkpoint:${match.model.filePath}`, versionId: match.file.filePath };
}
