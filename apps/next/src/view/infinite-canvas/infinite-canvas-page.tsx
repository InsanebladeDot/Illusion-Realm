"use client";

// 正式路由装配已有画布引擎与交付包 UI；菜单/面板开合不进入作品撤销记录。
// AppShell 仍拥有窗口与导航，画布只占主区，不复制桌面外壳。
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { Background, BackgroundVariant, MiniMap, ReactFlow, ReactFlowProvider, SelectionMode, useReactFlow } from "@xyflow/react";
import { Copy, Trash2, Scissors, ClipboardPaste, Square, RectangleHorizontal, SlidersHorizontal, Plus } from "lucide-react";
import { CascadeMenu, type CascadeMenuItem } from "@/components/cascade-menu";
import { useTranslation } from "@/i18n";
import { CanvasNodeCard } from "./canvas-node";
import { CanvasToolbar } from "./canvas-toolbar";
import { CanvasOverlay } from "./canvas-overlay";
import { AddNodeMenu, ProjectHeader } from "./reference-ui/canvas-chrome";
import { CanvasSettings, DEFAULT_PREFERENCES } from "./reference-ui/canvas-settings";
import { CompositionEditor } from "./reference-ui/composition-editor";
import { CanvasEditorActionsProvider } from "./canvas-editor-context";
import { CanvasChip, CanvasIcon } from "./reference-ui/components";
import type { CanvasNode, NodeKind, CanvasData } from "./canvas-model";
import { CanvasCardSize, CARD_PRESETS } from "./canvas-card-size";
import { useCanvasProject } from "./use-canvas-project";
import { useCanvasEditor } from "./use-canvas-editor";
import { useCanvasMediaImport } from "./use-canvas-media-import";
// 视频确认复用当前主区浮层；导入业务仍由原 Hook 统一拥有。
import { CanvasImportChoice } from "./canvas-import-choice";
import "@xyflow/react/dist/style.css";
import styles from "./canvas.module.css";

const NODE_TYPES = { canvas: CanvasNodeCard };
type Popup = "settings" | "help" | "rename" | "reload" | "composition" | "card" | "open" | null;

export function InfiniteCanvasPage() {
  return <ReactFlowProvider><CanvasWorkspace /></ReactFlowProvider>;
}

function CanvasWorkspace() {
  const { t } = useTranslation();
  const editor = useCanvasEditor();
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
  const busy = project.busy || importing;
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
  const anchor = useRef<HTMLDivElement>(null);
  const popupTrigger = useRef<HTMLElement | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; left: number; top: number; context: "node" | "edge" | "pane" | null } | null>(null);
  const [popup, setPopup] = useState<Popup>(null);
  const [hand, setHand] = useState(false);
  const [grid, setGrid] = useState(true);
  const [minimap, setMinimap] = useState(false);
  const [preferences, setPreferences] = useState({ ...DEFAULT_PREFERENCES });
  const closeMenu = useCallback(() => { setMenu(null); host.current?.focus({ preventScroll: true }); }, []);
  const closePopup = useCallback(() => setPopup(null), []);
  // 开窗前留存触发器；随后 inert 会移走工作区焦点，浮层自身无法补猜原目标。
  // 每个画布会话各有自己的 ref，另一个实例开窗不会覆盖这里的返回地址。
  const openPopup = (value: Exclude<Popup, null>) => {
    popupTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : host.current;
    setPopup(value);
  };
// 添加菜单属于画布内部，需要这里管理外部点击关闭。
// 公共 CascadeMenu 自己处理外部点击和焦点，不能再重复安装同一关闭器。
// 否则按下菜单项时本层先卸载菜单，后续 click 将无按钮可以触发。
// 所以有 context 的级联菜单明确跳过这个 effect。
// 原空白添加菜单仍保留已有键盘和进入焦点路径。
// 外部点击处理只在菜单打开期间注册。
// 关闭或更换菜单时清理同一回调，避免监听不断累积。
// 事件目标必须是 Element 才调用 closest，非元素目标不猜测菜单归属。
  useEffect(() => {
    if (!menu || menu.context) return;
    const element = host.current?.querySelector<HTMLElement>("[data-canvas-menu] button:not(:disabled)");
    element?.focus();
    const closeOutside = (event: PointerEvent) => { if (event.target instanceof Element && !event.target.closest("[data-canvas-menu]")) closeMenu(); };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [menu, closeMenu]);
  // 屏幕点交给图引擎换算，导航开合和缩放不能再手动减一遍偏移。
  const showMenu = (x: number, y: number, context: "node" | "edge" | "pane" | null) => {
    const rect = host.current?.getBoundingClientRect();
    if (!rect) return;
    setMenu({ x, y, context, left: Math.max(18, Math.min(x - rect.left, rect.width - 198)), top: Math.max(18, Math.min(y - rect.top, rect.height - 540)) });
  };
  const add = (kind: NodeKind) => {
    if (!menu || !editor.persistence.editable) return;
    const position = flow.screenToFlowPosition({ x: menu.x, y: menu.y });
    editor.add(kind, { x: position.x - (kind === "video" ? 251 : 142), y: position.y - 100 });
    closeMenu();
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
// 首次没有剪贴板时空白处保留原 AddNodeMenu。
// 已有底稿后空白处切换为添加与粘贴的公共级联菜单。
// 用户设置的空白右键策略仍控制未复制前的添加入口。
// 粘贴入口的有无取决于底稿，不取决于系统文本剪贴板。
// 已复制普通文字不能让节点粘贴动作凭空出现。
// 菜单开合不是作品修改，不消耗撤销步数。
// 点击菜单项后的 focus 恢复让后续 Ctrl+V 回到画布命令范围。
  const context = (event: MouseEvent | globalThis.MouseEvent, node?: CanvasNode) => {
    event.preventDefault();
    if (node && !node.selected) {
      editor.changeNodes(editor.nodes.map(item => ({ type: "select", id: item.id, selected: item.id === node.id })));
      editor.changeEdges(editor.edges.map(item => ({ type: "select", id: item.id, selected: false })));
    }
    if (node || editor.clipboard || preferences.blank === "right") showMenu(event.clientX, event.clientY, node ? "node" : editor.clipboard ? "pane" : null);
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
// 外壳 CSS 读取宽高，媒体元素继续 object-fit contain。
// 因此卡片变方不会裁掉竖屏视频的原始画面。
// 端口位置按新高度计算，用户不用重新创建连线。
  const resizeCards = (card: NonNullable<CanvasData["card"]>) => {
    for (const node of editor.nodes.filter(item => item.selected)) editor.updateNodeData(node.id, { card: { ...card } });
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
  const contextItems: CascadeMenuItem[] = menu?.context === "edge" ? [
    { id: "remove", label: t("canvas.removeEdge"), icon: Trash2, destructive: true, action: () => { editor.remove(); closeMenu(); } },
  ] : [
    ...(menu?.context === "node" ? [
      { id: "copy", label: t("canvas.copy"), icon: Copy, action: () => { editor.clipboardAction("copy"); closeMenu(); } },
      { id: "cut", label: t("canvas.cut"), icon: Scissors, action: () => { editor.clipboardAction("cut"); closeMenu(); } },
      { id: "card", label: t("canvas.cardStyle"), icon: Square, children: [
        { id: "square", label: t("canvas.cardSquare"), icon: Square, action: () => { resizeCards(CARD_PRESETS.square); closeMenu(); } },
        { id: "rectangle", label: t("canvas.cardRectangle"), icon: RectangleHorizontal, action: () => { resizeCards(CARD_PRESETS.rectangle); closeMenu(); } },
        { id: "custom", label: t("canvas.cardCustom"), icon: SlidersHorizontal, action: () => { openPopup("card"); setMenu(null); } },
      ] },
      { id: "remove", label: t("canvas.remove"), icon: Trash2, destructive: true, action: () => { editor.remove(); closeMenu(); } },
    ] : [{ id: "add", label: t("canvas.add"), icon: Plus, action: open }]),
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
  return <section ref={host} data-infinite-canvas tabIndex={-1} className={`${styles.workspace} hy-canvas-ui`} aria-label={t("canvas.title")} onDragOver={event => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }} onDrop={event => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    if (!popup && !busy && !choice.pending) importFiles(Array.from(event.dataTransfer.files));
  }} onKeyDownCapture={event => {
    if (popup || busy || choice.pending) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      flushSync(() => { if (event.target instanceof HTMLElement) event.target.blur(); });
      void editor.persistence.save({ name: editor.name, workspace: editor.workspace, nodes: flow.getNodes(), edges: flow.getEdges() });
      return;
    }
    if (event.key === "Escape") setMenu(null);
    editor.keyDown(event);
  }}>
    {/* 工作区文件入口：系统框支持多选，取消不修改作品；隐藏 input 不占键盘导航站点。 */}
    {/* input 放在业务宿主中，不复制 AppShell，也不盖住应用导航。 */}
    {/* hidden 仅用于系统文件选择入口，不把可交互的素材卡藏在这里。 */}
    {/* 真实 FileList 在 change 当次消费，作品 JSON 只接收已转换的普通引用数据。 */}
    {/* cancel 使用 Hook 中原生监听，不能通过窗口 blur 猜测用户是否取消。 */}
    <input ref={mediaInputRef} data-canvas-file-input type="file" multiple hidden onChange={mediaChanged} />
    <CanvasEditorActionsProvider value={{ updateNodeData: editor.updateNodeData, duplicateSelected: editor.duplicate, copySelected: () => editor.clipboardAction("copy"), openComposer: () => openPopup("composition"), cancelConnection: editor.cancelConnection, connectPort: editor.connectPort, importMedia: pickMedia }}>
    {/* 工作区主体：浮层 inert 继续隔离隐藏背景的键盘路径，不为导入再建全窗口遮罩。 */}
    {/* 待确认与磁盘处理中同样隔离背景，避免 Delete/Ctrl+V 穿透到原画布。 */}
    {/* 确认框在隔离层之外，不会把自己的按钮也变成无法聚焦。 */}
    <div style={{ width: "100%", height: "100%" }} inert={!!popup || busy || choice.pending} aria-hidden={popup || busy || choice.pending ? true : undefined}>
    <ReactFlow<CanvasNode> nodes={editor.nodes} edges={editor.edges} nodeTypes={NODE_TYPES} onNodesChange={editor.changeNodes} onEdgesChange={editor.changeEdges} onConnect={editor.connect} onClickConnectEnd={() => editor.cancelConnection()} onNodeDragStart={editor.startDrag} onNodeDragStop={editor.stopDrag} onSelectionDragStart={editor.startDrag} onSelectionDragStop={editor.stopDrag} onPaneContextMenu={context} onNodeContextMenu={context} onEdgeContextMenu={edgeContext} onEdgeClick={() => host.current?.focus({ preventScroll: true })} onNodeClick={event => { if (!(event.target instanceof Element) || !event.target.closest("input,textarea,button,video,audio,[data-canvas-media-control]")) host.current?.focus({ preventScroll: true }); }} onPaneClick={event => { if (event.detail === 2 && preferences.blank === "double") showMenu(event.clientX, event.clientY, null); }} onConnectStart={() => editor.setMessage(t("canvas.connectHint"))} minZoom={.25} maxZoom={2} defaultViewport={{ x: 0, y: 0, zoom: 1 }} panOnScroll={preferences.wheel === "pan"} panOnScrollSpeed={preferences.panSpeed} zoomOnScroll={preferences.wheel === "zoom"} zoomOnDoubleClick={false} panOnDrag nodesDraggable={!hand && editor.persistence.editable} elementsSelectable={editor.persistence.editable} selectNodesOnDrag={preferences.selectOnDrag} snapToGrid={preferences.snap} snapGrid={[20, 20]} selectionKeyCode="Shift" multiSelectionKeyCode="Shift" selectionMode={SelectionMode.Partial} nodeDragThreshold={0} deleteKeyCode={null} proOptions={{ hideAttribution: true }} defaultEdgeOptions={{ type: "bezier", interactionWidth: 22 }}>
      {grid && <Background variant={BackgroundVariant.Dots} gap={20} size={1} />}
      {/* 小地图只取当前主题色，缩略窗口与主画布共用同一配色，切主题不重建节点。 */}
      {/* 缩略块不加载真实媒体，避免小地图为每份视频再建一套解码器。 */}
      {/* nodeColor 和 maskColor 取 CSS token，主题切换无需 JavaScript 再算 RGB。 */}
      {/* 位置参数仍属于视图，没有序列化到用户画布文档。 */}
      {minimap && <MiniMap pannable zoomable position="bottom-right" style={{ bottom: 52, background: "var(--hy-panel)" }} nodeColor="var(--hy-muted)" maskColor="var(--hy-map-mask)" />}
    </ReactFlow>
    <div className={styles.identity}><ProjectHeader name={editor.name || t("canvas.untitled")} status={saveText} editable={editor.persistence.editable && !busy} saving={editor.persistence.status === "saving"} onAction={headerAction} /><p className={styles.persistence} data-canvas-save-status role="status" aria-live="polite">{saveText}</p></div>
    {editor.nodes.length === 0 && editor.persistence.editable && <button type="button" className={styles.empty} onClick={open}><span><CanvasIcon name="plus" size={29} /></span><strong>{t("canvas.empty")}</strong><small>{t("canvas.emptyHint")}</small></button>}
    <CanvasToolbar editor={editor} hand={hand} grid={grid} minimap={minimap} onHand={setHand} onGrid={() => setGrid(value => !value)} onMiniMap={() => setMinimap(value => !value)} onAdd={open} onSettings={() => openPopup("settings")} onHelp={() => openPopup("help")} onImport={() => pickMedia()} />
    <p role="status" data-canvas-message aria-live="polite" className={styles.message}>{editor.message}</p>
    {menu && !menu.context && <div className={styles.menu} style={{ left: menu.left, top: menu.top }}><AddNodeMenu onSelect={add} onClose={closeMenu} onImport={() => { closeMenu(); pickMedia(); }} /></div>}
    {/* 节点右键仍使用公共级联菜单，本轮文件导入不替换旧复制、删除契约。 */}
    {/* 添加菜单先关闭再同步点 input，避免保留一个挡在文件选择返回位置的旧菜单。 */}
    {/* 关闭菜单的 focus 恢复不会触发生成，文件读取由随后真正的选择结果决定。 */}
    {menu?.context && <><div ref={anchor} style={{ position: "fixed", left: menu.x, top: menu.y }} /><CascadeMenu anchor={anchor} items={contextItems} label={t("canvas.settings")} backLabel={t("canvas.close")} placement="pointer" onClose={closeMenu} /></>}
    </div>
    </CanvasEditorActionsProvider>
    {/* 视频导入：复制默认选中，取消不修改图或文件；系统框与拖放共用该入口。 */}
    {choice.pending && <CanvasImportChoice onConfirm={choice.confirm} onCancel={choice.cancel} returnFocus={choice.returnFocus} />}
    {busy && <div className={styles.loading} role="status">{t("canvas.projectBusy")}</div>}
    {!editor.persistence.editable && <div className={styles.loading}><p>{saveText}</p>{editor.persistence.status === "loadError" && <CanvasChip onClick={() => { void editor.persistence.load(); }}>{t("canvas.retry")}</CanvasChip>}</div>}
    {popup && <CanvasOverlay label={t(popup === "composition" ? "canvas.composition" : popup === "settings" ? "canvas.canvasSettings" : "canvas.title")} onClose={closePopup} returnFocus={popupTrigger}>
      {popup === "card" && <div className={styles.dialog}><CanvasCardSize card={editor.nodes.find(node => node.selected)?.data.card} onApply={resizeCards} onClose={closePopup} /></div>}
      {popup === "open" && <div className={styles.dialog}><h2>{t("canvas.openProject")}</h2><p>{t("canvas.openConfirm")}</p><footer><CanvasChip onClick={closePopup}>{t("canvas.cancel")}</CanvasChip><CanvasChip onClick={() => { closePopup(); project.open(); }}>{t("canvas.openProject")}</CanvasChip></footer></div>}
      {popup === "settings" && <CanvasSettings value={preferences} onChange={setPreferences} onClose={closePopup} />}
      {popup === "composition" && <CompositionEditor onClose={closePopup} />}
      {popup === "help" && <div className={styles.dialog}><h2>{t("canvas.help")}</h2><p>{t("canvas.helpText")}</p><p>{t("canvas.unavailable")}</p><CanvasChip onClick={closePopup}>{t("canvas.close")}</CanvasChip></div>}
      {popup === "rename" && <form className={styles.dialog} onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); editor.rename(String(form.get("name") ?? "").trim()); closePopup(); }}><h2>{t("canvas.rename")}</h2><input autoFocus name="name" aria-label={t("canvas.rename")} defaultValue={editor.name} maxLength={80} /><footer><CanvasChip onClick={closePopup}>{t("canvas.cancel")}</CanvasChip><button type="submit" className="hy-chip">{t("canvas.apply")}</button></footer></form>}
      {popup === "reload" && <div className={styles.dialog}><h2>{t("canvas.reload")}</h2><p>{t("canvas.reloadConfirm")}</p><footer><CanvasChip onClick={closePopup}>{t("canvas.cancel")}</CanvasChip><CanvasChip onClick={() => { closePopup(); void editor.persistence.load(); }}>{t("canvas.reload")}</CanvasChip></footer></div>}
    </CanvasOverlay>}
  </section>;
}
