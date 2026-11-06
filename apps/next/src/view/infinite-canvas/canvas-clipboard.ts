// 会话剪贴板像复印机的底稿：复制只拍快照，粘贴才产生新的作品身份。
// 不使用系统文本剪贴板，避免把媒体绝对路径覆盖用户正在复制的普通文字。
// 输入框仍使用原生 Ctrl+C/X/V；只有画布焦点才调用这些图命令。
import type { CanvasDocument, CanvasNode } from "./canvas-model";

// 会话剪贴板保存一份独立的图子集。
// 它不是 navigator.clipboard 中的文本。
// 因此用户复制普通提示词不会被图的路径 JSON 覆盖。
// 当前没有跨应用节点格式，也不读取系统剪贴板猜测节点。
// 剪贴板只属于当前 reducer 实例。
// 另一份同时挂载的画布不会自动获得这份底稿。
// 重新打开页面会清空底稿，粘贴入口也随之消失。
// 撤销栈不保存剪贴板，因此撤销剪切不会撤销复制意图。
// 媒体正文不进入底稿，深拷贝的只是轻量引用描述。
// 复用文件地址不表示复用播放器，粘贴卡片会挂载自己的媒体元素。
export type CanvasClipboard = Pick<CanvasDocument, "nodes" | "edges">;

// 只收录两个端点都在选择集内的边；外部引用不会随粘贴暗中连接到原图。
// 嵌套 card/media 同样深拷贝，粘贴后替换来源或调整宽高不影响底稿。
// 先选节点再决定关联边，不能只凭 edge.selected 把外部端点带进来。
// 只选一条线时没有节点底稿，复制命令不清除已有底稿。
// 选择两张相连卡片会连同它们之间的引用一起复制。
// 从已选卡片连向未选卡片的边被排除。
// 从未选卡片连入选择集的边也被排除。
// 这样粘贴得到封闭子图，不会暗中连回旧作品。
// structuredClone 保留嵌套 media 与 card 的值。
// 之后改原卡的宽高不会改变已经复制的底稿。
// 之后更换原卡媒体也不会把底稿换成另一份文件。
// 临时 DOM 不在节点 data 中，因此不需要跨页面克隆浏览器元素。
// 空选择返回 null，由 reducer 决定保留旧剪贴板。
// 复制只拍快照，不写 past，不把作品标记成未保存。
export function copyCanvasSelection(document: CanvasDocument): CanvasClipboard | null {
  const nodes = document.nodes.filter(node => node.selected);
  if (!nodes.length) return null;
// 复制示例：选 A 与 B，A→B 会进入底稿。
// 同图还存在 B→C，但 C 未选，所以这条边不会进入底稿。
// 粘贴生成 A′ 与 B′，内部边改成 A′→B′。
// 原图 A→B 与 B→C 都仍保持原身份和端点。
// 如果仅选 A，底稿只有 A，不带 A→B。
// 如果仅选边而不选节点，返回空底稿意图，不改旧剪贴板。
// 标题重复不会影响选择，因为选择集按 id 建立。
// 媒体同源也不会合并两张不同 id 的卡。
// 副本更换来源只替换自己的 media，小对象不反向修改底稿。
// 副本改 card 同理，不会让下一次粘贴突然采用刚改的新尺寸。
// 用户想复制修改后的尺寸，需要再明确执行一次复制。
// 这与普通复制粘贴的拍照语义一致，底稿不是实时订阅。
// 位置保留每张卡自己的 x/y，粘贴偏移对整组统一叠加。
// 因此框选形成的排布可以整体搬运，不自动重新排版。
// 连接的可见曲线由图引擎按新端点重算，旧路径像素不会入底稿。
// 选择高亮虽在临时对象里，粘贴时仍由新节点明确设定。
// 测量缓存清掉后，新卡按当前主题与宽高重新布局。
// 节点内部未确认输入草稿不会自动成为底稿中的已确认 content。
// 复制命令只能读取 editor 已提交数据，输入框文字仍走原生复制。
// 要让刚编辑的正文进入图复制，需要先完成原字段提交。
  const ids = new Set(nodes.map(node => node.id));
  return structuredClone({ nodes, edges: document.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)) });
}

// id 前缀由用户事件产生，再按序号生成短身份；不会无限拼接旧复制后缀。
// 每次粘贴向右下错开，所有节点采用同一位移，内部布局和连接保持一致。
// 同一底稿可以多次粘贴，每次事件都有新的随机前缀。
// 内部序号让每张新卡在本次粘贴中仍保持唯一。
// 短身份避免把原 id 的多层 copy 后缀无限累积。
// 先建立旧身份到新身份的映射，再重写全部边端点。
// 节点标题不参与映射，相同标题的两张卡也不会串线。
// 位置统一加 offset，底稿中的相对排布不变。
// offset 使用世界单位，不受当前镜头缩放干扰。
// 多次粘贴逐次错开，用户能看见新副本而不是完全覆盖原卡。
// 新节点全部选中，方便继续一起移动或删除。
// measured 清空后交给图引擎重新测量，不能复用旧屏幕几何。
// 参数深拷贝再次隔开本次副本与会话底稿。
// 边身份也更新，否则图引擎可能把新连接当作旧边覆盖。
// 边的选择清空，节点选择作为粘贴后主要操作目标。
// 非空映射来自 copy 的封闭子图，不需要猜测外部端点。
// 返回图子集，由 reducer 一次并入作品和历史。
// 函数不直接通知 UI，也不在循环里逐节点派发命令。
export function pasteCanvasClipboard(clipboard: CanvasClipboard, id: string, offset: number): CanvasClipboard {
  const ids = new Map(clipboard.nodes.map((node, index) => [node.id, `${id}-${index}`]));
  const nodes: CanvasNode[] = clipboard.nodes.map(node => ({
    ...structuredClone(node), id: ids.get(node.id)!, selected: true, measured: undefined,
    position: { x: node.position.x + offset, y: node.position.y + offset },
  }));
  return { nodes, edges: clipboard.edges.map((edge, index) => ({ ...edge, id: `${id}-edge-${index}`, source: ids.get(edge.source)!, target: ids.get(edge.target)!, selected: false })) };
}
