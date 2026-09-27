/**
 * 把单个气泡素材（含文字）导出成图片。
 *
 * 怎么做：把素材与文字画到离屏 canvas → `toBlob` → 触发下载；
 * 素材图先 `loadImage` 等就绪，避免导出空白。
 */
import type { CartoonBubbleAsset, CartoonTextBlock } from "@/types/cartoonBubble";
import { t } from "@/i18n";
import { getAssetTextArea } from "@/utils/cartoon/textArea";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(t("cartoon.export.assetImageLoadFailed")));
    img.src = src;
  });
}

function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  block: CartoonTextBlock,
  areaX: number,
  areaY: number,
  areaW: number,
  areaH: number
): void {
  const text = block.text.trim();
  if (!text) return;

  const x = areaX + block.x * areaW;
  const y = areaY + block.y * areaH;
  const maxW = Math.max(8, areaW - block.x * areaW);
  const maxH = Math.max(8, areaH - block.y * areaH);

  ctx.save();
  ctx.fillStyle = "#111";
  ctx.font = `${block.fontSize}px sans-serif`;
  ctx.textBaseline = "top";

  if (block.direction === "vertical") {
    let colX = x + block.fontSize;
    const chars = [...text.replace(/\s/g, "")];
    let rowY = y;

    for (const char of chars) {
      if (rowY + block.fontSize > y + maxH) {
        colX -= block.fontSize * 1.2;
        rowY = y;
        if (colX < x) break;
      }
      if (colX > x + maxW) break;
      ctx.fillText(char, colX - block.fontSize * 0.85, rowY);
      rowY += block.fontSize * 1.15;
    }
  } else {
    const lines = wrapHorizontalText(ctx, text, maxW);
    let lineY = y;
    for (const line of lines) {
      if (lineY + block.fontSize > y + maxH) break;
      ctx.fillText(line, x, lineY);
      lineY += block.fontSize * 1.35;
    }
  }

  ctx.restore();
}

function wrapHorizontalText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  const paragraphs = text.split("\n");

  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push("");
      continue;
    }

    let current = "";
    for (const char of paragraph) {
      const next = current + char;
      if (ctx.measureText(next).width > maxWidth && current) {
        lines.push(current);
        current = char;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
  }

  return lines;
}

export async function exportBubbleImage(
  asset: CartoonBubbleAsset,
  textBlocks: CartoonTextBlock[]
): Promise<Blob> {
  const img = await loadImage(asset.src);
  const width = img.naturalWidth || asset.width;
  const height = img.naturalHeight || asset.height;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(t("cartoon.export.canvasUnavailable"));

  ctx.drawImage(img, 0, 0, width, height);

  const area = getAssetTextArea(asset);
  const areaX = area.x * width;
  const areaY = area.y * height;
  const areaW = area.width * width;
  const areaH = area.height * height;

  for (const block of textBlocks) {
    drawTextBlock(ctx, block, areaX, areaY, areaW, areaH);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(t("cartoon.export.failed")))),
      "image/png"
    );
  });
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
