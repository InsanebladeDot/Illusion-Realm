// 图片输入限制用于连线、模式变更和实际提交，不另外维护“看起来能连”的规则。
// 像检查登机人数：超额时当场拒绝，人数不足时允许准备，但不能起飞。
// 文本边不计作图片，媒体仍须在提交时具备真实可读的文件引用。
// 旧工程可以打开；不合规输入以显式错误阻止执行，不静默删掉历史连线。
import type { CanvasData, CanvasDocument } from "./canvas-model";

// 图片编辑只提交一次；旧配置中的批次数量不再生效。
export function canvasImageBatchSize(data: CanvasData) {
  return data.kind === "image" && (canvasInputRule(data)?.min ?? 0) > 0 ? 1 : data.batchSize ?? 1;
}

export function canvasInputRule(data: CanvasData) {
  if (data.mode === "upscale") return null;
  if (data.mode === "compare") return { min: 1, max: 2 };
  if (data.kind !== "image" && data.kind !== "video") return null;
  const mode = data.remoteImage ? data.mode ?? "text" : data.workflow === "minimax-image-edit" ? "reference" : data.workflow === "anima-edit" ? "image" : data.kind === "video" ? data.workflow === "minimax-reference" ? "reference" : "image" : "text";
  return mode === "image" ? { min: 1, max: 1 } : mode === "reference" ? { min: 1, max: 8 } : { min: 0, max: 0 };
}
// 文生图暂不使用参考图；切回编辑时仍可沿用保存的附件和连线。
export function canvasIsTextToImage(data: CanvasData) {
  return data.kind === "image" && canvasInputRule(data)?.max === 0;
}
// 场景生成的预览也属于一张图片输入，不能绕过文生图的零图片约束。
// 同一来源的重复边先由原图校验拒绝；不同来源即便同文件也按用户连接张数计数。
// 不递归展开祖先，只有当前节点直接接入的图片参与本轮上传。
// 用户先连空图节点可继续填充内容；提交前检查缺媒体，不假设已生成。
// 先建 Map 用于查来源，再沿当前目标的直接边筛选，其他节点不会被误上传。
// 编号与返回列表位置一致，因此空媒体也必须保留节点对象。
// 是否有可读图片由执行边界检查，这层只回答图上声明了哪些图片输入。
// 相同节点不应有重复同向边，重复边合法性仍由原连接校验负责。
// 本函数不递归追溯依赖，避免生成一张图时把祖先所有图片都打包上传。
// 图中的移动与选中不改变 ID，单纯搬卡不会交换引用顺位。
// 若用户真正断开并换成另一个来源，新名单允许变化，这是明确的图编辑。
// 音频、视频上游不伪装为图片，后续支持其他资源需要相应类型与任务契约。
// 返回源节点而非 media 可让调用方区分空输入与完全没有连接。
// 空输入可以在编辑期间存在，但不能在提交时悄悄跳过它缩小数量。
export function canvasImageInputs(id: string, document: Pick<CanvasDocument, "nodes" | "edges">) {
  const byId = new Map(document.nodes.map(node => [node.id, node]));
  return document.edges.filter(edge => edge.target === id).flatMap(edge => {
    const node = byId.get(edge.source);
    return node && (node.data.kind === "image" || node.data.kind === "scene") ? [node] : [];
  });
}
export function canvasInputOverflow(id: string, data: CanvasData, document: Pick<CanvasDocument, "nodes" | "edges">, extra = 0) {
  const rule = canvasInputRule(data);
  return !!rule && canvasImageInputs(id, document).length + (data.inputImages?.length ?? 0) + extra > rule.max;
}
