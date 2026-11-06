/**
 * 面板伸缩共用应用导航已有的 300ms 缓入缓出节奏。
 * 这里只统一时长与曲线，具体改变宽度、留白还是网格列由调用方决定。
 * nav 改宽度，AppShell 同步改左留白，模型库改左右列占用。
 * 不共用它们的展开状态，避免收起分类时连应用导航也一起关闭。
 * 类名是完整静态字符串，Tailwind 静态导出时可以直接发现并生成。
 * 不使用 transition-all，调用方必须明确需要过渡的布局属性。
 * 不创建定时器或依赖 transitionend，快速反向点击交给浏览器续接动画。
 * 减少动态效果继续由 globals.css 的 prefers-reduced-motion 统一兜底。
 */
export const PANEL_RESIZE_MOTION = "duration-300 ease-in-out";
