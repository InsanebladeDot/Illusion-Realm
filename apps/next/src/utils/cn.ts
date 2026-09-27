/**
 * className 合并（Tailwind 冲突消解）。
 *
 * 怎么做：`clsx` 收集条件类名 → `tailwind-merge` 让后写的同族工具类覆盖先写的。
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
