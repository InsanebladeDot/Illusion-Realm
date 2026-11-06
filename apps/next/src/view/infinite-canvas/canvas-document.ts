// 把磁盘 JSON 转成可编辑作品：先验形状，再验身份和有向连接，不信任手改的用户文档。
// 就像先检查拼图块是否齐全，再检查它们能否连接，单靠 TypeScript 不能保证磁盘数据正确。
// 失败抛到持久化边界，保留旧磁盘和当前草稿，不能偷偷用空画布覆盖坏文档。
import { InfiniteCanvasDocumentSchema } from "@illusion-realm/shared";
import type { UserDataInfiniteCanvas } from "@/types/infinite-canvas";
import { connectionError, restoreCanvas } from "./canvas-model";

export function parseCanvasDocument(value: unknown): UserDataInfiniteCanvas {
  // 只有完全缺少画布段才代表首次使用；null 或损坏对象不能被当成空画布吞掉。
  // 这一区别保护已有作品：读取失败会进入错误态，由用户决定重试，不自动回写空图。
  if (value === undefined) return { version: 1, name: "", nodes: [], edges: [] };
  const document = InfiniteCanvasDocumentSchema.parse(value);
  const nodes = new Set(document.nodes.map(node => node.id));
  const edges = new Set(document.edges.map(edge => edge.id));
  if (nodes.size !== document.nodes.length || edges.size !== document.edges.length) throw new Error("invalid-canvas-identities");
  const graph = restoreCanvas(document);
  graph.edges = [];
  // 像逐条接通电路：每加一条边就检查已经接好的部分，最后一条闭环也会被发现。
  // 不能直接用全部边检查每条边，否则当前边会把自己识别成重复连接。
  // 老文档省略端口时补默认值；真正写盘的端口仍由唯一序列化入口确定。
  for (const edge of document.edges) {
    const connection = { ...edge, sourceHandle: edge.sourceHandle ?? "out", targetHandle: edge.targetHandle ?? "in" };
    if (connectionError(connection, graph)) throw new Error("invalid-canvas-connection");
    graph.edges.push(edge);
  }
  return document;
}
