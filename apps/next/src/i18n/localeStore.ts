"use client";

import { create } from "zustand";
import { DEFAULT_LOCALE } from "./locales";
import type { Locale } from "./types";

type LocaleState = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

/**
 * 当前语言。用 Zustand 而不是 Context：项目约定客户端全局状态一律走 Zustand。
 *
 * 目前只有 zh-CN，所以**不持久化**；将来接入第二门语言时，
 * 应把 locale 写进用户数据文档（`user/illusion-realm.json` 的某个段），
 * 由 AppShell 水合回填，避免首屏闪一次默认语言。
 */
export const useLocaleStore = create<LocaleState>((set) => ({
  locale: DEFAULT_LOCALE,
  setLocale: (locale) => set({ locale }),
}));
