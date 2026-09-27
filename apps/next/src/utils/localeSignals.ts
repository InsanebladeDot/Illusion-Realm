/**
 * 语言信号的**唯一写点**：`data-locale` / `lang` / `data-locale-ready` 三者在同一条语句里、
 * 同一个节点（`<html>`）、同一个来源上设置。
 *
 * 为什么必须收敛到一处：只要有人用 `className = …` 或单独 `setAttribute("data-locale", …)`
 * 写一次，「同源」就退化成「同文件」，而且只在特定组合下才错（例如主题切换顺手改 `<html>` 的类名）。
 * AppShell（首帧 + 异步文档）与语言切换弹框都调用本函数 —— 没有第二个写点。
 *
 * `data-locale-ready` 的初值是**属性不存在**（不是 `"false"`），因此等待谓词可以写成
 * 「属性出现即完成」，不必区分字符串真假；它由本函数在任何一条决议路径上同步设置。
 *
 * `lang` 用**决议后**的值（必须是 `AVAILABLE_LOCALES` 之一），绝不透传原始字段 ——
 * 否则脏值（如 `"ja"`、`"zh_cn"`）会同时污染日志与 DOM。
 */
import type { Locale } from "@/i18n";

export function applyLocaleSignals(locale: Locale): Locale {
  if (typeof document === "undefined") return locale;
  const root = document.documentElement;
  root.setAttribute("data-locale", locale);
  root.setAttribute("lang", locale);
  root.setAttribute("data-locale-ready", "");
  return locale;
}
