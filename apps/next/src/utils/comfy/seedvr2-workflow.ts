/** 克隆用户提供的SeedVR2图，接入模型、倍数、批次与种子；原模板不受表单修改。 */
import template from "@/data/comfy/utillswWorkflower/Seedvr2_upscaled_image/utility_seedvr2_7b_int8_upscale_image.json";
import videoTemplate from "@/data/comfy/utillswWorkflower/Seedvr2_upscaled_image/utility_seedvr2_3b_int8_upscale_video.json";
import type { ComfyApiPrompt } from "@/types/comfy";
import { t } from "@/i18n";

import { UpscaleSettingsSchema, type UpscaleSettings } from "@/schemas/upscale-settings.schema";
export type { UpscaleSettings };
export const DEFAULT_UPSCALE = { enabled: false, model: "seedvr2_7b", scale: 2, batchFrames: 10, seedMode: "shared", seed: "0" } satisfies UpscaleSettings;
export const UPSCALE_SCALES = [2, 3, 4, 5, 6, 7, 8] as const;

/** 旧工程没有批次和种子字段时补默认值，不反写或清空原节点。 */
export function resolveUpscaleSettings(value?: UpscaleSettings) {
  return { ...DEFAULT_UPSCALE, ...value, batchFrames: value?.batchFrames ?? 10, seedMode: value?.seedMode ?? "shared", seed: value?.seed ?? "0" };
}

/** 像同一卷胶片共用冲洗配方：shared只在任务开始抽一次，random每批重新抽。 */
export function upscaleSeed(value: UpscaleSettings, sharedSeed?: number): number {
  const config = resolveUpscaleSettings(value);
  if (config.seedMode === "fixed") return Number(config.seed);
  if (config.seedMode === "shared" && sharedSeed !== undefined) return sharedSeed;
  const words = crypto.getRandomValues(new Uint32Array(2));
  return (words[0] & 0xffff) * 4294967296 + words[1];
}

/** 两种权重沿用同一模板接线；交给现有模型匹配器解析服务端实际目录。 */
function applyUpscaleSettings(prompt: ComfyApiPrompt, value: UpscaleSettings) {
  const name = value.model === "seedvr2_3b" ? "seedvr2_3b_int8_convrot" : "seedvr2_7b_int8_convrot";
  prompt["66:52"].inputs.unet_name = `SeedVR2\\${name}.safetensors`;
  prompt["66:57"].inputs["resize_type.multiplier"] = value.scale;
  prompt["66:54"].inputs.seed = upscaleSeed(value);
}

export function buildSeedvr2Prompt(name: string, kind: "image" | "video", value: UpscaleSettings): ComfyApiPrompt {
  if (!name || !value.enabled || !UpscaleSettingsSchema.safeParse(value).success) throw Error(t("canvas.upscaleInvalid"));
  if (kind === "video") return buildSeedvr2VideoPrompt(name, value);
  const prompt: ComfyApiPrompt = structuredClone(template);
  applyUpscaleSettings(prompt, value);
  prompt["1"].inputs.image = name;
  prompt["76"] = { class_type: "SaveImage", inputs: { images: ["66:59", 0], filename_prefix: "IllusionRealm/SeedVR2" } };
  return prompt;
}

/** 原帧以所选批帧数作为FPS重组，切片固定1秒；恢复原FPS在所有批次取回后进行。 */
function buildSeedvr2VideoPrompt(name: string, value: UpscaleSettings): ComfyApiPrompt {
  const prompt: ComfyApiPrompt = structuredClone(videoTemplate);
  prompt["73"].inputs.file = name;
  prompt["113:112"].inputs.fps = resolveUpscaleSettings(value).batchFrames;
  prompt["113:115"].inputs.start_time = 0;
  prompt["113:115"].inputs.duration = 1;
  applyUpscaleSettings(prompt, value);
  prompt["76"].inputs.filename_prefix = "IllusionRealm/SeedVR2Video";
  return prompt;
}


/** 克隆同源请求，只推进切片开始秒数；原图和其他批次不受修改。 */
export function seedvr2VideoBatch(graph: ComfyApiPrompt, startTime: number, frames: number, seed?: number): ComfyApiPrompt {
  const batchFrames = Number(graph["113:112"].inputs.fps);
  if (!Number.isInteger(batchFrames) || batchFrames < 1 || batchFrames > 120 || !Number.isInteger(startTime) || startTime < 0 || !Number.isInteger(frames) || frames < 1 || frames > batchFrames) throw Error(t("canvas.upscaleInvalid"));
  const prompt = structuredClone(graph);
  if (seed !== undefined) prompt["66:54"].inputs.seed = seed;
  prompt["113:115"].inputs.start_time = startTime;
  prompt["113:115"].inputs.duration = 1;
  // 原生组件视频忽略宽松截长，尾批套一层原生视频列表，让不足一秒也按余帧返回。
  // 像给不足一盒的胶卷加个外盒：不复制胶卷，不改1秒参数，只允许最后一盒未装满。
  if (frames < batchFrames) {
    prompt.ir_tail_video = { class_type: "ConcatenateVideo", inputs: { "videos.video0": ["113:112", 0], codec: "auto" } };
    prompt["113:115"].inputs.video = ["ir_tail_video", 0];
  }
  return prompt;
}
