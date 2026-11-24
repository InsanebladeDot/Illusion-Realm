/** H3 文字改图：克隆用户模板，按参考图顺序扩展原生图片输入，不改原 JSON。 */
import template from "@/data/comfy/utillswWorkflower/Minimax_h3_image/image_p_h3_image_edit.json";
import type { ComfyApiPrompt } from "@/types/comfy";
import type { AnimaEditSettings } from "./anima-edit-workflow";
import { applyVideoModelOverrides } from "./video-workflow-models";
import { applyVideoLoras, getVideoLoras } from "./video-workflow-loras";
import { t } from "@/i18n";
import { imagePromptMedia } from "./image-reference-media";
import { alignedEditImageSize, isEditImageSize, resizeEditedOutput } from "./image-edit-size";
import { normalizeVideoReferences } from "./video-reference-media";

// 保留模板的采样器、手动 sigma 和模型链；兼容字段不展示为可调参数。
export const MINIMAX_IMAGE_EDIT_DEFAULTS: AnimaEditSettings = {
  editWorkflow: "minimax-image-edit", instruction: "", negative: "",
  megapixels: template["6"].inputs.megapixels, seed: String(template["12"].inputs.noise_seed),
  steps: 8, cfg: 1, denoise: 1, samplerName: template["11"].inputs.sampler_name,
  scheduler: "simple", checkpointName: template["1"].inputs.unet_name,
  loras: getVideoLoras(template).map(({ name, strength }) => ({ name, strength })),
};

/** 模型设置直接读取真实加载槽；比较器只用于原网页，不参与推理。 */
export function getMinimaxImageEditTemplate(): ComfyApiPrompt {
  const prompt: ComfyApiPrompt = structuredClone(template);
  delete prompt["20"];
  return prompt;
}

/** 一次最多八张，与画布已有参考资源上限一致；第一张决定基础画幅。 */
export function buildMinimaxImageEditPrompt(value: AnimaEditSettings, names: string[]): ComfyApiPrompt {
  validateMinimaxImageEdit(value, names);
  const prompt = getMinimaxImageEditTemplate();
  // 在实际工作流边界转换，不能只有预览显示官方标记而请求仍带 @。
  prompt["9"].inputs.prompt = value.promptConversion === false ? value.instruction.trim() : normalizeVideoReferences(value.instruction.trim(), imagePromptMedia(names), value.promptReferenceLabels);
  prompt["12"].inputs.noise_seed = Number(value.seed);
  prompt["1"].inputs.unet_name = value.checkpointName;
  names.forEach((name, index) => addReference(prompt, value, name, index));
  // 首图决定采样尺寸，解码后将可能出现的 32 像素对齐还原。
  if (value.outputSize) resizeEditedOutput(prompt, value.outputSize, 32);
  applyVideoModelOverrides(prompt, value.modelOverrides);
  // 扩展接在主模型后面，沿用 MiniMax 的目录、权重校验和模型链连接规则。
  applyVideoLoras(prompt, value.loras.map((item, index) => ({ ...item, id: String(index) })), "minimax");
  return prompt;
}

function addReference(prompt: ComfyApiPrompt, value: AnimaEditSettings, name: string, index: number) {
  const source = index ? `h3-source-${index}` : "26", scale = index ? `h3-scale-${index}` : "6";
  prompt[source] = { class_type: "LoadImage", inputs: { image: name } };
  prompt[scale] = { class_type: "ImageScaleToTotalPixels", inputs: { ...template["6"].inputs, image: [source, 0], megapixels: value.megapixels } };
  if (index === 0 && value.outputSize) prompt[scale] = { class_type: "ImageScale", inputs: { image: [source, 0], upscale_method: "lanczos", ...alignedEditImageSize(value.outputSize, 32), crop: "disabled" } };
  prompt["9"].inputs[`images.image_${index + 1}`] = [scale, 0];
}

/** 拒绝无图、坏种子和非法尺寸；不把 Anima 的 MP/采样枚举套到 H3。 */
function validateMinimaxImageEdit(value: AnimaEditSettings, names: string[]) {
  if (!names.length || names.length > 8 || names.some(name => !name)) throw Error(t("canvas.remoteInputInvalid"));
  if (!value.instruction.trim() || value.instruction.length > 3000) throw Error(t("create.animaEdit.invalidInstruction"));
  if (!/^\d+$/.test(value.seed) || !Number.isSafeInteger(Number(value.seed))) throw Error(t("create.animaEdit.invalidSeed"));
  if (value.controlMode || !Number.isFinite(value.megapixels) || value.megapixels < 0.1 || value.megapixels > 2 || !value.checkpointName) throw Error(t("create.animaEdit.invalidParameters"));
  if (value.outputSize && !isEditImageSize(value.outputSize)) throw Error(t("create.animaEdit.invalidParameters"));
}
