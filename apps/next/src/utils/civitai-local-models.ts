/** 按文件名匹配在线和本地模型；复用设置扫描结果，不推断文件内容或版本相同。 */
import type { LocalModel } from "@/types/localModel";
import type { CivitaiModel } from "@/utils/civitai";
import type { SettingsPaths } from "@/types/settings";

export function localModelFileNames(models: LocalModel[]): Set<string> {
  return new Set(models.flatMap((model) => model.versions.map((version) =>
    (version.filePath.split(/[/\\]/).pop() || version.name).toLowerCase()
  )));
}

export function hasLocalCivitaiFile(model: CivitaiModel, names: Set<string>): boolean {
  return model.versions.some((version) => version.files.some((file) => names.has(file.name.toLowerCase())));
}

/** Display the category inside the model type/series directory, matching native download destinations. */
export function localLibraryCategory(model: LocalModel, paths: SettingsPaths): string {
  const normalize = (value: string) => value.replace(/\\/g, "/").replace(/\/+$/, "");
  const folder = normalize(model.filePath);
  const roots = paths.searchPath ? [paths.searchPath] : [paths.lorasPath, paths.checkpointPath, paths.diffusionModelsPath];
  const root = roots.map(normalize).filter(Boolean).find((value) => folder.toLowerCase().startsWith(value.toLowerCase() + "/"));
  if (!root) return model.category || "Uncategorized";
  const segments = folder.slice(root.length + 1).split("/");
  if (paths.searchPath && /^(loras|checkpoints|diffusion_models|embeddings)$/i.test(segments[0])) segments.shift();
  if (/^(anima|sdxl)$/i.test(segments[0]) && segments.length > 2) segments.shift();
  return segments.length > 1 ? segments[0] : model.category || "Uncategorized";
}
