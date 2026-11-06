"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ContextMenuItem, ContextMenuSeparator, CONTEXT_MENU_SIZE_CLASS, CONTEXT_MENU_SURFACE_CLASS } from "@/components/context-menu-item";
import { createPortal } from "react-dom";
import { ChevronRight, Droplets, ImagePlus, RotateCcw, Trash2, Wrench } from "lucide-react";
import { useTranslation } from "@/i18n";

// 漫画格图片的菜单只接收选中格对应的回调，不传整份画布状态。
// removed描述当前格子图片是否已移除，不能根据其他格是否有图来启用操作。
// 恢复会保留格子的边界和位置；它与删除整个漫画格子不是同一业务。
// 替换仍由原页面打开文件选择入口，公共菜单没有得到任意读盘能力。
// 模糊化回调只打开既有图片工具，当前菜单不执行像素滤镜。
// onClose与业务回调分开，展开子菜单不应把整个菜单立刻关闭。
// 漫画子菜单需要从父项旁边伸出，不能套overflow-y:auto的公共定位容器。
// 因此此处保留既有Portal和定位，但菜单行、尺寸、分隔线与表面都用共享实现。
// 这就像统一餐厅菜单的字体和纸张，折页展开方式仍由原本的折页结构负责。
interface ImageMenuProps {
  x: number; y: number; removed: boolean; onReplace: () => void; onRemove: () => void;
  onRestore: () => void; onBlur: () => void; onClose: () => void;
}

// 导航只处理方向和首尾键，Enter与Space仍由原生按钮触发onClick。
// 禁用项从候选中排除，移除图片后不能用键盘绕过模糊禁用状态。
// getBoundingClientRect过滤隐藏项，尚未展开的子菜单不进入焦点候选。
// 当前activeElement可能不在候选中，因此使用index=-1的起步语义。
// Home和End取可见列表两端，不改变画布里选中的格子。
// 只preventDefault已识别的导航键，避免拦住Escape向页面关闭监听冒泡。
// 此处沿用原漫画导航，统一菜单外观不额外改变其子菜单键位约定。
function navigateMenu(event: KeyboardEvent<HTMLDivElement>) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)")].filter(button => button.getBoundingClientRect().width);
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
  event.preventDefault(); buttons[next]?.focus();
}

// 188是共享操作列表宽度；两列需要376px，判断侧向空间时必须同步更新。
// 只改CSS而不改这个数字，会在窗口右边出现“父菜单正常、子菜单出界”。
// 优先向右展开，右边放不下且左边够宽时向左展开。
// 两侧都不够时改为内联子菜单，保留按钮可达性而不把页面横向撑宽。
// 坐标最少留4px，负坐标不能把首项藏到窗口之外。
// 这里的220px仍是既有漫画菜单安全高度，不用它推导时间线片段的时长。
// 共享尺寸调整与定位数字应一起检查，避免菜单行复用后几何判断继续使用旧宽度。
function menuPlacement(x: number, y: number) {
  const width = window.innerWidth, height = window.innerHeight;
  const position = { left: Math.max(4, Math.min(x, width - 188)), top: Math.max(4, Math.min(y, height - 220)) };
  const submenuClass = position.left + 376 < width ? "absolute left-full top-0" : position.left >= 188 ? "absolute right-full top-0" : "relative !w-full";
  return { position, submenuClass };
}

// 工具展开状态只属于本次菜单实例，关闭再开不会继承上次停留的子菜单。
// ref用于菜单初始聚焦，不拿它定位或编辑画布中的图片。
// createPortal让菜单不会被漫画画布的缩放变换一起缩小。
// 菜单仍在document.body内，原页面的外部点击判断通过data标记识别它。
// onPointerDown停止传播，避免菜单操作被画布当成新的拖动起点。
// 箭头作为尾部插槽传入共享行，它不额外创建第二个按钮焦点。
// aria-expanded描述子菜单是否已挂载，点击工具项只改这个UI状态。
// 删除和恢复使用run关闭菜单；仅展开工具列表不会执行任何图片操作。
// 红色只用于实际破坏性的移除，恢复和替换保持普通操作色。
// 移除按钮的disabled取当前removed，统一样式不能让已删图片重复执行删除。
export default function ComicImageMenu({ x, y, removed, onReplace, onRemove, onRestore, onBlur, onClose }: ImageMenuProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, []);
  const { position, submenuClass } = menuPlacement(x, y);
  const run = (action: () => void) => { action(); onClose(); };
  return createPortal(<div ref={ref} data-image-context-menu role="menu" aria-label={t("toolBox.comic.imageTools.title")} className={`fixed z-[70] ${CONTEXT_MENU_SIZE_CLASS} ${CONTEXT_MENU_SURFACE_CLASS}`} style={position} onPointerDown={event => event.stopPropagation()} onKeyDown={navigateMenu}>
    <ContextMenuItem icon={ImagePlus} label={t("toolBox.comic.imageTools.replace")} onClick={() => run(onReplace)} />
    <div className="relative" onPointerEnter={() => setToolsOpen(true)} onPointerLeave={() => setToolsOpen(false)}>
      <ContextMenuItem icon={Wrench} label={t("toolBox.comic.imageTools.menu")} data-image-tools-menu aria-haspopup="menu" aria-expanded={toolsOpen} onClick={() => setToolsOpen(true)} onKeyDown={event => { if (event.key === "ArrowRight") { event.preventDefault(); setToolsOpen(true); } }}><ChevronRight size={14} /></ContextMenuItem>
      {toolsOpen && <div role="menu" data-image-tools-submenu className={`${CONTEXT_MENU_SIZE_CLASS} ${CONTEXT_MENU_SURFACE_CLASS} ${submenuClass}`}>
        <ContextMenuItem icon={Droplets} label={t("toolBox.comic.imageTools.blur")} disabled={removed} onClick={() => run(onBlur)} />
        <ContextMenuItem icon={RotateCcw} label={t("toolBox.comic.imageTools.restore")} onClick={() => run(onRestore)} />
      </div>}
    </div>
    <ContextMenuSeparator /><ContextMenuItem icon={Trash2} destructive label={t("toolBox.comic.imageTools.remove")} disabled={removed} onClick={() => run(onRemove)} />
  </div>, document.body);
}
