"use client";

// 级联菜单共用创建页翻译菜单的列、定位与焦点规则，调用方只提供操作单。
// 像并排打开的抽屉：父列留在原地，子列独立滚动，不把主列往下挤。
// 内容、权限与保存仍归业务；这里不访问翻译配置，也不修改时间线工程。
import { useEffect, useState, type KeyboardEvent, type RefObject } from "react";
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
  selected?: boolean;
  children?: CascadeMenuItem[];
  action?: () => void;
  edit?: () => void;
  editLabel?: string;
  editTitle?: string;
  icon?: LucideIcon;
  disabledReason?: string;
  destructive?: boolean;
  separator?: boolean;
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
  placement?: "above" | "pointer";
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

// 方向键只在当前列的可用行间移动，跳过禁用项和编辑小按钮。
// 子列打开后延迟到下一次绘制再找节点，避免聚焦尚未挂载的按钮。
// 不用计时器推进业务，rAF只负责这一次焦点交接，关闭时节点查找自然为空。
function focusColumn(panel: HTMLDivElement | null, last: boolean, index = 0) {
  const columns = panel?.querySelectorAll<HTMLElement>("[data-assistant-column]");
  const column = last ? columns?.[columns.length - 1] : columns?.[0];
  const buttons = column?.querySelectorAll<HTMLButtonElement>("[data-assistant-item]:not(:disabled)");
  if (buttons?.length) buttons[(index + buttons.length) % buttons.length]?.focus();
}

export function CascadeMenu({ anchor, items, label, backLabel, caption, placement = "above", attributes, onClose }: CascadeMenuProps) {
  const compact = !useMediaQueryAfterHydration("(min-width: 720px)");
  const [path, setPath] = useState<string[]>([]);
  const columns = collectColumns(items, path);
  const { panel, capacity } = useCascadePosition(anchor, compact ? 0 : columns.length - 1, placement);
  const drilldown = compact || capacity === 0;
  const visible = drilldown ? [columns.at(-1)!] : [columns[0], ...columns.slice(1).slice(-capacity)];
  const skipped = columns.length - visible.length;
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !anchor.current?.contains(event.target)) onClose();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation(); onClose();
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
      setPath(path.slice(0, -1));
      requestAnimationFrame(() => [...panel.current?.querySelectorAll<HTMLButtonElement>("[data-assistant-item]") ?? []].find(node => node.dataset.assistantItem === parent)?.focus());
    }
  };
  return createPortal(<div ref={panel} {...attributes} data-cascade-menu className="fixed z-[1100] w-52 max-w-[calc(100vw-16px)] text-foreground" aria-label={label} onKeyDown={key} onContextMenu={event => event.preventDefault()}>
    {/* 级联列：沿用翻译菜单的薄边、圆角、半透明背景与独立滚动。 */}
    {visible.map((column, columnIndex) => <div key={columnIndex} data-assistant-column={columnIndex} role="menu" aria-label={label} style={columnIndex ? { left: `calc(var(--assistant-cascade-offset, 208px) * ${columnIndex})`, maxHeight: "min(480px, var(--assistant-cascade-height, calc(100dvh - 64px)))" } : undefined} className={`${columnIndex ? "absolute top-0" : "relative"} max-h-[min(480px,calc(100dvh-64px))] w-full overflow-y-auto rounded-xl border border-border bg-background/95 p-1.5 shadow-lg backdrop-blur-xl`}>
      {path.length > 0 && (drilldown || skipped > 0 && columnIndex > 0) && <button type="button" role="menuitem" className="flex w-full items-center gap-1 rounded-lg p-2 text-xs text-muted-foreground" onClick={() => setPath(path.slice(0, -1))}><ChevronLeft size={14} />{backLabel}</button>}
      {column.map(item => <CascadeRow key={item.id} item={item} depth={drilldown ? columns.length - 1 : columnIndex === 0 ? 0 : columnIndex + skipped} path={path} drilldown={drilldown} onPath={setPath} />)}
      {columnIndex === 0 && caption && <div title={caption} className="truncate border-t border-border px-2.5 py-2 text-[10px] text-muted-foreground">{caption}</div>}
    </div>)}
  </div>, document.body);
}

// 行结构同时服务翻译预设和片段命令，区别通过图标、禁用原因与回调注入。
// 悬停只导航，不执行；触屏没有hover，点击父项也能打开相同的子列。
// 鼠标从父项进入侧列时，路径不被清空，因此可以沿水平方向进入子项。
// 危险色只强调删除意图，是否真的可删仍必须由业务提交处再次校验。
function CascadeRow({ item, depth, path, drilldown, onPath }: { item: CascadeMenuItem; depth: number; path: string[]; drilldown: boolean; onPath: (path: string[]) => void }) {
  const open = () => onPath(item.children ? [...path.slice(0, depth), item.id] : path.slice(0, depth));
  const Icon = item.icon;
  return <>
    {item.separator && <div role="separator" className="my-1 border-t border-border" />}
    <div className="flex items-start">
      <button type="button" role="menuitem" data-assistant-item={item.id} aria-label={item.label} disabled={!!item.disabledReason} title={item.disabledReason ?? item.description ?? item.label} aria-haspopup={item.children ? "menu" : undefined} aria-expanded={item.children ? path[depth] === item.id : undefined} onPointerEnter={event => { if (!drilldown && !item.disabledReason && event.pointerType === "mouse") open(); }} onClick={() => item.children ? open() : item.action?.()} className={`flex min-w-0 flex-1 items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-stroke disabled:cursor-not-allowed disabled:opacity-40 ${item.selected ? "bg-muted" : ""} ${item.destructive ? "text-destructive" : ""}`}>
        {Icon && <Icon size={14} className="shrink-0" aria-hidden />}
        <span className="min-w-0 flex-1"><span className="block">{item.label}</span>{item.description && <span className="mt-1 line-clamp-6 block text-[10px] leading-relaxed text-muted-foreground">{item.description}</span>}</span>
        {item.selected && <Check size={13} className="shrink-0" />}
        {item.children && <ChevronRight size={13} style={{ rotate: drilldown ? undefined : "var(--assistant-cascade-arrow, 0deg)" }} className="shrink-0" />}
      </button>
      {item.edit && <button type="button" role="menuitem" data-assistant-edit={item.id} aria-label={item.editLabel} title={item.editTitle ?? item.editLabel} onClick={item.edit} className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-stroke"><Pencil size={13} aria-hidden /></button>}
    </div>
  </>;
}
