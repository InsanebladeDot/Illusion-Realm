import { DEFAULT_LOCALE, LOCALES } from "./locales";
import type { InterpolationParams, Locale, MessageKey } from "./types";

/** 按点分路径深入词条表取字符串；路径不存在或不是字符串时返回 undefined */
function lookup(locale: Locale, key: string): string | undefined {
  let current: unknown = LOCALES[locale];
  for (const part of key.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

/**
 * 插值：把 `{name}` 换成参数值。
 * 缺参数时**原样保留占位符**，这样漏传参数在界面上是可见的
 * （比静默变成空字符串更容易发现）。
 */
export function interpolate(template: string, params: InterpolationParams): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export type Translator = (key: MessageKey, params?: InterpolationParams) => string;

/**
 * 绑定一门语言，返回翻译函数。
 *
 * ## 取词条的回退链（顺序是刻意的）
 *   1. 当前语言：`lookup(locale, key)`
 *   2. **回退到参考语言 zh-CN 的原文** —— 这是多语言下最重要的一环：
 *      en 词条表是增量翻译的，某个 key 万一没登记，用户应该看到**中文原文**，
 *      而不是 `create.addImagesToFolderDialog.title` 这种看起来像 bug 的字符串。
 *   3. 最后才回落成 key 本身：只有连 zh-CN 都没有时才可能发生（= 词条表登记有洞），
 *      此时显示 key 名是有意的「明显异常信号」。
 *
 * 注意区分两个指标：**回退链保证界面不露 key 名**，但它不等于「界面全英文」——
 * 「还有多少条未翻译」由 `apps/next/scripts/check-i18n-en.mjs` 的 ratchet 单独计数。
 */
export function createTranslator(locale: Locale): Translator {
  return (key, params) => {
    const template =
      lookup(locale, key) ?? lookup(DEFAULT_LOCALE, key) ?? key;
    return params ? interpolate(template, params) : template;
  };
}
