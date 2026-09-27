/**
 * 3D 视角的「增强倍率」（四个滑块：X / Y / Z / 总系数）。
 *
 * 注意：**基准权重由《AI 提示词动态生成》需求文档决定**（例如正面 `(front view:3.0)`、
 * 45° 俯视 `(high angle:2.0)`），本模块只提供一层可选的倍率：
 * - 四个滑块默认全为 1（强度 ×1），此时输出与文档完全一致；
 * - 最低 1（不会低于文档基准），最高 = 该系列的权重上限（Anima 3 / SDXL 2，文档第七节）；
 * - 总系数对三个维度整体缩放。
 *
 * 纯函数，不依赖 three.js / React。
 */

import type { MessageKey } from "@/i18n";
import type { ViewSeries } from "@/utils/view3d/promptMapping";

/** 倍率最小值（强度 ×1） */
export const ENHANCE_MIN = 1;

/** 倍率上限 = 文档第七节的权重上限：Anima 3.0 / SDXL 建议 2.0 */
export const SERIES_ENHANCE_MAX: Record<ViewSeries, number> = {
  anima: 3,
  sdxl: 2,
};

/** 滑块步长 */
export const ENHANCE_STEP = 0.1;

export type EnhanceAxis = "x" | "y" | "z" | "total";

export type EnhanceWeights = Record<EnhanceAxis, number>;

/** 默认全部为 1（强度 ×1，等价于文档基准） */
export const DEFAULT_ENHANCE_WEIGHTS: EnhanceWeights = {
  x: 1,
  y: 1,
  z: 1,
  total: 1,
};

export const ENHANCE_AXIS_META: {
  axis: EnhanceAxis;
  labelKey: MessageKey;
  hint?: string;
  hintKey?: MessageKey;
}[] = [
  { axis: "x", labelKey: "view3d.enhance.axisToward", hint: "front view / facing left / facing right / from behind" },
  { axis: "y", labelKey: "view3d.enhance.axisAngle", hintKey: "view3d.enhance.axisAngleHint" },
  { axis: "z", labelKey: "view3d.enhance.axisShot", hint: "extreme close-up → wide shot" },
  { axis: "total", labelKey: "view3d.enhance.axisTotal", hintKey: "view3d.enhance.axisTotalHint" },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 单个倍率按系列夹取（最低 1，最高 3 / 2） */
export function clampEnhanceWeight(value: number, series: ViewSeries): number {
  const max = SERIES_ENHANCE_MAX[series] ?? SERIES_ENHANCE_MAX.anima;
  if (!Number.isFinite(value)) return ENHANCE_MIN;
  return round1(clamp(value, ENHANCE_MIN, max));
}

export function clampEnhanceWeights(
  weights: Partial<EnhanceWeights> | null | undefined,
  series: ViewSeries
): EnhanceWeights {
  const source = weights ?? DEFAULT_ENHANCE_WEIGHTS;
  return {
    x: clampEnhanceWeight(source.x ?? ENHANCE_MIN, series),
    y: clampEnhanceWeight(source.y ?? ENHANCE_MIN, series),
    z: clampEnhanceWeight(source.z ?? ENHANCE_MIN, series),
    total: clampEnhanceWeight(source.total ?? ENHANCE_MIN, series),
  };
}
