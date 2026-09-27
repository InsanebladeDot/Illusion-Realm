import type { zhCN } from "./locales/zh-CN";

/**
 * 词条类型系统。
 *
 * 参考语言是 zh-CN：`MessageKey` 由 zh-CN 词条表推导而来，因此
 * 写错 key（`t("nav.hom")`）会在 `pnpm typecheck` 阶段直接报错，
 * 而不是等运行时回落成 key 字符串才发现 —— 这是本项目没有单测框架时
 * 唯一可靠的防线。
 */

/**
 * 把 `as const` 带来的**字面量类型**放宽成 `string`，只保留键结构。
 *
 * 为什么必须放宽：`Messages = typeof zhCN` 时每个叶子都是字面量类型（`"取消"`），
 * 于是 `LOCALES: Record<Locale, Messages>` 实际要求**每门语言的值逐字等于中文** ——
 * 它把「键必须一致」错收成了「值必须一致」，第二门语言只要真的翻译就编不过。
 * 这个缺陷在只有镜像词条时不会暴露（值恰好相同），是本轮翻译第一批英文时炸出来的。
 *
 * 放宽后约束回到本意：**键结构完全一致**（漏词条 / 多词条编译报错），值任意字符串。
 */
type Widen<T> = {
  [K in keyof T]: T[K] extends string ? string : Widen<T[K]>;
};

/** 一门语言的完整词条表形状；其他语言必须与 zh-CN **键结构**完全一致 */
export type Messages = Widen<typeof zhCN>;

/**
 * 支持的语言。新增语言时同时要：
 * 1. 在 `locales/<locale>/` 建同名同结构的词条表
 * 2. 在 `locales/index.ts` 的 LOCALES 里登记
 */
export type Locale = "zh-CN" | "en";

type Leaves<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Leaves<T[K]>}`;
}[keyof T & string];

/** 词条点分路径，例如 `"nav.home"`、`"common.cancel"` */
export type MessageKey = Leaves<Messages>;

/** 插值参数：`t("common.notImplemented", { label: "语言" })` */
export type InterpolationParams = Record<string, string | number>;
