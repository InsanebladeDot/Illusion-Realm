/** 给实际提交的主模型、CLIP、VAE 与模板生成组合同一凭据，出图结果据此登记。 */
import type { ComfyApiPrompt } from '@/types/comfy';
import type { LocalModel } from '@/types/localModel';
import type { ImageModelVerification } from '@/types/userData';
import type { SettingsPaths } from '@/types/settings';
import { imageCoreFiles, imageCoreSlots, normalizeImageModelName } from './image-core-models';
import type { VideoModelOverrides } from './video-workflow-models';

export interface ImageModelCheck {
  identity: string;
  names: ReadonlyArray<{ id: string; input: string; name: string }>;
}

/** 像把几件配套器材登记到同一张单，任一文件或工作流变化都要重新试跑。 */
export function describeImageModelCheck(template: ComfyApiPrompt, choices: VideoModelOverrides, models: LocalModel[], paths: SettingsPaths, server: string): ImageModelCheck | undefined {
  const slots = imageCoreSlots(template);
  if (!slots.some(slot => slot.input === 'unet_name')) return;
  const names = [];
  const revisions = [];
  for (const slot of slots) {
    const name = normalizeImageModelName(choices[slot.id] || slot.name);
    const match = imageCoreFiles(slot, models, paths).get(name);
    if (!match || match.file.bytes === undefined || match.file.modifiedAt === undefined) return;
    names.push({ id: slot.id, input: slot.input, name });
    // 文件改动由模型扫描发现，用 stat 区分版本，避免为试跑每次读完整权重。
    revisions.push([match.file.filePath, match.file.bytes, match.file.modifiedAt]);
  }
  return { identity: JSON.stringify([server, template, names, revisions]), names };
}

export async function imageModelCheckKey(check: ImageModelCheck) {
  // 只落盘摘要，设置里不重复保存模型绝对路径或 ComfyUI 地址。
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(check.identity));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function matchesImageModelCheck(prompt: ComfyApiPrompt, check: ImageModelCheck) {
  return check.names.every(({ id, input, name }) => {
    const actual = prompt[id]?.inputs[input];
    return typeof actual === 'string' && normalizeImageModelName(actual) === name;
  });
}

/** 老文档没有记录；只恢复有效摘要和实际可写入的结果。 */
export function restoreImageModelChecks(value: unknown): Record<string, ImageModelVerification> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, status]) =>
    /^[a-f0-9]{64}$/.test(key) && (status === 'verified' || status === 'unsupported'),
  ).slice(-32));
}

export function isPrimaryUnetError(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  return error.code === 'COMFY_UNET_NOT_FOUND' || error.code === 'COMFY_UNET_LOAD_FAILED';
}
