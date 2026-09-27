/**
 * ComfyUI models 根目录下的标准分类目录（任务规范：src/data 静态数据）
 * 本地模型按这些分类逐层查询与展示：分类名/子文件夹名/.../模型文件名.扩展名
 */
export const STANDARD_MODEL_CATEGORIES = [
  "background_removal",
  "checkpoints",
  "clip",
  "clip_vision",
  "configs",
  "controlnet",
  "detection",
  "diffusers",
  "diffusion_models",
  "embeddings",
  "frame_interpolation",
  "geometry_estimation",
  "gligen",
  "hypernetworks",
  "ipadapter",
  "latent_upscale_models",
  "loras",
  "model_patches",
  "onnx",
  "optical_flow",
  "photomaker",
  "sams",
  "style_models",
  "text_encoders",
  "unet",
  "upscale_models",
  "vae",
] as const;

export type StandardModelCategory = (typeof STANDARD_MODEL_CATEGORIES)[number];

/** 模型根目录固定语义的参考路径（实际以设置页配置为准） */
export const DEFAULT_MODEL_ROOT = "F:\\AI\\ComfyUI\\Comfy_ui_module\\models";

/** diffusion_models 分类额外支持的模型扩展名 */
export const DIFFUSION_MODEL_EXTENSIONS = [".gguf", ".safetensors"] as const;

export function isStandardModelCategory(name: string): boolean {
  return (STANDARD_MODEL_CATEGORIES as readonly string[]).includes(name);
}
