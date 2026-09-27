import type { PngTextChunk } from "@/utils/exif/pngTextChunks";

/** 一条 PNG tEXt 元数据（键值对） */
export type MetaItem = PngTextChunk;

export type ProcessStatus =
  | "pending"
  | "processing"
  | "done"
  | "error"
  | "inconsistent";

export type BatchMode = "edit" | "add" | "clear";

/** 已导入待处理的图片（统一抽象浏览器 File 与本地文件夹导入两种来源） */
export type ProcessedFile = {
  id: string;
  name: string;
  mimeType: string;
  buffer: ArrayBuffer;
  preview: string;
  status: ProcessStatus;
  originalSize: number;
  cleanSize?: number;
  metadata: MetaItem[];
  errorMessage?: string;
  finalFileName?: string;
  outputBlob?: Blob;
};
