/**
 * 本地模型的一级分类归并：扫描目录 → 展示用分类名。
 *
 * 怎么做：路径前缀匹配 + 排除非扩散模型目录；分类名给词条 key，渲染时翻译。
 */
import type { SettingsPaths } from "@/types/settings";
import type { LocalModel } from "@/types/localModel";
import { t } from "@/i18n";

/**
 * 兜底分类名。模块级 t 在 import 时求值：该常量只用于「同进程内比较 + 展示」，
 * 两侧都取自同一常量，因此取值一致。
 */
export const UNCATEGORIZED_LOCAL_CATEGORY = t("errors.localModelCategory.uncategorized");

/**
 * 这些「模型」不能作为扩散模型使用（放进 UNETLoader.unet_name / CheckpointLoaderSimple.ckpt_name 会被 ComfyUI 判为
 * value_not_in_list）。检索路径指向整个 ComfyUI models 目录时尤其容易误收录。
 */
export const NON_DIFFUSION_MODEL_DIRS = [
  "upscale_models",
  "vae",
  "clip",
  "text_encoders",
  "clip_vision",
  "controlnet",
  "embeddings",
  "loras",
  "style_models",
  "gligen",
  "hypernetworks",
  "photomaker",
  "safety_checker",
  "diffusers",
  "model_patches",
  "audio_encoders",
] as const;

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

/** 路径是否落在上述非扩散模型目录中（只看各级目录名，不看文件名） */
export function isNonDiffusionModelPath(filePath: string): boolean {
  const segments = normalizePath(filePath)
    .toLowerCase()
    .split("/")
    .filter(Boolean)
    // 去掉文件本身，只看目录层级
    .slice(0, -1);
  return segments.some((segment) =>
    (NON_DIFFUSION_MODEL_DIRS as readonly string[]).includes(segment)
  );
}

export function resolveScanRootForType(
  paths: SettingsPaths,
  type: LocalModel["type"]
): string {
  if (type === "checkpoint") {
    return paths.checkpointPath.trim() || paths.searchPath.trim();
  }
  return paths.lorasPath.trim() || paths.searchPath.trim();
}

/** 相对扫描根目录的第一级文件夹名即为分类名 */
export function getFirstLevelCategory(
  scanRoot: string,
  folderPath: string
): string {
  const normalizedRoot = normalizePath(scanRoot).replace(/\/+$/, "");
  const normalizedFolder = normalizePath(folderPath);

  if (!normalizedRoot || !normalizedFolder) {
    return UNCATEGORIZED_LOCAL_CATEGORY;
  }

  const rootLower = normalizedRoot.toLowerCase();
  const folderLower = normalizedFolder.toLowerCase();

  if (
    folderLower !== rootLower &&
    !folderLower.startsWith(`${rootLower}/`)
  ) {
    return UNCATEGORIZED_LOCAL_CATEGORY;
  }

  const relative = normalizedFolder
    .slice(normalizedRoot.length)
    .replace(/^\/+/, "");
  const firstSegment = relative.split("/").filter(Boolean)[0];

  return firstSegment || UNCATEGORIZED_LOCAL_CATEGORY;
}

export function collectLocalModelCategories(
  models: LocalModel[],
  scanRoot: string
): string[] {
  const categories = new Set<string>();

  for (const model of models) {
    categories.add(getFirstLevelCategory(scanRoot, model.filePath));
  }

  return [...categories].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function matchesLocalModelCategory(
  folderPath: string,
  scanRoot: string,
  category: string | null
): boolean {
  if (!category) return true;
  return getFirstLevelCategory(scanRoot, folderPath) === category;
}
