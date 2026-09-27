/**
 * EXIF 工具的图片处理：写入 / 清空元数据、按规则改名。
 *
 * 怎么做：读成 ArrayBuffer → 用 `exif/pngTextChunks` 删旧块、写新块 →
 * 返回新 buffer 与新文件名（不落盘，落盘由页面调 IPC 完成）。
 */
import {
  stripPngTextChunks,
  writePngTextChunks,
  type PngTextChunk,
} from "@/utils/exif/pngTextChunks";
import { buildRenamedName } from "@/utils/exif/format";

export type ImageProcessInput = {
  buffer: ArrayBuffer;
  name: string;
  mimeType: string;
};

export type ImageProcessOptions = {
  /** 要写入的元数据；null 表示保持原样 */
  metadata: PngTextChunk[] | null;
  /** 是否清空元数据（优先级高于 metadata） */
  clearMetadata: boolean;
  /** 重命名配置；null 表示保持原文件名 */
  rename: { prefix: string; sequence: number } | null;
};

export type ImageProcessResult = {
  blob: Blob;
  size: number;
  fileName: string;
};

const PNG_MIME = "image/png";

/**
 * 对单张图片应用元数据与重命名：
 * - 非 PNG 图片不做元数据读写（仅重命名）
 * - clearMetadata 优先于 metadata
 */
export function processImage(
  input: ImageProcessInput,
  options: ImageProcessOptions
): ImageProcessResult {
  const isPng = input.mimeType === PNG_MIME || input.name.toLowerCase().endsWith(".png");

  let outputBuffer = input.buffer;
  if (isPng) {
    if (options.clearMetadata) {
      outputBuffer = stripPngTextChunks(input.buffer);
    } else if (options.metadata) {
      outputBuffer = writePngTextChunks(input.buffer, options.metadata);
    }
  }

  const blob = new Blob([outputBuffer], { type: input.mimeType || PNG_MIME });
  const fileName = options.rename
    ? buildRenamedName(input.name, options.rename.prefix, options.rename.sequence)
    : input.name;

  return { blob, size: blob.size, fileName };
}

/** Blob → base64（不含 data URL 前缀），用于通过 IPC 写盘 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}
