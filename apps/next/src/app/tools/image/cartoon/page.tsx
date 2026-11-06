// 正式漫画对话框入口直接挂载合成编辑，不再经过素材设置页。
// AppShell由tools/layout复用，此页只装配业务视图与现有工作区宿主。
// workspace参数与视频编辑器相同，GIF等普通工具调用方保持原样。
// 不在路由文件加载模板HTML或读取磁盘，静态导出后仍可离线运行。
// 漫画分镜仍位于/tools/image/comic，与气泡合成工具分开。
// 素材、文字和导出状态由业务视图管理，路由不持有重复状态。
// 返回入口由编辑器工作栏提供，宿主不再多显示一条返回工具箱栏。
// 兼容入口/cartoon仅重定向到这里，不维护第二份编辑界面。
import { DialoguePage } from "@/view/cartoon/dialogue-page";
import { ToolPageFrame } from "@/view/toolBox/tool-page-frame";

export default function Page() {
  return <ToolPageFrame mode="workspace"><DialoguePage /></ToolPageFrame>;
}
