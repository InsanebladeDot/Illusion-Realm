/**
 * 检查「多张图的元数据是否一致」（EXIF 工具批量操作前的守卫）；理由见下方注释。
 */
import { t } from "@/i18n";
import type { PngTextChunk } from "@/utils/exif/pngTextChunks";

export type MetadataConsistency = {
  passed: boolean;
  message: string;
  inconsistentKeys: Set<string>;
};

/**
 * 检查多张图片的元数据键集合是否一致。
 * 批量编辑要求结构一致，否则需要先标准化。
 */
export function checkMetadataConsistency(
  fileMetadatas: PngTextChunk[][]
): MetadataConsistency {
  if (fileMetadatas.length < 2) {
    return { passed: true, message: "", inconsistentKeys: new Set<string>() };
  }

  const baseKeys = new Set(fileMetadatas[0].map((item) => item.key));
  const inconsistentKeys = new Set<string>();

  for (const metadata of fileMetadatas) {
    const keys = new Set(metadata.map((item) => item.key));
    for (const key of baseKeys) {
      if (!keys.has(key)) inconsistentKeys.add(key);
    }
    for (const key of keys) {
      if (!baseKeys.has(key)) inconsistentKeys.add(key);
    }
  }

  const passed = inconsistentKeys.size === 0;
  return {
    passed,
    message: passed
      ? t("errors.metadataConsistency.passed", { count: fileMetadatas.length })
      : t("errors.metadataConsistency.inconsistent", { count: inconsistentKeys.size }),
    inconsistentKeys,
  };
}
