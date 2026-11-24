/** 用完整 SHA256 作为内容指纹；文件名和版本标题不能证明模型相同。 */
import type { LocalModel } from "@/types/localModel";
import type { SettingsPaths } from "@/types/settings";
import type { CivitaiModel, CivitaiVersion } from "@/utils/civitai";
import type { LocalModelMetadataEntry } from "@illusion-realm/shared";

/** 拒绝短摘要和空值；十六进制大小写不影响文件身份。 */
function normalizedSha256(value: string): string {
  const trimmed = value.trim();
  return /^[a-f\d]{64}$/i.test(trimmed) ? trimmed.toLowerCase() : "";
}

/** 只收集完整摘要，不在浏览列表时读取大型权重。
 * 离线记录失效时用空串阻断来源回退，不能拿旧指纹证明新文件相同。
 */
export function localModelHashes(entries: LocalModelMetadataEntry[]): Set<string> {
  return new Set(entries.map(entry => normalizedSha256(entry.localSha256 ?? (entry.status === "ready" ? entry.metadata?.sha256 || "" : ""))).filter(Boolean));
}

/** 返回命中的官网版本。一个版本有多个文件时，任一文件的完整 SHA256 命中就标记该版本。 */
export function findLocalCivitaiVersions(model: CivitaiModel, hashes: ReadonlySet<string>): CivitaiVersion[] {
  if (hashes.size === 0) return [];
  return model.versions.filter(version => version.files.some(file => {
    const hash = normalizedSha256(file.sha256);
    return hash !== "" && hashes.has(hash);
  }));
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
