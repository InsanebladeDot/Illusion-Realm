"use client";

// 正式会话和静态工程复用同一宿主几何，数据由各自调用方提供。
// 这个外壳不导入真实文件能力，样板不会因为共用外壳而读取用户视频。
import { useId, useRef, type ReactNode } from "react";
import { GripHorizontal, PanelLeft, PanelRight, X } from "lucide-react";
import { useTranslation } from "@/i18n";
import { ProjectInfoStrip, ProjectToolbar } from "./editor-chrome";
import { EditorTimeline, type EditorTimelineClip } from "./editor-timeline";
import type { EditorMediaAsset, EditorPreviewProject } from "./editor-panels";
// 工作区只透传时间线意图，不持有另一份片段选中状态。
// 样板与正式入口继续共享同一个上下区高度和滚动布局。
// 新增可选参数没有改变legacy或GIF的媒体编辑接口。
// 上区插槽仍由宿主决定展示素材还是片段源，不在几何外壳内查文件。
// 工程总长通过project传给信息条，视口range由时间线自己消费。
// 两者不混为同一个参数，空白可编辑空间不会被统计成视频长度。
import type { TimelineInteraction } from "./use-live-timeline";
import styles from "./editor.module.css";
import { EditorAction } from "./editor-controls";
import { usePreviewLayout } from "./use-preview-layout";
import { useWorkspacePanels, useWorkspaceSplit } from "./use-workspace-layout";

// children 仅装上区的素材、预览和属性，不接收整个应用外壳。
// AppShell 仍管理导航、窗口按钮和底部全局状态。
// project 是工程参数，不能从源视频元数据隐式覆盖。
// clips 与 assets 分开传入，空时间线不会因为有素材而自动填片段。
// currentTime 是工程时间，与源播放器 currentTime 不同。
// onImport 只在真实宿主提供；演示宿主不提供就继续禁用。
// busy 表达真实导入等待，不会由外壳自动结束。
// 这份接口不含保存或导出回调，未接通业务不会被意外激活。
// 两种宿主使用同一外框尺寸，回归截图能比较同一几何。
// 事件不根据项目名猜业务，静态与真实身份由调用方显式注入。
// 演示数据不被复制进真实数组，外壳只传递当前参数。
// 轨道素材映射仍由既有 EditorTimeline 实现，不在这里重写行内容。
// 没有新的页面容器滚动所有者，保持原上区与时间线分工。
// height 由现有 workspace grid 分配，不再拼窗口或导航偏移。
// 项目栏的导入入口确保素材栏隐藏时仍可打开系统选择器。
// 拖入覆盖层由真实宿主提供，不给静态工程开放文件拖入。
// 只读信息条使用同一 project，避免预览和底部显示不同的工程总长。
// 分隔条只调整局部布局，未接效果或工程保存的按钮仍保持原生禁用。
// 时间线缩放是局部视口能力；切分、修剪等未接业务仍说明原因。
// 本组件不持有视频元素，所以隐藏或卸载清理由真实播放器承担。
// 不使用 position fixed 覆盖全窗口，应用导航始终可用。
// 这层共享的是布局契约，不合并旧视频工具和新多轨编辑业务。
// 布局观察由局部Hook配对清理，没有新增全局持久化布局状态。
// ReactNode 槽只装对应区域，避免为了复用留下毫无约束的空壳。
interface EditorWorkspaceProps {
  // 具名插槽只注入预览标题的临时面板入口，不复制任何素材行或属性结构。
  // 旧调用者仍可传普通children；正式页与演示工程都使用同一布局控制器。
  children: ReactNode | ((panelActions: ReactNode) => ReactNode);
  project: EditorPreviewProject;
  clips: readonly EditorTimelineClip[];
  assets: readonly EditorMediaAsset[];
  currentTime: number;
  onImport?: () => void;
  busy?: boolean;
  onCancelImport?: () => void;
  // 真实工程注入选择与拖动；未传时样板继续只读，不共用会话数组。
  // 外壳只往同一时间线透传，不复制轨道或把工程规则放进项目栏。
  // 项目总长与视口范围分开，R10只接收真实最晚结束时间。
  timeline?: TimelineInteraction;
}

// R01 固定项目工作栏，导入 busy 在两个按钮处同步反映。
// R02、R03、R04 作为兄弟节点放入同一上区。
// 素材列表滚动不应带走节目控制栏或项目工作栏。
// R05独立占据八像素，指针捕获与键盘事件共用同一布局边界。
// 分隔条通过aria范围说明当前高度，不能以禁用语义掩盖已接通的布局调整。
// R06–R09 使用原时间轴装配，不复制三条轨道 JSX。
// 正式会话传空 clips，仍保留可辨认的空轨道和初始标尺。
// 空工程的实际时长为零，初始三十秒只是未来放置视口。
// R10 不随轨道滚动，工程设置始终可查看。
// 素材时长不能在这里相加为工程时长。
// 共享外壳不直接引用 DEMO 常量，所以真实调用方不会意外读到样图。
// 静态调用方仍可传完整确定性工程，保留原视觉验收基准。
// 没有把弹窗或媒体业务塞进展示外壳。
// 这个组合是真实的两个调用处共用，不是仅为拆分文件创建包装。
// 主题色全部来自原 CSS Module 与语义变量。
// 不为 LIVE-01 新增另一套亮暗主题开关。
// 按钮和占位保留旧组件的可访问名称与禁用说明。
// children 顺序由宿主明确装配，不能按文件类型暗中重排面板。
// 导入结束不会重建整个工作区，源播放器状态仍由其自身 key 控制。
// 正式调用注入LIVE片段，静态调用仍传独立演示数组，两者不共享业务会话。
// 离开路由后外壳与内部组件一起卸载，不永久隐藏整份编辑器。
// 保存状态仍为未保存，不能用共享项目栏宣称已自动持久化。
// 真实视频播放器和演示封面在同一 R03 几何中互斥出现。
// 这层不会创建第二个导航或系统标题栏。
export function EditorWorkspace({ children, project, clips, assets, currentTime, onImport, busy, onCancelImport, timeline }: EditorWorkspaceProps) {
  // 共享的panelActions只放预览标题内的入口，不把完整上区业务搬进布局Hook。
  // children函数由正式页和演示页分别装配，差异是数据和回调，不是重复外框。
  // root测上下预算，upper测横向断点，两份ref对应两个明确几何职责。
  // upperId由useId生成，两个工作区的aria-controls不会误指向同一个固定ID。
  // 入口通过buttonRef记录实际触发按钮，面板关闭能够准确返回本实例。
  // aria-expanded表达临时开合，pressed不用于面板，避免读屏误认为是工具选择。
  // 素材和属性按钮一直来自同一个actions节点，节目源切换不另造一套入口规范。
  // 同一时刻只渲染一个节目预览分支，所以不会产生两个重复focus返回目标。
  // 临时关闭按钮位于上区标题角落，不跟属性体或素材列表一起滚走。
  // Escape先看defaultPrevented，让字段的“取消草稿”优先于“关闭整个面板”。
  // 若字段已经消费Escape，用户仍在面板里查看恢复后的数值，不突然失去上下文。
  // 组按钮等未消费Escape的目标则由workspace关闭，焦点回实际入口。
  // 临时区仅覆盖upper，不影响下方轨道拖动、缩放按钮和底部项目信息条。
  // 显式高度只替换grid行分配，区域顺序与滚动所有者不随调节改变。
  // 仍保留minmax(202px,1fr)保护时间轴，不把可用轨道高度压成不可操作细线。
  // split.max和值来自同一宿主预算，aria范围不能引用浏览器完整窗口高度。
  // 指针down/move/up/cancel都挂在同一分隔节点，捕获释放不会跨组件丢失。
  // 入口和关闭使用EditorAction，主题、禁用原因和焦点规范与其他区域一致。
  // 这里不响应文件拖入，外层正式会话拥有文件路径解析和批次错误恢复。
  // 布局外壳不关心音轨分离，所以公共布局修改不会另改工程编辑规则。
  const { t } = useTranslation();
  const root = useRef<HTMLDivElement>(null), upper = useRef<HTMLDivElement>(null), upperId = useId();
  const panels = useWorkspacePanels(upper), split = useWorkspaceSplit(root);
  usePreviewLayout(upper, !!timeline, project.width / project.height);
  const actions = <div className={styles.compactPanels}><EditorAction icon={PanelLeft} label={t("toolBox.editorUi.media")} buttonRef={panels.media} expanded={panels.open === "media"} controls={upperId} onClick={() => panels.toggle("media")} /><EditorAction icon={PanelRight} label={t("toolBox.editorUi.inspector")} buttonRef={panels.inspector} expanded={panels.open === "inspector"} controls={upperId} onClick={() => panels.toggle("inspector")} /></div>;
  return <div ref={root} className={styles.workspace} style={split.height === null ? undefined : { gridTemplateRows: `44px ${split.height}px 8px minmax(202px, 1fr) 30px` }}>
    {/* R01：窄窗口隐藏素材栏时，项目栏仍保留同一个导入入口。 */}
    <ProjectToolbar editing={timeline?.editing} onImport={onImport} busy={busy} onCancelImport={onCancelImport} />
    {/* R02–R04：临时面板仅覆盖上区；Escape先让字段处理，未消费时才关闭面板。 */}
    <div ref={upper} id={upperId} data-editor-upper data-fitted-preview={!!timeline || undefined} data-open-panel={panels.open ?? undefined} className={styles.upper} onKeyDown={event => { if (event.key === "Escape" && panels.open && !event.defaultPrevented) { event.preventDefault(); panels.close(); } }}>{typeof children === "function" ? children(actions) : children}{panels.open && <div className={styles.panelClose}><EditorAction icon={X} label={t("toolBox.editorUi.closePanel")} compact onClick={panels.close} /></div>}</div>
    {/* R05：布局拖动不改变工程，指针取消与Escape都恢复本次调整前高度。 */}
    <div data-editor-region="R05" className={styles.splitter} role="separator" tabIndex={0} aria-orientation="horizontal" aria-valuemin={260} aria-valuemax={split.max} aria-valuenow={Math.round(split.value)} aria-label={t("toolBox.editorUi.resize")} title={t("toolBox.editorUi.resizeHint")} onPointerDown={split.down} onPointerMove={split.move} onPointerUp={split.finish} onPointerCancel={split.finish} onKeyDown={split.key}><GripHorizontal size={20} aria-hidden="true" /></div>
    {/* R06–R10：独立时间轴视口与固定信息条不被上区临时面板覆盖。 */}
    <EditorTimeline clips={clips} assets={assets} project={project} currentTime={currentTime} interaction={timeline} />
    <ProjectInfoStrip project={project} />
  </div>;
}
