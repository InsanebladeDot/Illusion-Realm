/**
 * 模型文件的识别与展示辅助（真正的目录扫描在主进程 `apps/electron/modelScanner.js`）。
 *
 * 怎么做：扩展名白名单、展示名清洗、图标候选优先级 —— 全是纯函数。
 */
import type { LocalModel, LocalModelType, LocalModelVersion } from "@/types/localModel";

export const MODEL_FILE_EXTENSIONS = [
  ".safetensors",
  ".ckpt",
  ".pt",
  ".pth",
] as const;

export const MODEL_ICON_NAMES = [
  "logo.png",
  "logo.jpg",
  "logo.webp",
  "preview.png",
  "preview.jpg",
  "preview.webp",
  "thumbnail.png",
  "cover.png",
  "icon.png",
] as const;

const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|webp|gif|bmp)$/i;

export function isModelFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return MODEL_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function getModelDisplayName(filePath: string): string {
  const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
}

export function isImageFile(fileName: string): boolean {
  return IMAGE_EXTENSION_PATTERN.test(fileName);
}

export function pickPreferredIconFile(fileNames: string[]): string | null {
  const lowerMap = new Map(fileNames.map((name) => [name.toLowerCase(), name]));

  for (const preferred of MODEL_ICON_NAMES) {
    const match = lowerMap.get(preferred);
    if (match) return match;
  }

  return fileNames.find(isImageFile) ?? null;
}

function getParentDir(filePath: string): string {
  const index = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return index >= 0 ? filePath.slice(0, index) : filePath;
}

function getFolderName(folderPath: string): string {
  const parts = folderPath.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? folderPath;
}

const LORA_PATH_PATTERN = /(^|[/\\])(lora|loras|lycoris|loha)([/\\]|$)/i;

export function inferLocalModelType(folderPath: string): LocalModelType {
  if (/(^|[/\\])embeddings([/\\]|$)/i.test(folderPath)) return "embedding";
  return LORA_PATH_PATTERN.test(folderPath) ? "lora" : "checkpoint";
}

export function applySearchPathClassification(
  models: LocalModel[]
): LocalModel[] {
  return models.map((model) => ({
    ...model,
    type: inferLocalModelType(model.filePath),
  }));
}

type LegacyLocalModel = Partial<LocalModel> &
  Pick<LocalModel, "id" | "name" | "type"> & {
    filePath?: string;
    iconPath?: string | null;
    category?: string;
    versions?: LocalModelVersion[];
  };

export function normalizeLocalModel(raw: LegacyLocalModel): LocalModel {
  if (Array.isArray(raw.versions) && raw.versions.length > 0) {
    return {
      id: raw.id,
      name: raw.name,
      filePath: raw.filePath ?? raw.id,
      iconPath: raw.iconPath ?? null,
      type: raw.type,
      category: raw.category,
      versions: raw.versions,
    };
  }

  const filePath = raw.filePath ?? raw.id;

  if (isModelFile(filePath.split(/[/\\]/).pop() ?? filePath)) {
    const folderPath = getParentDir(filePath);
    const versionName = getModelDisplayName(filePath);

    return {
      id: folderPath,
      name: raw.name || getFolderName(folderPath) || versionName,
      filePath: folderPath,
      iconPath: raw.iconPath ?? null,
      type: raw.type,
      category: raw.category,
      versions: [
        {
          id: filePath,
          name: versionName,
          filePath,
        },
      ],
    };
  }

  return {
    id: raw.id,
    name: raw.name,
    filePath,
    iconPath: raw.iconPath ?? null,
    type: raw.type,
    category: raw.category,
    versions: [],
  };
}

export function normalizeLocalModels(models: LegacyLocalModel[]): LocalModel[] {
  return mergeLocalModels(models.map(normalizeLocalModel));
}

export function mergeLocalModels(models: LocalModel[]): LocalModel[] {
  const map = new Map<string, LocalModel>();

  for (const raw of models) {
    const model = normalizeLocalModel(raw);

    const existing = map.get(model.id);
    if (!existing) {
      map.set(model.id, model);
      continue;
    }

    const seen = new Set(existing.versions.map((version) => version.filePath));
    const mergedVersions = [...existing.versions];

    for (const version of model.versions) {
      if (seen.has(version.filePath)) continue;
      seen.add(version.filePath);
      mergedVersions.push(version);
    }

    mergedVersions.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

    map.set(model.id, {
      ...existing,
      iconPath: existing.iconPath ?? model.iconPath,
      versions: mergedVersions,
    });
  }

  return Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "zh-CN")
  );
}

export function countModelsByType(models: LocalModel[]) {
  return models.reduce(
    (acc, model) => {
      acc[model.type] += 1;
      return acc;
    },
    { checkpoint: 0, lora: 0, embedding: 0 } satisfies Record<LocalModelType, number>
  );
}
