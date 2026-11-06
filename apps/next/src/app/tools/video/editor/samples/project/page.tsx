// 独立静态工程入口，正式编辑器不再默认混入示例素材。
import { EditorDemoView } from "@/view/toolBox/Tool/video/editor/editor-demo-view";
import { ToolPageFrame } from "@/view/toolBox/tool-page-frame";

export default function Page() {
  return <ToolPageFrame mode="workspace"><EditorDemoView /></ToolPageFrame>;
}
