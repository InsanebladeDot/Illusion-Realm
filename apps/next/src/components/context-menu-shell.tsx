"use client";

/** 通用右键菜单容器：复用点击外部/Esc 关闭规则，以 Portal 避免裁切，并按实测尺寸限制在视口内。 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CONTEXT_MENU_SIZE_CLASS, CONTEXT_MENU_SURFACE_CLASS } from "./context-menu-item";

interface ContextMenuShellProps {
  x: number; y: number; label: string; onClose: () => void; children: ReactNode;
  role?: "menu" | "dialog";
  className?: string;
}

// 公共尺寸现在取自创建图片菜单，未传尺寸的操作列表会自动跟随同一规范。
// 带速度输入框的旧视频菜单仍传w-64；它只是表单需要更宽，不另写操作行样式。
// 调色器显式传w-60，所以默认宽度变化不会挤压原来的颜色输入格。
// 表面常量与漫画子菜单共享，修改边框或阴影会作用到所有右键入口。
// Portal放到body是为了避开素材区和画布的overflow，不意味着创建第二个应用外壳。
// 菜单坐标使用clientX/clientY，与fixed定位一致，不额外加页面scrollTop。
// 初次render先使用鼠标坐标，布局阶段测量后在绘制前校正位置。
// 测量采用offsetWidth/offsetHeight，不受菜单入场scale动画影响。
// 八像素边距用于保留外框阴影，不把贴边按钮压到窗口可操作区之外。
// 顶部额外留出应用标题栏高度，避免操作行落进系统窗口拖拽区。
// 标题栏变量不可读时按零处理，普通浏览器样板仍可正常打开。
// 极矮窗口由max-height与内部滚动承接，不把菜单所有项目缩成小字号。
// 内部滚动事件会冒泡到window捕获监听，因此先排除菜单自身的滚动。
// 外层素材列表滚动则关闭旧锚点，避免菜单看似仍绑定已经滚走的对象。
// 窗口resize也关闭，不让旧坐标继续锚定到新的布局。
// pointerdown关闭早于click，调用方应把实际操作绑定在菜单内部按钮上。
// contains同时接受图标、文字与按钮，点击菜单子元素不会先被当成外部操作。
// EventTarget不保证是Node，监听器先缩窄类型才执行contains。
// 依赖onClose变化时先移除旧监听再安装新的，避免一次Escape触发多个过期回调。
// 本组件不自动恢复焦点，因为源对象可能已被删除，返回目标需要业务层判断。
// 入场只聚焦未禁用按钮，全部禁用时不会强行激活无效动作。
// 菜单中的输入框按自己的表单逻辑处理数字，外壳不拦截字符输入。
// 这里没有拦截原生文本编辑菜单，统一范围是应用自定义的业务右键菜单。
export function ContextMenuShell({ x, y, label, onClose, children, role = "menu", className = CONTEXT_MENU_SIZE_CLASS }: ContextMenuShellProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const menu = ref.current;
    const chrome = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--window-chrome-height")) || 0;
    // role 的入场动画带 scale；用未缩放的布局尺寸，避免动画结束后越过窗口边缘。
    if (menu) setPosition({ left: Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8)),
      top: Math.max(chrome + 8, Math.min(y, innerHeight - menu.offsetHeight - 8)) });
    ref.current?.querySelector<HTMLElement>("button:not(:disabled), input, select")?.focus({ preventScroll: true });
  }, [x, y]);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !ref.current?.contains(event.target)) onClose(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    // 输入框失焦时可能自动卷回文字起点，这不移动菜单锚点，不能当作页面滚动关闭。
    // 例如先手动输入倍速再右键片段，迟到的input scroll曾让新菜单立即消失。
    // textarea内部文本滚动同理；它只移动编辑文字，不移动时间线或素材列表。
    // 保留菜单自身内部滚动，不让长菜单滚到底部时自动关掉。
    // 真实页面、素材列表或时间线滚动仍关闭，防止菜单绑定已经滚走的对象。
    // 这里只忽略输入控件自身事件，不按最近焦点忽略整个应用的滚动。
    // 因此输入控件外面的滚动容器移动时，仍进入下方onClose。
    // 使用DOM类型缩窄，不根据class名或某个业务字段名字写特殊例外。
    // 公共修复同时作用于视频、漫画和创建页菜单，调用方不再各自做延迟打开。
    // 没有用setTimeout猜迟到滚动持续多久，事件来源决定是否会影响锚点。
    // 监听清理仍使用同一个scroll函数引用，卸载后不再处理其他页面的输入。
    const scroll = (event: Event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.target instanceof Node && ref.current?.contains(event.target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, true); window.addEventListener("resize", onClose);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", scroll, true); window.removeEventListener("resize", onClose); };
  }, [onClose]);
  return createPortal(<div ref={ref} role={role} aria-label={label} style={position}
    className={`fixed z-[120] max-h-[calc(100dvh-var(--window-chrome-height,0px)-16px)] max-w-[calc(100vw-16px)] overflow-y-auto ${CONTEXT_MENU_SURFACE_CLASS} ${className}`}
    onContextMenu={event => event.preventDefault()}>{children}</div>, document.body);
}
