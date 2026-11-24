"use client";
/** 节点编辑、只读预览和助手共用输入表；顺序与工程边及导入列表一致。 */
import { useMemo } from "react";
import { useNodeConnections, useNodesData } from "@xyflow/react";
import { canvasFilePrefix } from "./canvas-media-name";
import { audioPromptMedia } from "@/utils/comfy/audio-prompt-references";
import { canvasAudioReferences } from "./canvas-audio-parameters";
import { canvasReferenceMedia } from "./canvas-reference-media";
import { canvasIsTextToImage } from "./canvas-input-rules";
import type { CanvasData, CanvasNode } from "./canvas-model";

// 只订阅上游数据，拖动节点位置不重建输入表；数组仍由各面板实例独立持有。
export function useCanvasPromptMedia(nodeId: string, data: CanvasData) {
  const connections = useNodeConnections({ id: nodeId, handleType: "target" });
  const sources = useNodesData<CanvasNode>(connections.map(item => item.source));
  const { kind, inputImages } = data, reference = data.audioParameters?.reference;
  const textOnly = canvasIsTextToImage(data);
  return useMemo(() => {
    if (textOnly) return [];
    const ordered = connections.flatMap(connection => sources.filter(source => source.id === connection.source));
    return kind === "audio"
      ? audioPromptMedia(canvasAudioReferences({ audioParameters: { reference } }, ordered)[0] ?? null).map(item => ({ ...item, displayName: canvasFilePrefix(item.name) }))
      : canvasReferenceMedia(ordered, inputImages);
  }, [connections, sources, kind, inputImages, reference, textOnly]);
}

