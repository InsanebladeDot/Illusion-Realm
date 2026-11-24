"use client";

/** 工程库请求串行提交，失败保留列表与选择；只有磁盘确认成功才切换到新画布。 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { CanvasLibraryRequest, CanvasLibrarySnapshot } from "@illusion-realm/shared/schemas/canvas-library.schema";
import { useCanvasSessionsStore } from "@/stores/use-canvas-sessions-store";
import { canvasLibrary, canvasLibraryErrorKey, createCanvas, listCanvases } from "./canvas-library-api";

function useLibraryState() {
  const [data, setData] = useState<CanvasLibrarySnapshot>({ entries: [], folders: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof canvasLibraryErrorKey> | null>(null);
  const pending = useRef(false);
  const aliveRef = useRef(true);
  // 请求像排队交单，门闩在 React 更新按钮状态之前就生效，防止连点创建两份工程。
  const perform = useCallback(async (action: () => Promise<CanvasLibrarySnapshot>) => {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setError(null);
    try { const result = await action(); if (aliveRef.current) setData(result); return true; }
    catch (error) { if (aliveRef.current) setError(canvasLibraryErrorKey(error)); return false; }
    finally { pending.current = false; if (aliveRef.current) setBusy(false); }
  }, []);
  return { data, busy, error, perform, aliveRef };
}

export function useCanvasLibrary() {
  const state = useLibraryState();
  const { perform, aliveRef } = state;
  const activeId = useCanvasSessionsStore(value => value.activeId);
  const refresh = useCallback(() => perform(listCanvases), [perform]);
  useEffect(() => {
    aliveRef.current = true;
    if (!activeId) void Promise.resolve().then(refresh);
    return () => { aliveRef.current = false; };
  }, [activeId, refresh, aliveRef]);
  const run = (request: CanvasLibraryRequest) => perform(async () => {
    if (request.operation === "create") {
      const entry = await createCanvas(request.name, request.folderId);
      useCanvasSessionsStore.getState().open(entry.id, entry.name);
      // 创建回执已证明落盘；不再把后续列表刷新失败误报成创建失败，诱使用户重复提交。
      return { ...state.data, entries: [entry, ...state.data.entries.filter(item => item.id !== entry.id)] };
    } else await canvasLibrary(request);
    return listCanvases();
  });
  return { ...state.data, busy: state.busy, error: state.error, refresh, run };
}
