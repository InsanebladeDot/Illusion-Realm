/** 根据指针相对元素中心的位置计算旋转角度（度，0–360） */
export function pointerAngleDeg(
  centerX: number,
  centerY: number,
  pointerX: number,
  pointerY: number
): number {
  const radians = pointerAngleRad(centerX, centerY, pointerX, pointerY);
  const degrees = (radians * 180) / Math.PI + 90;
  return ((degrees % 360) + 360) % 360;
}

export function pointerAngleRad(
  centerX: number,
  centerY: number,
  pointerX: number,
  pointerY: number
): number {
  return Math.atan2(pointerY - centerY, pointerX - centerX);
}

/** 根据拖拽指针相对中心的角度变化计算新旋转角（度，可超出 0–360） */
export function rotationFromPointerDrag(
  startRotation: number,
  startPointerRad: number,
  centerX: number,
  centerY: number,
  pointerX: number,
  pointerY: number
): number {
  const currentRad = pointerAngleRad(centerX, centerY, pointerX, pointerY);
  const deltaDeg = ((currentRad - startPointerRad) * 180) / Math.PI;
  return startRotation + deltaDeg;
}

export const ROTATE_CURSOR =
  'url(\'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="%23111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.15-5.88"/><polyline points="21 3 21 9 15 9"/></svg>\') 10 10, grab';

export function distanceSq(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

export const LONG_PRESS_MS = 400;
export const DRAG_THRESHOLD_SQ = 25;
