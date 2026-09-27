/**
 * 「本地解析」里「从生成路径选图」那条入口。
 *
 * 怎么做：按路径读盘（`files:readImageDataUrl`）→ 还原成 Blob/File →
 * 交给 `inspectSdImageBuffer` 解析，产出与拖入文件一致的结果形状。
 */
import type { SdImageInspectResult } from "@/types/sdImageMeta";
import { readLocalImage } from "@/utils/electronBridge";
import { guessImageMimeType } from "@/utils/sdImageInspector/guessImageMime";
import { inspectSdImageBuffer } from "@/utils/sdImageInspector/inspectSdImage";
import { t } from "@/i18n";

export async function inspectGeneratedImageFromPath(
  filePath: string,
  fileName: string
): Promise<SdImageInspectResult> {
  const mimeType = guessImageMimeType(fileName);
  if (!mimeType) {
    throw new Error(t("errors.sdImage.unsupportedFormat"));
  }

  const dataUrl = await readLocalImage(filePath);
  if (!dataUrl) {
    throw new Error(t("errors.desktopOnly.readLocalImage"));
  }

  const response = await fetch(dataUrl);
  const buffer = await response.arrayBuffer();

  const result = await inspectSdImageBuffer(
    buffer,
    mimeType,
    fileName,
    dataUrl
  );

  return {
    fileName,
    fileSize: buffer.byteLength,
    metaType: result.metaType,
    fields: result.fields,
    exif: result.exif,
    rawParameters: result.rawParameters,
  };
}
