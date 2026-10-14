/**
 * 将分镜排版合成为 PNG：按页面百分比换算坐标，逐格多边形裁切并居中 cover 绘制。
 * 只消费内容数据，不读取 DOM 控制层；图片未加载或画布编码失败时拒绝导出。
 */
import { t } from "@/i18n";
import { DEFAULT_COMIC_PAGE_SIZE, isComicDimension } from "./page-size";
import { readBackgroundColor } from "./custom-templates";

interface StoryboardPoint { x: number; y: number }
export interface StoryboardImagePanel {
  src: string;
  blur?: number;
  imageRemoved?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  vertices: StoryboardPoint[];
}

export const STORYBOARD_IMAGE_WIDTH = DEFAULT_COMIC_PAGE_SIZE.width;
export const STORYBOARD_IMAGE_HEIGHT = DEFAULT_COMIC_PAGE_SIZE.height;
interface StoryboardImageSize { width: number; height: number; backgroundColor?: string }

function validatePanel(panel: StoryboardImagePanel): void {
  const values = [panel.x, panel.y, panel.width, panel.height];
  if (!values.every(Number.isFinite) || panel.width <= 0 || panel.height <= 0
    || panel.vertices.length < 3 || !panel.vertices.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) {
    throw new Error(t("toolBox.comic.invalidExportLayout"));
  }
}

function loadPanelImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const fail = () => finish(new Error(t("toolBox.comic.exportImageLoadFailed")));
    const timer = window.setTimeout(fail, 15000);
    function finish(error?: Error): void {
      window.clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      if (error) { image.src = ""; reject(error); }
      else resolve(image);
    }
    image.crossOrigin = "anonymous";
    image.onload = () => image.naturalWidth && image.naturalHeight ? finish() : fail();
    image.onerror = fail;
    image.src = src;
  });
}

function drawPanel(ctx: CanvasRenderingContext2D, panel: StoryboardImagePanel, image: HTMLImageElement | null): void {
  const x = panel.x * ctx.canvas.width / 100;
  const y = panel.y * ctx.canvas.height / 100;
  const width = panel.width * ctx.canvas.width / 100;
  const height = panel.height * ctx.canvas.height / 100;
  ctx.save();
  ctx.beginPath();
  panel.vertices.forEach((point, index) => {
    const px = x + point.x * width / 100, py = y + point.y * height / 100;
    if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(x, y, width, height);
  if (!image || panel.imageRemoved) { ctx.restore(); return; }
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawnWidth = image.naturalWidth * scale, drawnHeight = image.naturalHeight * scale;
  const blur = Number.isFinite(panel.blur) ? Math.max(0, Math.min(40, panel.blur ?? 0)) : 0;
  ctx.filter = blur ? `blur(${blur}px)` : "none";
  ctx.drawImage(image, x + (width - drawnWidth) / 2, y + (height - drawnHeight) / 2, drawnWidth, drawnHeight);
  ctx.restore();
}

function encodePng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error(t("toolBox.comic.exportFailed"))), "image/png");
  });
}

export async function exportStoryboardImage(panels: StoryboardImagePanel[], size: StoryboardImageSize = DEFAULT_COMIC_PAGE_SIZE): Promise<Blob> {
  if (!isComicDimension(size.width) || !isComicDimension(size.height)) throw new Error(t("toolBox.comic.invalidPageSize"));
  if (!panels.length) throw new Error(t("toolBox.comic.invalidExportLayout"));
  panels.forEach(validatePanel);
  const images = await Promise.all(panels.map(panel => panel.imageRemoved ? Promise.resolve(null) : loadPanelImage(panel.src)));
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(t("toolBox.comic.exportFailed"));
  ctx.fillStyle = readBackgroundColor(size.backgroundColor);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  panels.forEach((panel, index) => drawPanel(ctx, panel, images[index]));
  return encodePng(canvas);
}
