"use client";

/** 工程与全局库共享请求状态；所有写入串行，迟到的旧列表不能覆盖已切换的来源。 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { CanvasResourceItem, UserDataInfiniteCanvas } from "@illusion-realm/shared";
import { useCanvasResourceLibraryStore } from "@/stores/use-canvas-resource-library-store";
import { canvasLibrary, canvasLibraryErrorKey } from "./canvas-library-api";
import type { CanvasMedia } from "./canvas-media-import";

export type ResourceScope = "project" | "library";
interface Props { projectId?: string; workspace?: UserDataInfiniteCanvas["workspace"]; scope: ResourceScope }

type ResourceError = ReturnType<typeof canvasLibraryErrorKey> | "canvas.resourcePartialFailure" | null;

/** 每份回包带来源身份，切换来源立即隔离旧列表；无需同步effect清空另一个来源的状态。 */
function useResourceListing({ projectId, workspace, scope }: Props) {
  const key = `${scope}:${projectId ?? ""}:${workspace?.id ?? ""}`;
  const [snapshot, setSnapshot] = useState<{ key: string; items: CanvasResourceItem[]; truncated: boolean }>({ key: "", items: [], truncated: false });
  const [failure, setFailure] = useState<{ key: string; error: ResourceError }>({ key: "", error: null });
  const alive = useRef(true), sequence = useRef(0);
  const setError = (error: ResourceError) => setFailure({ key, error });
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const refresh = useCallback(async () => {
    const revision = ++sequence.current;
    if (scope === "project" && !projectId) return;
    const result = await canvasLibrary(scope === "library" ? { operation: "libraryResources" } : { operation: "resources", id: projectId!, workspace });
    if (!result || !("resourceItems" in result)) throw Error("canvas-resource-invalid-result");
    if (alive.current && revision === sequence.current) { setSnapshot({ key, items: result.resourceItems, truncated: result.truncated }); setFailure({ key, error: null }); }
  }, [projectId, workspace, scope, key]);
  useEffect(() => {
    let disposed = false;
    alive.current = true;
    void refresh().catch(error => { if (!disposed) setFailure({ key, error: canvasLibraryErrorKey(error) }); });
    return () => { disposed = true; alive.current = false; invalidate(); };
  }, [refresh, invalidate, key]);
  return { items: snapshot.key === key ? snapshot.items : [], truncated: snapshot.key === key && snapshot.truncated,
    error: failure.key === key ? failure.error : null, loading: snapshot.key !== key && failure.key !== key, alive, refresh, setError };
}

export function useCanvasResources(props: Props) {
  const list = useResourceListing(props);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  // 同步门闩先拦连点；关闭窗口不会中断文件操作，但不会再调用卸载后的完成回调。
  const run = async (action: () => Promise<boolean>, onComplete?: () => void) => {
    if (pending.current) return false;
    pending.current = true; setBusy(true); list.setError(null);
    try {
      const complete = await action();
      await list.refresh();
      if (props.scope === "library") await useCanvasResourceLibraryStore.getState().refresh();
      if (list.alive.current) { onComplete?.(); if (!complete) list.setError("canvas.resourcePartialFailure"); }
      return complete;
    } catch (error) { if (list.alive.current) list.setError(canvasLibraryErrorKey(error)); return false; }
    finally { pending.current = false; if (list.alive.current) setBusy(false); }
  };
  return { items: list.items, truncated: list.truncated, busy: busy || list.loading, loading: list.loading, error: list.error, run };
}

/** 上传描述来自原File转换器，主进程再次检查格式；未知类型不会被默认为图片。 */
export async function importLibraryMedia(media: CanvasMedia[]) {
  let complete = true;
  // 每批200个沿用IPC上限，用户选择更大批量时逐批提交，不静默丢弃后面的文件。
  for (let offset = 0; offset < media.length; offset += 200) {
    const result = await canvasLibrary({ operation: "importLibraryResources", files: media.slice(offset, offset + 200) });
    if (!result || !("imported" in result)) throw Error("canvas-resource-invalid-result");
    complete = result.rejected.length === 0 && complete;
  }
  return complete;
}
