import { CivitaiPage } from "@/view/toolBox/Tool/civitai/civitai-page";
import { ToolPageFrame } from "@/view/toolBox/tool-page-frame";

// 模型库使用工作区宿主，三块面板自行管理滚动，不叠加普通工具页返回栏。
// 返回入口已在模型工具栏里，在线模式仍由自己的容器提供原有内边距。
// 只改变这个调用方，GIF 等工具继续使用默认 page 模式。
export default function Page() {
  return <ToolPageFrame mode="workspace"><CivitaiPage /></ToolPageFrame>;
}
