import type { Locale, Messages } from "../types";
import { en } from "./en";
import { zhCN } from "./zh-CN";

/**
 * 已登记的语言。新增语言时在这里追加一项，
 * 类型 `Record<Locale, Messages>` 会强制它的键与 zh-CN 完全一致
 * （漏词条 / 多词条都会编译报错）。
 *
 * en 目前是 **zh-CN 的镜像**（键完全一致、值相同），由
 * `apps/next/scripts/mirror-locale.mjs` 生成；翻译按命名空间增量推进，
 * 未翻译数量由 `apps/next/scripts/check-i18n-en.mjs` 的 ratchet 盯着（只减不增）。
 */
export const LOCALES: Record<Locale, Messages> = {
  "zh-CN": zhCN,
  en,
};

export const DEFAULT_LOCALE: Locale = "zh-CN";

export const AVAILABLE_LOCALES = Object.keys(LOCALES) as Locale[];
