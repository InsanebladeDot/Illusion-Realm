"use client";

/**
 * 静态库工具栏适配器，实际搜索/单多选/复制/已选按钮复用角色工具栏。
 * 展示模式与收藏配置直接传给共用工具栏，不另写第二套横向布局。
 * 排序值在适配层校验，普通库只接收default和az。
 * 动作、背景、表情与画师都通过本组件传递相同的选择参数。
 */
import { useTranslation } from "@/i18n";
import { TAG_SORT_OPTIONS, type TagSortMode } from "@/utils/tagLibrary";
import { LibraryPickerToolbar } from "@/view/create/characters/CharacterPickerToolbar";

type TagLibraryToolbarProps = {
  favorites?: { count: number; active: boolean; onToggle: () => void };
  /** 画师的完整排序在侧栏，无需重复渲染default/az。 */
  hideSort?: boolean;
  displayMode: "card" | "text";
  query: string;
  sort: TagSortMode;
  multi: boolean;
  selectedCount: number;
  selectedOnly: boolean;
  prefix: string;
  placeholder: string;
  onQueryChange: (value: string) => void;
  onSortChange: (sort: TagSortMode) => void;
  onMultiChange: (multi: boolean) => void;
  onCopySelected: () => void;
  onToggleSelectedOnly: () => void;
  onClearSelected: () => void;
  onDisplayModeChange: (mode: "card" | "text") => void;
};

/**
 * 传给共用工具栏的prefix保留所有既有静态库定位入口。
 * 显示模式按钮有单独可访问标签，与单多选切换不是同一个状态。
 * 只读工具动作来自父组件，包装器没有自己的选择草稿。
 * 图标和文本展示取同一displayMode，aria-pressed不会与内容脱节。
 * 明暗主题不再使用独立的白色输入和紫色按钮样式。
 * 原来两种排序值保持不变，画师额外排序由侧栏提供。
 * 未选择时复制和清除仍由共用工具栏禁用，不在这里重复判断。
 * 显示开关置于排序与多选之间，窄宽度下跟随共同flex换行。
 */
/**
 * 保留原data-<prefix>-display-mode入口，旧的文本模式回归无需改定位方式。
 * 工具栏不处理收藏过滤，组与已选视图统一交给父级查询函数。
 */
export function TagLibraryToolbar(props: TagLibraryToolbarProps) {
  const { t } = useTranslation();

  return <LibraryPickerToolbar {...props} searchLabel={t("characters.tagLibrary.searchLabel", { label: props.placeholder })} sortOptions={TAG_SORT_OPTIONS.map(item => ({ ...item, label: t(item.label) }))} onSortChange={value => { if (value === "default" || value === "az") props.onSortChange(value); }} />;
}
