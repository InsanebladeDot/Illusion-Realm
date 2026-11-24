"use client";

// 同一工作区只编辑一块标注牌；目标按节点与标注 ID 绑定，不靠当前数组下标。
import { useCallback, useState, type RefObject } from "react";
import type { CanvasData, CanvasNode } from "./canvas-model";
import { MAX_CANVAS_ANNOTATIONS, saveCanvasAnnotation, type CanvasAnnotation } from "./canvas-annotations";
import { CanvasAnnotationEditor } from "./canvas-annotation-editor";

interface Props {
  nodes: CanvasNode[];
  host: RefObject<HTMLElement | null>;
  editable: boolean;
  update: (id: string, patch: Partial<CanvasData>) => void;
}
interface Target { nodeId: string; annotationId?: string; x: number; y: number }

export function useCanvasAnnotations({ nodes, host, editable, update }: Props) {
  const [target, setTarget] = useState<Target | null>(null);
  const node = nodes.find(item => item.id === target?.nodeId);
  const value = node?.data.annotations?.find(item => item.id === target?.annotationId);
  // 删节点或撤销掉当前牌子时丢弃草稿；点另一处由公共浮层关闭，不复活旧弹层。
  if (target && (!node || target.annotationId && !value || !editable)) setTarget(null);
  const close = useCallback(() => setTarget(null), []);
  const open = (nodeId: string, annotationId?: string) => {
    const current = nodes.find(item => item.id === nodeId);
    if (!editable || !current || !annotationId && (current.data.annotations?.length ?? 0) >= MAX_CANVAS_ANNOTATIONS) return;
    const card = host.current?.querySelector(`[data-canvas-node="${CSS.escape(nodeId)}"] .hy-node-card`);
    const rect = card?.getBoundingClientRect();
    if (rect) setTarget({ nodeId, annotationId, x: rect.right - 4, y: rect.top - 8 });
  };
  const save = (annotation: CanvasAnnotation) => {
    if (!node || !editable) return;
    const annotations = saveCanvasAnnotation(node.data.annotations, annotation);
    if (!annotations) return;
    update(node.id, { annotations });
    close();
    host.current?.focus({ preventScroll: true });
  };
  const remove = () => {
    if (!node || !target?.annotationId || !editable) return;
    update(node.id, { annotations: node.data.annotations?.filter(item => item.id !== target.annotationId) });
    close();
    host.current?.focus({ preventScroll: true });
  };
  const editor = target && node && editable ? <CanvasAnnotationEditor key={`${target.nodeId}:${target.annotationId ?? "new"}`} value={value} x={target.x} y={target.y} onSave={save} onRemove={remove} onClose={close} /> : null;
  return { open, editor };
}
