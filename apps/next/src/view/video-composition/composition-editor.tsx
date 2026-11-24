"use client";
import { HoverTip } from "@/components/hover-tip";


// React 只提供原网页的宿主，原 Vue 组件继续拥有时间线、预览、效果与导出界面。
// 与导演台共用已存在的导航保存保护，业务状态和媒体注册表分别独立。
// 资源使用 Next 静态导出路径，不依赖研究包附带的本地 HTTP 服务。
import { useEffect, useLayoutEffect, useRef, useState, useImperativeHandle, type Ref } from "react";
import { useTranslation } from "@/i18n";
import type { CanvasDocument } from "../infinite-canvas/canvas-model";
import { useDirectorNavigation } from "../director/use-director-navigation";
import { CompositionController } from "./composition-controller";
import { CompositionBridge } from "./composition-bridge";
import { CompositionResourcePicker, useCompositionPicker } from "./composition-resource-picker";
export interface CompositionSession { close: () => Promise<void> }
interface Props {
  id: string;
  projectId?: string;
  document: CanvasDocument;
  onSave: (document: CanvasDocument) => Promise<boolean>;
  onApply: (document: CanvasDocument) => void;
  onClose: () => void;
  sessionRef?: Ref<CompositionSession>;
}
export default function CompositionEditor(props: Props) {
  const { t } = useTranslation();
  const frame = useRef<HTMLIFrameElement>(null);
  const bridge = useRef<CompositionBridge | null>(null);
  const controller = useRef<CompositionController | null>(null);
  const latest = useRef(props);
  const [state, setState] = useState("loading");
  const picker = useCompositionPicker();
  const pickerRef = useRef(picker);
  useLayoutEffect(() => { pickerRef.current = picker; });
  useLayoutEffect(() => { latest.current = props; });
  useEffect(() => () => { bridge.current?.dispose(); }, []);
  const close = () => bridge.current ? bridge.current.close() : Promise.resolve(latest.current.onClose());
  useImperativeHandle(props.sessionRef, () => ({ close }));
  useDirectorNavigation(close);
  // 只给当前 iframe 传递专线；同源身份与确切窗口双重约束握手。
  // 控制器在本次打开期间保持稳定，React 回填不会把未提交的原组件重建。
  // 请求回调延迟读取最新保存器，避免捕获最初 loading 状态后永远拒绝保存。
  function connect(): void {
    const child = frame.current?.contentWindow;
    if (!child) return;
    bridge.current?.dispose();
    try {
      controller.current ??= new CompositionController(props.document, props.id, { save: document => latest.current.onSave(document), apply: document => latest.current.onApply(document) });
      const pair = new MessageChannel();
      bridge.current = new CompositionBridge(pair.port1, controller.current, { ready: () => setState("ready"), error: () => setState("error"), close: () => latest.current.onClose(), selectAssets: () => pickerRef.current.open(controller.current!), cancelSelection: () => pickerRef.current.settle(null) }, { saving: t("canvas.saving"), saved: t("canvas.persistenceReady"), unsaved: t("canvas.unsaved"), retry: t("canvas.retry"), operationError: t("canvas.compositionOperationError"), downloadSaved: t("canvas.compositionDownloadSaved"), downloadCancelled: t("canvas.compositionDownloadCancelled"), localOnly: t("canvas.compositionLocalOnly") });
      const origin = new URL(frame.current!.src).origin;
      child.postMessage({ protocol: "illusion-video-composition/v1" }, origin === "null" ? "*" : origin, [pair.port2]);
    } catch { setState("error"); }
  }
  return <div data-composition-root data-composition-state={state} style={{ width: "100%", height: "100%", position: "relative", background: "var(--surface)" }}>
    {/* 视频合成：样式与快捷键留在原网页，不向创建页或视频编辑器注入 CSS。 */}
    <HoverTip asChild layer="window" label={(t("canvas.composition")) ?? ""}><iframe inert={!!picker.current} ref={frame} data-original-composition src="/embedded-tools/video-composition/embed.html" onLoad={connect} allow="fullscreen 'none'" style={{ border: 0, display: "block", width: "100%", height: "100%" }} /></HoverTip>
    {picker.current && <CompositionResourcePicker projectId={props.projectId} controller={picker.current.controller} onChoose={items => picker.settle(items)} onClose={() => picker.settle(null)} />}
    {/* 加载状态：原组件未就绪时明确反馈，不用静态样板冒充可操作时间线。 */}
    {state !== "ready" && <div role={state === "error" ? "alert" : "status"} style={{ position: "absolute", bottom: 12, left: 12, padding: 12, background: "var(--surface)", color: "var(--text-primary)" }}>{t(state === "error" ? "canvas.compositionOperationError" : "canvas.compositionLoading")}{state === "error" && <button type="button" onClick={props.onClose}>{t("canvas.close")}</button>}</div>}
  </div>;
}
