"use client";

import { useMemo } from "react";
import { useLocaleStore } from "./localeStore";
import { createTranslator, type Translator } from "./translate";
import type { InterpolationParams, Locale, MessageKey } from "./types";

export { AVAILABLE_LOCALES, DEFAULT_LOCALE, LOCALES } from "./locales";
export { useLocaleStore } from "./localeStore";
export { interpolate } from "./translate";
export type { InterpolationParams, Locale, MessageKey, Messages } from "./types";

/**
 * 非组件环境（utils / store / 事件回调）里取当前语言的文案。
 *
 * 它读的是 store 的当前值，因此**不会**订阅语言变化：
 * 组件里请用 `useTranslation()`，否则切换语言时不会重渲染。
 */
export function t(key: MessageKey, params?: InterpolationParams): string {
  return createTranslator(useLocaleStore.getState().locale)(key, params);
}

/**
 * 组件里用：订阅当前语言，切换语言时自动重渲染。
 *
 * ```tsx
 * const { t } = useTranslation();
 * return <span>{t("nav.home")}</span>;
 * ```
 */
export function useTranslation(): { t: Translator; locale: Locale } {
  const locale = useLocaleStore((state) => state.locale);
  const translator = useMemo(() => createTranslator(locale), [locale]);
  return { t: translator, locale };
}
