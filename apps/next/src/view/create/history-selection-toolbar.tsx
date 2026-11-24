"use client";

// side：把现有图片多选按钮放到独立浮层，选择与文件操作仍归原图库。
// 像把工具盘挂在书架前面：盘子跟着书架停靠，但不被某一格的窄宽度挤成两行。
// 锚点保留在原 sticky 区，真正的按钮通过 Portal 脱离祖先的 overflow 和变换。
// Electron 的原生 CSS 锚定负责跟随布局，不在每次滚动时测量并刷新 React。
// 每个实例生成独立锚名，侧栏和文件管理页同时保活时不会串到另一张工具盘。
// 此处只组合已有 children，不复制全选、取消、移动或删除的状态与处理函数。
import { useId, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useIsHydrated } from "@/hooks/useIsHydrated";
import { INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

// 首帧沿用项目的水合判断，服务端和客户端首次都不访问 document.body。
// 菜单不是模态框，没有遮罩、焦点圈套或自动抢焦点，用户仍可继续勾图。
// Portal 只改变 DOM 的展示位置，React 事件仍回到原图库业务回调。
// 锚点有固定占高，为图片底部留出操作空间，不改变图片网格的列宽。
// 窄到整条工具栏也放不下时，横向滚动承接全部按钮，禁止拆行或缩小字号。
// 工具盘的表面沿用原背景、圆角和细边框，浅深主题都读取现有语义变量。
// position-visibility 会隐藏失去可见锚点的浮层，后台保活图库不泄漏操作按钮。
// 取消选择卸载本组件时，React 同时移除锚点和 Portal，不留下全局监听器。
// 没有把文件路径、勾选集合或加载锁放进公共外壳，不新增共享业务状态。
// 删除确认框的层级高于这里的浮层，工具盘不会盖住确认或取消动作。
// useId 过滤标点只用于生成合法 CSS 自定义标识符，不充当图片或文件夹身份。
// 同一组件的锚名在重绘中稳定，计数变化不会重挂按钮导致键盘焦点丢失。
// 滚动、导航宽度变化及窗口变动均由浏览器重新计算锚定位置，无需计时器猜测。
// 按钮自身保留原 disabled 与文字，操作中的错误和恢复路径不由外壳吞掉。
// data 标记仅用于核对正式浮层，测试不得以直接改该节点代替选择图片。
// center span-left 为锚点左侧和中间留出空间，右侧窄栏不足时向左延展。
// 右缘对齐图库，不能因 Portal 挂到 body 就把工具盘误定位到全窗口中间。
// 浏览器以锚点的四十八像素停靠区垂直居中，浮层不改变图片列表的列宽。
// max-content 读取全部操作的真实宽度，不按当前图库父元素的百分比计算。
// 上限只限制到视口两侧各留八像素，原来的窄栏不能再限制操作条宽度。
// 对直接子项取消收缩，数字计数变长也不能把文字压到不可辨认。
// 不设置页面整体 overflow 来掩盖问题，横滚只发生在极窄的操作条内部。
// 横向 overscroll 保留在本条，触摸滚到末端不会把整个应用拖出视口。
// fixed 从视口定位，父树上的缩放或过渡不再成为此浮层的包含块。
// 原图库祖先的 opacity 不再影响表面颜色，背景与字体从应用主题独立继承。
// 浮层不添加开场位移动画，减少动态效果偏好不需要额外动画分支。
// 原按钮的鼠标和 Tab 操作保持不变，外壳不把它改成有额外方向键规则的菜单。
// body 下存在多个弹窗时不强设 focus，取消确认后仍由原弹窗恢复原操作焦点。
// 不在每个全选回调后重算位置，计数的文字变化由浏览器正常布局处理。
// 这个壳也不建立文件移动的撤销记录，磁盘副作用继续由原业务解释。
// CSS 锚点只参与工具盘定位，原 sticky 区继续占位，勾选计数变化不会挤动图片列。
// 无选择时是否卸载由原图库控制，外壳不自行推断应保留哪些文件操作权限。
export function HistorySelectionToolbar({ children }: { children: ReactNode }) {
  const id = useId();
  const hydrated = useIsHydrated();
  const style = { "--history-selection-anchor": `--history-selection-${id.replace(/[^a-zA-Z0-9_-]/g, "")}` } as CSSProperties;
  return <>
    {/* side：原位锚点参与 sticky 停靠，真实操作条位于 body 浮层。 */}
    <span data-history-selection-anchor className="pointer-events-none block h-12 w-full [anchor-name:var(--history-selection-anchor)]" style={style} aria-hidden="true" />
    {hydrated && createPortal(<div data-history-selection-actions style={style} className={cn("pointer-events-auto fixed z-40 m-0 flex w-max max-w-[calc(100vw-16px)] flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain whitespace-nowrap rounded-xl bg-background px-3 py-2 text-foreground shadow-lg [position-anchor:var(--history-selection-anchor)] [position-area:center_span-left] [position-visibility:anchors-visible] [justify-self:end] [align-self:center] [&>*]:shrink-0", INPUT_BORDER_CLASS)}>{children}</div>, document.body)}
  </>;
}
