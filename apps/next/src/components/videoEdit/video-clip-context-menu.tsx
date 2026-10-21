"use client";

/** 界面：「区间右键菜单」。所有入口只传区间 ID 与操作回调，速度面板和菜单读取同一份效果。 */
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
const BUTTON = "flex w-full items-center justify-between gap-2 rounded px-2 py-2 text-left text-xs hover:bg-muted focus-visible:bg-muted disabled:opacity-40";
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

function ClipMenuActions(props: VideoClipContextMenuProps) {
  const { t } = useTranslation();
  const effects = getClipEffects(props.clip);
  const run = (action: () => void) => { action(); props.onClose(); };
  return <>
    <button type="button" className={BUTTON} onClick={() => props.onChange({ volume: Math.min(4, Math.round((effects.volume + 0.1) * 10) / 10) })}>{t("toolBox.video.clipMenu.volumeUp")}<span>+10%</span></button>
    <button type="button" className={BUTTON} onClick={() => props.onChange({ volume: Math.max(0, Math.round((effects.volume - 0.1) * 10) / 10) })}>{t("toolBox.video.clipMenu.volumeDown")}<span>−10%</span></button>
    <button type="button" aria-pressed={effects.muted} className={BUTTON} onClick={() => props.onChange({ muted: !effects.muted })}>{t("toolBox.video.clipMenu.mute")}<span>{effects.muted ? "✓" : ""}</span></button>
    <button type="button" aria-pressed={effects.reverse} className={BUTTON} onClick={() => props.onChange({ reverse: !effects.reverse })}>{t("toolBox.video.clipMenu.reverse")}<span>{effects.reverse ? "✓" : ""}</span></button>
    <div className="my-1 border-t border-border" />
    <button type="button" className={BUTTON} disabled={!canSplitClip(props.clip, props.position.time)} onClick={() => run(props.onSplit)}>{t("toolBox.video.clipMenu.split")}</button>
    <button type="button" className={BUTTON} onClick={() => run(props.onCopy)}>{t("toolBox.video.clipMenu.copy")}</button>
    <button type="button" className={BUTTON} disabled={!props.canPaste} onClick={() => run(props.onPaste)}>{t("toolBox.video.clipMenu.paste")}</button>
    <button type="button" className={`${BUTTON} text-destructive`} onClick={() => run(props.onDelete)}>{t("toolBox.video.clipMenu.delete")}</button>
  </>;
}

export function VideoClipContextMenu(props: VideoClipContextMenuProps) {
  const { t } = useTranslation();
  return <ContextMenuShell role="dialog" x={props.position.x} y={props.position.y} label={t("toolBox.video.clipMenu.title")} onClose={props.onClose}>
    <div data-video-clip-menu>
      <p className="truncate border-b border-border px-2 pb-2 text-xs font-medium" title={props.clip.name}>{props.clip.name}</p>
      <EffectControls clip={props.clip} onChange={props.onChange} />
      <ClipMenuActions {...props} />
      <p className="px-2 pt-2 text-[11px] leading-relaxed text-muted-foreground">{t("toolBox.video.clipMenu.previewHint")}</p>
    </div>
  </ContextMenuShell>;
}
