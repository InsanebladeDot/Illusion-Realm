/** 对比只解析图片引用，像把原件和修订件并排登记；不复制文件或提交生成任务。 */
import type { CanvasNode } from "./canvas-model";

export type CompareSource = Pick<CanvasNode, "id" | "data">;

function image(node?: CompareSource) {
  return node?.data.media?.kind === "image" ? node.data.media : undefined;
}

// 普通两图按接线顺序；遇到超分输出时固定它在右边，不受最近点击影响。
// 只追溯超分的一层原始输入，不把整张节点网的其他图片误算进来。
// 上游尚未生成也保留原图身份，不能拿结果或任意邻居填补缺失原图。
export function canvasCompareSources(sources: CompareSource[], parents: CompareSource[]) {
  const upscale = sources.find(node => node.data.mode === "upscale");
  if (!upscale) return { original: image(sources[0]), result: image(sources[1]) };
  const original = sources.find(node => node.id !== upscale.id) ?? parents.find(node => node.data.kind === "image");
  return { original: image(original), result: image(upscale) };
}
