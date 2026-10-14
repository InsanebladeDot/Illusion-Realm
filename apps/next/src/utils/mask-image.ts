/**
 * 把涂抹覆盖率导出为原尺寸 mask；黑白图取覆盖率，ComfyUI 原图取反向 alpha。
 * PNG 直接压缩 RGBA 字节，避免 Canvas 编码把透明区域的原图 RGB 清零。
 */
import { deflate } from "pako";
import { t } from "@/i18n";
import { encodePngChunk } from "./exif/pngTextChunks";

export interface MaskSource { url: string; name: string; width: number; height: number }
export interface MaskExports { mask: Blob; image: Blob; width: number; height: number }

export function loadMaskImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const finish = (failed: boolean) => {
      window.clearTimeout(timer); image.onload = null; image.onerror = null;
      if (failed) reject(new Error(t("create.maskEditor.loadFailed")));
      else resolve(image);
    };
    const timer = window.setTimeout(() => finish(true), 15000);
    image.onload = () => finish(!image.naturalWidth || !image.naturalHeight);
    image.onerror = () => finish(true);
    image.src = url;
  });
}

function readPixels(image: HTMLImageElement, width: number, height: number): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error(t("create.maskEditor.exportFailed"));
  context.drawImage(image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height).data;
}

export function encodeMaskPng(rgba: Uint8Array, width: number, height: number): Blob {
  const stride = width * 4, scanlines = new Uint8Array((stride + 1) * height);
  for (let row = 0; row < height; row++) scanlines.set(rgba.subarray(row * stride, (row + 1) * stride), row * (stride + 1) + 1);
  const header = new Uint8Array(13), view = new DataView(header.buffer);
  view.setUint32(0, width); view.setUint32(4, height); header[8] = 8; header[9] = 6;
  return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    encodePngChunk("IHDR", header).slice().buffer,
    encodePngChunk("IDAT", deflate(scanlines)).slice().buffer,
    encodePngChunk("IEND", new Uint8Array()).slice().buffer], { type: "image/png" });
}

export async function exportMaskImages(source: MaskSource, overlayUrl: string): Promise<MaskExports> {
  const [original, overlay] = await Promise.all([loadMaskImage(source.url), loadMaskImage(overlayUrl)]);
  const rgba = new Uint8Array(readPixels(original, source.width, source.height));
  const coverage = readPixels(overlay, source.width, source.height);
  const grayscale = new Uint8Array(rgba.length);
  for (let index = 0; index < rgba.length; index += 4) {
    const value = coverage[index + 3];
    grayscale[index] = value; grayscale[index + 1] = value; grayscale[index + 2] = value;
    grayscale[index + 3] = 255; rgba[index + 3] = 255 - value;
  }
  return { mask: encodeMaskPng(grayscale, source.width, source.height),
    image: encodeMaskPng(rgba, source.width, source.height), width: source.width, height: source.height };
}

export function downloadMaskImage(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
