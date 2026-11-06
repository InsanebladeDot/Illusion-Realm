// 当前页面的编辑事务：每条命令要么完成一整笔修改，要么保持原作品。
// 历史像修改白板前拍照；只存作品，不把菜单、镜头、输入焦点一起倒回去。
// 无网络、无磁盘、无定时器，未来接入保存时也应单独定义持久化边界。
import { addEdge, applyEdgeChanges, applyNodeChanges, type Connection, type NodeChange, type EdgeChange, type XYPosition } from "@xyflow/react";
import type { UserDataInfiniteCanvas } from "@/types/infinite-canvas";
import { t } from "@/i18n";
import { copyCanvasSelection, pasteCanvasClipboard, type CanvasClipboard } from "./canvas-clipboard";
import { connectionError, CONNECTION_ERRORS, duplicateNodes, restoreCanvas, snapshot, type CanvasData, type CanvasDocument, type CanvasNode, type NodeKind } from "./canvas-model";

// 作品和手势同时放在会话里，但drag是旧快照，不属于可保存的工程字段。
// cancelled专门屏蔽Escape之后、鼠标松开之前迟到的位置事件。
export interface CanvasState extends CanvasDocument {
  past: CanvasDocument[];
  future: CanvasDocument[];
  drag: CanvasDocument | null;
  cancelled: boolean;
  message: string;
// clipboard 保存的是当前会话私有底稿。
// 它不属于 CanvasDocument，不能被 serializeCanvas 写盘。
// past 和 future 只搬运作品，不搬运用户最近复制内容。
// pasteCount 同样是会话状态，不用它判断工程是否未保存。
// 单例 INITIAL 只提供空初值，不含可被多实例共享修改的底稿。
// 后续命令总创建新对象，不向 INITIAL 的数组就地 push。
// 恢复工程会清历史，但允许当前会话底稿继续用于跨工程粘贴。
// 跨工程粘贴仍引用原受管媒体；便携导出会收集这些真实引用。
// 这样可以在两份先后打开的工程间搬运节点，不需要系统剪贴板权限。
// 重新挂载整个页面后底稿才自然释放。
  clipboard: CanvasClipboard | null;
  pasteCount: number;
}
export const INITIAL_CANVAS_STATE: CanvasState = { name: "", nodes: [], edges: [], past: [], future: [], drag: null, cancelled: false, message: "", clipboard: null, pasteCount: 0 };

// ID在用户事件入口生成，reducer对同一命令重复求值不会随机变出另一套节点。
// 节点数据没有动作函数，复制、历史快照都不携带旧闭包或服务凭据。
export type CanvasAction =
  | { type: "add"; kind: NodeKind; position: XYPosition; title: string; id: string; createdAt: number }
  | { type: "nodes"; changes: NodeChange<CanvasNode>[] }
  | { type: "updateData"; id: string; patch: Partial<CanvasData> }
  | { type: "edges"; changes: EdgeChange[] }
  | { type: "connect"; connection: Connection; id: string }
  | { type: "history"; redo: boolean }
  | { type: "duplicate"; id: string }
  | { type: "message"; message: string }
  | { type: "restore"; document: UserDataInfiniteCanvas }
  | { type: "rename"; name: string }
  | { type: "clipboard"; operation: "copy" | "cut" | "paste"; id: string }
  | { type: "workspace"; workspace: NonNullable<UserDataInfiniteCanvas["workspace"]> }
  // 一次多选导入是一笔历史；逐个撤销不会只撤掉同批素材的一半。
  // id 和本地路径都由调用边界准备，这里只接收已校验的节点引用。
  | { type: "importMedia"; nodes: CanvasNode[] }
  | { type: "remove" | "dragStart" | "dragStop" | "cancel" | "releaseCancel" };

// 五十笔上限只限制本地撤销内存，不限制画布世界坐标或节点数量。
// 新编辑清空重做栈，旧分支不能在用户已经继续创作后覆盖新作品。
// change可只更新节点或边，其余字段保留，选择高亮不另记一笔历史。
function commit(state: CanvasState, change: Partial<CanvasDocument>, before = snapshot(state)): CanvasState {
  return { ...state, ...change, past: [...state.past.slice(-49), before], future: [] };
}

// 节点尺寸和选择高亮不是作品修改，不能挤掉真正的编辑历史。
// 参数和名称通过 updateData 回传，因此它们仍进入相同撤销路径。
// 鼠标拖动移动很多次，历史等松手时统一登记；键盘移动每次独立提交。
function changeNodes(state: CanvasState, changes: NodeChange<CanvasNode>[]): CanvasState {
  // React Flow 的 replace 只代表它自己的临时缓存，不能覆盖编辑器已确认的字段。
  // 卡片参数走 updateData，位置、选择和尺寸等图引擎变化才从这里进入。
  const accepted = changes.filter(change => change.type !== "replace");
  const active = state.cancelled ? accepted.filter(change => change.type !== "position") : accepted;
  // 像只搬动桌上的一张卡：没搬的卡继续用原对象，不必把整桌重新复印。
  // applyNodeChanges 已保留未变节点的引用，也保留移动节点的 data。
  // replace 在上面被拒绝，因此不需要逐项 find 再克隆来防止旧参数覆盖。
  // 去掉这层全表查找，单次位置更新不再增加一次平方级遍历。
  // 位置、选中和测量仍由原库更新，不自建另一套节点坐标模型。
  // 不变节点的引用稳定后，图库与节点 memo 才能真正跳过无关内容。
  const nodes = applyNodeChanges(active, state.nodes);
  const edited = active.some(change => change.type === "add" || change.type === "position" && !state.drag);
  return edited ? commit(state, { nodes }) : { ...state, nodes };
}

// 参数编辑和拖动都走同一份历史快照；组件不能只改 React Flow 内存而漏掉保存。
// 这像在原卡片上改字，再把修改单交回总账，不会让每张卡片各自保存一份账本。
function updateNodeData(state: CanvasState, id: string, patch: Partial<CanvasData>): CanvasState {
  const index = state.nodes.findIndex(node => node.id === id);
  if (index < 0) return state;
  const current = state.nodes[index];
  if (Object.entries(patch).every(([key, value]) => current.data[key] === value)) return state;
  const nodes = state.nodes.slice();
  nodes[index] = { ...current, data: { ...current.data, ...patch } };
  return commit(state, { nodes });
}

// 复制只复制选中的节点；引用边不自动跟过去，避免暗中改变生成图关系。
// 通过原ID加事件入口生成的唯一后缀，相同命令重复计算仍有相同输出。
// 位置偏移是世界单位，放大后不会改成另一个实际偏移量。
// 参数重新建对象，同源副本后续改提示词不会影响原件。
function duplicate(state: CanvasState, id: string): CanvasState {
  const selected = state.nodes.filter(node => node.selected);
  if (!selected.length) return state;
  return commit(state, { nodes: duplicateNodes(state.nodes, id) });
}

// 剪切先取得完整快照再删除，失败或没有选中节点时不清掉已有剪贴板。
// 撤销只恢复工程，不撤回用户复制的底稿；它是临时会话能力，不参与保存。
// clipboardCommand 与 duplicate 是不同意图。
// duplicate 保留现有立即复制快捷键，copy/paste 新增会话底稿流程。
// 拖动事务未结束时不操作剪贴板，避免把半途位置当作确认作品。
// copy 的结果不进入 commit，因此不会清空重做栈。
// 复制失败只返回原 state，不把旧底稿置空。
// cut 必须先取得有效节点底稿，只有边选择时不能误删除边。
// 有效 cut 调用原 remove，节点与关联边一起记历史。
// 底稿只保留选择集内部边，跨出选择集的边不在粘贴时复活。
// 剪切关联的外部边仍可通过撤销恢复，因为 remove 保存完整旧图。
// paste 检查底稿存在，空剪贴板快捷键保持无修改。
// pasteCount 只描述当前底稿使用次数，不写入文档。
// 重新复制或剪切会把偏移计数归零。
// 每次粘贴先增加计数，再乘统一世界偏移。
// 新增节点与边一次并入 commit，不逐项制造半份粘贴历史。
// 旧节点与旧边只清选择，不改它们的内容或身份。
// 新底稿的深拷贝确保后续尺寸修改只影响这次副本。
// 撤销粘贴移除本次整个子图，不能留下一半悬空边。
// 重做恢复刚才产生的身份，不重新随机生成第二套 id。
// clipboard 本身不在快照中，撤销后仍可再次粘贴同一底稿。
// 因此剪切后撤销并不抹掉用户的复制意图。
// 这里没有磁盘剪切，媒体资产不因节点移除被删除。
// 作品与播放器分开，新卡挂载时从真实源重新解码。
// 新副本不会继承旧播放器 currentTime 或错误状态。
// 这个函数不显示成功弹窗，节点出现就是实际编辑证据。
function clipboardCommand(state: CanvasState, action: Extract<CanvasAction, { type: "clipboard" }>): CanvasState {
  if (state.drag) return state;
  if (action.operation !== "paste") {
    const clipboard = copyCanvasSelection(state);
    if (!clipboard) return state;
    return { ...(action.operation === "cut" ? remove(state) : state), clipboard, pasteCount: 0 };
  }
// 这里保留空粘贴的精确无操作语义。
// 不会增加历史，不清旧选择，也不改变 message。
// 菜单隐藏粘贴是展示保护，reducer 检查是业务保护。
// 两个保护缺一不可，快捷键可以在没有菜单时直接触发。
// 第一次粘贴偏移三十六，第二次偏移七十二，第三次一百零八。
// 偏移序列只属于同一份底稿，重新复制重新开始。
// 撤销不会把 pasteCount 倒退，避免后续粘贴盖在旧恢复位置上。
// 这不改变作品原坐标，只有本次新节点获得偏移。
// 边没有独立世界位置，仅端点身份发生映射。
// commit 前清旧选择，避免下一次 Delete 把原件和副本一起删掉。
// 深拷贝后的 selected=true 只属于这次副本。
// 粘贴节点尺寸若存在，也在 data.card 内原样保留。
// 素材地址同样保留，但实际媒体播放状态从新组件重新开始。
// 同源节点不会共享播放 currentTime，也不会因为深拷贝复制媒体正文。
// 剪贴板数据不包含系统权限凭据，粘贴不会取得额外文件能力。
// 对既有受管文件的读取仍由 localfile 协议完成。
// 工程导出可以收集粘贴来的媒体，即使它来自另一份之前打开的工程。
// 当前没有自动把跨工程粘贴文件再次搬到新归属目录。
// 便携打包仍能带上它；这个边界应在存储说明中明确。
// 不能因此声称每种粘贴都已经执行磁盘剪切或复制。
  if (!state.clipboard) return state;
  const pasteCount = state.pasteCount + 1;
  const pasted = pasteCanvasClipboard(state.clipboard, action.id, pasteCount * 36);
  return { ...commit(state, { nodes: [...state.nodes.map(node => ({ ...node, selected: false })), ...pasted.nodes], edges: [...state.edges.map(edge => ({ ...edge, selected: false })), ...pasted.edges] }), pasteCount };
}

// 删除端点和关联边是一笔事务，撤销必须一起还原，不能留下悬空连线。
// 只选中连线时也能删除，不强迫用户先删除素材节点才能断开引用。
// 不修改源文件、生成记录或创建页表单；这些东西不归画布命令所有。
function remove(state: CanvasState): CanvasState {
  const ids = new Set(state.nodes.filter(node => node.selected).map(node => node.id));
  if (!ids.size && !state.edges.some(edge => edge.selected)) return state;
  return commit(state, {
    nodes: state.nodes.filter(node => !ids.has(node.id)),
    edges: state.edges.filter(edge => !edge.selected && !ids.has(edge.source) && !ids.has(edge.target)),
  });
}

// 错误只更新就近反馈，不清空或重建原图；合法连接才产生历史记录。
// 建立关系不等于服务执行，成功文案明确写“本地引用”。
function connect(state: CanvasState, action: Extract<CanvasAction, { type: "connect" }>): CanvasState {
  const error = connectionError(action.connection, state);
  if (error) return { ...state, message: t(CONNECTION_ERRORS[error]) };
  const next = commit(state, { edges: addEdge({ ...action.connection, id: action.id }, state.edges) });
  return { ...next, message: t("canvas.connected") };
}

// 拖动时禁用撤销，避免两条命令同时争夺当前纸张的位置。
// 撤销与重做相互搬运当前作品；视口、菜单和其他页面状态仍保持原样。
function history(state: CanvasState, redo: boolean): CanvasState {
  const stack = redo ? state.future : state.past;
  const document = stack.at(-1);
  if (!document || state.drag) return state;
  const current = snapshot(state);
  const past = redo ? [...state.past.slice(-49), current] : state.past.slice(0, -1);
  const future = redo ? state.future.slice(0, -1) : [...state.future.slice(-49), current];
  return { ...state, ...document, past, future, message: "" };
}

// 一次拖动松手才拍入历史；取消后恢复同一份旧坐标，不提交迟到的末尾帧。
// 没移动的轻点不会消耗撤销槽位，画布的选择和编辑因此保持不同语义。
function stopDrag(state: CanvasState): CanvasState {
  // Escape 已经释放旧快照时，松手不再登记一次历史，也不提前移除迟到事件屏障。
  // 取消不能留下永久“正在拖动”的状态，否则保存入口会一直被静默挡住。
  if (!state.drag) return state;
  // 松手也用身份索引核对，避免拖最后一张卡时逐个 find 形成一次长卡顿。
  // 索引只属于本次收尾，旧快照没有被改写，撤销仍能恢复整笔移动。
  // 对照世界坐标而非 DOM 像素，缩放不会误判成作品移动。
  const original = new Map(state.drag.nodes.map(node => [node.id, node.position]));
  const changed = state.nodes.some(node => {
    const old = original.get(node.id);
    return old && (old.x !== node.position.x || old.y !== node.position.y);
  });
  const next = state.cancelled ? { ...state, ...state.drag } : changed ? commit(state, {}, state.drag) : state;
  return { ...next, drag: null, cancelled: false };
}

// 取消立即恢复坐标并结束作品事务，不依赖库在节点恢复后一定再发 dragStop。
// 像把纸张放回原位并撤掉搬运单；鼠标尚未松开时，仍要拦住迟到的搬运动作。
// 当前选择保留，避免 Escape 将正在编辑的卡片一起取消选中并卸载其面板。
function cancelDrag(state: CanvasState): CanvasState {
  if (!state.drag) return { ...state, message: "" };
  const nodes = state.drag.nodes.map(node => ({ ...node, selected: state.nodes.find(current => current.id === node.id)?.selected }));
  return { ...state, ...state.drag, nodes, drag: null, cancelled: true, message: "" };
}

// 添加时只清除旧高亮，原节点参数与连线保持不变。
// 视频默认横向，其他类型默认方形；音频卡的紧凑形状由展示层负责。
function add(state: CanvasState, action: Extract<CanvasAction, { type: "add" }>): CanvasState {
  const { id, kind, position, title } = action;
  const node: CanvasNode = { id, type: "canvas", position, selected: true, data: { kind, title, prompt: "", content: "", ratio: kind === "video" ? "16/9" : "1/1", createdAt: action.createdAt } };
  return { ...commit(state, { nodes: [...state.nodes.map(item => ({ ...item, selected: false })), node] }), message: "" };
}

// 按命令分派，不按UI按钮来源判断。同一业务只有一条修改作品的路径。
// Escape恢复画布位置时会让界面重新测量参数高度，不回写屏幕坐标。
export function canvasReducer(state: CanvasState, action: CanvasAction): CanvasState {
  switch (action.type) {
    case "nodes": return changeNodes(state, action.changes);
    case "updateData": return updateNodeData(state, action.id, action.patch);
    case "edges": return { ...state, edges: applyEdgeChanges(action.changes, state.edges) };
    case "add": return add(state, action);
    case "duplicate": return duplicate(state, action.id);
    case "clipboard": return clipboardCommand(state, action);
    case "workspace": return commit(state, { workspace: action.workspace });
    case "remove": return remove(state);
    case "connect": return connect(state, action);
    case "history": return history(state, action.redo);
    case "message": return { ...state, message: action.message };
    case "restore": return { ...state, ...restoreCanvas(action.document), past: [], future: [], drag: null, cancelled: false, message: "" };
    case "rename": return action.name === state.name ? state : commit(state, { name: action.name.slice(0, 80) });
    // 只替换选择，不清空已有作品；文件加载失败也不影响别的节点或连接。
    // 导入节点与手工创建节点使用同一历史栈，撤销不删除磁盘上的原文件。
    // incoming 数组在导入边界一次准备好，reducer 内不读取 File、路径桥接或系统对话框。
    // 原节点只清掉高亮，不克隆其来源文件，也不重置它们已经保存的参数。
    // 新节点有自己的随机 ID，因此相同来源多次入图不会互相覆盖身份。
    // 连接数组原样保留，导入本地素材不能使先前手工连线丢失。
    // 空批次返回原 state，全部拒绝或用户取消都不应制造一笔空撤销记录。
    // commit 会清掉旧重做分支，符合用户已经继续编辑后的历史规则。
    // 预览解码失败不从这里删除节点，错误状态不是作品结构修改。
    // 后续删除和复制继续使用原来的方法，不为本地媒体分出第二套命令。
    case "importMedia": return action.nodes.length ? commit(state, { nodes: [...state.nodes.map(node => ({ ...node, selected: false })), ...action.nodes] }) : state;
    case "dragStart": return { ...state, drag: snapshot(state), cancelled: false };
    case "dragStop": return stopDrag(state);
    case "cancel": return cancelDrag(state);
    case "releaseCancel": return { ...state, cancelled: false };
  }
}
