export const CARTOON_FONT_SIZE_MIN = 8;
export const CARTOON_FONT_SIZE_MAX = 200;

export type CartoonTextDirection = "horizontal" | "vertical";

export type CartoonTextAlign = "left" | "center" | "right";

export type CartoonExportFormat = "png" | "jpeg";

/** 相对素材尺寸 0–1 的矩形区域，用于限定文字输入范围 */
export type CartoonTextArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CartoonTextBlock = {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  direction: CartoonTextDirection;
};

export type CartoonBubbleAsset = {
  id: string;
  name: string;
  src: string;
  width: number;
  height: number;
  isBuiltIn: boolean;
  textArea?: CartoonTextArea;
};

export type CartoonCustomAssetInput = {
  name: string;
  src: string;
  width: number;
  height: number;
  textArea: CartoonTextArea;
};

export type CartoonTextAnchor = {
  x: number;
  y: number;
};

/** 二级合成页：单个文本框 */
export type CartoonComposeTextItem = {
  id: string;
  /** 相对对话框素材 0–1 */
  box: CartoonTextArea;
  text: string;
  direction: CartoonTextDirection;
  /** 0–180° */
  textRotation: number;
  fontSize: number;
  /** 字体 id，对应 Date/cartoonFonts */
  fontFamilyId: string;
  /** 文字颜色 hex */
  color: string;
  textAlign: CartoonTextAlign;
  /** 行高倍率，1 = 默认 */
  lineHeightScale: number;
  /** 字间距 px */
  letterSpacing: number;
  strokeWidth: number;
  strokeColor: string;
};

/** @deprecated 使用 CartoonComposeTextItem[] */
export type CartoonComposeTextLayout = {
  box: CartoonTextArea;
  anchor: CartoonTextAnchor;
  textRotation: number;
};

export type CartoonSetupConfig = {
  asset: CartoonBubbleAsset;
};

/** 合成页画布上的一个对话框实例 */
export type CartoonPlacedBubble = {
  id: string;
  assetId: string;
  placement: CartoonBubblePlacement;
  textItems: CartoonComposeTextItem[];
};

export type CartoonBubblePlacement = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  /** 水平镜像翻转素材 */
  flipX: boolean;
  /** 垂直镜像翻转素材 */
  flipY: boolean;
  /** 0–1，整个对话框层（素材 + 文字）透明度 */
  opacity: number;
};

export function normalizeBubblePlacement(
  placement: Partial<CartoonBubblePlacement> & { scale?: number }
): CartoonBubblePlacement {
  const scaleX = placement.scaleX ?? placement.scale ?? 0.32;
  const scaleY = placement.scaleY ?? placement.scale ?? scaleX;
  return {
    x: placement.x ?? 0.5,
    y: placement.y ?? 0.45,
    scaleX,
    scaleY,
    rotation: placement.rotation ?? 0,
    flipX: placement.flipX ?? false,
    flipY: placement.flipY ?? false,
    opacity: placement.opacity ?? 1,
  };
}

export type CartoonBackground = {
  src: string;
  width: number;
  height: number;
};

/** 合成页可持久化的工程快照（v2：多气泡） */
export type CartoonComposeDraft = {
  version: 2;
  bubbles: CartoonPlacedBubble[];
  background: CartoonBackground | null;
  savedAt: number;
};

/** @deprecated v1 单气泡草稿，加载时自动迁移 */
export type CartoonComposeDraftV1 = {
  version: 1;
  assetId: string;
  placement: CartoonBubblePlacement;
  textItems: CartoonComposeTextItem[];
  background: CartoonBackground | null;
  savedAt: number;
};

export type CartoonCustomFont = {
  id: string;
  name: string;
  /** 注册到 document.fonts 的 family 名 */
  family: string;
  dataUrl: string;
};

export type UserDataCartoonBubble = {
  customAssets: CartoonBubbleAsset[];
  customFonts: CartoonCustomFont[];
};
