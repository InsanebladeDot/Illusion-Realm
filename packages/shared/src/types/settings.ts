export type SettingsPathKey =
  | "searchPath"
  | "checkpointPath"
  | "lorasPath"
  | "diffusionModelsPath";

export type SettingsPaths = Record<SettingsPathKey, string>;

export const SETTINGS_PATH_LABELS: Record<
  SettingsPathKey,
  { label: string; description: string }
> = {
  searchPath: {
    label: "检索路径",
    description: "本地模型根目录，用于统一检索 Checkpoint 与 LoRA",
  },
  checkpointPath: {
    label: "Checkpoint 模型地址",
    description: "Stable Diffusion 主模型（.safetensors / .ckpt）所在文件夹",
  },
  lorasPath: {
    label: "LoRA 模型地址",
    description: "LoRA 模型文件所在文件夹",
  },
  diffusionModelsPath: {
    label: "Diffusion 模型地址",
    description:
      "Diffusion 模型（.safetensors / .gguf）所在文件夹，Anima 系列模型存放于其 Anima 子目录",
  },
};

export const EMPTY_SETTINGS_PATHS: SettingsPaths = {
  searchPath: "",
  checkpointPath: "",
  lorasPath: "",
  diffusionModelsPath: "",
};

export const DEFAULT_COMFY_SERVER_URL = "127.0.0.1:8188";

export const OUTPUT_PATH_SETTING = {
  label: "生成图片保存路径",
  description:
    "生成完成后自动保存到此文件夹。留空则使用默认路径：与软件目录同级的「Illusion Realm Output」文件夹。",
} as const;
