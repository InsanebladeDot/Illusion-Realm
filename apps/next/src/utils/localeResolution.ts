/**
 * 语言（locale）的**唯一决议入口**。
 *
 * ## 为什么单独抽出来
 * locale 有两个来源：用户数据文档里的 `settings.locale` 与运行时用户的选择。
 * 只要这两处各自写一遍「缺字段怎么办 / 值非法怎么办」，就一定会在某一格里分叉
 * （典型症状：老文档没有字段 → 某条路径落到 `undefined` → `LOCALES[undefined]` 取不到词条）。
 * 所以决议只留这一条路，调用方只负责把结果喂给 store / 写回文档。
 *
 * ## 真值表（`scripts/verify-locale-resolution.js` 逐格断言）
 * | 输入 | 结果 | reason |
 * |------|------|--------|
 * | `undefined` / `null` / `""` / 空白 | 回退值（zh-CN） | `missing` |
 * | 合法值（两侧空白被裁） | 原值 | `stored` |
 * | 非法值（`"ja"`、`42`、`"zh-cn"` 大小写不符…） | 回退值（zh-CN） | `invalid` |
 *
 * 非法值**不能**静默通过：老文档被手改过、或中间某次合并写进脏值，迁移期真实会发生。
 * 所以函数把 `reason: "invalid"` 报出来，由调用方决定告警方式（本项目写入 logs/）。
 *
 * 纯函数、零依赖（允许集与回退值都由参数传入）—— 这样它能被纯 Node 直接单测，
 * 不需要 alias 解析钩子，也就不会因为测试脚手架的问题而漏测。
 */

export type LocaleResolutionReason = "stored" | "missing" | "invalid";

export interface LocaleResolution {
  /** 决议后的语言：必定属于 `allowed`（除非 allowed 为空，此时原样回退 fallback） */
  locale: string;
  reason: LocaleResolutionReason;
  /** 触发 invalid 时的原始值，便于告警里带上脏数据本身 */
  rejected?: unknown;
}

/**
 * 决议语言。
 * @param stored 文档里存的值（`unknown`：老文档可能没有字段，也可能被手改成任意类型）
 * @param allowed 允许的语言列表（通常是 `AVAILABLE_LOCALES`）
 * @param fallback 回退语言（通常是 `DEFAULT_LOCALE` = zh-CN）
 */
export function resolveLocale(
  stored: unknown,
  allowed: readonly string[],
  fallback: string
): LocaleResolution {
  const isAcceptable = (value: unknown): value is string =>
    typeof value === "string" && allowed.includes(value);

  if (stored === undefined || stored === null) return { locale: fallback, reason: "missing" };
  if (typeof stored === "string" && stored.trim() === "") {
    return { locale: fallback, reason: "missing" };
  }
  if (typeof stored === "string") {
    const trimmed = stored.trim();
    if (isAcceptable(trimmed)) return { locale: trimmed, reason: "stored" };
    return { locale: fallback, reason: "invalid", rejected: stored };
  }
  return { locale: fallback, reason: "invalid", rejected: stored };
}

/**
 * 需要告警时的统一文案（调用方负责写进 logs/，函数本身不产生副作用）。
 *
 * 刻意用**英文**：这是写给开发者看的日志，不是界面文案 —— 本项目
 * `check:i18n` 的硬编码中文基线只减不增，界面文案必须进词条表，
 * 而日志文案进词条表反而会增加噪声（用户永远看不到它）。
 */
export function localeResolutionWarning(resolution: LocaleResolution, fallback: string): string | null {
  if (resolution.reason !== "invalid") return null;
  return (
    `[locale] invalid locale in user data, fell back to ${fallback}: ` +
    `rejected=${JSON.stringify(resolution.rejected)}. ` +
    "Likely a hand-edited user document or a dirty value written by a migration."
  );
}
