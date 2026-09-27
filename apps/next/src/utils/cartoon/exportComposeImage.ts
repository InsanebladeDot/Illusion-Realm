/**
 * 把整个合成台（背景 + 多个气泡 + 各自文字）导出成一张图。
 *
 * 怎么做：离屏 canvas 按 z 序依次绘制背景 / 气泡 / 文字，绘制前统一等字体就绪
 * （否则首帧会用兜底字体量错排版）。
 */
import type {
  CartoonBubbleAsset,
  CartoonComposeTextItem,
  CartoonCustomFont,
  CartoonExportFormat,
  CartoonPlacedBubble,
} from "@/types/cartoonBubble";
import { resolveCartoonFont } from "@/data/cartoonFonts";
import { t } from "@/i18n";
import { drawFlowTextOnCanvas } from "@/utils/cartoon/drawFlowText";
import { downloadBlob } from "@/utils/cartoon/exportBubbleImage";
import { ensureTextItemsFontsLoaded } from "@/utils/cartoon/fontLoad";
import { normalizeTextItem } from "@/utils/cartoon/normalizeTextItem";
import { resolveComposeFontSize } from "@/utils/cartoon/composeFontSize";
import type { CartoonBubblePlacement } from "@/types/cartoonBubble";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(t("cartoon.export.imageLoadFailed")));
    img.src = src;
  });
}

function drawBubbleLayer(
  ctx: CanvasRenderingContext2D,
  asset: CartoonBubbleAsset,
  bubbleImg: HTMLImageElement,
  textItems: CartoonComposeTextItem[],
  placement: CartoonBubblePlacement,
  canvasW: number,
  canvasH: number,
  customFonts: CartoonCustomFont[],
  previewCanvasWidth?: number
): void {
  const bubbleW = canvasW * placement.scaleX;
  const bubbleH = canvasW * placement.scaleY * (asset.height / asset.width);

  ctx.save();
  ctx.translate(placement.x * canvasW, placement.y * canvasH);
  ctx.rotate((placement.rotation * Math.PI) / 180);
  ctx.globalAlpha = placement.opacity ?? 1;

  ctx.save();
  const flipSx = placement.flipX ? -1 : 1;
  const flipSy = placement.flipY ? -1 : 1;
  ctx.scale(flipSx, flipSy);
  ctx.drawImage(bubbleImg, -bubbleW / 2, -bubbleH / 2, bubbleW, bubbleH);
  ctx.restore();

  for (const item of textItems) {
    const normalized = normalizeTextItem(item);
    const boxX = -bubbleW / 2 + normalized.box.x * bubbleW;
    const boxY = -bubbleH / 2 + normalized.box.y * bubbleH;
    const boxW = normalized.box.width * bubbleW;
    const boxH = normalized.box.height * bubbleH;
    const fontSize = resolveComposeFontSize(
      normalized.fontSize,
      canvasW,
      previewCanvasWidth
    );
    const strokeWidth = resolveComposeFontSize(
      normalized.strokeWidth,
      canvasW,
      previewCanvasWidth
    );
    const letterSpacing = resolveComposeFontSize(
      normalized.letterSpacing,
      canvasW,
      previewCanvasWidth
    );
    const fontFamily = resolveCartoonFont(normalized.fontFamilyId, customFonts).family;

    ctx.save();
    ctx.translate(boxX, boxY);
    drawFlowTextOnCanvas(
      ctx,
      normalized.text,
      fontSize,
      normalized.direction,
      boxW,
      boxH,
      0,
      0,
      normalized.textRotation,
      {
        fontFamily,
        color: normalized.color,
        textAlign: normalized.textAlign,
        lineHeightScale: normalized.lineHeightScale,
        letterSpacing,
        strokeWidth,
        strokeColor: normalized.strokeColor,
      }
    );
    ctx.restore();
  }

  ctx.restore();
}

export type ComposeExportInput = {
  bubbles: CartoonPlacedBubble[];
  assets: CartoonBubbleAsset[];
  background: { src: string; width: number; height: number };
  /** 编辑预览时合成画布的宽度，用于导出时等比放大字号 */
  previewCanvasWidth?: number;
  format?: CartoonExportFormat;
  jpegQuality?: number;
  customFonts?: CartoonCustomFont[];
};

export async function exportComposeImage(input: ComposeExportInput): Promise<Blob> {
  const customFonts = input.customFonts ?? [];
  const resolveFamily = (id: string) => resolveCartoonFont(id, customFonts).family;
  const allTextItems = input.bubbles.flatMap((bubble) => bubble.textItems);
  await ensureTextItemsFontsLoaded(allTextItems, resolveFamily);

  const assetMap = new Map(input.assets.map((asset) => [asset.id, asset]));
  const uniqueSrcs = [...new Set(input.bubbles.map((b) => assetMap.get(b.assetId)?.src).filter(Boolean))] as string[];

  const [bgImg, ...bubbleImgs] = await Promise.all([
    loadImage(input.background.src),
    ...uniqueSrcs.map(loadImage),
  ]);
  const imgBySrc = new Map(uniqueSrcs.map((src, index) => [src, bubbleImgs[index]]));

  const width = bgImg.naturalWidth || input.background.width;
  const height = bgImg.naturalHeight || input.background.height;
  const format = input.format ?? "png";
  const mime = format === "jpeg" ? "image/jpeg" : "image/png";
  const quality = input.jpegQuality ?? 0.92;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(t("cartoon.export.canvasUnavailable"));

  ctx.drawImage(bgImg, 0, 0, width, height);

  for (const bubble of input.bubbles) {
    const asset = assetMap.get(bubble.assetId);
    if (!asset) continue;
    const bubbleImg = imgBySrc.get(asset.src);
    if (!bubbleImg) continue;
    drawBubbleLayer(
      ctx,
      asset,
      bubbleImg,
      bubble.textItems,
      bubble.placement,
      width,
      height,
      customFonts,
      input.previewCanvasWidth
    );
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(t("cartoon.export.failed")))),
      mime,
      format === "jpeg" ? quality : undefined
    );
  });
}

export { downloadBlob };
