import type { NegativePromptPreset } from "@/types/presetPrompt";

export const NEGATIVE_PRESET_DESCRIPTION =
  "反向提示词预设会直接填入反向提示词输入框，填入后仍可自由修改；自定义预设会保存到用户数据文件中长期保留。";

/**
 * 内置反向提示词预设。
 * 取值为社区通行写法（SDXL / Illustrious / NoobAI 通用负面），
 * 权重语法 `(tag:1.2)` 为 ComfyUI / A1111 通用。
 * 参考：
 * https://stablediffusionxl.com/sdxl-resolutions-and-aspect-ratios/
 * https://docs.seaart.ai/guide-1/6-permanent-events/high-quality-models-recommendation/noobai-xl
 */
export const BUILTIN_NEGATIVE_PRESETS: NegativePromptPreset[] = [
  {
    id: "neg-anatomy-weighted",
    name: "解剖 / 融合修正（加权）",
    isDefault: true,
    note: "针对多肢体、融合、穿插等结构性崩坏的强化负面",
    negative: [
      "(worst quality, low quality, normal quality, lowres, bad jpeg:1.4),",
      "(bad anatomy, bad proportions, disfigured, deformed, ugly, extra limbs, mutated:1.3),",
      "(bad hands, missing fingers, extra fingers, fused fingers, mutated hands, poorly drawn hands:1.3),",
      "(multiple people, crowd, group, 2girls, 3girls, 2boys, 3boys:1.2),",
      "(text, watermark, logo, signature, blurry, out of frame, cropped:1.2),",
      "poorly drawn face, mutation, extra arms, extra legs, extra breasts, fused limbs,",
      "(extra heads, multiple heads, extra faces, multiple faces, body horror, twisted body, contorted body, disjointed body, floating limbs, disconnected limbs, missing body parts, unnatural pose:2.0),",
      "(extra penis, multiple penises, two penises, duplicate penis, penis duplication, extra phallus, multiple phalluses, duplicated phallus, extra shaft, multiple shafts, floating penis, detached penis, disembodied penis, stray penis, floating phallus, detached phallus:2.0),",
      "(mesh clipping, clipping through body, interpenetration, self-intersection, model clipping, intersecting meshes, fused meshes, body clipping, geometry clipping, penetration artifacts, clipping through limbs, clipping through torso:2.0),",
      "(genital clipping, genital fusion, fused genitals, malformed genitals, extra genitals, duplicate genitals, wrong genital anatomy, unnatural genital placement:1.9),",
      "(unnatural insertion, broken penetration, incorrect penetration, anatomical errors at junction, merged bodies, fused bodies, merged limbs, merged genitals:1.8),",
      "(disconnected genitals, floating body parts, detached genitals, genital artifacts, extra sex organs, multiple sex organs:1.8),",
    ].join("\n"),
  },
  {
    id: "neg-sdxl-standard",
    name: "SDXL 通用负面",
    isDefault: true,
    note: "最通用的稳定组合，适用于绝大多数 SDXL 系模型",
    negative:
      "worst quality, low quality, normal quality, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, jpeg artifacts, signature, watermark, username, blurry, artist name",
  },
  {
    id: "neg-illustrious-anime",
    name: "二次元（Illustrious / NoobAI）",
    isDefault: true,
    note: "带 score 标签的动漫模型常用写法",
    negative:
      "worst quality, low quality, score_1, score_2, score_3, blurry, jpeg artifacts, bad anatomy, bad hands, extra digits, fewer digits, missing fingers, watermark, signature, username, artist name, dated, old, error, cropped",
  },
  {
    id: "neg-photoreal",
    name: "写实向",
    isDefault: true,
    note: "抑制插画 / 3D 质感，偏向摄影风格",
    negative:
      "cartoon, anime, 3d, cgi, render, painting, illustration, sketch, drawing, lowres, jpeg artifacts, watermark, text, signature, deformed, bad anatomy, extra limbs",
  },
  {
    id: "neg-minimal",
    name: "精简负面",
    isDefault: true,
    note: "只保留画质与签名类，适合模型自带负面嵌入时",
    negative: "worst quality, low quality, blurry, jpeg artifacts, watermark, signature",
  },
  {
    id: "neg-empty",
    name: "不使用负面",
    isDefault: true,
    note: "清空反向提示词（部分模型不需要负面）",
    negative: "",
  },
];

export const DEFAULT_NEGATIVE_PRESET_ID = "neg-anatomy-weighted";

export function findBuiltinNegativePreset(
  id: string | null | undefined
): NegativePromptPreset | undefined {
  return BUILTIN_NEGATIVE_PRESETS.find((preset) => preset.id === id);
}

export function createCustomNegativePresetId(): string {
  return `neg-custom-${Date.now()}`;
}
