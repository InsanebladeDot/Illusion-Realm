"use client";

// 保留资料包四种面板的 JSX 顺序、字号和高度，差异只通过 kind 与参数注入。
// 模型/费用来自宿主；资料中的 Neo-G、MiniMax 和积分数不作为幻域真实服务能力。
// prompt 受控更新，生成入口独立于输入禁用，未接生成时仍允许编辑并保存草稿。
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import { CanvasChip, CanvasIcon, IconButton, SegmentedControl } from "./components";
import type { CanvasData } from "../canvas-model";

interface PanelProps {
  data: CanvasData;
  onChange: (patch: Partial<CanvasData>) => void;
  onToggle: () => void;
  onSubmit?: () => void;
  busy?: boolean;
  model?: string;
}

// 图片比例是本地节点参数，选择它不会提交生成任务，也不改其他节点的面板。
// 这像打开当前抽屉的小隔层：关闭只收回隔层，不能把整张卡片或画布一起关掉。
function ImageRatioPicker({ ratio, disabled, onChange }: { ratio: string; disabled?: boolean; onChange: (ratio: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popupId = useId();
  // useId 只关联按钮与浮层，不写进作品；多个图片节点同时存在也不会重复 DOM id。
  // 浮层开合属于当前实例的短暂 UI 状态，不能进入保存文档或作品撤销栈。
  // 只在展开期间监听外部点击；切换节点或卸载时由 effect 释放这份订阅。
  // 外部点击保留用户刚点中的焦点，只有 Escape 和选完比例才返回触发器。
  useEffect(() => {
    if (!open) return;
    host.current?.querySelector<HTMLElement>("[aria-pressed=true]")?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !host.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  // Escape 由最内层浮层消费；否则捕获阶段的画布取消会先于这里改变选择和焦点。
  // 选择后先通知宿主参数更新，再关闭本层；没有对媒体文件或模型服务的副作用。
  return <div ref={host} data-canvas-popover={open ? "" : undefined} onKeyDown={event => {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault(); event.stopPropagation(); close();
  }}>
    <CanvasChip ref={trigger} icon="crop" disabled={disabled} expanded={open} controls={open ? popupId : undefined} onClick={() => setOpen(value => !value)}>{t("canvas.ratio")}·{ratio.replace("/", ":")}</CanvasChip>
    {open && <div id={popupId} className="hy-ratio-popup"><SegmentedControl label={t("canvas.ratio")} items={["1/1", "16/9", "9/16", "4/3"].map(id => ({ id, label: id.replace("/", ":") }))} value={ratio} onChange={value => { onChange(value); close(); }} /></div>}
  </div>;
}

export function GenerationPanel({ data, onChange, onToggle, onSubmit, busy, model }: PanelProps) {
  // 四类面板只共用展示壳，视频模式和音频模式分别使用自己的稳定选项集合。
  // 切模式只是保存意图，不代表该模式的服务已可用；生成仍由 onSubmit 是否接通决定。
  const { t } = useTranslation();
  const { kind, prompt, mode = kind === "audio" ? "voice" : "text" } = data;
  const videoModes = [{ id: "text", label: t("canvas.modeTextVideo") }, { id: "reference", label: t("canvas.modeReference") }, { id: "edit", label: t("canvas.modeEdit") }, { id: "extend", label: t("canvas.modeExtend") }, { id: "motion", label: t("canvas.modeMotion") }];
  const audioModes = [{ id: "voice", label: t("canvas.modeVoice") }, { id: "music", label: t("canvas.modeMusic") }, { id: "record", label: t("canvas.modeRecord") }];
  const disabledChip = (label: string) => <CanvasChip key={label} disabled reason={t("canvas.unavailable")}>{label}</CanvasChip>;
  const submit = () => { if (prompt.trim() && !busy && onSubmit) onSubmit(); };
  // Shift+Enter 在输入法尚未结束组词时不能提交，否则候选词确认会误触发任务。
  // 空白提示词、忙碌和缺少业务回调都在动作入口二次守住，不能只依赖按钮置灰。
  return <section className={`hy-generation-panel hy-panel-${kind} nodrag nopan nowheel`} aria-label={t("canvas.settings")} onKeyDown={event => { if (event.key === "Enter" && event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }}>
    <IconButton icon="expand" label={t("canvas.collapse")} className="hy-panel-expand" onClick={onToggle} />
    {kind === "text" || kind === "image" ? <><button type="button" aria-label={t("canvas.reference")} className="hy-reference-add" disabled title={t("canvas.unavailable")}><CanvasIcon name="plus" size={18} /></button><div className="hy-panel-tools">{kind === "text" ? disabledChip(t("canvas.quickPrompts")) : <>{disabledChip(t("canvas.styleTransfer"))}{disabledChip(t("canvas.palette"))}</>}</div></> : <div className="hy-panel-tabs"><SegmentedControl items={kind === "video" ? videoModes : audioModes} value={mode} onChange={value => onChange({ mode: value })} label={t("canvas.generationMode")} />{kind === "video" && disabledChip(t("canvas.camera"))}</div>}
    <textarea aria-label={t("canvas.prompt")} value={prompt} maxLength={4000} disabled={busy} onChange={event => onChange({ prompt: event.target.value })} placeholder={t(kind === "text" ? "canvas.promptText" : kind === "image" ? "canvas.promptImage" : kind === "video" ? "canvas.promptVideo" : "canvas.promptAudio")} />
    <div className="hy-panel-footer"><div className="hy-panel-options">
      {disabledChip(model || t("canvas.model"))}
      {kind === "image" && <><ImageRatioPicker ratio={data.ratio} disabled={busy} onChange={ratio => onChange({ ratio })} />{disabledChip(t("canvas.countOne"))}</>}
      {kind === "video" && disabledChip(t("canvas.videoSettings"))}
      {kind === "audio" && <>{disabledChip(t("canvas.voice"))}{disabledChip(t("canvas.neutral"))}{disabledChip(t("canvas.parameters"))}{disabledChip(t("canvas.polyphone"))}</>}
    </div><div className="hy-panel-submit">{kind === "image" && disabledChip(t("canvas.batch"))}<span className="hy-cost" title={t("canvas.unavailable")}>—</span><button type="button" className="hy-submit" aria-label={t("canvas.generate")} title={onSubmit ? t("canvas.generate") : t("canvas.unavailable")} disabled={!prompt.trim() || !onSubmit || busy} onClick={submit}><CanvasIcon name={busy ? "history" : "arrow"} size={18} /></button></div></div>
  </section>;
}
