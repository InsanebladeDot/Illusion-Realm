/** 模型选择器按完整文件路径隐藏版本，原始扫描结果仍供工作流解析。 */
import type { LocalModel } from "@/types/localModel";

export function modelPathKey(path: string) {
  return path.replace(/\\/g, "/").toLowerCase();
}

export function visibleLocalModels(models: LocalModel[], hiddenPaths: readonly string[]) {
  if (!hiddenPaths.length) return models;
  const hidden = new Set(hiddenPaths);
  // 模型组像一格书架，只取下隐藏的版本，空了才撤掉整组。
  return models.flatMap(model => {
    const versions = model.versions.filter(version => !hidden.has(modelPathKey(version.filePath)));
    return versions.length ? [{ ...model, versions }] : [];
  });
}

/** ComfyUI 返回相对路径，按对应的模型根还原门牌号，不能只比较文件名。 */
export function isModelNameHidden(name: string, roots: string[], hiddenPaths: readonly string[]) {
  const key = modelPathKey(name);
  if (!key) return false;
  return hiddenPaths.includes(key) || roots.some(root => hiddenPaths.includes(`${modelPathKey(root).replace(/\/+$/, "")}/${key}`));
}
