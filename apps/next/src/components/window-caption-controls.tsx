"use client";

// 界面：head 右侧自定义最小化、最大化/还原和关闭按钮。
// 三个按钮与页面在同一 Chromium 提交中切换主题。
// 系统操作走受限 preload API，主进程校验动作并选择发送者窗口。
// 仅自定义 head 挂载此组件，普通浏览器和 macOS 保持原有行为。
import { Copy, Minus, Square, X } from "lucide-react";
import { useWindowControls } from "@/hooks/use-window-controls";
import { useTranslation } from "@/i18n";

// 最大化来自系统事件与初始查询，外部快捷键同样会改变图标。
// window-caption-action 声明 no-drag，点击不会被识别为拖动。
// 固定尺寸由外壳样式设置，不再预留第二套原生按钮区。
// aria-label 与 title 共用翻译，鼠标与键盘用户获得一致含义。
export function WindowCaptionControls() {
  // 翻译hook订阅当前语言，切换语言不需要重建原生窗口或重新注册IPC。
  // 系统状态hook仅保存此窗口的最大化布尔值，不接触创作任务或下载队列。
  // component不接收windowId，无法通过props控制任意其他应用窗口。
  const { t } = useTranslation(), { maximized, control } = useWindowControls();
  // label同时驱动可访问名称与鼠标提示，图标状态和动作含义保持一致。
  // 最大化时的动作是还原，因此不能始终使用「最大化」作为aria-label。
  // 最小化和关闭没有持久选中态，各自使用独立的动作文案。
  const label = t(maximized ? "common.restoreWindow" : "common.maximizeWindow");
  // 统一交互类提供 no-drag、键盘焦点及稳定命中区域。
  // close 额外使用红色 hover，避免与普通工具按钮混淆。
  // data 属性是冒烟入口，测试不依赖翻译文本或 SVG 内部 path。
  const classes = "window-caption-action flex h-full flex-1 items-center justify-center text-muted-foreground hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-stroke";
  // 界面：控件顺序沿用 Windows 的最小化、最大化、关闭。
  // shrink-0 保证窄窗口仍可关闭，父外壳负责压缩品牌和账户文字。
  // 图标 aria-hidden 避免屏幕阅读器重复朗读标签与 SVG 内容。
  // aria-pressed 仅用于最大化状态，其他按钮不伪装成选项开关。
  // 图标统一14px，保持54px head 中窗口符号的原有密度。
  // 不绑定mousedown即执行，按钮正常的click语义支持键盘Enter与Space。
  // 焦点描边只在键盘导航时显示，不改变hover命中面积或顶栏拖动区域。
  return <div data-window-controls className="flex h-full w-[96px] shrink-0 sm:w-[138px]">
    {/* 最小化交还系统，任务栏恢复时继续显示原页面状态。 */}
    {/* 冒烟通过按钮确认 isMinimized，不只检查 handler 被调用。 */}
    {/* type=button 避免未来外壳加入表单时意外提交。 */}
    <button type="button" data-window-control="minimize" className={classes} aria-label={t("common.minimizeWindow")} title={t("common.minimizeWindow")} onClick={() => control("minimize")}><Minus size={14} aria-hidden="true" /></button>
    {/* 系统最大化显示重叠方框，点击还原系统记住的窗口尺寸。 */}
    {/* 外部系统操作也刷新 aria-pressed，不在组件内反转状态。 */}
    {/* 两种状态共享按钮节点，主题变化不会替换整枚按钮。 */}
    <button type="button" data-window-control="toggle-maximize" className={classes} aria-pressed={maximized} aria-label={label} title={label} onClick={() => control("toggle-maximize")}>{maximized ? <Copy size={14} aria-hidden="true" /> : <Square size={14} aria-hidden="true" />}</button>
    {/* close 保留既有关闭生命周期，由主进程处理任务清理。 */}
    {/* 不使用 window.close，不在 renderer 直接退出进程。 */}
    {/* 红色 hover 仅作用关闭按钮，默认底色继续来自整个 head。 */}
    <button type="button" data-window-control="close" className={`${classes} hover:!bg-red-600 hover:!text-white`} aria-label={t("common.close")} title={t("common.close")} onClick={() => control("close")}><X size={14} aria-hidden="true" /></button>
  </div>;
}
