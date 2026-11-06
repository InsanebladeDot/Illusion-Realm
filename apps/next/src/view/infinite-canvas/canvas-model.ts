// 无限画布的本地文档模型：只描述节点、参数和连接，不承担生成或文件读写。
// 世界坐标像桌上纸张的位置；缩放只移动观察桌面的镜头，不修改纸张本身。
// React Flow 负责镜头和命中检测，本模块只补充幻域自己的连接约束。
import type { Connection, Edge, Node } from "@xyflow/react";
import type { UserDataInfiniteCanvas } from "@/types/infinite-canvas";
import { FileText, Image, Music2, StickyNote, Video, Film } from "lucide-react";

// 类型名称属于幻域自有协议，不声称兼容参考软件的工程文件。
// 便签只用于组织想法，不作为媒体输入，因此没有连接端口。
export const NODE_KINDS = ["text", "image", "video", "audio", "composition", "note"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];
export const NODE_ICONS = { text: FileText, image: Image, video: Video, audio: Music2, note: StickyNote, composition: Film };
// 显式键表也供静态文案门禁识别，不能靠动态拼接把未翻译词条藏起来。
export const NODE_LABELS = { text: "canvas.text", image: "canvas.image", video: "canvas.video", audio: "canvas.audio", note: "canvas.note", composition: "canvas.composition" } as const;
export const CONNECTION_ERRORS = { self: "canvas.self", duplicate: "canvas.duplicateEdge", type: "canvas.type", cycle: "canvas.cycle" } as const;

// 参数是可显式保存的本地草稿；未提交到生成服务，也不冒充服务返回结果。
// prompt 是生成意图，content 是用户手写文本，两者不冒充生成结果。
// ratio 记录未来生成画面的比例；当前卡片几何仍按组件样式库，不修改媒体文件。
// 名称与提示词分别限长，避免粘贴巨量文字让节点尺寸失控。
export interface CanvasData extends Record<string, unknown> {
  kind: NodeKind;
  title: string;
  prompt: string;
  content: string;
  ratio: string;
  mode?: string;
  createdAt?: number;
  card?: UserDataInfiniteCanvas["nodes"][number]["data"]["card"];
  // 来源引用是不可变小对象，副本可以共用它；更换文件必须替换整个引用。
  // 不往这里放播放位置、加载错误或 DOM，撤销和磁盘只保留作品内容。
  // 类型直接从 shared 推导，不能在渲染层维护另一份不同字段的媒体契约。
  // imported 文件不覆盖 prompt 或 content，这些字段仍表达生成意图与手写正文。
  // media 缺失代表空媒体卡，不等于一次导入失败；失败状态在实际预览会话中显示。
  // 更换来源要整体替换对象，保证复制片段和旧历史快照不会被原地修改影响。
  // 播放和失败都不会触碰此引用，因此一次试听不会消耗撤销记录。
  media?: NonNullable<UserDataInfiniteCanvas["nodes"][number]["data"]["media"]>;
}
export type CanvasNode = Node<CanvasData, "canvas">;
// CanvasDocument 描述可被保存与撤销的作品。
// workspace 是可选归属，不是画布标题的别名。
// 新纯文字画布可以没有 workspace。
// 首次导入成功才取得主进程分配的目录。
// 标题与目录分开，改名不会使每个 media.path 失效。
// 节点数组中保留世界位置，不保存屏幕坐标。
// 边数组只表达引用，不保存播放器状态。
// 剪贴板、鼠标手势和菜单开合在外层会话里。
// 卡片尺寸属于作品参数，需要跟着节点持久化。
// 已保存旧节点没有 card 时保持原默认布局。
// 媒体副本对象按不可变约定替换，不允许就地修改 path。
// 工程导出使用相同序列化字段，避免出现另一份节点模型。
export interface CanvasDocument { name: string; nodes: CanvasNode[]; edges: Edge[]; workspace?: UserDataInfiniteCanvas["workspace"] }

/** 只把稳定的作品字段写入用户文档，React Flow 的临时测量和选择态不跨页面保存。 */
// 序列化是用户草稿与工程交换共同的数据出口。
// workspace 按原归属写入草稿，工程打包器在副本中去掉本机归属。
// 这里不做资产扫描，保持普通保存不会完整读取大视频。
// card 放入显式字段白名单，临时 CSS 计算值不跨边界。
// undefined 可选字段交给 JSON 自然省略，兼容早期作品。
// 媒体引用仍保留本机路径形式，不保存协议 URL。
// 实际打包时另转换相对路径，不能改变正在编辑的对象。
// 边端口恢复统一 in/out，保持正式节点只有这一套端口契约。
// 不序列化 selection，打开工程后用户重新选择操作对象。
// 不序列化 measured，窗口与卡片尺寸变化后需要重新测量。
// 不把 source 的内存 DOM 或 browser File 混进节点数据。
// 序列化结果是纯数据，主进程无需 React 或 Next 运行时即可校验。
export function serializeCanvas(document: CanvasDocument): UserDataInfiniteCanvas {
  return {
    version: 1,
    name: document.name,
    workspace: document.workspace,
    // 固定字段顺序像给归档盒贴统一标签；同样内容不能因编辑先后而被误判为未保存。
    // schema 解析会按契约顺序重建对象，因此签名和写盘必须采用同一套字段次序。
    // media 按 schema 的字段次序归档，避免重新打开后同一引用被误判为未保存。
    // 不展开任意 data 属性：播放状态和浏览器错误永远不能混进用户文档。
    // 字段排在 createdAt 之后与 schema 一致，防止保存后重开出现对象顺序假脏。
    // 路径保留本地形式，buildLocalFileUrl 是临时展示转换，不能在这里持久化。
    // 旧节点没有 media 时 JSON 会省略 undefined，原草稿格式依然可以读回。
    // 不展开 File 或二进制，即使导入很大视频，用户 JSON 也只增加少量引用数据。
    // 作品复制只增加节点引用，不在序列化阶段复制或上传源文件。
    nodes: document.nodes.map(node => ({ id: node.id, position: { x: node.position.x, y: node.position.y }, data: { kind: node.data.kind, title: node.data.title, prompt: node.data.prompt, content: node.data.content, ratio: node.data.ratio as "1/1" | "16/9" | "9/16" | "4/3", mode: node.data.mode, createdAt: node.data.createdAt, card: node.data.card, media: node.data.media } })),
    edges: document.edges.map(edge => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: "out", targetHandle: "in" })),
  };
}

/** 重新打开时补回画布运行所需的 type，并把旧文档当成不选中的静态作品。 */
// 恢复边界先使用 shared schema 规范可选字段。
// name 缺失兼容早期文档，最后得到可显示的空标题。
// workspace 缺失保持 undefined，不能沿用上一份工程的目录。
// 这也是显式返回 workspace 的原因，不能只展开旧 state 保留残留归属。
// 每张节点补 type=canvas，让图引擎继续调用同一个适配组件。
// 已保存节点没有 selected，所以恢复明确以未选状态开始。
// 参数面板因此不会在打开工程时同时展开所有媒体节点。
// 媒体内容仍按各自 path 实际加载，而不是用包清单假造 ready。
// 旧文件缺失只影响对应卡片，不应使恢复丢弃其他文本节点。
// 边的视觉曲线重新计算，不恢复上次屏幕上的 path 像素。
// 卡片自定义尺寸属于 data，恢复时原样交回组件。
// 来源文件大小不被当作画面宽高，竖屏仍由浏览器自然尺寸显示。
// 恢复操作不会自动运行节点生成任务或上传素材。
// 用户想编辑参数需要明确选中目标，避免误修改隐含默认项。
// 文档可以有两个同名视频卡，恢复按各自 id 保持独立。
// 同一 media.path 也不会让它们合成一个节点。
// 播放与暂停状态不在文档里，恢复后不会自动发声。
// 主题与应用导航不属于画布文档，这里不切换全局设置。
// 旧文档新字段的默认兼容只发生在数据边界，不批量重写其他用户分段。
// 工程打开失败时不会调用本函数拿一个空对象继续。
// 因此恢复函数只处理已被接受的工程，不承担错误回落清场。
export function restoreCanvas(document: UserDataInfiniteCanvas): CanvasDocument {
  return {
    name: document.name,
    workspace: document.workspace,
    nodes: document.nodes.map(node => ({ ...node, type: "canvas", selected: false })),
    edges: document.edges.map(edge => ({ ...edge, selected: false })),
  };
}

// 撤销保存的是数据快照，不保存鼠标位置、菜单焦点或视口。
// 选择和拖动中的临时标志不属于作品，恢复后需要重新选择操作目标。
// 嵌套 card/media 以整体替换保持不可变；剪贴板跨副本另外执行深拷贝。
// measured 属于布局缓存，交还给画布重新测量，避免旧尺寸压住参数面板。
// 历史快照保存当前已确认的 card 与 media 引用。
// 嵌套对象由 updateNodeData 整体替换，因此旧快照不会被就地修改。
// 剪贴板另外深拷贝，是为了隔开跨副本的独立底稿。
// 这两个用途不同，不能把历史快照当作会话剪贴板直接复用。
// workspace 一起进入快照，撤销首次导入可恢复尚未分配目录的作品状态。
// 撤销不会实际删除目录，磁盘资产生命周期比一笔图事务更长。
// 重做引用仍有效，不要求重新复制原文件。
// 临时测量清除可避免恢复后卡片宽高沿用错误缓存。
// selected 和 dragging 清除避免撤销把鼠标手势带回半完成状态。
// 位置复制为新对象，之后的图引擎坐标更新不改旧快照。
// 边对象也复制，选择高亮变化不倒灌进历史。
// 标题与参数仍是作品部分，撤销尺寸或名称时可以恢复。
// 截图和播放器句柄不在快照，历史不会持有视频解码缓冲。
// 五十步限制来自 reducer，不在这里隐藏裁剪节点数组。
// 序列化与快照都显式包含归属，避免保存和撤销看到两份不同工程。
// 更换媒体后的旧地址可以留在历史里，因此当前不做立即资产回收。
export function snapshot(document: CanvasDocument): CanvasDocument {
  return {
    name: document.name,
    workspace: document.workspace,
    nodes: document.nodes.map(node => ({
      ...node, measured: undefined, selected: false, dragging: false,
      position: { ...node.position }, data: { ...node.data },
    })),
    edges: document.edges.map(edge => ({ ...edge, selected: false })),
  };
}

// 工具条、节点菜单和键盘复制同用此函数，副本参数不会引用原件的可变对象。
// 新 ID 由用户操作入口提供，撤销或重算不会随机改变节点身份。
export function duplicateNodes(nodes: CanvasNode[], id: string): CanvasNode[] {
  const copies = nodes.filter(node => node.selected).map(node => ({
    ...node, data: { ...node.data }, selected: true, id: `${node.id}-copy-${id}`,
    position: { x: node.position.x + 36, y: node.position.y + 36 },
  }));
  return [...nodes.map(node => ({ ...node, selected: false })), ...copies];
}

// 自连接、重复边、便签连线和不支持的输入都在同一个入口拒绝。
// 文本可给任意生成节点提供描述；图片可引用到图片和视频节点。
// 音频及视频当前仅允许同类型引用，避免暗示已接通跨媒体转换。
// 这里的“引用”只是有向关系，不传播结果、不上传内容、不触发任务。
export function connectionError(connection: Connection, document: Pick<CanvasDocument, "nodes" | "edges">) {
  const source = document.nodes.find(node => node.id === connection.source);
  const target = document.nodes.find(node => node.id === connection.target);
  if (!source || !target || source.id === target.id) return "self";
  if (document.edges.some(edge => edge.source === source.id && edge.target === target.id)) return "duplicate";
  const from = source.data.kind;
  const to = target.data.kind;
  if (from === "note" || to === "note" || from === "composition" || !(from === "text" || from === to || from === "image" && to === "video" || to === "composition")) return "type";
  return reaches(target.id, source.id, document.edges) ? "cycle" : null;
}

// 像沿单行道走一遍：若目标能走回起点，再修一条路就会绕成环。
// 使用显式待查列表，节点数量增加时也不依赖递归调用栈。
// visited 防止坏数据里的旧环让检查永远转圈，不只防止新建的环。
// 只读连接数组，检查失败不修改任何已有连接。
function reaches(start: string, end: string, edges: Edge[]) {
  const pending = [start];
  const visited = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === end) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(...edges.filter(edge => edge.source === id).map(edge => edge.target));
  }
  return false;
}
