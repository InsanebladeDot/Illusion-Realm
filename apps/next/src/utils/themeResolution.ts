/**
 * 主题偏好（`system` / `light` / `dark`）的**唯一决议入口**。
 *
 * 与 `localeResolution.ts` 同一套理由：值有两个来源（用户数据文档里的 `settings.theme`
 * 与运行时用户的选择），只要两处各自写一遍「缺字段怎么办 / 值非法怎么办」，就一定会在
 * 某一格分叉 —— 典型症状是脏值（手改过的文档、迁移写坏的值）直接落到
 * `nativeTheme.themeSource`，Electron 会给整屏一个意料之外的颜色，而错误信息里什么也没有。
 *
 * ## 真值表
 * | 输入 | 结果 | reason |
 * |------|------|--------|
 * | `undefined` / `null` / `""` / 空白 | `system` | `missing` |
 * | `system` / `light` / `dark`（两侧空白被裁） | 原值 | `stored` |
 * | 其它任意值（`"Dark"`、`"auto"`、`42`…） | `system` | `invalid` |
 *
 * 纯函数、零依赖：与 locale 一样，它能被纯 Node 直接断言，不需要 alias / TS 解析钩子。
 */

export const AVAILABLE_THEME_PREFERENCES = ["system", "light", "dark"] as const;

export type ThemePreference = (typeof AVAILABLE_THEME_PREFERENCES)[number];

/** 默认「跟随系统」：与加这个开关之前的行为**完全一致**（此前只有系统偏好这一个来源） */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

export type ThemeResolutionReason = "stored" | "missing" | "invalid";

export interface ThemeResolution {
  preference: ThemePreference;
  reason: ThemeResolutionReason;
  /** 触发 invalid 时的原始值，便于告警里带上脏数据本身 */
  rejected?: unknown;
}

export function resolveThemePreference(stored: unknown): ThemeResolution {
  const isAllowed = (value: unknown): value is ThemePreference =>
    typeof value === "string" &&
    (AVAILABLE_THEME_PREFERENCES as readonly string[]).includes(value);

  if (stored === undefined || stored === null) {
    return { preference: DEFAULT_THEME_PREFERENCE, reason: "missing" };
  }
  if (typeof stored === "string") {
    const trimmed = stored.trim();
    if (trimmed === "") {
      return { preference: DEFAULT_THEME_PREFERENCE, reason: "missing" };
    }
    if (isAllowed(trimmed)) return { preference: trimmed, reason: "stored" };
    return {
      preference: DEFAULT_THEME_PREFERENCE,
      reason: "invalid",
      rejected: stored,
    };
  }
  return {
    preference: DEFAULT_THEME_PREFERENCE,
    reason: "invalid",
    rejected: stored,
  };
}
