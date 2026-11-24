"use client";

/** 候选库只读展示；明确选择后才登记节点附件，复用原输入约束，不创建边。 */
import { useEffect, useMemo, useState } from "react";
import { useReactFlow, useStore } from "@xyflow/react";
import { useShallow } from "zustand/react/shallow";
import { useTranslation } from "@/i18n";
import { useCanvasResourceLibraryStore } from "@/stores/use-canvas-resource-library-store";
import { buildLocalFileUrl } from "@/utils/localFileUrl";
import { mediaReferenceToken, type PromptReferenceMedia } from "@/utils/prompt-media-references";
import type { PromptMediaGroup } from "@/view/create/prompt-media-menu";
import { canvasFilePrefix } from "./canvas-media-name";
import { canvasImageInputs, canvasInputRule } from "./canvas-input-rules";
import type { CanvasData, CanvasDocument, CanvasNode } from "./canvas-model";
import type { CanvasMedia } from "./canvas-media-import";

/** 菜单编号只是占位；选择时根据真实附件顺位计算，未选素材不会混入请求表。 */
function candidates(items: readonly CanvasMedia[], scope: string): PromptReferenceMedia[] {
  return items.map((item, index) => ({ id: `${scope}:${index}`, kind: item.kind, number: index + 1,
    tokenPrefix: "picture", name: canvasFilePrefix(item.name), displayName: canvasFilePrefix(item.name), src: buildLocalFileUrl(item.path) ?? "" }));
}

/** 已有引用复用原编号；新增图片按连线在前、附件在后的规则接到末尾。 */
function selectionPatch(nodeId: string, data: CanvasData, item: CanvasMedia, document: Pick<CanvasDocument, "nodes" | "edges">): { patch: Partial<CanvasData>; token: string } {
  const sourceIds = new Set(document.edges.filter(edge => edge.target === nodeId).map(edge => edge.source));
  const sources = data.kind === "audio" ? document.nodes.filter(node => sourceIds.has(node.id)) : canvasImageInputs(nodeId, document);
  if (data.kind === "audio") {
    const linked = sources.filter(node => node.data.kind === "audio");
    if (linked.some(node => node.data.media?.path === item.path) || data.audioParameters?.reference?.path === item.path) return { patch: {}, token: "@audio1" };
    if (linked.length || data.audioParameters?.reference) throw Error("create.audio.invalidReference");
    return { patch: { audioParameters: { ...data.audioParameters, reference: item } }, token: "@audio1" };
  }
  const linked = sources.filter(node => node.data.kind === "image" || node.data.kind === "scene");
  const paths = [...linked.map(node => node.data.media?.path), ...(data.inputImages ?? []).map(media => media.path)];
  const existing = paths.indexOf(item.path);
  if (existing >= 0) return { patch: {}, token: `@picture${existing + 1}` };
  if (paths.length >= (canvasInputRule(data)?.max ?? 0)) throw Error("canvas.imageInputOverflow");
  return { patch: { inputImages: [...(data.inputImages ?? []), item] }, token: `@picture${paths.length + 1}` };
}

/** 候选ID仅在菜单内查原对象，不能当作节点ID或磁盘路径使用。 */
function findCandidate(item: PromptReferenceMedia, pools: { library: CanvasMedia[]; local: CanvasMedia[] }) {
  const [scope, offset] = item.id.split(":");
  return (scope === "library" ? pools.library : pools.local)[Number(offset)];
}

export function useCanvasMentionLibrary(nodeId: string, data: CanvasData, actual: readonly PromptReferenceMedia[], onChangeData: (patch: Partial<CanvasData>) => void, enabled = true) {
  const { t } = useTranslation();
  const flow = useReactFlow<CanvasNode>();
  // 仅订阅媒体对象，搬动卡片不重建全库缩略图或重新装饰正文。
  const local = useStore(useShallow(state => state.nodes.filter(node => node.id !== nodeId).flatMap(node => node.data.media ? [node.data.media as CanvasMedia] : [])));
  const library = useCanvasResourceLibraryStore(state => state.items);
  const failed = useCanvasResourceLibraryStore(state => state.error);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (enabled) void useCanvasResourceLibraryStore.getState().refresh(); }, [enabled]);
  const allowedKind = data.kind === "audio" ? "audio" : "image";
  const pools = useMemo(() => ({ library: library.filter(item => item.state === "active" && item.media.kind === allowedKind).map(item => item.media), local: local.filter(item => item.kind === allowedKind) }), [library, local, allowedKind]);
  const groups = useMemo<PromptMediaGroup[]>(() => [
    { id: "library", path: "资源库", label: t("canvas.mentionLibrary"), items: candidates(pools.library, "library") },
    { id: "local", path: allowedKind === "audio" ? "音频" : "图片", label: t(allowedKind === "audio" ? "canvas.mentionAudio" : "canvas.mentionImages"), items: [...actual, ...candidates(pools.local, "local").filter(item => !actual.some(reference => reference.src === item.src))] },
  ], [pools, actual, allowedKind, t]);
  const resolve = (item: PromptReferenceMedia) => {
    if (!enabled) return null;
    setError(null);
    if (actual.includes(item)) return mediaReferenceToken(item);
    const media = findCandidate(item, pools);
    if (!media) return null;
    try {
      const result = selectionPatch(nodeId, data, media, { nodes: flow.getNodes(), edges: flow.getEdges() });
      onChangeData(result.patch);
      return result.token;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "canvas.libraryError"); return null; }
  };
  return { groups, resolve, error: error === "canvas.imageInputOverflow" ? t("canvas.imageInputOverflow") : error ? t("create.audio.invalidReference") : failed ? t("canvas.globalResourceLoadFailed") : null };
}
