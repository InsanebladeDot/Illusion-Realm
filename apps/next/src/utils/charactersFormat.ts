/**
 * 角色库展示用的格式化纯函数（大数字缩写 / 复制文本 / 分页项）。
 *
 * 怎么做：按 locale 分组（中文按万·亿，英文按 K·M），细节见下方各函数注释。
 */
import { useLocaleStore } from "@/i18n";

/** 角色库显示辅助（纯函数） */

/**
 * 大数字缩写：103500 → `10.4万`（zh-CN）/ `104K`（en）。
 *
 * 为什么不再手搓「除以 10^4 再拼上『万』」：**分组间隔本身也是语言的一部分** ——
 * 中文按 10^4 / 10^8（万 / 亿），英文按 10^3 / 10^6（K / M）。
 * 只翻单位字面量会把 103500 显示成「10.4K」——差一个数量级，而且看不出是翻译错还是算错。
 * `Intl.NumberFormat` 的 `notation: "compact"` 就是「按当前语言选分组与单位」的标准实现，
 * 于是这类错误的可能被整体消掉（顺带不用再维护两组单位词条）。
 *
 * 一万以下保持分组显示（`9,999`）：与改动前 zh-CN 的行为逐字一致。
 */
export function formatCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  const locale = useLocaleStore.getState().locale;
  if (value < 10_000) return new Intl.NumberFormat(locale).format(value);
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** 复制到剪贴板，返回是否成功（Electron 与浏览器均可用） */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * 从当前页码推导分页按钮：首尾页 + 当前页附近，其余用省略号占位。
 * 返回 (number | "gap") 数组。
 */
export function buildPageItems(
  current: number,
  total: number
): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

  const items: (number | "gap")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) items.push("gap");
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < total - 1) items.push("gap");
  items.push(total);
  return items;
}
