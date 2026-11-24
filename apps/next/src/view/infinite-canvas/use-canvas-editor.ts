"use client";

// 每次挂载创建独立会话；跨路由、创建表单和生成队列都不共享这份草稿。
// 作品交给reducer，镜头和命中检测交给React Flow，各自只维护一个事实来源。
// 参数与鼠标命令都进同一命令入口，避免复制出键盘专用的删除或撤销逻辑。
import { useEffect, useReducer, useRef, type Dispatch, type KeyboardEvent } from "react";
import { useStoreApi, type Connection, type NodeChange, type EdgeChange, type XYPosition } from "@xyflow/react";
import { t } from "@/i18n";
import { useToastStore } from "@/stores/useToastStore";
import { useCanvasPersistence } from "./use-canvas-persistence";
import { canvasReducer, INITIAL_CANVAS_STATE, type CanvasAction } from "./canvas-reducer";
import { NODE_LABELS, type CanvasData, type CanvasNode, type CanvasAddKind, type CanvasDocument } from "./canvas-model";

// 按键只在当前画布根元素生效，输入框的Delete不能冒泡成删除节点。
// 菜单通过Portal挂在外面，它的Escape和方向键继续由公共菜单处理。
// Ctrl与Command使用同一命令，不因操作系统不同产生第二套编辑业务。
function handleKey(event: KeyboardEvent<HTMLElement>, dispatch: Dispatch<CanvasAction>, cancel: () => void) {
  // 小浮层先消费自己的 Escape 和方向键；捕获阶段不能抢先取消整个画布手势。
  // 普通胶囊没有这个标记，关闭浮层后仍恢复画布快捷键，不永久屏蔽当前节点。
  // 媒体原生控件拥有自己的方向键与空格，不能被画布快捷键吞掉或误删节点。
  // 与表单一样只隔离控件内事件，回到画布后仍可删除选中素材。
  // capture 阶段先检查目标，不能等媒体组件 bubble 停传播后再决定是否删除。
  // 视频时间条的方向键属于原生媒体，不应变成移动节点或切换画布模式。
  // 更换和重试按钮同样隔离，按 Delete 操作按钮不会误删当前选中卡。
  // 隔离仅限这些后代，画布根的 Delete、复制与撤销继续保持原有行为。
  // 配置页及翻译历史通过 Portal 冒泡到画布，关闭按钮也必须保留自己的按键。
  // 检查实际 dialog 祖先，而非只排除输入框；在按钮上按 Delete 同样不能删节点。
  // 离开浮层后画布快捷键恢复，不另建全局“当前弹窗”状态。
  if (event.target instanceof HTMLElement && event.target.closest("input,textarea,select,video,audio,[data-canvas-media-control],[contenteditable=true],[role=menu],[role=listbox],[role=dialog],[data-canvas-popover]")) return;
// 快捷键分派必须先经过上方输入控件隔离。
// 否则在提示词里剪切一段文字会误删整张卡片。
// 媒体进度条也拥有 Ctrl 或方向键语义，不应被图操作截走。
// 菜单 Portal 的焦点由公共菜单管理，不在页面捕获阶段抢走。
// Command 与 Control 归一为 command，保持平台常用操作一致。
// c、x、v 先转小写，按键大小写不改变命令含义。
// 操作码只来自固定映射，不将任意键当作 reducer 动作。
// 匹配后 preventDefault，阻止浏览器再执行一次系统文本粘贴。
// 随后立即 return，不能又落到其他历史或删除分支。
// UUID 在用户事件边界生成，reducer 保持可重复求值。
// 复制没有本地文件读取权限请求，只处理已存在于图中的数据。
// 没有底稿时 Ctrl+V 仍由 reducer 安全忽略。
// 剪贴板命令不触发浏览器上传，也不把媒体路径写到系统文本板。
// Ctrl+D 沿用原立即复制，不改老用户现有习惯。
// Ctrl+Z 仍撤销作品，不能用它恢复系统剪贴板文本。
  const command = event.ctrlKey || event.metaKey;
  const operation = ({ c: "copy", x: "cut", v: "paste" } as const)[event.key.toLowerCase() as "c" | "x" | "v"];
  // 图剪贴板只在画布命中，普通文本选择不进入 reducer。
  if (command && operation) { event.preventDefault(); dispatch({ type: "clipboard", operation, id: crypto.randomUUID() }); return; }
  if (event.key === "Escape") { event.stopPropagation(); cancel(); dispatch({ type: "cancel" }); }
  else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); dispatch({ type: "remove" }); }
  else if (command && event.key.toLowerCase() === "d") { event.preventDefault(); dispatch({ type: "duplicate", id: crypto.randomUUID() }); }
  else if (command && event.key.toLowerCase() === "z") { event.preventDefault(); dispatch({ type: "history", redo: event.shiftKey }); }
  else if (command && event.key.toLowerCase() === "y") { event.preventDefault(); dispatch({ type: "history", redo: true }); }
}

// hook只做React和命令模型的接线，不在事件中复制整个工程处理流程。
// add增加可选源ID，但普通底栏与右键的两参数调用保持原含义。
// 传源ID的调用将创建和连接一起dispatch，不先后发送两条可被打断的命令。
// 新节点ID仍由原事件入口创建，渲染和纯reducer都不运行随机生成。
// 撤销、重做与自动保存继续读取同一个state，不额外建立连接菜单历史。
// 此入口不持有媒体字节，参考解析按已有图边寻找源文件。
// 菜单关闭与取消只修改操作意图，不能在这里自动删除用户已有连线。
// cancelConnection使用库自己的取消入口，删除临时橡皮筋而非伪造一条边。
// 点击连线的起点也一起清空，Escape后下次点击不会接续上一次未完成的边。
// 保存由独立适配器调用统一分段存储，本 hook 不直接读写文件或整份用户文档。
function usePortConnections(dispatch: Dispatch<CanvasAction>) {
  const pendingPort = useRef<{ id: string; type: "source" } | null>(null);
  const store = useStoreApi<CanvasNode>();
  const cancel = () => {
    pendingPort.current = null;
    store.getState().cancelConnection();
    store.setState({ connectionClickStartHandle: null });
  };
  const connectPort = (id: string, type: "source" | "target") => {
    if (type === "source") {
      pendingPort.current = { id, type };
      useToastStore.getState().show(t("canvas.connectHint"));
      return;
    }
    const source = pendingPort.current;
    pendingPort.current = null;
    if (source) dispatch({ type: "connect", connection: { source: source.id, sourceHandle: "out", target: id, targetHandle: "in" }, id: crypto.randomUUID() });
  };
  // 点击连线只保存临时起点；拖动连线仍由 React Flow 跟踪屏幕命中。
  // 两种输入最后都交给同一 reducer 检查类型和循环，不维护第二份连接规则。
  const connect = (connection: Connection) => {
    dispatch({ type: "connect", connection, id: crypto.randomUUID() });
    cancel();
  };
  return { cancelConnection: cancel, connectPort, connect };
}

// 命令绑定只注入事件参数和稳定 ID，不持有节点副本，也不另建历史栈。
// 节点工具条、快捷键和右键菜单拿到的是同一组动作，失败语义由 reducer 决定。
function bindCanvasCommands(dispatch: Dispatch<CanvasAction>) {
  return {
// 菜单与节点工具条的复制从同一命令绑定入口进入。
// operation 参数只允许 copy、cut、paste 三种明确意图。
// 每次事件新的 UUID 为粘贴准备稳定身份，copy 本身不会插入节点。
// setWorkspace 接收主进程返回的归属，不根据标题自行构造。
// workspace 进入作品历史，撤销导入后仍能追溯目录身份。
// openDocument 使用已有 restore 命令，不绕过数据规范化。
// 恢复清掉旧撤销栈，避免撤销把上一份工程混回新图。
// 这组绑定只 dispatch，不直接访问 window.electronAPI。
// 磁盘操作归独立 Hook，编辑事务继续是纯逻辑。
// 因此菜单、快捷键、按钮不会各写一套剪切或工程恢复方法。
    clipboardAction: (operation: "copy" | "cut" | "paste") => dispatch({ type: "clipboard", operation, id: crypto.randomUUID() }),
    setWorkspace: (workspace: NonNullable<CanvasDocument["workspace"]>) => dispatch({ type: "workspace", workspace }),
    openDocument: (document: import("@/types/infinite-canvas").UserDataInfiniteCanvas) => dispatch({ type: "restore", document }),
    // 可选sourceId只用于图片输出拖线的新建意图，普通添加仍不建立任何隐式边。
    // ID与时间在事件入口生成，reducer保持可重复求值，不在历史回放时随机换身份。
    // 新建节点和入边共用同一add命令，键盘撤销无需维护第二套连接历史。
    add: (kind: CanvasAddKind, position: XYPosition, sourceId?: string) => dispatch({ type: "add", kind, position, title: t(kind === "compare" ? "canvas.compareImage" : kind === "upscale" ? "canvas.upscale" : NODE_LABELS[kind]), id: crypto.randomUUID(), createdAt: Date.now(), sourceId }),
    duplicate: () => dispatch({ type: "duplicate", id: crypto.randomUUID() }),
    applyDocument: (document: CanvasDocument) => dispatch({ type: "applyDocument", document }),
    // 与文件改名服务共享稳定结果形状，不在卡片内逐个发出多笔更新。
    // 一次分派修正全部引用，避免半数节点还指向旧文件。
    // 此动作不创造新的磁盘撤销协议，原位置和参数历史仍按原规则回放。
    relinkMedia: (result: import("@/utils/generatedImages").RenameGeneratedImageResult) => dispatch({ type: "relinkMedia", result }),
    updateNodeData: (id: string, patch: Partial<CanvasData>) => dispatch({ type: "updateData", id, patch }),
    remove: () => dispatch({ type: "remove" }),
    changeNodes: (changes: NodeChange<CanvasNode>[]) => dispatch({ type: "nodes", changes }),
    changeEdges: (changes: EdgeChange[]) => dispatch({ type: "edges", changes }),
    startDrag: () => dispatch({ type: "dragStart" }),
    stopDrag: () => dispatch({ type: "dragStop" }),
    history: (redo: boolean) => dispatch({ type: "history", redo }),
    setFixedSize: (value: boolean) => dispatch({ type: "fixedSize", value }),
    lockSize: (value: boolean) => dispatch({ type: "lockSize", value }),
    resizeCards: (card: NonNullable<CanvasData["card"]>) => dispatch({ type: "resizeCards", card }),
    rename: (name: string) => dispatch({ type: "rename", name }),
    // 导入与重复节点是不同意图；前者保留真实来源，后者继续沿用已有复制规则。
    // 新节点已由统一导入边界校验类型和路径，绑定层不再自己读 File。
    // 同一方法服务按钮和 drop，避免键盘替代或多个入口维护不同历史策略。
    // dispatch 只传普通节点数据，闭包不会跟着作品保存到磁盘。
    // 编辑完成以后 canUndo 自动从 past 更新，不额外维护一个导入历史栈。
    importMedia: (nodes: CanvasNode[]) => dispatch({ type: "importMedia", nodes }),
  };
}

// 取消清理拥有单独的窗口事件生命周期，不混入作品数据转换或端口连接逻辑。
function useCancelledDrag(cancelled: boolean, dispatch: Dispatch<CanvasAction>) {
  // 取消后图引擎可能因节点恢复而不再发 dragStop；窗口松手负责收掉迟到事件屏障。
  // mouseup 兼容图引擎的鼠标拖动，pointerup 覆盖指针，blur 处理拖到窗口外才松手。
  // 这只完成取消清理，不提交位置或第二份历史；实例卸载和取消结束都会释放订阅。
  useEffect(() => {
    if (!cancelled) return;
    // 图引擎在同一次 mouseup 里还会回送末尾坐标，等这一轮事件结束才撤屏障。
    // 这里的零延时只排事件顺序，不伪造业务进度；卸载必须清掉尚未执行的回调。
    let timer: ReturnType<typeof setTimeout> | undefined;
    const release = () => { clearTimeout(timer); timer = setTimeout(() => dispatch({ type: "releaseCancel" }), 0); };
    window.addEventListener("mouseup", release);
    window.addEventListener("pointerup", release);
    window.addEventListener("blur", release);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mouseup", release);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("blur", release);
    };
  }, [cancelled, dispatch]);
}

// 会话只组合作品、持久化和连接手势；动作 Context 传回调，不存全局业务状态。
// 每个 ReactFlowProvider 的 reducer、临时端口和撤销栈都随实例单独创建。
// 会话初始化时 clipboard=null，初次菜单自然没有粘贴。
// 复制后 reducer 变化驱动菜单条件重新计算，不手动改菜单 DOM。
// 选择、历史和归属同在一个 editor，工程导入不会另开第二个 store。
// 页面侧 project 与 import Hook 只组合这份会话，不复制节点数据源。
// 多个 ReactFlowProvider 各自初始化 reducer，图对象不会跨实例共享。
// 持久化仍对应同一个用户草稿段，不承诺同时编辑两份草稿的合并策略。
// 动作 Context 只传方法，不把 clipboard 放成全局 Context 状态。
// 菜单、工具条与快捷键拿到同一个最新绑定。
// 因此修复 remove 或剪贴板规则能同步作用于所有本轮入口。
// 恢复工程后 canUndo 从空 past 重算，不保留旧工程的可撤销提示。
// 媒体预览状态没有装入 editor，所以播放不会导致保存签名变化。
// 卡片尺寸在 data 中，因此改大小确实会让作品变成未保存。
// 导出工程直接读同一 editor 的 serializeCanvas，没有另一份影子工程。
// 相同媒体多个节点仍各有自己的 id 与参数，文件路径只说明来源。
export function useCanvasEditor(projectId?: string) {
  const [state, dispatch] = useReducer(canvasReducer, INITIAL_CANVAS_STATE);
  const persistence = useCanvasPersistence(state, dispatch, projectId);
  const connections = usePortConnections(dispatch);
  useCancelledDrag(state.cancelled, dispatch);
  const { feedback } = state;
  const announced = useRef<typeof feedback>(null);
  // 命令先提交再弹提示。每次结果像一张新回执，拖动和重渲染不会重复播报原回执。
  useEffect(() => {
    if (!feedback || announced.current === feedback) return;
    announced.current = feedback;
    useToastStore.getState().show(feedback.message, feedback.variant);
  }, [feedback]);
  return {
    ...state,
    ...bindCanvasCommands(dispatch),
    ...connections,
    notify: useToastStore.getState().show,
    keyDown: (event: KeyboardEvent<HTMLElement>) => { if (persistence.editable) handleKey(event, dispatch, connections.cancelConnection); },
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    persistence,
  };
}
