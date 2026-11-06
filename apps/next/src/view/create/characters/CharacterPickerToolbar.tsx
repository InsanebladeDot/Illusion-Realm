"use client";

import { LibraryFavoritesControls } from "@/components/library/library-favorites-controls";
import { LibraryDisplaySwitch, type LibraryDisplayMode } from "@/components/library/library-display-switch";
import { Copy, Eye, Search, Trash2 } from "lucide-react";
import { useTranslation } from "@/i18n";
import type { AnimadexSearchParams } from "@/types/character";
import { cn } from "@/utils/cn";
import { ACCENT_SELECTED_SOFT_CLASS } from "@/utils/layout";

// 工具栏像一块通用控制面板，各资料库只换面板上的标签和接线。
// prefix用于测试定位，不用于判断当前数据到底属于哪个模型或角色。
// placeholder来自词条表，角色与画师可以用不同的搜索说明。
// sortOptions是一组值与显示名称，值交回调用方执行真正排序。
// 没有提供选项时保留原角色热度及最新浏览能力。
// localReference只修正本地数据没有发布时间的问题。
// hideSort用于侧栏已经提供完整排序的画师库。
// 隐藏排序不会同时隐藏搜索、多选或复制等无关按钮。
// extra保留附加操作的插槽，展示模式已由公共控件直接渲染。
// query是受控值，组件不会保留第二份搜索关键字。
// 父级收到onQueryChange后负责重置页码和执行过滤。
// sort也是受控值，按钮高亮必须反映实际使用的排序值。
// multi切换只通知父级，是否保留最后一个选择由父级统一决定。
// selectedCount来自完整已选草稿，不能只数当前页勾选图标。
// selectedOnly与普通筛选独立，由父级决定如何显示完整草稿。
// 复制、清空和只看已选各用独立回调，避免一个按钮误改多种状态。
// 空选择时复制和清空禁用，但用户仍可打开只看已选查看空态。
// 共用层不导入画师元数据，也不请求角色远端接口。
// 界面主题由CSS变量提供，不给不同资料库单独维护颜色配置。
// 新增一个静态库只需传配置，不应再复制一份搜索框与按钮DOM。
export interface LibraryToolbarProps {
  // 收藏入口复用相同控件，具体过滤状态仍由本次弹窗持有。
  favorites?: { count: number; active: boolean; onToggle: () => void };
  // 展示开关由同一工具栏放置，状态继续属于当前资料库。
  displayMode?: LibraryDisplayMode;
  onDisplayModeChange?: (mode: LibraryDisplayMode) => void;
  /** 资料库前缀只影响稳定定位属性，所有库共享同一工具栏DOM。 */
  prefix?: string;
  /** 排序有独立完整侧栏时隐藏重复控件，其余操作继续共享。 */
  hideSort?: boolean;
  /** 源适配器传入显示文案与排序值，不在组件内解析画师元数据。 */
  /** 可访问名称与占位提示分开传入，保留各资料库原有朗读语义。 */
  /** 未传时继续使用占位或角色词条，旧调用方无需新增必填字段。 */
  /** 名称来自词条表，不在共用DOM中按prefix拼接中文。 */
  searchLabel?: string;
  placeholder?: string;
  sortOptions?: readonly { value: string; label: string }[];
  extra?: React.ReactNode;
  /** 本地没有发布时间，用字母序替代会误导用户的“最新”。 */
  /** 在线来源仍使用原 recent 参数，不改变远端排序契约。 */
  /** 缺省 false，兼容其他调用者。 */
  localReference?: boolean;
  query: string;
  sort: string;
  multi: boolean;
  selectedCount: number;
  selectedOnly: boolean;
  onQueryChange: (value: string) => void;
  onSortChange: (sort: string) => void;
  onMultiChange: (multi: boolean) => void;
  onCopySelected: () => void;
  onToggleSelectedOnly: () => void;
  onClearSelected: () => void;
};

/**
 * 弹窗标题下方的横向工具条：
 * 左侧浮动：[搜索角色名称]（收窄后的固定宽度）
 * 右侧浮动：排序（热度 | 最新）/ 单选多选 / 复制已选 / 只看已选 / 清除已选
 */
export function LibraryPickerToolbar({
  // prefix不会改变回调含义，各库的搜索和多选都走相同原生控件。
  // extra是可选显示方式控件，角色不传时不保留空白占位。
  // 排序选项由调用方能力决定，不给没有时间戳的数据伪造最新排序。
  prefix = "character", placeholder, searchLabel, sortOptions, extra, hideSort = false, displayMode, onDisplayModeChange, favorites,
  // 排序选项随资料能力变化，不能凭空生成本地更新时间。
  // az 是现有共享契约支持的值，不新增另一套排序参数。
  // 热度仍代表资料 post_count，不是实时生成计数。
  localReference = false,
  query,
  sort,
  multi,
  selectedCount,
  selectedOnly,
  onQueryChange,
  onSortChange,
  onMultiChange,
  onCopySelected,
  onToggleSelectedOnly,
  onClearSelected,
}: LibraryToolbarProps) {
  const { t } = useTranslation();

// 搜索使用浏览器原生search输入语义，清除内容仍经过受控回调。
// 图标设为不接收指针，点击输入框左侧不会被装饰图标吞掉。
// 输入框宽度保留原角色规格，窄窗口时允许max-width收缩。
// 工具栏允许换行，操作多时不会把弹窗主区撑出横向滚动条。
// 右侧操作整体使用ml-auto，让短搜索与长操作区保持原来的两端布局。
// 所有按钮显式type=button，避免将来嵌入表单时误触发提交。
// 排序按钮使用aria-pressed表达当前值，不以字体粗细充当唯一反馈。
// 高亮来自同一ACCENT_SELECTED_SOFT_CLASS，随主题切换。
// 默认排序空字符串仍是合法值，因此测试定位使用hot作为可读标记。
// 标记名称的转换只影响DOM属性，不篡改传回父级的空字符串。
// 映射排序时以原value作为key，避免重排选项后复用错误按钮。
// 静态库传自有选项后，不会混入角色专用recent排序。
// 显示开关和收藏入口保持在选择操作前，卡片和文字布局位置统一。
// 单选多选开关用role=switch与aria-checked表达当前模式。
// 开关内部圆点只是装饰，实际点击区域仍是完整按钮。
// 收藏不放入这个通用开关，画师收藏与生成草稿是不同状态。
// 图标按钮保留可见文字，不能仅靠图标形状猜复制或清空。
// ToolbarButton共享禁用和选中样式，避免三个动作各维护一套颜色。
// 清空按钮只通知父级，不主动清除搜索、分页或收藏。
// 此组件不执行异步复制，成功失败提示仍由父级复制流程处理。
  return (
    <div
      {...{ [`data-${prefix}-toolbar`]: true }}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2"
    >
      <div {...{ [`data-${prefix}-search`]: true }} className="relative w-[220px] max-w-full shrink-0">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          aria-label={searchLabel || placeholder || t("characters.toolbar.searchLabel")}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={placeholder || t("characters.toolbar.searchPlaceholder")}
          className="h-8 w-full rounded-lg border border-border bg-muted pl-8 pr-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-stroke/40"
        />
      </div>

      {/* 其余控件整体右浮动 */}
      <div
        {...{ [`data-${prefix}-toolbar-right`]: true }}
        className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-2"
      >
        {/* 排序：横向排列 */}
        {!hideSort && <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("characters.toolbar.sort")}</span>
          <div className="flex overflow-hidden rounded-lg border border-border">
            {(
              (sortOptions ?? [
                { value: "", label: t("characters.toolbar.sortHot") },
                // 本地数据缺少时间戳，显示可实际执行的 A-Z 排序。
                // 在线 recent 仍按站点语义提交，保留原来的最新浏览。
                // 两个分支均保持与下方 aria-pressed 的真实状态一致。
                { value: localReference ? "az" : "recent", label: t(localReference ? "characters.tagLibrary.sortAz" : "characters.toolbar.sortLatest") },
              ])
            ).map((option) => {
              const active = sort === option.value;
              return (
                <button
                  key={option.value || "hot"}
                  type="button"
                  {...{ [`data-${prefix}-sort`]: option.value || "hot" }}
                  aria-pressed={active}
                  onClick={() => onSortChange(option.value)}
                  className={cn(
                    "h-8 px-3 text-xs transition-colors",
                    active
                      ? cn("font-medium", ACCENT_SELECTED_SOFT_CLASS)
                      : "bg-background text-foreground hover:bg-muted"
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>}

        {/* 界面：可选显示模式由相同工具栏承载，不再复制搜索与选择按钮。 */}
        {displayMode && onDisplayModeChange && <LibraryDisplaySwitch prefix={prefix} value={displayMode} onChange={onDisplayModeChange} />}{favorites && <LibraryFavoritesControls prefix={prefix} {...favorites} />}{extra}
        {/* 单选 / 多选 */}
        <button
          type="button"
          role="switch"
          {...{ [`data-${prefix}-mode`]: multi ? "multi" : "single" }}
          aria-checked={multi}
          onClick={() => onMultiChange(!multi)}
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
        >
          <span
            aria-hidden
            className={cn(
              "flex h-4 w-4 items-center justify-center rounded-full border transition-colors",
              multi ? "border-accent-stroke bg-accent-fill" : "border-border bg-background"
            )}
          >
            {multi && <span className="h-1.5 w-1.5 rounded-full bg-accent-fill-foreground" />}
          </span>
          {multi ? t("characters.toolbar.multi") : t("characters.toolbar.single")}
        </button>

        <div className="flex items-center gap-1.5">
          <ToolbarButton
            dataAttr={`data-${prefix}-copy-selected`}
            icon={<Copy className="h-3.5 w-3.5" />}
            label={t("characters.toolbar.copySelected")}
            disabled={selectedCount === 0}
            onClick={onCopySelected}
          />
          <ToolbarButton
            dataAttr={`data-${prefix}-only-selected`}
            icon={<Eye className="h-3.5 w-3.5" />}
            label={t("characters.toolbar.onlySelected")}
            active={selectedOnly}
            onClick={onToggleSelectedOnly}
          />
          <ToolbarButton
            dataAttr={`data-${prefix}-clear-selected`}
            icon={<Trash2 className="h-3.5 w-3.5" />}
            label={t("characters.toolbar.clearSelected")}
            disabled={selectedCount === 0}
            onClick={onClearSelected}
          />
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({
  dataAttr,
  icon,
  label,
  onClick,
  disabled = false,
  active = false,
}: {
  dataAttr: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      {...{ [dataAttr]: "true" }}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        active
          ? cn("font-medium", ACCENT_SELECTED_SOFT_CLASS)
          : "bg-background text-foreground hover:bg-muted"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * 原角色入口保留窄契约，远端recent不会被一般库的排序值污染。
 * 候选值先核验再交还调用方，不用断言把任意字符串冒充合法值。
 * 空字符串仍表示原默认热度，az仅供本地数据的字母序。
 * 这层没有DOM，所有实际按钮来自LibraryPickerToolbar。
 * 本地/线上排序选项仍由原localReference参数决定。
 * 保留旧export名以兼容已有详情与回归调用。
 */
// 角色适配器保留比通用工具栏更窄的排序类型。
// 通用层收到任意配置字符串，不代表角色API接受任意字符串。
// 因此回调白名单只放行空值、az与recent。
// 如果未来添加新排序，需要明确扩展角色契约后再放行。
// 没有使用类型断言掩盖不支持的排序值。
// 旧组件名保持导出，现有调用方无需为复用更改业务数据。
// 这个适配器不添加容器，布局尺寸仍完全来自共用工具栏。
// 角色的收藏筛选仍在侧栏，不与此处已选混用。
// 调用方仍可接收原localReference参数切换线上和本地语义。
// 此层不把字符串路径当作角色slug，也不猜测资料来源。
// 保留原回调类型能让TypeScript在新增调用处检查误传。
// 通用组件独立维护DOM，修复主题只需修改一个实现。
// 测试属性仍默认character，已有角色回归不必改成另一套定位规则。
type CharacterPickerToolbarProps = Omit<LibraryToolbarProps, "sort" | "onSortChange"> & { sort: NonNullable<AnimadexSearchParams["sort"]> | ""; onSortChange: (sort: NonNullable<AnimadexSearchParams["sort"]> | "") => void };
export function CharacterPickerToolbar(props: CharacterPickerToolbarProps) {
  return <LibraryPickerToolbar {...props} onSortChange={value => { if (value === "" || value === "az" || value === "recent") props.onSortChange(value); }} />;
}
