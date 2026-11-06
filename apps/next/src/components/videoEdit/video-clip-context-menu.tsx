"use client";

/** 界面：「区间右键菜单」。所有入口只传区间 ID 与操作回调，速度面板和菜单读取同一份效果。 */
import { ContextMenuItem, ContextMenuSeparator, ContextMenuCaption } from "@/components/context-menu-item";
import { Volume2, VolumeX, RotateCcw, Scissors, Copy, ClipboardPaste, Trash2 } from "lucide-react";
import { ContextMenuShell } from "@/components/context-menu-shell";
import { useTranslation } from "@/i18n";
import type { ClipItem } from "./types";
import type { VideoClipEffects } from "@/types/electron-api";
import { canSplitClip, getClipEffects } from "@/utils/video/clip-effects";
import { SPEED_PRESETS } from "@/view/toolBox/Tool/video/components/SpeedPanel";
import { useState } from "react";

export interface ClipMenuPosition { id: string; x: number; y: number; time: number }
interface VideoClipContextMenuProps {
  clip: ClipItem; position: ClipMenuPosition; canPaste: boolean;
  onChange: (effects: VideoClipEffects) => void; onSplit: () => void;
  onCopy: () => void; onPaste: () => void; onDelete: () => void; onClose: () => void;
}
const INPUT = "h-8 w-20 rounded border border-border bg-background px-2 text-right text-xs";

/** 输入中允许暂时留空或输入小数点；只有完整且合法的数字才写入剪辑数据。 */
function EffectNumber({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState({ base: value, text: String(value) });
  return <input aria-label={label} type="number" min={min} max={max} step={step}
    value={draft.base === value ? draft.text : String(value)} className={INPUT}
    onBlur={() => setDraft({ base: value, text: String(value) })}
    onChange={event => {
      const text = event.target.value, next = Number(text);
      setDraft({ base: value, text });
      if (text.trim() && Number.isFinite(next) && next >= min && next <= max) onChange(next);
    }} />;
}

function EffectControls({ clip, onChange }: Pick<VideoClipContextMenuProps, "clip" | "onChange">) {
  const { t } = useTranslation();
  const effects = getClipEffects(clip);
  return <div className="space-y-2 border-b border-border p-2 pb-3">
    <label className="flex items-center justify-between gap-2 text-xs">{t("toolBox.video.clipMenu.speed")}
      <EffectNumber label={t("toolBox.video.clipMenu.speed")} min={0.1} max={16} step={0.1} value={effects.speed} onChange={speed => onChange({ speed })} />
    </label>
    <div className="flex flex-wrap gap-1">{SPEED_PRESETS.map(speed => <button key={speed} type="button" aria-pressed={effects.speed === speed}
      onClick={() => onChange({ speed })} className={`rounded px-1.5 py-1 text-[11px] ${effects.speed === speed ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{speed}×</button>)}</div>
    <label className="flex items-center justify-between gap-2 text-xs">{t("toolBox.video.clipMenu.volume")}
      <EffectNumber label={t("toolBox.video.clipMenu.volume")} min={0} max={400} step={10} value={Math.round(effects.volume * 100)} onChange={volume => onChange({ volume: volume / 100 })} />
    </label>
    <input aria-label={t("toolBox.video.clipMenu.volumeSlider")} type="range" min={0} max={400} step={10} value={Math.round(effects.volume * 100)}
      onChange={event => onChange({ volume: Number(event.target.value) / 100 })} className="w-full accent-primary" />
  </div>;
}

// 旧区间使用源时间与效果对象，新时间线使用工程帧安排，二者只共享操作行。
// 不能因为外观统一就把原有切分或倒放接到尚未支持这些能力的新工程。
// 效果调整onChange继续立即作用于当前旧区间，菜单保留以便连续调整。
// run只包装复制、粘贴、切分和删除，这些动作执行后沿用原来的关闭行为。
// 音量数据单位是一倍，显示尾部的百分数只说明这次步长。
// 增大先按十分位取整再限到4，避免多次点击累计出4.0000001。
// 减小最低为零，不产生负音量；这不等同把muted标记打开。
// 静音只改变muted，保留volume，以便取消静音后恢复之前音量。
// 倒放只翻转reverse，保留speed，不能用负数速度冒充反向播放。
// aria-pressed继续描述静音和倒放的实际效果状态，不让复用丢失开关信息。
// 勾号走尾部插槽，与标题分开，长翻译仍给状态标记保留空间。
// 切分可用性仍由canSplitClip检查源边界，公共行不猜当前鼠标时间。
// position.time来自打开菜单的落点，不能在重渲染时改成播放器currentTime。
// 剪贴板是否可用由原工具传入canPaste，统一组件不会创建全局剪贴板。
// 删除仍为原区间删除，不调用新时间线的applyTimelineEdit。
// 片段名称移到公共底部说明后，顶部数值表单的控件顺序不变。
// 表单保留自己的输入样式，不把滑条也伪装成菜单操作行。
// 在输入小数时草稿由EffectNumber持有，ContextMenuItem不会接管数值校正。
// 整个容器保留dialog语义，因为这里同时存在输入框、滑条和操作按钮。
// 外壳的内部滚动不触发关闭，短窗口仍可访问底部删除项。
// previewHint留作悬停说明，不再用独立大段说明挤占操作列表高度。
// 文件名保持用户原值，不从它解析效果或选择要删的区间。
// 无音轨时的实际输出处理仍在FFmpeg业务层，不因为出现音量菜单就伪造音轨。
// 本组件不发IPC，不拉取源文件，不在渲染阶段启动任何导出。
// 异步导出失败仍由原页面捕获；菜单关闭不等于文件已成功写入。
// 共享行的原生disabled同时限制点击与键盘，切分禁用不是单纯降低透明度。
function ClipMenuActions(props: VideoClipContextMenuProps) {
  const { t } = useTranslation();
  const effects = getClipEffects(props.clip);
  const run = (action: () => void) => { action(); props.onClose(); };
  return <>
    {/* 操作行：与创建图片菜单共用视觉，效果调整仍保留旧业务的即时回调。 */}
    <ContextMenuItem icon={Volume2} label={t("toolBox.video.clipMenu.volumeUp")} onClick={() => props.onChange({ volume: Math.min(4, Math.round((effects.volume + 0.1) * 10) / 10) })}>+10%</ContextMenuItem>
    <ContextMenuItem icon={Volume2} label={t("toolBox.video.clipMenu.volumeDown")} onClick={() => props.onChange({ volume: Math.max(0, Math.round((effects.volume - 0.1) * 10) / 10) })}>−10%</ContextMenuItem>
    <ContextMenuItem icon={VolumeX} label={t("toolBox.video.clipMenu.mute")} aria-pressed={effects.muted} onClick={() => props.onChange({ muted: !effects.muted })}>{effects.muted ? "✓" : ""}</ContextMenuItem>
    <ContextMenuItem icon={RotateCcw} label={t("toolBox.video.clipMenu.reverse")} aria-pressed={effects.reverse} onClick={() => props.onChange({ reverse: !effects.reverse })}>{effects.reverse ? "✓" : ""}</ContextMenuItem>
    <ContextMenuSeparator />
    <ContextMenuItem icon={Scissors} label={t("toolBox.video.clipMenu.split")} disabled={!canSplitClip(props.clip, props.position.time)} onClick={() => run(props.onSplit)} />
    <ContextMenuItem icon={Copy} label={t("toolBox.video.clipMenu.copy")} onClick={() => run(props.onCopy)} />
    <ContextMenuItem icon={ClipboardPaste} label={t("toolBox.video.clipMenu.paste")} disabled={!props.canPaste} onClick={() => run(props.onPaste)} />
    <ContextMenuItem icon={Trash2} destructive label={t("toolBox.video.clipMenu.delete")} onClick={() => run(props.onDelete)} />
  </>;
}

export function VideoClipContextMenu(props: VideoClipContextMenuProps) {
  const { t } = useTranslation();
  return <ContextMenuShell role="dialog" x={props.position.x} y={props.position.y} label={t("toolBox.video.clipMenu.title")} onClose={props.onClose} className="w-64 py-1">
    <div data-video-clip-menu>
      <EffectControls clip={props.clip} onChange={props.onChange} />
      <ClipMenuActions {...props} />
      <div title={t("toolBox.video.clipMenu.previewHint")}><ContextMenuCaption>{props.clip.name}</ContextMenuCaption></div>
    </div>
  </ContextMenuShell>;
}
