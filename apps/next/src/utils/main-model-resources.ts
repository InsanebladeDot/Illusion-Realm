/**
 * 主模型扫描结果的展示适配：只取当前系列目录，按其下的分类聚合，保留每个文件的真实选择值。
 * 分类/模型/文件布局与 LoRA 一样展示；旧的系列直存、模型文件夹直存也继续可选，空目录不生成卡片。
 */
import type { LocalModel } from "@/types/localModel";
import type { SelectedModel } from "@/types/model";
import type { SettingsPaths } from "@/types/settings";
import { makeLocalCheckpointId, type LocalResourceSeries } from "@/utils/localModelResources";
import type { ResourceSelectionGroup, ResourceSelectionOption } from "@/utils/resource-selection";

function normalizePath(value: string) {
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function getModelSeriesName(series: LocalResourceSeries) {
  return series === "sdxl" ? "SDXL" : series === "minimax" ? "Minimax" : "Anima";
}

function getSeriesRoot(paths: SettingsPaths, series: LocalResourceSeries) {
  const explicit = series === "sdxl" ? paths.checkpointPath : paths.diffusionModelsPath;
  const root = explicit?.trim() || (paths.searchPath.trim()
    ? normalizePath(paths.searchPath.trim()) + (series === "sdxl" ? "/checkpoints" : "/diffusion_models")
    : "");
  return root ? normalizePath(root) + "/" + getModelSeriesName(series) : "";
}

function getCategory(model: LocalModel, root: string, series: LocalResourceSeries) {
  const folder = normalizePath(model.filePath);
  if (root) {
    if (folder.toLowerCase() === root.toLowerCase()) return model.name;
    if (!folder.toLowerCase().startsWith(root.toLowerCase() + "/")) return null;
    return folder.slice(root.length + 1).split("/")[0] || model.name;
  }
  const seriesName = getModelSeriesName(series).toLowerCase();
  if (model.category?.toLowerCase() !== seriesName) return null;
  const parts = folder.split("/");
  const index = parts.findLastIndex((part) => part.toLowerCase() === seriesName);
  return parts[index + 1] || model.name;
}

function getModelOptions(model: LocalModel, category: string): ResourceSelectionOption[] {
  return model.versions.map((file) => ({
    id: file.filePath,
    label: model.versions.length === 1 && category !== model.name ? model.name : file.name,
    detailLabel: file.name,
    cover: model.iconPath ?? "",
  }));
}

export function buildMainModelResources(
  models: LocalModel[], paths: SettingsPaths, series: LocalResourceSeries
) {
  const root = getSeriesRoot(paths, series);
  const groups = new Map<string, ResourceSelectionGroup>();
  const selections = new Map<string, SelectedModel>();
  const sorted = [...models].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  for (const model of sorted) {
    if (model.type !== "checkpoint" || !model.versions.length) continue;
    const category = getCategory(model, root, series);
    if (!category) continue;
    const versions = getModelOptions(model, category);
    const group = groups.get(category) ?? {
      id: `local-model-category:${series}:${category}`, name: category, category,
      cover: versions[0].cover ?? "", tag: category, versions: [],
    };
    group.versions.push(...versions);
    groups.set(category, group);
    for (const file of model.versions) selections.set(file.filePath, {
      modelId: makeLocalCheckpointId(model.filePath), versionId: file.filePath,
    });
  }
  const resources = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  return { resources, selections };
}
