// 正式入口装配 UI-01 工作区；旧单片段工具保留为独立 legacy 路由。
// 页面不复制 AppShell，窗口按钮和导航由上级 tools/layout 统一管理。
// 演示数据只在编辑器视图中使用，路由不接入 FFmpeg 或项目读写。
import { VideoEditorView } from "@/view/toolBox/Tool/video/editor/video-editor-view";
import { ToolPageFrame } from "@/view/toolBox/tool-page-frame";

export default function Page() {
  // workspace 取消普通工具页的第二圈 padding 和返回栏，滚动交给内部区域。
  // GIF 等调用方没有传这个模式，继续使用原布局与真实业务。
  return <ToolPageFrame mode="workspace"><VideoEditorView /></ToolPageFrame>;
}
