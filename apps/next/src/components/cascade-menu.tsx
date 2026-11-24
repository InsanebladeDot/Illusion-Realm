"use client";
import { HoverTip } from "@/components/hover-tip";


// 级联菜单共用创建页翻译菜单的列、定位与焦点规则，调用方只提供操作单。
// 像并排打开的抽屉：父列留在原地，子列独立滚动，不把主列往下挤。
// 内容、权限与保存仍归业务；这里不访问翻译配置，也不修改时间线工程。
import { useEffect, useEffectEvent, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, Pencil, type LucideIcon } from "lucide-react";
import { useMediaQueryAfterHydration } from "@/hooks/useMediaQuery";
import { useCascadePosition } from "./prompt-assistant/use-cascade-position";

// id在同一列内稳定，重复显示名称不会导致另一个条目被执行。
// children表示导航，action表示执行，两者不会在一次点击里同时触发。
// disabledReason保留在title，原生disabled阻止鼠标、键盘和程序click。
// edit是独立入口，编辑预设时不顺带选中它；普通片段菜单无需传入。
export interface CascadeMenuItem {
  id: string;
  label: string;
  description?: string;
  /** 有独立「查看」入口的行不弹悬停说明，其他菜单项沿用原提示。 */
  hideTooltip?: boolean;
  summary?: string;
  content?: ReactNode;
  selected?: boolean;
  children?: CascadeMenuItem[];
  action?: () => void;
  edit?: () => void;
  editLabel?: string;
  editTitle?: string;
  trailing?: ReactNode;
  icon?: LucideIcon;
  disabledReason?: string;
  destructive?: boolean;
  separator?: boolean;
  attributes?: Record<`data-${string}`, string | boolean>;
}

// 锚点由调用方拥有，右键可传固定点，翻译按钮继续使用原来的真实区域。
// placement只决定根列在锚点上方还是指针处，子列仍共用边界计算。
// 标记供现有回归定位使用，不参与业务分支或菜单项的权限判断。
// caption是只读对象名，长文本不撑宽整列，也不会变成额外焦点站点。
interface CascadeMenuProps {
  anchor: RefObject<HTMLDivElement | null>;
  items: CascadeMenuItem[];
  label: string;
  backLabel: string;
  caption?: string;
  placement?: "above" | "pointer" | "side";
  appearance?: "canvas" | "compact";
  descriptionMode?: "inline" | "tooltip";
  footer?: ReactNode;
  detail?: {
    content: ReactNode;
    expanded?: boolean;
    onEscape?: () => void;
    onClose: (restoreFocus: boolean) => void;
  };
  equalHeight?: boolean;
  cascadeRight?: boolean;
  firstSubmenuWidthRatio?: number;
  heading?: ReactNode;
  attributes?: Record<`data-${string}`, string | boolean>;
  onClose: () => void;
}

// 只沿已有children向下找；业务数据变化后，失效路径自然停止。
// 不按数组下标缓存目标，排序或删项之后不会打开别人的子菜单。
// 所有数组都新建，打开菜单不能修改调用方的条目或持久化配置。
function collectColumns(items: CascadeMenuItem[], path: string[]) {
  const columns = [items];
  for (const id of path) {
    const children = columns.at(-1)?.find(item => item.id === id)?.children;
    if (!children) break;
    columns.push(children);
  }
  return columns;
}

// 展开菜单时按整棵树预留侧边空间，向更深一层移动时已经打开的列不会换边。
function maxMenuDepth(items: CascadeMenuItem[]): number {
  return items.reduce((depth, item) => item.children ? Math.max(depth, 1 + maxMenuDepth(item.children)) : depth, 0);
}

// 方向键只在当前列的可用行间移动，跳过禁用项和编辑小按钮。
// 子列打开后延迟到下一次绘制再找节点，避免聚焦尚未挂载的按钮。
// 不用计时器推进业务，rAF只负责这一次焦点交接，关闭时节点查找自然为空。
function focusColumn(panel: HTMLDivElement | null, last: boolean, index = 0) {
  const columns = panel?.querySelectorAll<HTMLElement>("[data-assistant-column]");
  const column = last ? columns?.[columns.length - 1] : columns?.[0];
  const buttons = column?.querySelectorAll<HTMLButtonElement>("[data-assistant-item]:not(:disabled)");
  if (buttons?.length) buttons[(index + buttons.length) % buttons.length]?.focus();
}

export function CascadeMenu({ anchor, items, label, backLabel, caption, placement = "above", attributes, onClose, appearance, equalHeight = false, cascadeRight = false, firstSubmenuWidthRatio = 1, heading, footer, detail, descriptionMode = "inline" }: CascadeMenuProps) {
  const compact = !useMediaQueryAfterHydration("(min-width: 720px)");
  const [path, setPath] = useState<string[]>([]);
  const columns = collectColumns(items, path);
  const levels = maxMenuDepth(items);
  const { panel, capacity } = useCascadePosition(anchor, compact ? 0 : levels, placement, cascadeRight, firstSubmenuWidthRatio);
  // 音色的三层需要同时可见。窄窗口直接逐级进入，避免中间的语气列被挤掉。
  const drilldown = compact || capacity === 0 || (cascadeRight && capacity < levels);
  const visible = drilldown ? [columns.at(-1)!] : [columns[0], ...columns.slice(1).slice(-capacity)];
  const skipped = columns.length - visible.length;
  // 阅读页先还原成卡片，下一次 Escape 才关闭卡片。
  const closeDetail = useEffectEvent(() => {
    if (!detail) return false;
    if (detail.onEscape) detail.onEscape();
    else detail.onClose(true);
    return true;
  });
  const readerOwnsMain = useEffectEvent(() => Boolean(detail?.expanded));
  const changePath = (next: string[]) => {
    detail?.onClose(false);
    setPath(next);
  };
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (readerOwnsMain()) return;
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !anchor.current?.contains(event.target)) onClose();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (closeDetail()) return;
      onClose();
      anchor.current?.querySelector<HTMLButtonElement>("button")?.focus();
    };
    const frame = requestAnimationFrame(() => focusColumn(panel.current, false));
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [anchor, onClose, panel]);
  // 右键会话自己恢复片段焦点，翻译入口则恢复锚点内按钮，各自只负责自己的对象。
  // 捕获Escape可阻止底层时间线同时处理取消；普通方向键仅在本菜单内拦截。
  // 横向空间不足时使用原翻译菜单的逐级返回，不让子项越过窗口无法点击。
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-assistant-item]");
    if (!button) return;
    const column = button.closest<HTMLElement>("[role=menu]")!;
    const buttons = [...column.querySelectorAll<HTMLButtonElement>("[data-assistant-item]:not(:disabled)")];
    const index = buttons.indexOf(button);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    } else if (event.key === "ArrowRight" && button.hasAttribute("aria-haspopup")) {
      event.preventDefault(); button.click(); requestAnimationFrame(() => focusColumn(panel.current, true));
    } else if (event.key === "ArrowLeft" && path.length) {
      event.preventDefault();
      const parent = path.at(-1);
      changePath(path.slice(0, -1));
      requestAnimationFrame(() => [...panel.current?.querySelectorAll<HTMLButtonElement>("[data-assistant-item]") ?? []].find(node => node.dataset.assistantItem === parent)?.focus());
    }
  };
  return createPortal(<div ref={panel} {...attributes} data-cascade-menu data-equal-height={equalHeight || undefined} className={`fixed z-[1100] max-w-[calc(100vw-16px)] text-foreground ${appearance === "canvas" ? "hy-canvas-ui hy-canvas-menu w-[180px]" : appearance === "compact" ? "w-[286px]" : "w-52"}`} aria-label={label} onKeyDown={key} onContextMenu={event => event.preventDefault()}>
    {/* 级联列：沿用翻译菜单的薄边、圆角、半透明背景与独立滚动。 */}
    {visible.map((column, columnIndex) => <div key={columnIndex} data-assistant-column={columnIndex} inert={detail?.expanded} role="menu" aria-label={label} style={columnIndex ? {
      left: columnIndex === 1 ? "var(--assistant-cascade-first-offset, 208px)" : `calc(var(--assistant-cascade-next-offset, 416px) + var(--assistant-cascade-offset, 208px) * ${columnIndex - 2})`,
      width: columnIndex === 1 ? `${firstSubmenuWidthRatio * 100}%` : undefined,
      height: equalHeight ? "var(--assistant-cascade-root-height)" : undefined, minHeight: "var(--assistant-cascade-root-height)", maxHeight: equalHeight ? "var(--assistant-cascade-height)" : "min(480px, var(--assistant-cascade-height, calc(100dvh - 64px)))" } : undefined} className={`${detail?.expanded ? "invisible " : ""}${columnIndex ? "absolute top-0" : "relative"} ${appearance === "canvas" ? "hy-add-menu" : "max-h-[min(480px,calc(100dvh-64px))] rounded-xl border border-border bg-background/95 p-1.5 shadow-lg backdrop-blur-xl"} w-full overflow-y-auto`}>
      {columnIndex === 0 && (appearance !== "compact" || !drilldown || !path.length) && heading && <div className={appearance === "compact" ? "px-2.5 py-2" : "hy-menu-heading"}>{heading}</div>}
      {path.length > 0 && (drilldown || skipped > 0 && columnIndex > 0) && <button type="button" role="menuitem" className="flex w-full items-center gap-1 rounded-lg p-2 text-xs text-muted-foreground" onClick={() => changePath(path.slice(0, -1))}><ChevronLeft size={14} />{backLabel}</button>}
      {/* 自定义内容仍留在同一列，定位、外部点击和 Escape 共用原菜单机制。 */}
      {column.map(item => {
        const depth = drilldown ? columns.length - 1 : columnIndex === 0 ? 0 : columnIndex + skipped;
        return item.content !== undefined ? <div key={item.id}>{item.content}</div>
          : <CascadeRow key={item.id} item={item} depth={depth} path={path} canHover={!detail && !drilldown && depth < capacity}
            drilldown={drilldown} descriptionMode={descriptionMode} onPath={changePath} />;
      })}
      {columnIndex === 0 && (!drilldown || !path.length) && footer}
      {columnIndex === 0 && caption && <HoverTip asChild layer="window" label={(caption) ?? ""}><div className="truncate border-t border-border px-2.5 py-2 text-[10px] text-muted-foreground">{caption}</div></HoverTip>}
    </div>)}
    {detail?.content}
  </div>, document.body);
}

// 行结构同时服务翻译预设和片段命令，区别通过图标、禁用原因与回调注入。
// 悬停只导航，不执行；触屏没有hover，点击父项也能打开相同的子列。
// 鼠标从父项进入侧列时，路径不被清空，因此可以沿水平方向进入子项。
// 危险色只强调删除意图，是否真的可删仍必须由业务提交处再次校验。
function CascadeRow({ item, depth, path, canHover, drilldown, descriptionMode, onPath }: { item: CascadeMenuItem; depth: number; path: string[]; canHover: boolean; drilldown: boolean; descriptionMode: "inline" | "tooltip"; onPath: (path: string[]) => void }) {
  const hoverTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);
  function cancelHover() {
    window.clearTimeout(hoverTimer.current);
  }
  function open() {
    cancelHover();
    if (path[depth] !== item.id) onPath([...path.slice(0, depth), item.id]);
  }
  function hover(pointerType: string) {
    if (!canHover || pointerType !== "mouse" || item.disabledReason || !item.children || path[depth] === item.id) return;
    if (!path[depth]) {
      open();
      return;
    }
    // 像过道一样留出穿过相邻项的时间，只有鼠标停在另一分类上才切换。
    hoverTimer.current = window.setTimeout(open, 240);
  }
  const Icon = item.icon;
  const rowButton = <button type="button" role="menuitem" {...item.attributes} data-assistant-item={item.id} aria-label={item.label} disabled={!!item.disabledReason} aria-haspopup={item.children ? "menu" : undefined} aria-expanded={item.children ? path[depth] === item.id : undefined} onPointerEnter={event => hover(event.pointerType)} onPointerLeave={cancelHover} onClick={() => item.children ? open() : item.action?.()} className={`flex min-w-0 flex-1 items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-stroke disabled:cursor-not-allowed disabled:opacity-40 ${item.selected ? "bg-muted" : ""} ${item.destructive ? "text-destructive" : ""}`}>
    {Icon && <Icon size={14} className="shrink-0" aria-hidden />}
    <span className="min-w-0 flex-1"><span className="block">{item.label}</span>{item.description && descriptionMode === "inline" && <span className="mt-1 line-clamp-6 block text-[10px] leading-relaxed text-muted-foreground">{item.description}</span>}</span>
    {item.summary && <span className="max-w-[55%] truncate text-[11px] text-muted-foreground">{item.summary}</span>}
    {item.selected && <Check size={13} className="shrink-0" />}
    {item.children && <ChevronRight size={13} style={{ rotate: drilldown ? undefined : "var(--assistant-cascade-arrow, 0deg)" }} className="shrink-0" />}
  </button>;
  return <>
    {item.separator && <div role="separator" className="my-1 border-t border-border" />}
    <div className="flex items-start">
      {item.hideTooltip ? rowButton : <HoverTip asChild layer="window" label={item.disabledReason ?? item.description ?? item.label}>{rowButton}</HoverTip>}
      {item.edit && <HoverTip asChild layer="window" label={(item.editTitle ?? item.editLabel) ?? ""}><button type="button" role="menuitem" data-assistant-edit={item.id} aria-label={item.editLabel} onClick={item.edit} className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-stroke"><Pencil size={13} aria-hidden /></button></HoverTip>}
      {item.trailing}
    </div>
  </>;
}
