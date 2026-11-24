"use client";

// 正式路由装配已有画布引擎与交付包 UI；菜单/面板开合不进入作品撤销记录。
// AppShell 仍拥有窗口与导航，画布只占主区，不复制桌面外壳。
import { useCanvasSession } from "./use-canvas-session";
import { applyExistingCanvasMedia, type ExistingMediaTarget } from "./canvas-existing-media";
import { addBatchCanvasMedia } from "./canvas-batch-media";
import type { CanvasBatchSource } from "./reference-ui/canvas-add-menu";
import type { CanvasMedia } from "./canvas-media-import";
import type { CanvasSessionProps } from "./canvas-session-host";
import { isCanvasSurfaceEvent } from "./canvas-surface-event";
import { CanvasProjectDelete } from "./canvas-project-delete";
import { CanvasProjectMenu } from "./canvas-project-menu";
import { LockKeyhole, UnlockKeyhole, Tag } from "lucide-react";
import { useCallback, useRef, useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { Background, BackgroundVariant, MiniMap, ReactFlow, ReactFlowProvider, SelectionMode, useReactFlow } from "@xyflow/react";
import { Copy, Trash2, Scissors, ClipboardPaste, Square, RectangleHorizontal, SlidersHorizontal, Plus } from "lucide-react";
import { CascadeMenu, type CascadeMenuItem } from "@/components/cascade-menu";
import { useTranslation } from "@/i18n";
import { CanvasNodeCard } from "./canvas-node";
import { CanvasToolbar } from "./canvas-toolbar";
import { CanvasConnectionMenu, useCanvasConnectionMenu } from "./canvas-connection-menu";
import { CanvasOverlay } from "./canvas-overlay";
import { canvasNetwork } from "./canvas-network";
import { AddNodeMenu, ProjectHeader } from "./reference-ui/canvas-chrome";
import { CanvasSettings, DEFAULT_PREFERENCES } from "./reference-ui/canvas-settings";
import dynamic from "next/dynamic";
import type { DirectorSession } from "../director/director-session";
import { prepareDirectorSave } from "./save-director-scene";
import { createDirectorMediaWriter } from "../director/director-media";
import type { CompositionSession } from "../video-composition/composition-editor";
import { CanvasEditorActionsProvider } from "./canvas-editor-context";
import { CanvasChip, CanvasIcon } from "./reference-ui/components";
import { serializeCanvas, type CanvasNode, type CanvasAddKind, type CanvasData } from "./canvas-model";
import { CanvasCardSize, CARD_PRESETS } from "./canvas-card-size";
import { canvasNoteMenu } from "./canvas-note-menu";
import { MAX_CANVAS_ANNOTATIONS } from "./canvas-annotations";
import { useCanvasAnnotations } from "./use-canvas-annotations";
import { useCanvasProject } from "./use-canvas-project";
import { useCanvasImageGeneration } from "./use-canvas-image-generation";
import { useCanvasMediaRename } from "./use-canvas-media-rename";
import { useCanvasEditor } from "./use-canvas-editor";
import { useCanvasPanRecovery } from "./use-canvas-pan-recovery";
import { useCanvasMediaImport } from "./use-canvas-media-import";
import { useCanvasVoiceReference } from "./use-canvas-voice-reference";
// 视频确认复用当前主区浮层；导入业务仍由原 Hook 统一拥有。
import { CanvasImportChoice } from "./canvas-import-choice";
import { CanvasImageSidebar } from "./canvas-image-sidebar";
import styles from "./canvas.module.css";

// 三维编辑器仅在打开导演台时加载，普通画布不承担 Three.js 启动成本。
// 图片侧栏按打开动作加载，不让原空画布提前加载全部图片参数组件。
// 视频配置仍由节点入口管理，不能把两类生命周期强行合成一个窗口状态。
// 侧栏不复制 AppShell，也不改变应用导航或路由。
const ImageSettings = dynamic(() => import("./canvas-workflow-settings"), { ssr: false });
const AudioSettings = dynamic(() => import("./canvas-audio-panel").then(module => module.CanvasAudioPanel), { ssr: false });
const CompositionEditor = dynamic(() => import("../video-composition/composition-editor"), { ssr: false });
const Director = dynamic(() => import("../director/director"), { ssr: false });
const NetworkPreview = dynamic(() => import("./canvas-network-preview"), { ssr: false });
const ProjectResources = dynamic(() => import("./canvas-project-resources"), { ssr: false });
const NODE_TYPES = { canvas: CanvasNodeCard };
type Popup = "resources" | "deleteProject" | "settings" | "help" | "rename" | "reload" | "composition" | "director" | "network" | "card" | "open" | null;

// 画布工作区持有图片任务入口，节点通过原动作通道提交稳定 ID。
// 按钮与输入快捷键进入同一个宿主，不为每张卡建立后台调度器。
// 引用输入的 contenteditable 保留焦点，外层节点 click 不能抢回画布根。
// 普通卡片点击仍可选中，修复光标不能通过禁用所有节点选择来实现。
// 加载消息读取真实任务状态，不以按下动画或固定延时判断生成进度。
// 任务与媒体导入各有忙碌来源，宿主统一限制正在处理时的冲突操作。
// 应用导航仍可离开工作区，资源清理由各自任务 hook 处理。
// 项目导入恢复整份文档，生成结果只追加和更新节点，两个动作不能混为一谈。
// ReactFlowProvider 保留既有边与节点坐标来源，引用编辑器不另建图关系状态。
// 新任务结果经原 applyDocument，自动保存和撤销继续使用现有工程协议。
export function InfiniteCanvasPage(props: CanvasSessionProps = {}) {
  return <ReactFlowProvider><CanvasWorkspace {...props} /></ReactFlowProvider>;
}

function CanvasWorkspace(props: CanvasSessionProps) {
  const active = props.active ?? true;
  const { t } = useTranslation();
  const editor = useCanvasEditor(props.projectId);
  // 导入会话绑定本工作区的 editor 与 ReactFlowProvider，不指向创建页或视频编辑器。
  // 这里只有一个文件 input，因此菜单、底栏和卡片不会各弹一份竞争中的系统框。
  // ref 直接交给 React 挂载，渲染阶段不读取 current 来决定页面几何。
  // 文件选择事件中的坐标换算读取当前镜头，不能缓存页面刚进入时的导航宽度。
  // 导入回调不是新的数据源，正式显示、保存和撤销仍读取同一个 editor。
  const { inputRef: mediaInputRef, pick: pickMedia, changed: mediaChanged, importFiles, busy: importing, choice } = useCanvasMediaImport(editor);
// 页面同时装配文件导入和工程交换，两者使用同一个 editor。
// 素材导入只追加节点或更换指定卡片，不替换整张图。
// 工程导入则恢复整份文档，不能误用素材追加回调。
// 两个异步入口的 busy 合并为工作区操作隔离。
// 处理期间节点、底栏和项目头都在 inert 区域内。
// 画布根捕获快捷键也检查 busy，不能靠键盘绕过界面禁用。
// 应用导航仍在外层可用，处理文件不会接管整个桌面窗口。
// 离开页面后各自 Hook 通过 alive 忽略迟到界面结果。
// 文件复制不是模型任务，顶部不能显示生成队列进度。
// 处理文案只表示正在本地操作，不编造百分比。
// menu 的 context 区分节点、连线与空白区域。
// 同一位置的右键菜单必须根据真实命中对象提供动作。
// 连线不显示卡片尺寸或剪切节点，避免动作含义混淆。
// 空白区域不能出现针对旧选中节点的删除项。
// 菜单位置使用屏幕坐标锚定，节点添加位置才换算世界坐标。
// 这样导航开合不会让菜单指针位置和新节点位置混用单位。
  const project = useCanvasProject(editor);
// 交互状态矩阵：空图且已水合时可以添加节点与导入素材。
// 草稿正在读取时不能导入，避免覆盖尚未恢复的作品。
// 草稿读取失败时保留错误层，只有重试可靠读取才能解锁编辑。
// 工程处理中整个画布业务区 inert，应用导航仍正常。
// 尺寸弹窗打开时背景不能接收 Delete 或 Ctrl+V。
// 关闭尺寸弹窗不触发工程保存，也不改变媒体预览源。
// 右键菜单开启时由公共菜单处理方向键与 Escape。
// 菜单关闭后焦点返回画布，复制粘贴快捷键重新生效。
// 媒体内部焦点继续保留自己的进度、静音与全屏键盘语义。
// 在 textarea 内 Ctrl+X 仍剪切文字，不删除节点。
// 在画布根 Delete 才调用删除选择集。
// 边被单独选中后 Delete 不要求删除任何媒体卡。
// 粘贴底稿为空时快捷键没有作品副作用。
// 复制不进入历史，因此撤销仍回到上一次实际编辑。
// 剪切进入历史，撤销能恢复节点与所有关联边。
// 粘贴进入历史，撤销移除这次产生的完整子图。
// 导入整工程清空旧历史，避免混回上一工程的片段。
// 标题改名仍保留原 workspace，目录与显示不会同步重写。
// 黑白主题切换只改变 token，不恢复节点或重置底稿。
// 窄窗口的图坐标仍由同一 ReactFlowProvider 计算。
  const generation = useCanvasImageGeneration(editor);
  const useReferenceVoice = useCanvasVoiceReference(editor, id => generation.store.getState().nodeIds.includes(id));
  // 图片文件改名复用同一操作隔离，防止重命名期间拖动、删除或新生成交错。
  // 只锁画布业务区，不复制应用导航和侧栏，也不把改名当生成队列任务。
  // 成功后仍由原用户文档写盘器保存，其他设置分段不会被旧整本 JSON 覆盖。
  const mediaRename = useCanvasMediaRename(editor);
  const [resourceWriting, setResourceWriting] = useState(false);
  const busy = project.busy || importing || mediaRename.busy || resourceWriting;
  // 待确认不是磁盘 busy：用户此时仍能取消，不显示“正在处理”的假进度。
  // 两种状态都隔离图编辑，但展示分别由确认浮层和原忙碌提示负责。
  // 键盘入口检查 choice.pending，防止捕获阶段先于浮层冒泡处理 Delete。
  // 浮层自身再停止冒泡，保留 Tab/Escape 只作用于当前确认框的路径。
  // onDrop 也检查 pending，即使资源管理器再次拖到浮层边缘也不覆盖原清单。
  // onDragOver 保留 copy 光标只是预告可导入，不代表在拖动过程中已选移动。
  // 真正的复制或移动意图必须在放下后通过确认框确定。
  // 待确认的素材还没有进入 editor，素材数量与节点连线不会先发生变化。
  // 确认完成进入 busy 后仍使用原页面遮挡，不另外创建全窗口应用外壳。
  // 已有工程打开确认与视频导入确认不能通过背景按钮相互嵌套。
  // 工程导入会替换图，素材导入只追加或更换，二者继续使用各自业务回调。
  // 用户关闭导入方式浮层不会关闭整个创建工作区或触发 URL 跳转。
  // 隔离范围是该画布实例的业务主体，不让另一个页面的播放器被无关操作暂停。
  // 资源释放仍在媒体组件，页面只控制入口，不用全局查询 video 来强清其他模块。
  // 新导入成功后的选中规则仍由 editor.importMedia 决定，确认选项不成为节点选择。
  // 选择复制不会改卡片尺寸，当前 square/rectangle/custom 方案仍由原参数管理。
  // 新视频的播放控件依赖真实解码结果，不因确认框关闭就立即启用。
  // 输入框继续隐藏但常驻，取消后无需重建它，原生选择和取消监听仍有效。
  // 确认浮层的 returnFocus 由 Hook 在设置 pending 前采集，避免背景失焦后丢位置。
  // 关闭后不强制 fitView，防止用户仅取消导入就丢失当前观察区域。
  // 这次布局接入没有新增固定导航偏移，镜头换算继续用实际主区矩形。
  // 主题变化只更新语义变量，pending 不会因切换浅色而自动确认或清空。
  // 画布名称显示为空时仍由主进程分配安全目录，弹窗不负责目录命名。
  // 素材复制/移动均为本地操作，页面没有把 File 提交给生成队列或网络接口。
  // 文件导入和图工程保存仍分两步，确认按钮不伪装成“已保存工程”。
  const flow = useReactFlow<CanvasNode>();
  const host = useRef<HTMLElement>(null);
  const session = useCanvasSession({ ...props, editor, host, writing: project.busy || importing || mediaRename.busy || resourceWriting, generating: generation.busy });
  const anchor = useRef<HTMLDivElement>(null);
  const popupTrigger = useRef<HTMLElement | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; left: number; top: number; context: "node" | "edge" | "pane" | null; nodeId?: string } | null>(null);
  const [popup, setPopup] = useState<Popup>(null);
  const annotations = useCanvasAnnotations({ nodes: editor.nodes, host, editable: active && !popup && !busy && editor.persistence.editable, update: editor.updateNodeData });
  const [resourceTarget, setResourceTarget] = useState<ExistingMediaTarget | undefined>();
  const [batchResource, setBatchResource] = useState<{ kind: "image" | "video"; source: Exclude<CanvasBatchSource, "local"> } | null>(null);
  const resourceTicket = useRef(0);
  const pickResources = (target?: ExistingMediaTarget) => { resourceTicket.current++; setBatchResource(null); setResourceTarget(target); openPopup("resources"); };
  const [previewId, setPreviewId] = useState("");
  // 返回焦点只保存 DOM 引用，不进入工程数据或历史快照。
  // 目标来自真实触发节点，不能在关闭时改为“最近选择的第一张”。
  // 锚点被删除则不强行聚焦断开的节点，选择仍由画布管理。
  // 从明确的 data-canvas-node 身份定位原触发器，不能依赖卡片在 DOM 中排第几。
  // CSS.escape 只保护选择器语法，节点身份本身仍由原模型验证和管理。
  // 保存的 ref 不是可交换工程数据，不允许写进 user JSON。
  // 图片侧栏渲染在 ReactFlow 之外，因此画布缩放不会带着表单缩放。
  // 一个侧栏打开时仍能点选其他节点，非模态面板不遮住整个 main。
  // 失去选中或节点删除会清掉 target，重新选择不会自动弹出过去的设置页。
  // 多选不隐式换目标：只有用户点某个节点的设置入口才明确绑定它。
  // 打开工程替换节点后，旧 ID 在新文档不存在，自然触发相同失效清理。
  // 单纯保存不会改选中状态，所以侧栏保持当前编辑现场而不重新初始化。
  // 工作区忙碌时暂不挂载字段，资源处理结束后仍读取当前节点的确认值。
  // 若主浮层打开，底层表单被卸载，旧助手或资源列表不能继续接受后台输入。
  // 渲染层在此只拼装现有组件，不直接访问 Electron 文件或模型权重。
  // 更新回调带原 id，异步 UI 回复不能用最近选中节点作为替代收件人。
  // 底层 reducer 仍决定事务，侧栏不另起历史栈或临时保存按钮。
  // 原素材导入与媒体互斥机制没有被侧栏接管，两者资源生命周期保持独立。
  const imageSettingsTrigger = useRef<HTMLElement | null>(null);
  const openImageSettings = (id: string) => {
    imageSettingsTrigger.current = host.current?.querySelector<HTMLElement>(`[data-canvas-node="${CSS.escape(id)}"] [data-canvas-workflow] button`) ?? null;
    setImageSettingsId(id);
  };
  const [imageSettingsId, setImageSettingsId] = useState<string | null>(null);
  // 侧栏目标必须仍存在且选中，空白取消选择或删除节点立即使它失效。
  // 像正在填写的一张工作单被收回：不能下一次又把旧表盖在另一张卡上。
  // 派生当前节点而非缓存 data，撤销与输入更新都使用真实最新值。
  // 多选时仍绑定明确打开的节点，不把目标替换为数组第一项。
  // 目标失效清掉 UI 状态，不影响节点参数或撤销栈。
  // 导入或工程对话期间侧栏会卸载，隐藏内容不响应键盘和异步工具回写。
  // 同一工作区只有这一处入口状态，因此两个模型按钮不会叠两份侧栏。
  // 工作区卸载后状态随之丢弃，下次打开工程仍由用户选择配置对象。
  // 既有图片配置宿主现在也接受视频，仍只有一个稳定的侧栏目标。
  // selected 只是确认该目标仍在活动选择中，不能用“最后点击”替代保存身份。
  // 取消选择或删除目标会卸载配置，已隐藏的表单不继续响应画布快捷键。
  // 多选不自动改写目标，侧栏仍服务用户明确打开的那张节点。
  // remoteImage 继续由后面的真实来源条件排除，不为远端显示本地模型加载器。
  // 原工作区滚动和导航宽度仍决定可用空间，不在这里拼固定侧栏偏移。
  // 侧栏与 ReactFlow 是兄弟，不会随着世界坐标缩放文字或改变节点尺寸。
  // 这里保留旧内部变量名以限制改动范围，实际内容由节点 kind 和 workflow 决定。
  const imageSettingsNode = editor.nodes.find(node => node.id === imageSettingsId && node.selected && ["image", "video", "audio"].includes(node.data.kind));
  if (imageSettingsId && !imageSettingsNode) setImageSettingsId(null);
  const [directorId, setDirectorId] = useState<string | null>(null);
  const director = useRef<DirectorSession | null>(null);
  // 合成器固定绑定打开时的节点，后续选择变化不能覆盖另一份工程。
  // 每次打开建立独立 iframe，会话退出先等待原组件保存。
  const [compositionId, setCompositionId] = useState<string | null>(null);
  const composition = useRef<CompositionSession | null>(null);
  const [writeDirectorImage] = useState(createDirectorMediaWriter);
  // 拖线空白菜单复用原编辑器add方法；新节点与连接只有同一份作品状态。
  // editable继续受保存、导入等事务约束，不为新入口开放后台编辑。
// 连接创建意图属于画布宿主，不挂到某张图片内部以免删源后残留。
// 图片卡只提供标准Handle，创建目标菜单由整个编辑会话处理。
// 菜单组件仍位于原画布主题容器内，沿用相同字号与表面变量。
// ReactFlow的结束回调与原开始提示共存，不替换原已有目标连接。
// 连接开始先清旧菜单，连续两次拖线不能误用上一次源ID。
// 普通右键菜单仍由原context处理，不因这次新菜单复制一套操作面板。
// 正式工作区禁用时传入editable=false，菜单隐藏且确认动作不会提交。
// 新建结果仍进入原自动保存，页面不保存独立的新节点临时数组。
// 世界坐标由当前ReactFlow上下文换算，导航开合不需要重建连接规则。
// 只接图片输出松手空白的新增场景，不改变从已有输入端连接的流程。
  const connectionMenu = useCanvasConnectionMenu({ nodes: editor.nodes, editable: editor.persistence.editable, add: editor.add, cancelConnection: editor.cancelConnection });
  const [hand, setHand] = useState(false);
  const panTool = useCanvasPanRecovery(host, hand, active && !popup && !busy && editor.persistence.editable);
  const [grid, setGrid] = useState(true);
  const [minimap, setMinimap] = useState(false);
  const [preferences, setPreferences] = useState({ ...DEFAULT_PREFERENCES });
  const closeMenu = useCallback(() => { setMenu(null); host.current?.focus({ preventScroll: true }); }, []);
  // 显式保留 setter 依赖，侧栏失效收尾存在渲染期更新时，编译器仍能验证缓存。
  // setter 引用由 React 保持稳定，因此不会让原有关闭回调随每次表单输入重建。
  // 关闭仍只修改当前工作区的浮层状态，不清空正在编辑的节点参数。
  const closePopup = useCallback(() => { resourceTicket.current++; setPopup(null); }, [setPopup]);
  // 开窗前留存触发器；随后 inert 会移走工作区焦点，浮层自身无法补猜原目标。
  // 每个画布会话各有自己的 ref，另一个实例开窗不会覆盖这里的返回地址。
  const openPopup = (value: Exclude<Popup, null>) => {
    popupTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : host.current;
    setPopup(value);
  };
  // 双击和视频放大共用同一主区预览，保留各自触发器以便退出后恢复焦点。
  const openPreview = (id: string) => {
    if (busy) return;
    setPreviewId(id); setMenu(null); openPopup("network");
  };
  // 文本与便签双击交回书写框；媒体正文继续进入节点网，标题和控件不参与。
  const previewNode = (event: MouseEvent, node: CanvasNode) => {
    if (node.data.kind === "text" || node.data.kind === "note") return;
    if (busy || !(event.target instanceof Element) || !event.target.closest(".hy-node-card") || event.target.closest("button,input,textarea,select,[contenteditable=true]")) return;
    event.preventDefault(); openPreview(node.id);
    popupTrigger.current = host.current;
  };
  const locatePreview = (id: string) => {
    editor.changeNodes(editor.nodes.map(node => ({ type: "select", id: node.id, selected: node.id === id })));
    void flow.fitView({ nodes: [{ id }], padding: .6, duration: 0 }).catch(() => editor.notify(t("canvas.taskFailed"), "error"));
    closePopup();
  };
  // 屏幕点交给图引擎换算，导航开合和缩放不能再手动减一遍偏移。
  const showMenu = (x: number, y: number, context: "node" | "edge" | "pane" | null, nodeId?: string) => {
    const rect = host.current?.getBoundingClientRect();
    if (!rect) return;
    setMenu({ x, y, context, nodeId, left: Math.max(18, Math.min(x - rect.left, rect.width - 198)), top: Math.max(18, Math.min(y - rect.top, rect.height - 540)) });
  };
  const add = (kind: CanvasAddKind) => {
    if (!menu || !editor.persistence.editable) return;
    const position = flow.screenToFlowPosition({ x: menu.x, y: menu.y });
    editor.add(kind, { x: position.x - (kind === "video" ? 251 : 142), y: position.y - 100 });
    closeMenu();
  };
  const importBatch = (kind: "image" | "video", source: CanvasBatchSource) => {
    closeMenu(); resourceTicket.current++; setResourceTarget(undefined);
    if (source === "local") { pickMedia({ id: "", kind, batch: true }); return; }
    setBatchResource({ kind, source }); openPopup("resources");
  };
  const useBatch = async (media: CanvasMedia[]) => {
    const rect = host.current?.getBoundingClientRect(), ticket = resourceTicket.current;
    if (!rect || !batchResource || resourceWriting) return false;
    setResourceWriting(true);
    try {
      const complete = await addBatchCanvasMedia(editor, media, flow.screenToFlowPosition({ x: rect.left + rect.width / 2 - 150, y: rect.top + rect.height / 2 - 100 }), batchResource.source === "library", () => ticket === resourceTicket.current && !!host.current);
      if (complete && ticket === resourceTicket.current) closePopup();
      return complete;
    } finally { if (host.current) setResourceWriting(false); }
  };
  const open = () => {
    const rect = host.current?.getBoundingClientRect();
    if (rect) showMenu(rect.left + rect.width / 2, rect.top + 100, null);
  };
// 右键先阻止浏览器默认菜单，再选择对应画布动作。
// 右键未选节点会清掉旧节点选择，只选本次明确目标。
// 同时清掉旧边选择，删除这张卡时不会顺带删无关连接。
// 右键已经在选择集内的节点保留多选，支持组复制与组剪切。
// 这里不复制节点，真正动作等用户选择菜单项。
// 空白右键先进入添加节点，图像分类与底栏加号共用 AddNodeMenu。
// 空白右键直接展示完整菜单，复制过节点时同时提供粘贴。
// 粘贴入口的有无取决于底稿，不取决于系统文本剪贴板。
// 已复制普通文字不能让节点粘贴动作凭空出现。
// 菜单开合不是作品修改，不消耗撤销步数。
// 点击菜单项后的 focus 恢复让后续 Ctrl+V 回到画布命令范围。
  const context = (event: MouseEvent | globalThis.MouseEvent, node?: CanvasNode) => {
    if (popup || busy || !isCanvasSurfaceEvent(event.target, host.current)) return;
    event.preventDefault();
    if (node && !node.selected) {
      editor.changeNodes(editor.nodes.map(item => ({ type: "select", id: item.id, selected: item.id === node.id })));
      editor.changeEdges(editor.edges.map(item => ({ type: "select", id: item.id, selected: false })));
    }
    showMenu(event.clientX, event.clientY, node ? "node" : null, node?.id);
  };
// 连线右键的目标身份来自图库事件，不从鼠标位置猜最近节点。
// 未选中的边先成为唯一边选择。
// 清空旧节点选择，避免 Delete 一次删掉节点和本次边。
// 已经选中的边保留现有选择集，遵循图引擎多选语义。
// 菜单只有删除连线，复用原 remove 命令清理选中边。
// 撤销使用同一作品历史，能恢复原 id 与端点。
// 不修改任何媒体文件，断开引用不是删除资产。
// 边的交互宽度比可见细线宽，方便实际指针命中。
// 普通点击边将焦点放到画布根，Delete 才能稳定到达命令入口。
// 焦点动作本身不创建或移除任何连接。
  const edgeContext = (event: MouseEvent, edge: { id: string; selected?: boolean }) => {
    if (popup || busy || !isCanvasSurfaceEvent(event.target, host.current)) return;
    event.preventDefault();
    // 右键未选中的边只选该边，不让旧节点选择导致意外连带删除。
    if (!edge.selected) {
      editor.changeNodes(editor.nodes.map(item => ({ type: "select", id: item.id, selected: false })));
      editor.changeEdges(editor.edges.map(item => ({ type: "select", id: item.id, selected: item.id === edge.id })));
    }
    showMenu(event.clientX, event.clientY, "edge");
  };
// 尺寸作用于当前选中的节点，不按鼠标所在媒体重新选目标。
// 每张卡获得自己的 card 对象，后续单卡更新不互相串值。
// 修改复用 updateNodeData，因此保存和撤销可见同一已确认数据。
// 卡片原来的 kind、prompt、content 与 media 不受尺寸修改影响。
// 内置预设和自定义表单都调用这一个入口。
// 自定义弹窗显示选择集首张卡的当前值，确认后应用到选择集。
// 多选逐项更新沿用原历史粒度，不声称是全新批量事务系统。
// 卡片随外壳尺寸铺满；主区大预览仍完整显示素材。
// 端口位置按新高度计算，用户不用重新创建连线。
  const resizeCards = (card: NonNullable<CanvasData["card"]>) => {
    editor.resizeCards(card);
  };
  // 粘贴只在本会话确实持有节点底稿时出现，连线菜单只提供准确的删除动作。
// contextItems 只是菜单配置，不拥有另一份作品状态。
// action 回调表达用户意图，实际编辑仍回到 reducer。
// copy 只建立底稿，所以菜单关闭后节点数不变。
// cut 将底稿与删除连在一次命令中，不能先删除再发现没复制。
// paste 每次产生新节点身份，不把原节点直接插入数组两次。
// card 子菜单通过 children 复用公共额外展开能力。
// 没有在画布页面复制一份级联定位与键盘实现。
// custom 先记录浮层触发焦点，再关闭旧菜单。
// 删除项沿用公共 destructive 提示，而非单独画粗红边按钮。
// 图标来自现有 lucide 依赖，不加载新的资源字体。
// 粘贴项用条件数组注入，没有底稿时 DOM 中不存在该动作。
// 没有假 disabled 粘贴占位来暗示它已具备系统剪贴板读取能力。
// 空白菜单的添加项返回原 AddNodeMenu，节点分类 UI 只有一份。
// 连线菜单与节点菜单共享 CascadeMenu 外壳，行为配置各自独立。
// 菜单文字使用 i18n，不用内部操作码直接给用户显示。
// 打开尺寸面板不会触发复制或移动源媒体。
  const noteMenu = canvasNoteMenu(editor.nodes, editor.updateNodeData).map(item => ({
    ...item, children: item.children?.map(child => ({ ...child, action: () => { child.action?.(); closeMenu(); } })),
  }));
  const annotationNode = editor.nodes.find(node => node.id === menu?.nodeId);
  const contextItems: CascadeMenuItem[] = menu?.context === "edge" ? [
    { id: "remove", label: t("canvas.removeEdge"), icon: Trash2, destructive: true, action: () => { editor.remove(); closeMenu(); } },
  ] : [
    ...(menu?.context === "node" ? [
      { id: "copy", label: t("canvas.copy"), icon: Copy, action: () => { editor.clipboardAction("copy"); closeMenu(); } },
      { id: "add-annotation", label: t("canvas.addAnnotation"), icon: Tag, disabledReason: (annotationNode?.data.annotations?.length ?? 0) >= MAX_CANVAS_ANNOTATIONS ? t("canvas.annotationLimit") : undefined, action: () => { if (annotationNode) annotations.open(annotationNode.id); closeMenu(); } },
      { id: "cut", label: t("canvas.cut"), icon: Scissors, action: () => { editor.clipboardAction("cut"); closeMenu(); } },
      ...noteMenu,
      { id: "lock-size", label: t(editor.nodes.filter(node => node.selected).every(node => node.data.resizeLocked) ? "canvas.unlockSize" : "canvas.lockSize"), icon: editor.nodes.filter(node => node.selected).every(node => node.data.resizeLocked) ? UnlockKeyhole : LockKeyhole, disabledReason: editor.fixedSize ? t("canvas.fixAllSizes") : undefined, action: () => { editor.lockSize(!editor.nodes.filter(node => node.selected).every(node => node.data.resizeLocked)); closeMenu(); } },
      { id: "card", disabledReason: editor.fixedSize || editor.nodes.filter(node => node.selected).every(node => node.data.resizeLocked) ? t("canvas.lockSize") : undefined, label: t("canvas.cardStyle"), icon: Square, children: [
        { id: "square", label: t("canvas.cardSquare"), icon: Square, action: () => { resizeCards(CARD_PRESETS.square); closeMenu(); } },
        { id: "rectangle", label: t("canvas.cardRectangle"), icon: RectangleHorizontal, action: () => { resizeCards(CARD_PRESETS.rectangle); closeMenu(); } },
        { id: "custom", label: t("canvas.cardCustom"), icon: SlidersHorizontal, action: () => { openPopup("card"); setMenu(null); } },
      ] },
      { id: "remove", label: t("canvas.remove"), icon: Trash2, destructive: true, action: () => { editor.remove(); closeMenu(); } },
    // 保留右键落点，只切换菜单形态；底栏的open才使用画布顶部中心。
    ] : [{ id: "add", label: t("canvas.add"), icon: Plus, action: () => setMenu(current => current ? { ...current, context: null } : null) }]),
    ...(editor.clipboard ? [{ id: "paste", label: t("canvas.paste"), icon: ClipboardPaste, action: () => { editor.clipboardAction("paste"); closeMenu(); } }] : []),
  ];
// 项目头复用已有图标按钮，通过 action 字符串通知页面。
// export 在这里接真实打包，不再是无行为的下载图标。
// open 先判断 dirty，未保存编辑需要用户明确确认替换。
// 导出不需要清空当前图，完成后仍可继续编辑同一工程。
// save 沿用原草稿保存，按钮语义与工程导出分开。
// rename 只打开标题草稿，不重命名磁盘资产目录。
// refresh 仍走原重新读取逻辑，不能把它误当作清空工程。
// 确认框的取消只关闭浮层，不调用工程打开接口。
// 确认继续后先解除浮层，再进入异步 busy 隔离。
// 导入取消会回到原工程，dirty 状态仍由实际内容决定。
// 读取失败不会用空文档覆盖尚未保存的作品。
// 项目头 disabled 同时反映可靠水合与本轮处理状态。
  const headerAction = (action: string) => {
    if (action === "export") project.export();
    if (action === "open") { if (editor.persistence.dirty) openPopup("open"); else project.open(); }
    if (action === "save") void editor.persistence.save();
    if (action === "rename") openPopup("rename");
    if (action === "refresh") { if (editor.persistence.dirty) openPopup("reload"); else void editor.persistence.load(); }
  };
  const saveText = t(editor.persistence.status === "loading" ? "canvas.persistenceLoading" : editor.persistence.status === "loadError" ? "canvas.loadError" : editor.persistence.status === "saveError" ? "canvas.persistenceError" : editor.persistence.status === "saving" ? "canvas.saving" : editor.persistence.dirty ? "canvas.unsaved" : "canvas.persistenceReady");
  // 只接收操作系统文件拖入；节点和端口仍由图引擎处理，不能全局 preventDefault。
  // 外部文件进入画布只创建媒体节点，不触发生成、时间线或云端上传。
  // Files 标志来自浏览器拖放清单，不用自定义字符串判断一次内部节点移动。
  // 只对外部文件调用 preventDefault，保留图引擎自己的连线与节点拖动。
  // dropEffect 的 copy 表示“增加引用”，不会剪切或移动资源管理器中的原文件。
  // 即使当前弹层打开也阻止浏览器默认导航到文件，但不在弹层背后修改作品。
  // 媒体错误、读取失败和导入反馈各由原有边界处理，这里不覆盖它们的状态。
  // 拖放与系统框最终同用 importFiles，格式允许集和异常语义不会各自漂移。
  // 不依赖非标准 File.path，外部 File 的路径仍经过现有 preload。
  // 页面离开后 input 与节点内容自然卸载，媒体清理属于对应预览会话。
  // 外层只确定主区几何，画布与原创建表单在 DOM 上互为兄弟。
  // 画布资料样式会重置所有后代 button 的边框、背景、对齐和字体。
  // 如果把原表单继续放在 hy-canvas-ui 内，即使用同一 JSX，也会被重置成另一种界面。
  // 这里通过真实宿主边界避免继承污染，而不是给每个输入补一条覆盖样式。
  // 原表单的开关、工具胶囊和生成渐变因此直接使用原来的样式来源。
  // 不能在侧栏再加 data-canvas-theme，否则又会把原主题令牌替换为画布中性令牌。
  // 外层没有 hy-canvas-ui，原表单不会进入画布的焦点阴影清理选择器。
  // 内层保留该类，原节点按钮与媒体控件的既有触摸效果不受影响。
  // 工作区 ref 仍指向原画布，不把侧栏加入 React Flow 的世界坐标计算。
  // 所以 fitView、鼠标命中与画布缩放不把参数面板当作一个图节点。
  // 侧栏绝对定位参照外层可用主区，不参照整个 Electron 窗口。
  // 导航开合后外层实际宽度变化，右侧面板随布局停靠，不拼接固定导航像素。
  // 外层使用 section 避免意外命中 AppShell 给直接子 div 设置的页面内边距。
  // 原内层仍保持完整高度，不从它里面扣除一份虚构侧栏高度。
  // 图片设置与画布背景可以同时存在，非模态侧栏不盖住应用导航。
  // 打开主浮层或导入确认时仍卸载图片设置，隐藏内容不参与键盘路径。
  // onKeyDownCapture 放在共同外层，使侧栏和画布都保留原 Ctrl+S 保存入口。
  // 若只留在内层，侧栏输入里的 Ctrl+S 会变成浏览器保存网页，而不是保存当前工程。
  // 保存继续先提交当前输入的失焦值，再读取图引擎的最新节点快照。
  // 这条保存链仍属于原编辑器，没有因为表单搬到兄弟层就创建另一份保存器。
  // 除保存外的图快捷键继续由原 editor.keyDown 检查 popover 和输入目标。
  // 侧栏自己的键盘冒泡隔离仍有效，按 Delete 编辑文字不能删除图节点。
  // Escape 的菜单清理仍在共同捕获阶段，内层字段可以继续处理自己的草稿取消。
  // 原指南消费 Escape 后侧栏保留，不能因宿主调整一次退出两个界面。
  // 原 ReactFlowProvider 仍包住整个工作区，图实例和选择模型没有迁移。
  // CanvasEditorActionsProvider 只服务原节点，参数表单通过明确回调更新稳定节点身份。
  // 侧栏不读取该动作 Context，从 DOM 兄弟层移出不会丢掉任何必需的节点动作依赖。
  // 所有节点动作仍走同一个 reducer，参数修改和画布移动使用原历史系统。
  // 原媒体 File input 留在画布内，外部文件拖放仍由原内层处理。
  // 不让侧栏的参数文件操作冒充画布媒体导入，两种输入边界各自保持。
  // 原背景菜单与工具栏位置不变，它们仍属于画布自己的语义样式域。
  // 原导演台和合成器浮层也留在内层，本轮不改变那些业务的外观或生命周期。
  // 原图片侧栏条件继续按 imageSettingsNode 身份计算，不从 DOM 最近点击猜目标。
  // 关闭侧栏不清空节点确认参数，原自动保存会继续处理已发出的事务。
  // 删除节点后原触发器可能断开，焦点恢复仍由外壳检查 isConnected。
  // 外层自身不添加 tabindex，因此不会给用户增加一个无意义的 Tab 停靠点。
  // 画布原 tabindex 保留，关闭配置以后仍能回到同一图工作区。
  // 主题改变只重算原表单变量，不切换另一棵白色或深色业务组件树。
  // 正式回归应同时检查两处 DOM 归属，不能只凭文件里出现同一个组件名判断复用正确。
  // 这层调整只解决宿主隔离，不意味着接通任何生成、上传或导出服务。
  return <section inert={!active} className="relative h-full w-full" onKeyDownCapture={event => {
    if (!active || popup || busy || choice.pending) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      flushSync(() => { if (event.target instanceof HTMLElement) event.target.blur(); });
      void editor.persistence.save({ fixedSize: editor.fixedSize, name: editor.name, workspace: editor.workspace, nodes: flow.getNodes(), edges: flow.getEdges() });
      return;
    }
    // 先取消图片待建连接，再进入原编辑器Escape，迟到松手不能重新弹出目标菜单。
    // 只在当前工作区处理，不给其他页面安装常驻快捷键。
    if (event.key === "Escape") { connectionMenu.cancel(); setMenu(null); }
    editor.keyDown(event);
  }}><section ref={host} data-infinite-canvas data-network-open={popup === "network"} data-fixed-size={editor.fixedSize} data-canvas-hand={panTool} tabIndex={-1} className={`${styles.workspace} hy-canvas-ui`} aria-label={t("canvas.title")} onDragOver={event => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }} onDrop={event => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    if (!popup && !busy && !choice.pending) importFiles(Array.from(event.dataTransfer.files));
  }}>
    {/* 工作区文件入口：系统框支持多选，取消不修改作品；隐藏 input 不占键盘导航站点。 */}
    {/* input 放在业务宿主中，不复制 AppShell，也不盖住应用导航。 */}
    {/* hidden 仅用于系统文件选择入口，不把可交互的素材卡藏在这里。 */}
    {/* 真实 FileList 在 change 当次消费，作品 JSON 只接收已转换的普通引用数据。 */}
    {/* cancel 使用 Hook 中原生监听，不能通过窗口 blur 猜测用户是否取消。 */}
    <input ref={mediaInputRef} data-canvas-file-input type="file" multiple hidden onChange={mediaChanged} />
    <div className={styles.identity} inert={!!popup || !!choice.pending}><ProjectHeader name={editor.name || t("canvas.untitled")} status={saveText} editable={editor.persistence.editable && !busy} saving={editor.persistence.status === "saving"} onAction={headerAction} projectMenu={props.projectId ? <CanvasProjectMenu requestDelete={() => openPopup("deleteProject")} active={active} rename={() => openPopup("rename")} leave={session.leave} /> : undefined} /><p className={styles.persistence} data-canvas-save-status role="status" aria-live="polite">{saveText}</p></div>
    <CanvasEditorActionsProvider fixedSize={!!editor.fixedSize} value={{ generationStore: generation.store, cancelGeneration: generation.cancel, renameNode: mediaRename.rename, generateImage: generation.generate, updateNodeData: editor.updateNodeData, openAnnotation: annotations.open, startDrag: editor.startDrag, stopDrag: editor.stopDrag, duplicateSelected: editor.duplicate, copySelected: () => editor.clipboardAction("copy"), openComposer: id => { setCompositionId(id); openPopup("composition"); }, openImageSettings, openPreview, openDirector: id => { setDirectorId(id); openPopup("director"); }, cancelConnection: editor.cancelConnection, connectPort: editor.connectPort, importMedia: pickResources, useReferenceVoice }}>
    {/* 工作区主体：浮层 inert 继续隔离隐藏背景的键盘路径，不为导入再建全窗口遮罩。 */}
    {/* 待确认与磁盘处理中同样隔离背景，避免 Delete/Ctrl+V 穿透到原画布。 */}
    {/* 确认框在隔离层之外，不会把自己的按钮也变成无法聚焦。 */}
    <div style={{ width: "100%", height: "100%" }} inert={!!popup || project.busy || importing || mediaRename.busy || choice.pending} aria-hidden={popup || project.busy || importing || mediaRename.busy || choice.pending ? true : undefined}>
    <ReactFlow<CanvasNode> nodes={editor.nodes} edges={editor.edges} nodeTypes={NODE_TYPES} onNodeDoubleClick={previewNode} onNodesChange={editor.changeNodes} onEdgesChange={editor.changeEdges} onConnect={editor.connect} onConnectEnd={connectionMenu.end} onClickConnectEnd={() => editor.cancelConnection()} onNodeDragStart={editor.startDrag} onNodeDragStop={editor.stopDrag} onSelectionDragStart={editor.startDrag} onSelectionDragStop={editor.stopDrag} onPaneContextMenu={context} onNodeContextMenu={context} onEdgeContextMenu={edgeContext} onEdgeClick={() => host.current?.focus({ preventScroll: true })} onNodeClick={event => { if (!(event.target instanceof Element) || !event.target.closest("input,textarea,button,video,audio,[contenteditable=true],[data-canvas-media-control]")) host.current?.focus({ preventScroll: true }); }} onPaneClick={event => { if (isCanvasSurfaceEvent(event.target, host.current) && event.detail === 2 && preferences.blank === "double") showMenu(event.clientX, event.clientY, null); }} onConnectStart={() => { connectionMenu.start(); editor.notify(t("canvas.connectHint")); }} minZoom={.25} maxZoom={10} defaultViewport={{ x: 0, y: 0, zoom: 1 }} panOnScroll={preferences.wheel === "pan"} panOnScrollSpeed={preferences.panSpeed} zoomOnScroll={preferences.wheel === "zoom"} zoomOnDoubleClick={false} panOnDrag panActivationKeyCode={null} nodesDraggable={!panTool && editor.persistence.editable} elementsSelectable={editor.persistence.editable} selectNodesOnDrag={preferences.selectOnDrag} snapToGrid={preferences.snap} snapGrid={[20, 20]} selectionKeyCode="Shift" multiSelectionKeyCode="Shift" selectionMode={SelectionMode.Partial} nodeDragThreshold={0} deleteKeyCode={null} proOptions={{ hideAttribution: true }} defaultEdgeOptions={{ type: "bezier", interactionWidth: 22 }}>
      {grid && <Background variant={BackgroundVariant.Dots} gap={20} size={1} />}
      {/* 小地图只取当前主题色，缩略窗口与主画布共用同一配色，切主题不重建节点。 */}
      {/* 缩略块不加载真实媒体，避免小地图为每份视频再建一套解码器。 */}
      {/* nodeColor 和 maskColor 取 CSS token，主题切换无需 JavaScript 再算 RGB。 */}
      {/* 位置参数仍属于视图，没有序列化到用户画布文档。 */}
      {minimap && <MiniMap pannable zoomable position="bottom-right" style={{ bottom: 52, background: "var(--hy-panel)" }} nodeColor="var(--hy-muted)" maskColor="var(--hy-map-mask)" />}
    </ReactFlow>
    {editor.nodes.length === 0 && editor.persistence.editable && <button type="button" className={styles.empty} onClick={open}><span><CanvasIcon name="plus" size={29} /></span><strong>{t("canvas.empty")}</strong><small>{t("canvas.emptyHint")}</small></button>}
    <CanvasToolbar editor={editor} hand={hand} grid={grid} minimap={minimap} onHand={setHand} onGrid={() => setGrid(value => !value)} onMiniMap={() => setMinimap(value => !value)} onAdd={open} onSettings={() => openPopup("settings")} onHelp={() => openPopup("help")} onImport={() => pickResources()} />
    {/* 图片输出拖空白：原添加菜单仅注入两个有效生成目标，选项确认后统一创建连线。 */}
    {connectionMenu.menu && <CanvasConnectionMenu menu={connectionMenu.menu} close={connectionMenu.close} select={connectionMenu.select} />}
    {active && menu && !menu.context && <div className={styles.menu} style={{ left: menu.left, top: menu.top }}><AddNodeMenu onSelect={add} onClose={closeMenu} onBatchImport={importBatch} onPaste={editor.clipboard ? () => { editor.clipboardAction("paste"); closeMenu(); } : undefined} onImport={() => { closeMenu(); pickResources(); }} /></div>}
    {/* 节点右键仍使用公共级联菜单，本轮文件导入不替换旧复制、删除契约。 */}
    {/* 添加菜单先关闭再同步点 input，避免保留一个挡在文件选择返回位置的旧菜单。 */}
    {/* 关闭菜单的 focus 恢复不会触发生成，文件读取由随后真正的选择结果决定。 */}
    {/* 子菜单与一级菜单等高，鼠标可从下方选项水平移入，再选择子项。 */}
    {active && menu?.context && <><div ref={anchor} style={{ position: "fixed", left: menu.x, top: menu.y }} /><CascadeMenu anchor={anchor} items={contextItems} label={t("canvas.settings")} backLabel={t("canvas.close")} placement="pointer" equalHeight onClose={closeMenu} /></>}
    </div>
    </CanvasEditorActionsProvider>
    {annotations.editor}
    {/* 视频导入：复制默认选中，取消不修改图或文件；系统框与拖放共用该入口。 */}
    {active && choice.pending && <CanvasImportChoice onConfirm={choice.confirm} onCancel={choice.cancel} returnFocus={choice.returnFocus} />}
    {(project.busy || importing || mediaRename.busy) && <div className={styles.loading} role="status">{t("canvas.projectBusy")}</div>}
    {!editor.persistence.editable && <div className={styles.loading}><p>{saveText}</p>{editor.persistence.status === "loadError" && <CanvasChip onClick={() => { void editor.persistence.load(); }}>{t("canvas.retry")}</CanvasChip>}</div>}
    {active && popup && <CanvasOverlay full={popup === "director" || popup === "composition" || popup === "network"} label={t(popup === "network" ? "canvas.networkPreview" : popup === "composition" ? "canvas.composition" : popup === "settings" ? "canvas.canvasSettings" : "canvas.title")} onClose={popup === "director" ? () => { void director.current?.close().catch(() => {}); } : popup === "composition" ? () => { void composition.current?.close().catch(() => {}); } : closePopup} returnFocus={popupTrigger}>
      {popup === "resources" && <ProjectResources key={batchResource ? `${batchResource.kind}:${batchResource.source}` : "normal"} initialScope={batchResource?.source === "library" ? "library" : "project"} nodeOnly={batchResource?.source === "nodes"} onUseBatch={batchResource ? useBatch : undefined} projectId={props.projectId} workspace={editor.workspace} readDocument={() => serializeCanvas(editor)} kind={batchResource?.kind ?? resourceTarget?.kind} onClose={closePopup} onLocal={() => { closePopup(); if (batchResource) pickMedia({ id: "", kind: batchResource.kind, batch: true }); else pickMedia(resourceTarget); }} onUse={media => {
        const rect = host.current?.getBoundingClientRect();
        if (!rect) return;
        try {
          applyExistingCanvasMedia(editor, media, flow.screenToFlowPosition({ x: rect.left + rect.width / 2 - 150, y: rect.top + rect.height / 2 - 100 }), resourceTarget);
          closePopup();
        } catch { editor.notify(t("canvas.imageInputOverflow"), "error"); }
      }} />}
      {popup === "network" && <NetworkPreview nodes={canvasNetwork(editor, previewId)} initialId={previewId} onClose={closePopup} onLocate={locatePreview} />}
      {popup === "deleteProject" && <CanvasProjectDelete cancel={closePopup} remove={() => session.leave("delete")} />}
      {popup === "card" && <div className={styles.dialog}><CanvasCardSize card={editor.nodes.find(node => node.selected)?.data.card} onApply={resizeCards} onClose={closePopup} /></div>}
      {popup === "open" && <div className={styles.dialog}><h2>{t("canvas.openProject")}</h2><p>{t("canvas.openConfirm")}</p><footer><CanvasChip onClick={closePopup}>{t("canvas.cancel")}</CanvasChip><CanvasChip onClick={() => { closePopup(); project.open(); }}>{t("canvas.openProject")}</CanvasChip></footer></div>}
      {popup === "settings" && <CanvasSettings value={preferences} fixedSize={!!editor.fixedSize} onFixedSize={editor.setFixedSize} onChange={setPreferences} onClose={closePopup} />}
      {/* 视频合成：直接装入原网页，不复制工具箱编辑器或另建时间模型。 */}
      {popup === "composition" && compositionId && <CompositionEditor key={compositionId} projectId={props.projectId} id={compositionId} document={editor} sessionRef={composition} onSave={editor.persistence.save} onApply={editor.applyDocument} onClose={closePopup} />}
      {/* 导演台：节点身份固定到打开时的 ID，保存不能误写后来选中的其他节点。 */}
      {popup === "director" && directorId && <Director key={directorId} sessionRef={director} initialScene={editor.nodes.find(node => node.id === directorId)?.data.scene} onCancel={closePopup} onSave={async scene => {
        const image = scene.previewImageUrl ?? undefined;
        const document = await prepareDirectorSave(editor, directorId, scene, image, false, writeDirectorImage);
        if (!await editor.persistence.save(document)) throw new Error("director-save-failed");
        editor.applyDocument(document);
      }} onConfirm={async (scene, image) => {
        const document = await prepareDirectorSave(editor, directorId, scene, image, true, writeDirectorImage);
        if (!await editor.persistence.save(document)) throw new Error("director-save-failed");
        editor.applyDocument(document);
      }} />}
      {popup === "help" && <div className={styles.dialog}><h2>{t("canvas.help")}</h2><p>{t("canvas.helpText")}</p><p>{t("canvas.unavailable")}</p><CanvasChip onClick={closePopup}>{t("canvas.close")}</CanvasChip></div>}
      {popup === "rename" && <form className={styles.dialog} onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); editor.rename(String(form.get("name") ?? "").trim()); closePopup(); }}><h2>{t("canvas.rename")}</h2><input autoFocus name="name" aria-label={t("canvas.rename")} defaultValue={editor.name} maxLength={80} /><footer><CanvasChip onClick={closePopup}>{t("canvas.cancel")}</CanvasChip><button type="submit" className="hy-chip">{t("canvas.apply")}</button></footer></form>}
      {popup === "reload" && <div className={styles.dialog}><h2>{t("canvas.reload")}</h2><p>{t("canvas.reloadConfirm")}</p><footer><CanvasChip onClick={closePopup}>{t("canvas.cancel")}</CanvasChip><CanvasChip onClick={() => { closePopup(); void editor.persistence.load(); }}>{t("canvas.reload")}</CanvasChip></footer></div>}
    </CanvasOverlay>}
  </section>
    {/* 图片侧栏直接使用创建页表单，放在画布样式域之外，不重画控件。 */}
    {active && imageSettingsNode && !imageSettingsNode.data.remoteImage && !popup && !busy && !choice.pending && (imageSettingsNode.data.kind === "audio" ?
      <CanvasImageSidebar key={imageSettingsNode.id} returnFocus={imageSettingsTrigger} label={imageSettingsNode.data.title || t("create.audio.media")} selecting={false} onClose={() => setImageSettingsId(null)}>
        {/* 音频侧栏：同一原表单，确认参数只更新当前节点，上传仍走受管资源导入。 */}
        <AudioSettings nodeId={imageSettingsNode.id} data={imageSettingsNode.data} busy={generation.nodeIds.includes(imageSettingsNode.id)} onChange={patch => editor.updateNodeData(imageSettingsNode.id, patch)} />
      </CanvasImageSidebar> : <ImageSettings returnFocus={imageSettingsTrigger} key={imageSettingsNode.id + (imageSettingsNode.data.workflow ?? "anima")} sidebar workflow={imageSettingsNode.data.workflow ?? (imageSettingsNode.data.kind === "video" ? "minimax" : "anima")} label={imageSettingsNode.data.title || t("canvas.standardImageWorkflow")} data={imageSettingsNode.data} onChange={patch => editor.updateNodeData(imageSettingsNode.id, patch)} onClose={() => setImageSettingsId(null)} />)}
  </section>;
}
