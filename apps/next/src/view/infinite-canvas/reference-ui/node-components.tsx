"use client";

import { HoverTip } from "@/components/hover-tip";
import { StickyNote } from "@/components/sticky-note";

// CanvasNode 与 GenerationPanel 分开挂载，沿用资料包的真实节点结构而非 NodeFixture。
// 外层选择和移动归 React Flow；端口插槽装真实 Handle，避免出现只有加号的假连接。
// 标题、结果和工具动作由宿主传入，生成状态不由展示组件自行计时或切换。
import type { ReactNode } from "react";
import { useTranslation } from "@/i18n";
import { CanvasIcon, CanvasChip, IconButton, type CanvasAction, type IconName } from "./components";
import type { CanvasData, NodeKind } from "../canvas-model";

export function NodeActionBar({ kind, onAction, expanded, fitAvailable }: { kind: NodeKind; onAction: CanvasAction; expanded: boolean; fitAvailable?: boolean }) {
  // 文本工具条有编辑与复制，媒体工具条只展示对应历史入口，不能套同一组伪动作。
  // 未接结果预览和历史服务时保留原生禁用；宿主不会收到一次假的执行成功回调。
  const { t } = useTranslation();
  const actions = ["target", "eye", "text", "copy", "expand", "history"] as const;
  const labels = { target: t("canvas.locate"), eye: t("canvas.preview"), text: t("canvas.manual"), copy: t("canvas.nodeCopy"), expand: t(expanded ? "canvas.collapse" : "canvas.expand"), history: t("canvas.nodeHistory") };
  return <div className={`hy-node-actions hy-node-actions-${kind} nodrag nopan`} aria-label={t("canvas.settings")}>
    {kind === "text" && actions.map(icon => <IconButton key={icon} icon={icon} label={labels[icon]} disabled={icon === "history" || icon === "eye"} reason={icon === "history" || icon === "eye" ? t("canvas.unavailable") : undefined} onClick={() => onAction(icon)} />)}
    {/* 文本与便签的书写入口共用原工具条动作。 */}
    {(kind === "image" || kind === "video" || kind === "audio") && <CanvasChip icon="crop" disabled={!fitAvailable} onClick={() => onAction("fit")}>{t("canvas.fitMedia")}</CanvasChip>}
    {kind === "note" && <IconButton icon="text" label={labels.text} onClick={() => onAction("text")} />}
    {(kind === "image" || kind === "video") && <HoverTip asChild label={(t("canvas.unavailable")) || ""}><button type="button" className="hy-history-button" disabled><CanvasIcon name="history" size={14} />{t("canvas.nodeHistory")}</button></HoverTip>}
    {kind !== "audio" && kind !== "composition" && kind !== "note" && <i />}
    {kind !== "note" && <IconButton icon="pin" label={t("canvas.pin")} disabled reason={t("canvas.unavailable")} />}
  </div>;
}

export interface CanvasNodeProps {
  // 端口由宿主传真实图引擎 Handle，展示壳不能自己画按钮替代连接机制。
  // content 属于已确认内容插槽；空、忙碌和错误只影响展示，不自行生产媒体结果。
  kind: NodeKind;
  fitAvailable?: boolean;
  noteAppearance?: CanvasData["noteAppearance"];
  selected: boolean;
  ariaLabel?: string;
  title: ReactNode;
  ports?: ReactNode;
  content?: ReactNode;
  state?: "empty" | "loading" | "error" | "success";
  onAction: CanvasAction;
  onDoubleClick?: () => void;
  expanded: boolean;
}

export function CanvasNode({ kind, selected, title, ariaLabel, ports, content, state = "empty", onAction, onDoubleClick, expanded, fitAvailable, noteAppearance }: CanvasNodeProps) {
  // selected 决定业务选框和工具条；普通 focus 不改它，移开鼠标也不取消选中。
  // 节点标题在内容区域外，长标题不能撑开卡片并悄悄移动连接端口。
  const { t } = useTranslation();
  const icon: IconName = kind === "note" ? "comment" : kind === "text" ? "file" : kind === "scene" ? "layers" : kind;
  // 文本保持原卡片；便签只替换纸面，正文编辑、工具条和节点尺寸仍归画布管理。
  const body = content || <div className="hy-node-empty"><CanvasIcon name={state === "loading" ? "history" : icon} size={kind === "audio" ? 42 : 32} /><span>{t(state === "error" ? "canvas.taskFailed" : state === "loading" ? "canvas.taskRunning" : kind === "text" ? "canvas.textHint" : kind === "note" ? "canvas.noteHint" : "canvas.mediaHint")}</span>{kind === "composition" && <button type="button" className="hy-open-composer nodrag" onClick={() => onAction("open-composer")}>{t("canvas.openComposer")}</button>}</div>;
  return <div className={`hy-node-shell hy-node-${kind} ${selected ? "is-selected" : ""}`}>
    {selected && <NodeActionBar fitAvailable={fitAvailable} kind={kind} onAction={onAction} expanded={expanded} />}
    <header className="hy-node-label"><CanvasIcon name={kind === "text" ? "comment" : icon} size={16} />{title}</header>
    {kind === "note" ? <StickyNote rotate={0} color={noteAppearance?.color} attach={noteAppearance?.attach} data-note-color={noteAppearance?.color ?? "yellow"} data-note-attach={noteAppearance?.attach ?? "none"} className={`hy-node-card hy-state-${state}`} role="group" aria-label={ariaLabel} onDoubleClick={onDoubleClick}
      style={{ width: "100%", height: "100%", border: 0, borderRadius: 0, overflow: "visible", background: "transparent", boxShadow: "none" }}
      paperStyle={{ width: "100%", height: "100%", aspectRatio: "auto", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, overflow: "hidden", fontFamily: "var(--hy-font)", fontSize: 14, lineHeight: 1.8 }}>
      {body}
    </StickyNote> : <div className={`hy-node-card hy-state-${state}`} role="group" aria-label={ariaLabel} onDoubleClick={onDoubleClick}>{body}</div>}
    {ports}
  </div>;
}
