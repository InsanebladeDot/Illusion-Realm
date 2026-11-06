// 旧剪辑工具保持原组件和普通工具页外壳，作为 UI 迭代期间可用的功能入口。
// 旧预览、修剪和 FFmpeg 处理继续独立，不把它们伪装成新多轨工程能力。
// GIF 仍直接复用同一批 videoEdit 组件，本路由不改这些公共契约。
// 静态路由随 Next 一起导出，不依赖服务器或开发环境开关。
import VideoToolPage from "@/view/toolBox/Tool/video/video";
// 保留原有返回工具箱和主题入口，用户离开新 UI 后仍可操作旧工具。
// 不迁移全局 video store，避免演示项目覆盖真实导出目录偏好。
// 路由隔离生命周期，后台不偷偷挂载两套视频播放器。
import { ToolPageFrame } from "@/view/toolBox/tool-page-frame";

// 页面只装配既有视图，不增加重复的文件处理或导出逻辑。
// 新编辑器项目栏提供显式链接进入这里，没有假导入或模拟导出成功提示。
// 原导入/导出冒烟只更新到此路由，原断言和真实 FFmpeg 夹具都保留。
// 从新编辑器进入时并不携带演示片段参数，旧工具不会误把封面当视频处理。
// 用户主动离开旧工具的状态边界与此前一致，本轮不扩大成工程恢复功能。
export default function Page() {
  return <ToolPageFrame><VideoToolPage /></ToolPageFrame>;
}
