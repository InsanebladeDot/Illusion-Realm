"use client";

// 旧的确定性工程移到显式演示入口，只复用展示组件，不启动真实媒体会话。
// 回归测试继续在这份固定数据上量坐标，不能把它当作真实导入证据。
import { ClipInspector, MediaPanel, ProgramPreview } from "./editor-panels";
import { EditorWorkspace } from "./editor-workspace";
import { DEMO_ASSETS, DEMO_CLIPS, DEMO_PROJECT } from "./editor-demo";
import styles from "./editor.module.css";

// 原确定性工作区移到 samples/project，用户可以明确进入演示工程。
// 这份入口只传 DEMO_ASSETS、DEMO_CLIPS 和 DEMO_PROJECT。
// 它不调用 useLiveVideoSession，因此没有真实导入的忙碌与取消副作用。
// 同一素材行、预览、检查器与时间轴仍是正式组件的实际调用者。
// 旧 UI-02–UI-04 回归可以在这里继续核对五个片段的确定坐标。
// 固定 clip-02 继续对应 scene_02，不受用户真实素材选择影响。
// 本入口的媒体按钮保持禁用，测试继续要求零探测与零媒体操作。
// 它没有 localfile 地址，也没有真实 video 节点。
// 演示名称不作为真实用户项目名，正式入口使用未命名项目。
// 主路由不通过查询参数开后门加载这些数据。
// 样板页提供可见链接，入口不是只有自动测试才能访问。
// 同一个 EditorWorkspace 确保演示与真实宿主的高度和滚动规则一致。
// 没有复制第二份 R01–R10 外框或按钮体系。
// 切换路由会卸载演示实例，不把它永久藏在真实工作区下面。
// 素材数组为只读，演示行的筛选不会修改模块级内容。
// 封面来自打包资源，不依赖开发者磁盘上的参考图。
// 文档截图明确区分演示图与真实导入图。
// 该入口不作为真实媒体导入证明，也不被标为 LIVE-01 业务成功。
// 原版视频与 GIF 路由继续独立，不被这个入口替换。
// 当前文件不执行文件保存，离开即丢弃局部纯 UI 状态。
// 节目总长固定三十秒只属于此演示工程。
// 正式空工程总长仍为零，不能沿用这份演示设置。
// 不同数据源的页面共享展示，不等于共享业务状态。
// 这里没有用户内容或服务端请求，因此不引入新权限条件。
export function EditorDemoView() {
  // UI-07布局入口也注入演示节目，让断点与焦点行为接受相同组件回归。
  // 样板没有timeline业务交互，缩放只调整展示密度，不开放真实安排修改。
  // 同一workspace管理上下分隔，演示与正式不会维护两份高度算法。
  // 这里仍不传onImport，不能把演示页的导入按钮伪装成已接真实文件。
  // ProgramPreview接headerActions只增标题入口，不改变固定clip-02映射。
  // ClipInspector的兼容默认对象用于旧确定性样板，正式页显式传targets。
  // 数据差异通过参数表达，面板开合状态则各归当前workspace实例。
  // 演示退出不会卸载用户另一个正在使用的工具窗口或删除任何本地文件。
  return <div data-video-editor-ui="UI-04" className={styles.host}>
    <EditorWorkspace project={DEMO_PROJECT} clips={DEMO_CLIPS} assets={DEMO_ASSETS} currentTime={DEMO_PROJECT.currentTime}>
      {headerActions => <><MediaPanel />
      <ProgramPreview clip={DEMO_CLIPS[1]} project={DEMO_PROJECT} currentTime={DEMO_PROJECT.currentTime} headerActions={headerActions} />
      <ClipInspector /></>}
    </EditorWorkspace>
  </div>;
}
