/**
 * 头像裁剪：用原图像素记录中心点和缩放，预览与 Canvas 导出共用同一个正方形区域。
 * 收敛中心点防止拖出空白；圆形仅用于界面预览，导出保留完整正方形。
 */
export interface AvatarPoint { x: number; y: number }
export interface AvatarSize { width: number; height: number }
export interface AvatarCrop { x: number; y: number; size: number }

export function getAvatarCrop(image: AvatarSize, center: AvatarPoint, zoom: number): AvatarCrop {
  const size = Math.min(image.width, image.height) / Math.max(1, Math.min(4, zoom));
  return {
    x: Math.max(0, Math.min(image.width - size, center.x - size / 2)),
    y: Math.max(0, Math.min(image.height - size, center.y - size / 2)),
    size,
  };
}

export function getAvatarCenter(crop: AvatarCrop): AvatarPoint {
  return { x: crop.x + crop.size / 2, y: crop.y + crop.size / 2 };
}

export function cropAvatar(image: HTMLImageElement, crop: AvatarCrop): string {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Avatar canvas unavailable");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, crop.x, crop.y, crop.size, crop.size, 0, 0, 512, 512);
  return canvas.toDataURL("image/webp", 0.92);
}
