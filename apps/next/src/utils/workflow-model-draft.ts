/** 只抽取当前所选加载文件供界面检查；不校验提示词，也不上传占位参考素材。 */
import type { ComfyApiPrompt } from '@/types/comfy';
import { getVideoModelSlots, type VideoModelOverrides } from '@/utils/comfy/video-workflow-models';
import { buildSeedvr2Prompt, type UpscaleSettings } from '@/utils/comfy/seedvr2-workflow';

interface Selection { overrides?: VideoModelOverrides; main?: string | null; loras?: { name: string }[]; upscale?: UpscaleSettings }

export function workflowModelDraft(template: ComfyApiPrompt, selection: Selection = {}): ComfyApiPrompt {
  const prompt = structuredClone(template);
  for (const slot of getVideoModelSlots(prompt)) {
    if (selection.overrides?.[slot.id]) prompt[slot.id].inputs[slot.input] = selection.overrides[slot.id];
    if (slot.category === 'diffusionModels' && selection.main) prompt[slot.id].inputs[slot.input] = selection.main;
    if (slot.category === 'loras' && selection.loras !== undefined) delete prompt[slot.id];
  }
  if (selection.main) for (const node of Object.values(prompt)) {
    if (node.class_type === 'CheckpointLoaderSimple') node.inputs.ckpt_name = selection.main;
  }
  selection.loras?.forEach((file, index) => { prompt[`readiness-lora-${index}`] = { class_type: 'LoraLoaderModelOnly', inputs: { lora_name: file.name } }; });
  // 开启超分才检查超分依赖；缺 7B 不应阻止只用 3B 或关闭超分的生成。
  if (selection.upscale?.enabled) Object.entries(buildSeedvr2Prompt('readiness.png', 'image', selection.upscale)).forEach(([id, node]) => { prompt[`readiness-upscale-${id}`] = node; });
  return prompt;
}
