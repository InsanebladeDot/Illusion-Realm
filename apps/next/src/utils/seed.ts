/**
 * 随机种子的生成与校验（创建页「种子」输入）。
 *
 * 怎么做：区间内取整随机 + `clampSeed` / `isValidSeed` 纯函数；上下限来自 `data/createForm`。
 */
import { SEED_MAX, SEED_MIN } from "@/data/createForm";

export function generateRandomSeed(
  min: number = SEED_MIN,
  max: number = SEED_MAX
): number {
  const range = max - min + 1;
  return min + Math.floor(Math.random() * range);
}

export function clampSeed(
  value: number,
  min: number = SEED_MIN,
  max: number = SEED_MAX
): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export function isValidSeed(
  value: number,
  min: number = SEED_MIN,
  max: number = SEED_MAX
): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}
