"use client";

/** 卡片和节点网预览共用对比入口，只订阅输入内容，搬动其他卡片不重建解码。 */
import { useNodeConnections, useNodesData } from "@xyflow/react";
import type { CanvasNode } from "./canvas-model";
import { canvasCompareSources } from "./canvas-compare-sources";
import { CanvasImageCompare } from "./canvas-image-compare";

export function CanvasCompareNode({ nodeId }: { nodeId: string }) {
  const edges = useNodeConnections({ id: nodeId, handleType: "target" });
  const inputs = useNodesData<CanvasNode>(edges.map(edge => edge.source));
  // 单接超分也可对比：另一份订阅跟随它的输入，迟到的结果自然回填当前节点。
  const upscaleId = inputs.find(node => node.data.mode === "upscale")?.id;
  const parentEdges = useNodeConnections({ id: upscaleId ?? nodeId, handleType: "target" });
  const parents = useNodesData<CanvasNode>(parentEdges.map(edge => edge.source));
  const byId = new Map(inputs.map(node => [node.id, node]));
  const sources = edges.flatMap(edge => byId.has(edge.source) ? [byId.get(edge.source)!] : []);
  return <CanvasImageCompare {...canvasCompareSources(sources, parents)} />;
}
