"use client";

/** 合成台通过宿主选择素材；iframe 始终保留，不因打开资源窗口而丢失时间线。 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import CanvasProjectResources from "../infinite-canvas/canvas-project-resources";
import { CanvasOverlay } from "../infinite-canvas/canvas-overlay";
import { mediaAccept, readCanvasMedia, type CanvasMedia } from "../infinite-canvas/canvas-media-import";
import type { CompositionController } from "./composition-controller";
import { serializeCanvas } from "../infinite-canvas/canvas-model";

type Selection = Awaited<ReturnType<CompositionController["selectMedia"]>>;
interface PendingSelection { controller: CompositionController; resolve: (items: Selection | null) => void; timer: ReturnType<typeof setTimeout> }

/** 挂起的选择像暂存取号单：取消、退出或卸载都会结单，不把桥接队列永久堵住。 */
export function useCompositionPicker() {
  const pending = useRef<PendingSelection | null>(null);
  const [current, setCurrent] = useState<PendingSelection | null>(null);
  const settle = (items: Selection | null) => {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current?.resolve(items);
    pending.current = null;
    setCurrent(null);
  };
  useEffect(() => () => { if (pending.current) clearTimeout(pending.current.timer); pending.current?.resolve(null); pending.current = null; }, []);
  const open = (controller: CompositionController): Promise<Selection | null> => {
    if (pending.current) return Promise.reject(Error("composition-selection-pending"));
    return new Promise(resolve => {
      const selection = { controller, resolve, timer: setTimeout(() => settle(null), 170000) };
      pending.current = selection;
      setCurrent(selection);
    });
  };
  return { current, open, settle };
}

export function CompositionResourcePicker({ projectId, controller, onChoose, onClose }: {
  projectId?: string; controller: CompositionController; onChoose: (items: Selection) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const alive = useRef(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const choose = async (media: CanvasMedia[], copy: boolean) => {
    if (pending.current) return false;
    pending.current = true; setBusy(true);
    try {
      const items = await controller.selectMedia(media, copy);
      if (alive.current) onChoose(items);
      return true;
    } finally { pending.current = false; if (alive.current) setBusy(false); }
  };
  // 文件从宿主原生输入读取路径，沿用画布复制接口，不跨iframe搬运大视频正文。
  const importLocal = async (files: FileList | null) => {
    if (!files?.length || pending.current) return;
    setError(false);
    try {
      const media = Array.from(files).map(readCanvasMedia);
      const valid = media.filter((item): item is CanvasMedia => item !== null);
      if (valid.length !== media.length) throw Error("canvas-invalid-media");
      await choose(valid, true);
    } catch { if (alive.current) setError(true); }
    finally { if (input.current) input.current.value = ""; }
  };
  return <CanvasOverlay label={t("canvas.projectResources")} onClose={() => { if (!pending.current) onClose(); }}>
    {/* 合成素材：共用原卡片、分类与全选，选择模式不提供删除，保护尚未保存的时间线引用。 */}
    <div data-composition-resource-picker aria-busy={busy} inert={busy}>
      <CanvasProjectResources projectId={projectId} workspace={controller.document.workspace} readDocument={() => serializeCanvas(controller.document)} selectionOnly onClose={onClose} onLocal={() => input.current?.click()} onUse={() => {}} onUseBatch={(media, scope) => choose(media, scope === "library")} />
      <input ref={input} hidden type="file" multiple accept={mediaAccept()} data-composition-local-input onChange={event => { void importLocal(event.target.files); }} />
      {error && <p role="alert">{t("canvas.compositionOperationError")}</p>}
    </div>
    {busy && <p role="status">{t("canvas.resourceLoading")}</p>}
  </CanvasOverlay>;
}
