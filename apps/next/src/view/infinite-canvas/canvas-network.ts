/** 连线像绳结，两端都属于同一张网；只读遍历不改依赖方向，也不修改工程。 */
import type { CanvasDocument, CanvasNode } from "./canvas-model";

export function canvasNetwork(document: Pick<CanvasDocument, "nodes" | "edges">, id: string): CanvasNode[] {
  const neighbors = new Map(document.nodes.map(node => [node.id, new Set<string>()]));
  if (!neighbors.has(id)) return [];
  for (const edge of document.edges) {
    if (!neighbors.has(edge.source) || !neighbors.has(edge.target)) continue;
    neighbors.get(edge.source)!.add(edge.target);
    neighbors.get(edge.target)!.add(edge.source);
  }
  // 用队列和已访问集合覆盖上游、下游、分支与环；失效端点不把无关节点拉进来。
  const visited = new Set([id]), queue = [id];
  for (let index = 0; index < queue.length; index++) {
    for (const neighbor of neighbors.get(queue[index])!) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor); queue.push(neighbor);
    }
  }
  return document.nodes.filter(node => visited.has(node.id));
}
