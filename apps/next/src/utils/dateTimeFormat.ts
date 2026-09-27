/**
 * 短日期时间文案（文件夹行副信息等）。
 *
 * 怎么做：`Intl.DateTimeFormat` 按 locale 输出；时间戳非法（0 / NaN / 负数）返回
 * `null`，由调用方决定「不显示」而不是显示 `Invalid Date`。
 */
import type { Locale } from "@/i18n";

/**
 * 短日期时间：文件夹行副信息用（`9月20日 12:13` / `Sep 20, 12:13 PM`）。
 *
 * 为什么用 `Intl` 而不是自己拼 `月/日`：拼字符串等于把中文写进代码，
 * `pnpm check:i18n` 会拦（而且拦得对 —— 那是漏翻译的另一种形态）。
 * 时间戳无效（0 / NaN / 负数）返回 null，由调用方决定「不显示」而不是显示 `Invalid Date`。
 */
export function formatShortDateTime(
  timestamp: number | undefined,
  locale: Locale
): string | null {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }

  try {
    return formatterCache(locale).format(new Date(timestamp));
  } catch {
    return null;
  }
}

/**
 * 格式化器按语言缓存：`new Intl.DateTimeFormat` 不便宜，而这是渲染期的每一行都会走到的路径。
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterCache(locale: Locale): Intl.DateTimeFormat {
  const cached = formatters.get(locale);
  if (cached) return cached;

  const created = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  formatters.set(locale, created);
  return created;
}
