"use client";

// 侧栏父级与其他库共用，字母和分类只是其内部可组合内容。
// 统一宽度和主题边界，避免同一个modal里出现两套浅色背景。
// 子级仍保留自己的固定区和内部滚动，不改变现有筛选状态。
import { LibrarySidebar } from "@/components/library/library-sidebar";
import { useState } from "react";
import { ChevronRight, Tag } from "lucide-react";
import { useTranslation } from "@/i18n";
import type { StaticTagItem } from "@/types/staticTagLibrary";
import { listTagCategories, tagCategoryShortName } from "@/utils/tagLibrary";
import { cn } from "@/utils/cn";

type TagCategorySidebarProps = {
  /** 背景可提供双层筛选，复用侧栏已选入口、宽度与滚动边界。 */
  /** 未传入时动作和表情继续走既有单分类，不改变其行为。 */
  /** 内容由父级组合，侧栏不解析背景数据或维护第二份条件。 */
  classification?: React.ReactNode;
  items: StaticTagItem[];
  category: string;
  selectedCount: number;
  selectedOnly: boolean;
  prefix: string;
  /** 分类区标题（默认「分类」） */
  sectionTitle?: string;
  onCategoryChange: (category: string) => void;
  onSelectedOnlyChange: (value: boolean) => void;
};

// 选中竖线读取accent-fill，随用户主题与强调色变化。
// 淡底读取accent-soft，与角色侧栏的选中语义一致。
// 不能把浅色主题的蓝色十六进制直接固定在按钮里。
// CSS变量字符串在渲染时才解析，不需要监听主题再逐个setState。
// 动态内联样式只承载选中状态，不写死整个侧栏底色。
// 没有选中时不设置背景，让底层主题色自然透出。
// 前景文字使用foreground，暗色下不会继续保留深灰字。
// 辅助分类标题使用muted-foreground，保持与主标题的层级差。
// 边界由border-border给出，深浅两套主题各自决定对比度。
// 悬停背景使用muted，不用半透明白色覆盖选中态。
// 这些是颜色语义，分类值本身仍是数据中的原始字符串。
// 修改主题不会更改当前选中分类或触发重新筛选。
const ACCENT_BAR = "var(--accent-fill)";
const ACCENT_TINT = "var(--accent-soft)";

/**
 * 静态标签库左侧导航（与角色选择器的 Saber 栏同一套排版）：
 * 「已选」固定在上、「分类」可收纳并内部滚动。
 */
export function TagCategorySidebar({
  // 可选内容只替换分类展示，不替换侧栏父容器和固定的已选区。
  // 各库仍共用一份弹窗布局，背景不另建覆盖层。
  // 背景与画师可传入此项，动作和表情保持原单分类控件。
  classification,
  items,
  category,
  selectedCount,
  selectedOnly,
  prefix,
  sectionTitle,
  onCategoryChange,
  onSelectedOnlyChange,
}: TagCategorySidebarProps) {
  const { t } = useTranslation();

  /** 回退值从「参数默认值」挪到函数体内：默认值在函数体外求值，拿不到 hook 的 t */
  const sectionTitleText = sectionTitle ?? t("characters.tagLibrary.sectionTitleDefault");
  const categories = listTagCategories(items);
  const [listOpen, setListOpen] = useState(true);

  return (
    <LibrarySidebar prefix={prefix}>
      <div className="shrink-0 space-y-1 border-b border-border px-1 py-3">
        <p className="px-2 text-xs font-medium tracking-wide text-muted-foreground">
          {t("characters.tagLibrary.selected")}
        </p>
        <button
          type="button"
          {...{ [`data-${prefix}-filter-selected`]: "true" }}
          aria-pressed={selectedOnly}
          onClick={() => onSelectedOnlyChange(!selectedOnly)}
          className={cn(
            "relative flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors",
            selectedOnly ? "text-foreground" : "text-foreground hover:bg-muted"
          )}
          style={selectedOnly ? { background: ACCENT_TINT } : undefined}
        >
          {selectedOnly ? (
            <span
              aria-hidden
              className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full"
              style={{ background: ACCENT_BAR }}
            />
          ) : null}
          <span className={cn("truncate pl-1.5", selectedOnly && "font-medium")}>
            {t("characters.tagLibrary.selectedOnlyCount", { count: selectedCount })}
          </span>
        </button>
      </div>

      {/* 界面：背景使用双层分类；动作与表情保留原单分类区。 */}
      {/* 分类在侧栏内部滚动，不会推动底部应用按钮或分页。 */}
      {/* 共用固定已选区，因此筛选替换不会丢失已选数量。 */}
      {classification ? <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">{classification}</div> : <div className="flex min-h-0 flex-1 flex-col py-3">
        <button
          type="button"
          {...{ [`data-${prefix}-section-toggle`]: "categories" }}
          aria-expanded={listOpen}
          onClick={() => setListOpen((prev) => !prev)}
          className="flex w-full shrink-0 items-center justify-between gap-1 px-2 py-1.5 text-left transition-colors hover:bg-muted"
        >
          <span className="text-xs font-medium tracking-wide text-muted-foreground">
            {sectionTitleText}
          </span>
          <ChevronRight
            {...{ [`data-${prefix}-section-arrow`]: listOpen ? "down" : "right" }}
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            style={{
              transform: listOpen ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </button>

        <div
          {...{ [`data-${prefix}-category-list`]: "true" }}
          className={cn(
            "min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1 [scrollbar-width:thin]",
            !listOpen && "hidden"
          )}
        >
          <CategoryRow
            prefix={prefix}
            label={t("characters.tagLibrary.allCategoriesCount", { count: items.length })}
            selected={category === ""}
            onClick={() => onCategoryChange("")}
          />
          {categories.map((item) => (
            <CategoryRow
              key={item}
              prefix={prefix}
              label={tagCategoryShortName(item)}
              title={item}
              selected={category === item}
              onClick={() => onCategoryChange(item)}
            />
          ))}
        </div>
      </div>}
    </LibrarySidebar>
  );
}

// 分类行接收已计算的selected，不另存一份可能过期的高亮状态。
// 完整title保留原分类值，短label只负责让窄侧栏更好读。
// 回调来自父级，行组件不决定筛选是并集还是交集。
// 分类图标不会因无预览或切换主题而被隐藏。
// 选中标记不参与布局宽度，因此点击前后文字不会横跳。
// 同一组CSS变量也用于顶部已选入口，避免出现两种强调色。
// 鼠标悬停只改变背景，不改变分类数量和实际查询条件。
// 按钮保持原生button，回车和空格仍可触发筛选。
// aria-pressed表达当前条件，而非仅靠颜色让用户猜。
// 样式更换不改变data属性，既有分类回归仍可定位原值。
// 顶层LibrarySidebar负责外壳，这里只管理内部单行。
// 画师与背景可提供自有筛选内容，但仍共享这个侧栏外壳。
function CategoryRow({
  prefix,
  label,
  title,
  selected,
  onClick,
}: {
  prefix: string;
  label: string;
  title?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      {...{ [`data-${prefix}-category`]: title ?? label }}
      aria-pressed={selected}
      title={title ?? label}
      onClick={onClick}
      className={cn(
        "relative flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        selected ? "text-foreground" : "text-foreground hover:bg-muted"
      )}
      style={selected ? { background: ACCENT_TINT } : undefined}
    >
      {selected ? (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full"
          style={{ background: ACCENT_BAR }}
        />
      ) : null}
      <Tag className="mr-1.5 h-3.5 w-3.5 shrink-0 opacity-60" />
      <span className={cn("truncate", selected && "font-medium")}>{label}</span>
    </button>
  );
}
