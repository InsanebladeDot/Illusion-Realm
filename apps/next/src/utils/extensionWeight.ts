/**
 * 扩展（LoRA）权重的取值约束与滑条填充比例。
 *
 * 怎么做：纯函数 —— `clampExtensionWeight` 夹到 [MIN, MAX]；
 * `getExtensionWeightBarFill` 算出滑条左右两侧的填充比例与方向。
 */
import {
  EXTENSION_WEIGHT_MAX,
  EXTENSION_WEIGHT_MIN,
} from "@/types/extension";

export type ExtensionWeightBarFill = {
  ratio: number;
  direction: "left" | "right" | "none";
  clamped: number;
};

export function clampExtensionWeight(weight: number): number {
  if (!Number.isFinite(weight)) return EXTENSION_WEIGHT_MIN;
  return Math.min(EXTENSION_WEIGHT_MAX, Math.max(EXTENSION_WEIGHT_MIN, weight));
}

export function getExtensionWeightBarFill(
  weight: number
): ExtensionWeightBarFill {
  const clamped = clampExtensionWeight(weight);
  if (clamped === 0) {
    return { ratio: 0, direction: "none", clamped };
  }

  const ratio = Math.abs(clamped) / EXTENSION_WEIGHT_MAX;
  return {
    ratio: Math.min(1, ratio),
    direction: clamped > 0 ? "left" : "right",
    clamped,
  };
}
