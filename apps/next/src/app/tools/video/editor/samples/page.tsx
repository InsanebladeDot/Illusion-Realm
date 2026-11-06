// UI-02 的独立状态样板，路由只装配视图，不接入媒体与文件存储。
// 共用上级 tools/layout 的应用外壳，不能复制导航和窗口控制。
// 样例表单离开页面即释放，不进入真实用户项目或全局设置。
// 与默认编辑器共用 workspace 模式，减少普通工具页的重复返回栏。
// 样板的内容较长，由视图内部 host 管滚动，不修改全局 main 的边距。
// 路由不读取本地文件，所以静态导出时不依赖 Next 服务端接口。
// 状态在客户端视图中建立，服务端只装配确定的组件结构。
// ToolPageFrame 的其他使用处继续采用既有默认模式，GIF 不受此入口影响。
// 该页面不导入旧视频编辑器 hook，避免样板开启媒体探测副作用。
// A/B 实例不属于路由参数，浏览器刷新不会误恢复成真实工程。
// 返回目标由视图明确指定，不使用 history.back 离开当前应用协议。
// 路由本身没有点击处理，业务与纯 UI 交互都留在职责明确的视图内。
import { EditorSamples } from "@/view/toolBox/Tool/video/editor/editor-samples";
import { ToolPageFrame } from "@/view/toolBox/tool-page-frame";

export default function Page() {
  return <ToolPageFrame mode="workspace"><EditorSamples /></ToolPageFrame>;
}
