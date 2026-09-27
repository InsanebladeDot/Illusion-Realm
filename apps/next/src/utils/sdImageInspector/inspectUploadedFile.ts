/**
 * 「本地解析」里拖入 / 选择文件那条入口。
 *
 * 怎么做：先按扩展名与 MIME 校验是否可解析，再读成 ArrayBuffer 交给
 * `inspectSdImageBuffer`（与「从路径选图」共用同一个解析器）。
 */
import { t } from "@/i18n";
import type { SdImageInspectResult } from "@/types/sdImageMeta";
import {
  guessImageMimeType,
  INSPECTABLE_IMAGE_EXTENSIONS,
} from "@/utils/sdImageInspector/guessImageMime";
import { inspectSdImageBuffer } from "@/utils/sdImageInspector/inspectSdImage";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error ?? new Error(t("inspect.errors.readFailed")));
    reader.readAsDataURL(file);
  });
}

export function isInspectableImageFile(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && INSPECTABLE_IMAGE_EXTENSIONS.includes(ext)) return true;
  return file.type.startsWith("image/");
}

export async function inspectUploadedImageFile(
  file: File
): Promise<SdImageInspectResult> {
  const mimeType =
    file.type || guessImageMimeType(file.name) || "application/octet-stream";

  if (!mimeType.startsWith("image/")) {
    throw new Error(t("inspect.errors.unsupportedFormat"));
  }

  const [buffer, dataUrl] = await Promise.all([
    file.arrayBuffer(),
    readFileAsDataUrl(file),
  ]);

  const result = await inspectSdImageBuffer(
    buffer,
    mimeType,
    file.name,
    dataUrl
  );

  return {
    fileName: file.name,
    fileSize: buffer.byteLength,
    metaType: result.metaType,
    fields: result.fields,
    exif: result.exif,
    rawParameters: result.rawParameters,
  };
}
