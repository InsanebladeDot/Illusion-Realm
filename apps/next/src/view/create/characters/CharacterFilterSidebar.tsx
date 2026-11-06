"use client";

// 侧栏父级与其他库共用，字母和分类只是其内部可组合内容。
// 统一宽度和主题边界，避免同一个modal里出现两套浅色背景。
// 子级仍保留自己的固定区和内部滚动，不改变现有筛选状态。
/**
 * 字母固定区继续使用原先的数据入口，供窄屏与筛选回归核对。
 * 收藏和作品段仍由本组件控制开合，共用父级只负责几何和主题。
 */
import { LibrarySidebar } from "@/components/library/library-sidebar";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "@/i18n";
import { CHARACTER_COPYRIGHT_FILTERS } from "@/data/characterFilters";
import { cn } from "@/utils/cn";
import { ACCENT_PILL_ACTIVE_CLASS, ACCENT_SELECTED_SOFT_CLASS } from "@/utils/layout";

type CharacterFilterSidebarProps = {
  /** 本地库在侧栏提供真实作品分类，隐藏远端固定作品表。 */
  /** 字母与收藏区保持可用，不因来源切换移除原有能力。 */
  /** 缺省 false 以兼容其他仍使用原在线侧栏的调用。 */
  hideCopyright?: boolean;
  /** 侧栏底部接入共享的本地属性分类，原字母和收藏保持独立。 */
  /** ReactNode 仅用于渲染组合，不把分类算法复制到导航组件。 */
  /** 分类区可独立滚动，多个展开段不会被固定页脚裁掉。 */
  referenceFilters?: React.ReactNode;
  /** 名称首字母（""=全部） */
  letter: string;
  copyright: string;
  favoritesOnly: boolean;
  selectedOnly: boolean;
  favoriteCount: number;
  selectedCount: number;
  onLetterChange: (letter: string) => void;
  onCopyrightChange: (slug: string) => void;
  onFavoritesOnlyChange: (value: boolean) => void;
  onSelectedOnlyChange: (value: boolean) => void;
};

const LETTERS = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

/**
 * 左侧导航（Saber，独立区域；只有「作品」列表内部滚动）：
 * 字母（固定） / 收藏（可收纳） / 作品（可收纳 + 内部滚动）。
 * 收纳箭头：收起为 ↓、展开为 ↑，点击切换，再点回到原状态。
 */
export function CharacterFilterSidebar({
  // 来源只影响作品导航，不能隐藏多选和收藏入口。
  // 父组件明确传入本地来源，避免异步结果到达前闪现远端作品。
  // 这里没有另维护一套本地分类，分类来自查询结果 facets。
  hideCopyright = false,
  // 传入的是同一份筛选组件，不同时在顶部工具栏再渲染一份。
  // 外层负责滚动与高度，分类组件仅负责列表、计数和回调。
  // 在线时该区域仍显示来源菜单，方便返回本地分类。
  referenceFilters,
  letter,
  copyright,
  favoritesOnly,
  selectedOnly,
  favoriteCount,
  selectedCount,
  onLetterChange,
  onCopyrightChange,
  onFavoritesOnlyChange,
  onSelectedOnlyChange,
}: CharacterFilterSidebarProps) {
  const { t } = useTranslation();
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [copyrightsOpen, setCopyrightsOpen] = useState(false);

  return (
    <LibrarySidebar prefix="character">
      {/* 固定区：字母（不收纳） */}
      <div
        data-character-sidebar-fixed
        className="shrink-0 space-y-1.5 border-b border-border px-2 py-3"
      >
        <SectionTitle hint={t("characters.filterSidebar.letterHint")}>
          {t("characters.filterSidebar.letter")}
        </SectionTitle>
        <div className="grid grid-cols-7 gap-0.5">
          <LetterButton
            label={t("characters.filterSidebar.all")}
            selected={letter === ""}
            onClick={() => onLetterChange("")}
          />
          {LETTERS.map((item) => (
            <LetterButton
              key={item}
              label={item}
              selected={letter === item}
              onClick={() => onLetterChange(item)}
            />
          ))}
        </div>
      </div>

      {/* 收藏：可收纳 */}
      <CollapsibleSection
        id="favorites"
        title={t("characters.filterSidebar.favorites")}
        open={favoritesOpen}
        onToggle={() => setFavoritesOpen((prev) => !prev)}
        className="border-b border-border"
      >
        <div className="space-y-0.5 px-1 pb-2">
          <FilterRow
            label={t("characters.filterSidebar.favoritesOnly", { count: favoriteCount })}
            selected={favoritesOnly}
            onClick={() => onFavoritesOnlyChange(!favoritesOnly)}
          />
          <FilterRow
            label={t("characters.filterSidebar.selectedOnly", { count: selectedCount })}
            selected={selectedOnly}
            onClick={() => onSelectedOnlyChange(!selectedOnly)}
          />
        </div>
      </CollapsibleSection>

      {/* 界面：本地分类位于字母、收藏之后，区域内部纵向滚动。 */}
      {/* 固定区不会随分类滚走，卡片区域与分类区互不抢滚动。 */}
      {/* 使用一个滚动容器容纳多个展开分类，适配截图中的连续列表。 */}
      {/* 在线时这里只保留来源菜单，不能用空白 flex-1 挤压原来的作品列表。 */}
      {/* 本地时分类区才接管剩余高度，多个展开段共用其内部滚动。 */}
      {/* 不改变固定字母/收藏区域，也不让整个 aside 随作品列表滚动。 */}
      {referenceFilters && <div data-character-reference-scroll className={cn("min-h-0 overflow-y-auto [scrollbar-width:thin]",hideCopyright?"flex-1":"shrink-0")}>{referenceFilters}</div>}
      {/* 作品：在线库沿用原导航，本地库在上方侧栏按真实资料筛选。 */}
      {/* 分类来源互斥，避免选择远端 slug 后本地总是零匹配。 */}
      {/* 只隐藏作品段，原有字母、收藏收纳与过渡保持一致。 */}
      {!hideCopyright && (
      <CollapsibleSection
        id="copyrights"
        title={t("characters.filterSidebar.copyrights")}
        open={copyrightsOpen}
        growWhenOpen
        onToggle={() => setCopyrightsOpen((prev) => !prev)}
      >
        <div
          data-character-copyright-list
          className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1 pb-2 [scrollbar-width:thin]"
        >
          {CHARACTER_COPYRIGHT_FILTERS.map((item) => (
            <FilterRow
              key={item.slug || "all"}
              label={t(item.label)}
              selected={copyright === item.slug}
              onClick={() => onCopyrightChange(item.slug)}
            />
          ))}
        </div>
      </CollapsibleSection>
      )}
    </LibrarySidebar>
  );
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <p className="px-2 text-xs font-medium tracking-wide text-muted-foreground" title={hint}>
      {children}
    </p>
  );
}

/**
 * 抽屉式收纳段落：标题行整行可点。
 * 箭头是一个 `>`，展开时顺时针旋转 90° 变成 `↓`（收起再转回来），旋转带过渡动画。
 * 内容始终留在 DOM 里，用 grid-template-rows 0fr ↔ 1fr 做高度过渡，
 * 因此展开/收起都是自然的滑动，不会闪烁（不做条件渲染的挂载/卸载）。
 * growWhenOpen 用于「作品」这类需要在展开时占满剩余高度并内部滚动的段落。
 */
function CollapsibleSection({
  id,
  title,
  open,
  growWhenOpen = false,
  className,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  growWhenOpen?: boolean;
  className?: string;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      data-character-section={id}
      className={cn(
        "flex flex-col",
        open && growWhenOpen ? "min-h-0 flex-1" : "shrink-0",
        className
      )}
    >
      <button
        type="button"
        data-character-section-toggle={id}
        data-character-section-open={open ? "true" : "false"}
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full shrink-0 items-center justify-between gap-1 px-2 py-2 text-left transition-colors hover:bg-muted"
      >
        <span className="text-xs font-medium tracking-wide text-muted-foreground">{title}</span>
        <ChevronRight
          data-character-section-arrow={open ? "down" : "right"}
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          style={{
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      </button>

      <div
        data-character-section-body={id}
        data-character-section-expanded={open ? "true" : "false"}
        className={cn(
          "grid overflow-hidden",
          open && growWhenOpen && "min-h-0 flex-1"
        )}
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows 300ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        {/* 0fr → 1fr 过渡需要内层 min-h-0 + overflow-hidden 才能把内容裁掉 */}
        <div className={cn("flex min-h-0 flex-col overflow-hidden", growWhenOpen && "flex-1")}>
          {children}
        </div>
      </div>
    </div>
  );
}

function LetterButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-character-letter={label}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex h-6 items-center justify-center rounded text-[11px] transition-colors",
        selected ? cn("font-medium", ACCENT_PILL_ACTIVE_CLASS) : "text-foreground hover:bg-muted"
      )}
    >
      {label}
    </button>
  );
}

function FilterRow({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      data-filter-selected={selected ? "true" : "false"}
      className={cn(
        "relative flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        selected ? ACCENT_SELECTED_SOFT_CLASS : "text-foreground hover:bg-muted"
      )}
    >
      {selected && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent-stroke"
        />
      )}
      <span className={cn("truncate pl-1.5", selected && "font-medium")}>{label}</span>
    </button>
  );
}
