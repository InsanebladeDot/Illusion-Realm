"use client";

/** 会话退出先提交输入与保存；挂起保留任务，关闭只在没有在途磁盘/生成任务时释放实例。 */
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { flushSync } from "react-dom";
import { useReactFlow } from "@xyflow/react";
import { useCanvasSessionsStore } from "@/stores/use-canvas-sessions-store";
import { deleteCanvasSession } from "./canvas-delete-media";
import { canvasLibrary } from "./canvas-library-api";
import type { CanvasSessionProps } from "./canvas-session-host";
import type { CanvasNode } from "./canvas-model";
import type { useCanvasEditor } from "./use-canvas-editor";

interface SessionInput extends CanvasSessionProps {
  editor: ReturnType<typeof useCanvasEditor>;
  host: RefObject<HTMLElement | null>;
  writing: boolean;
  generating: boolean;
}

function useSessionSave({ editor, host, writing }: SessionInput) {
  const flow = useReactFlow<CanvasNode>();
  const save = async () => {
    if (writing || editor.drag) return false;
    flushSync(() => {
      if (document.activeElement instanceof HTMLElement && host.current?.contains(document.activeElement)) document.activeElement.blur();
    });
    return editor.persistence.save({ ...editor, nodes: flow.getNodes(), edges: flow.getEdges() });
  };
  return save;
}

function useSessionCommands(input: SessionInput) {
  const { host, projectId, generating, onLeave } = input;
  const save = useSessionSave(input);
  const leaving = useRef(false);
  const close = async () => {
    if (generating || !await save()) return false;
    if (projectId) await canvasLibrary({ operation: "close", id: projectId });
    return true;
  };
  const leave = async (mode: "suspend" | "close" | "delete") => {
    if (leaving.current) return false;
    leaving.current = true;
    try { return await executeLeave(mode); }
    finally { leaving.current = false; }
  };
  const executeLeave = async (mode: "suspend" | "close" | "delete") => {
    // 其他挂起实例可能还有未落盘引用或生成任务，先关闭它们再做不可逆的磁盘删除。
    if (mode === "delete" && useCanvasSessionsStore.getState().sessions.some(session => session.id !== projectId)) throw new Error("canvas-delete-open-sessions");
    const ok = mode === "suspend" ? await save() : mode === "close" ? await close() : !generating && await save();
    if (!ok) return false;
    if (mode === "delete" && projectId) {
      await deleteCanvasSession(projectId, host.current);
      useCanvasSessionsStore.getState().remove(projectId);
    } else onLeave?.(mode);
    return true;
  };
  return { close, leave };
}

export function useCanvasSession(input: SessionInput) {
  const { editor, host, projectId, active = true, writing, onControl } = input;
  const commands = useSessionCommands(input);
  useLayoutEffect(() => {
    if (!projectId) return;
    onControl?.(projectId, { close: commands.close });
    useCanvasSessionsStore.getState().rename(projectId, editor.name);
    return () => onControl?.(projectId, null);
  });
  useEffect(() => {
    if (active) return;
    host.current?.querySelectorAll<HTMLMediaElement>("video,audio").forEach(media => media.pause());
    // 后台结果仍回到原节点，再保存最新图；保存失败留在原实例，不能报成已保存。
    if (!writing && !editor.drag && editor.persistence.dirty && editor.persistence.status === "ready") void editor.persistence.save();
  }, [active, writing, editor.drag, editor.persistence.dirty, editor.persistence.status, editor.persistence, host]);
  return { leave: commands.leave };
}
