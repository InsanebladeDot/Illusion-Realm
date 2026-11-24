"use client";

/** 按节点登记工作单：像不同桌子的点菜单，编辑独立，实际推理仍共用原FIFO。 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { createStore, useStore } from "zustand";
import type { CanvasGenerationState } from "./canvas-generation-state";
import { WorkflowModelsMissingError } from "@/utils/workflow-model-readiness";
import { GptSovitsInputError } from "@/utils/comfy/gpt-sovits-workflow";
import { t } from "@/i18n";
import type { CanvasData, CanvasNode } from "./canvas-model";
import type { useCanvasEditor } from "./use-canvas-editor";
import { startCanvasImageJob } from "./canvas-image-job";
import { canvasImageBatchSize } from "./canvas-input-rules";

function errorText(error: unknown) {
  if (error instanceof WorkflowModelsMissingError || error instanceof GptSovitsInputError) return error.message;
  const message = error instanceof Error ? error.message : "";
  if ([t("canvas.upscaleFailedOriginal"), t("canvas.upscaleSource"), t("canvas.upscaleInvalid"), t("canvas.upscaleNoResult")].includes(message)) return message;
  if (message === "euzhi-key-missing") return t("canvas.remoteKeyMissing");
  if (message === "euzhi-cancelled") return t("canvas.remoteCancelled");
  if (message === "euzhi-timeout") return t("canvas.remoteTimeout");
  if (message === "euzhi-input-invalid" || message === "euzhi-input-missing" || message === "euzhi-invalid-input-image") return t("canvas.remoteInputInvalid");
  if (/^euzhi-http-\d{3}$/.test(message)) return t("canvas.remoteHttpError", { status: message.slice(-3) });
  return t(message.startsWith("euzhi-") ? "canvas.remoteFailed" : "canvas.generationFailed");
}
/** 首张回填原卡，其余结果生成新卡；不建立会误作下次输入的连线。 */
function resultNodes(node: CanvasNode, media: NonNullable<CanvasData["media"]>[]): CanvasNode[] {
  return media.slice(1).map((image, index) => ({
    id: crypto.randomUUID(), type: "canvas", selected: false,
    position: { x: node.position.x + (index + 1) * 460, y: node.position.y },
    data: { ...structuredClone(node.data), title: image.name, kind: image.kind, media: image, createdAt: Date.now() },
  }));
}
/** 只修改最新工程里的收件节点；删除后不能用迟到结果复活它。 */
function applyResult(current: ReturnType<typeof useCanvasEditor>, node: CanvasNode, result: Awaited<ReturnType<typeof startCanvasImageJob>["promise"]>) {
  if (!result.media.length) throw Error("empty-result");
  if (!current.nodes.some(item => item.id === node.id)) return;
  const nodes = current.nodes.map(item => item.id === node.id ? { ...item, data: { ...item.data, kind: result.media[0].kind, media: result.media[0] } } : item);
  current.applyDocument({ name: current.name, workspace: result.workspace, edges: current.edges, nodes: [...nodes, ...resultNodes(node, result.media)] });
  const completion = node.data.kind === "audio" ? "create.audio.saved"
    : node.data.mode === "upscale" ? "canvas.upscaleComplete"
    : node.data.remoteImage ? "canvas.remoteComplete" : "canvas.generationComplete";
  current.notify(t(completion, { count: result.media.length, requested: canvasImageBatchSize(node.data) }), "success");
}


interface PendingJob { job: ReturnType<typeof startCanvasImageJob>; removed: boolean }
type Editor = ReturnType<typeof useCanvasEditor>;
interface Registry {
  pendingRef: RefObject<Map<string, PendingJob>>;
  latestRef: RefObject<Editor>;
  aliveRef: RefObject<boolean>;
  sync: () => void;
}

function reportError(registry: Registry, error: unknown) {
  if (!registry.aliveRef.current) return;
  const cancelled = error instanceof DOMException && error.name === "AbortError";
  registry.latestRef.current.notify(cancelled ? t("canvas.generationCancelled") : errorText(error), cancelled ? "info" : "error");
}

function invalidateJob(entry: PendingJob) {
  entry.removed = true;
  void entry.job.cancel().catch(() => {});
}

/** 删除和离开工作区都作废收件人；即使取消回执晚到，也不能把结果写回旧卡片。 */
function useJobLifecycle(editor: Editor, registry: Registry) {
  const { pendingRef, latestRef, aliveRef } = registry;
  useLayoutEffect(() => { latestRef.current = editor; }, [editor, latestRef]);
  useEffect(() => {
    for (const [id, entry] of pendingRef.current) {
      if (entry.removed || editor.nodes.some(node => node.id === id)) continue;
      invalidateJob(entry);
    }
  }, [editor.nodes, pendingRef]);
  useEffect(() => {
    aliveRef.current = true;
    const pending = pendingRef.current;
    return () => {
      aliveRef.current = false;
      for (const entry of pending.values()) invalidateJob(entry);
    };
  }, [aliveRef, pendingRef]);
}

function cancelJobs(registry: Registry, id?: string) {
  for (const [key, entry] of registry.pendingRef.current) {
    if (id !== undefined && key !== id) continue;
    void entry.job.cancel().catch(error => reportError(registry, error));
  }
}

async function receiveResult(registry: Registry, node: CanvasNode, entry: PendingJob) {
  const result = await entry.job.promise;
  if (!registry.aliveRef.current || entry.removed) return;
  // 同一轮返回也逐笔提交，下一笔读取更新后的工程，不覆盖前一笔结果。
  flushSync(() => applyResult(registry.latestRef.current, node, result));
}

async function runGeneration(registry: Registry, id: string, count?: number) {
  const snapshot = registry.latestRef.current;
  if (registry.pendingRef.current.has(id) || !snapshot.persistence.editable || snapshot.drag) return;
  const node = snapshot.nodes.find(item => item.id === id);
  if (!node || node.data.mode === "compare") return;
  if (node.data.mode !== "upscale" && (!["image", "video", "audio"].includes(node.data.kind) || !node.data.prompt.trim())) return;
  let entry: PendingJob | undefined;
  try {
    const input = structuredClone(node);
    if (input.data.kind === "audio" && count !== undefined) input.data.audioParameters = { ...input.data.audioParameters, count: count as 1 | 2 | 4 | 6 };
    entry = { job: startCanvasImageJob(input, snapshot), removed: false };
    registry.pendingRef.current.set(id, entry);
    registry.sync();
    await receiveResult(registry, node, entry);
  } catch (error) {
    if (!entry?.removed) reportError(registry, error);
  } finally {
    registry.pendingRef.current.delete(id);
    if (registry.aliveRef.current) registry.sync();
  }
}

export function useCanvasImageGeneration(editor: Editor) {
  const [store] = useState(() => createStore<CanvasGenerationState>(() => ({ nodeIds: [] })));
  const nodeIds = useStore(store, state => state.nodeIds);
  const busy = nodeIds.length > 0;
  const pendingRef = useRef(new Map<string, PendingJob>());
  const latestRef = useRef(editor);
  const aliveRef = useRef(true);
  const registry = { pendingRef, latestRef, aliveRef, sync: () => store.setState({ nodeIds: [...pendingRef.current.keys()] }) };
  useJobLifecycle(editor, registry);
  return { store, busy, nodeIds, generate: (id: string, count?: number) => { void runGeneration(registry, id, count); },
    cancel: (id?: string) => cancelJobs(registry, id) };
}
