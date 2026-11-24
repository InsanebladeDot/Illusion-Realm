"use client";

/** 页脚音色入口复用原级联菜单，预听不改变节点当前参考。 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, Pause, Play, Plus } from "lucide-react";
import { createPortal } from "react-dom";
import { CanvasVoiceImport } from "./canvas-voice-import";
import { CascadeMenu, type CascadeMenuItem } from "@/components/cascade-menu";
import { useTranslation } from "@/i18n";
import { useToastStore } from "@/stores/useToastStore";
import { buildLocalFileUrl } from "@/utils/localFileUrl";
import { unwrapIpc } from "@/utils/ipcResult";
import type { CanvasReferenceVoice } from "@illusion-realm/shared";
import { useCanvasEditorActions } from "./canvas-editor-context";
import { CanvasChip } from "./reference-ui/components";

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const group = groups.get(id);
    if (group) group.push(row);
    else groups.set(id, [row]);
  }
  return groups;
}

function buildVoiceItems(voices: CanvasReferenceVoice[], customLabel: string, clip: (voice: CanvasReferenceVoice) => CascadeMenuItem) {
  // 相同角色名在不同来源下各自分组，语气列表只读该角色的录音。
  return [...groupBy(voices, row => JSON.stringify([row.custom, row.source, row.role]))].map(([id, rows]) => ({
    id, label: rows[0].role, summary: rows[0].custom ? customLabel
      : voices.some(row => row.role === rows[0].role && (row.custom || row.source !== rows[0].source)) ? rows[0].source : undefined,
    children: [...groupBy(rows, row => row.tone)].map(([tone, clips]) => ({ id: tone, label: tone, children: clips.map(clip) })),
  }));
}

function useVoiceCatalog() {
  const [voices, setVoices] = useState<CanvasReferenceVoice[] | null>();
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const list = unwrapIpc(await window.electronAPI!.canvasReferenceVoices());
        if (active) setVoices(list);
      } catch { if (active) setVoices(null); }
    }
    void load();
    return () => { active = false; };
  }, []);
  return voices;
}

function useVoicePreview(onError: () => void) {
  const player = useRef<HTMLAudioElement>(null);
  const request = useRef(0);
  const [playing, setPlaying] = useState<string | null>(null);
  async function toggle(path: string) {
    const audio = player.current, url = buildLocalFileUrl(path);
    if (!audio || !url) return;
    const id = ++request.current;
    if (playing === path) { audio.pause(); setPlaying(null); return; }
    audio.src = url;
    setPlaying(path);
    try { await audio.play(); }
    catch { if (id === request.current && audio.isConnected) { setPlaying(null); onError(); } }
  }
  // 试听用一个播放器。切换录音时浏览器会停止上一条，关闭菜单释放媒体源。
  const audioRef = useCallback((element: HTMLAudioElement | null) => {
    if (!element) return;
    player.current = element;
    return () => {
      request.current++;
      element.pause();
      element.removeAttribute("src");
      element.load();
      player.current = null;
    };
  }, []);
  return { playing, toggle, audioRef, ended: () => setPlaying(null) };
}

export function CanvasReferenceVoicePicker({ nodeId, disabled, current }: { nodeId: string; disabled?: boolean; current?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [importHost, setImportHost] = useState<HTMLElement | null>(null);

  function openImport() {
    const host = anchor.current?.closest<HTMLElement>("[data-infinite-canvas]");
    if (!host) return;
    returnFocus.current = anchor.current?.querySelector("button") ?? null;
    setOpen(false);
    setImportHost(host);
  }

  return <div ref={anchor} data-canvas-voice>
    {/* 节点页脚：音色紧跟工作流，选中的录音继续显示在原附件区。 */}
    <CanvasChip expanded={open && !disabled} disabled={disabled} onClick={() => setOpen(value => !value)}><span className="inline-flex items-center gap-1"><AudioLines size={13} />{t("canvas.gptSovits.voice")}</span></CanvasChip>
    {open && !disabled && <VoiceMenu nodeId={nodeId} anchor={anchor} current={current} onAdd={openImport} onClose={() => setOpen(false)} />}
    {importHost && createPortal(<CanvasVoiceImport returnFocus={returnFocus} onClose={() => setImportHost(null)}
      onSaved={() => { setImportHost(null); setOpen(true); }} />, importHost)}
  </div>;
}

function VoiceMenu({ nodeId, anchor, current, onClose, onAdd }: { nodeId: string; anchor: React.RefObject<HTMLDivElement | null>; current?: string; onClose: () => void; onAdd: () => void }) {
  const { t } = useTranslation();
  const actions = useCanvasEditorActions();
  const voices = useVoiceCatalog();
  const notify = useToastStore.getState().show;
  const pending = useRef(false);
  const { playing, toggle, audioRef, ended } = useVoicePreview(() => notify(t("canvas.gptSovits.previewFailed"), "error"));

  async function choose(voice: CanvasReferenceVoice) {
    if (pending.current) return;
    pending.current = true;
    try { await actions.useReferenceVoice(nodeId, voice); onClose(); }
    catch (error) {
      // 节点已关闭时，异步失败不能在下一页弹出。
      if (!anchor.current?.isConnected) return;
      notify(t(error instanceof Error && error.message === "VOICE_REFERENCE_CONFLICT"
        ? "canvas.gptSovits.voiceConflict" : "canvas.gptSovits.voiceImportFailed"), "error");
    }
    finally { pending.current = false; }
  }

  const items: CascadeMenuItem[] = [
    { id: "add-voice", label: t("canvas.gptSovits.addVoice"), icon: Plus, action: onAdd },
    ...buildVoiceItems(voices ?? [], t("canvas.gptSovits.customVoice"), voice => ({ id: voice.media.path, label: voice.media.name, selected: current === voice.media.name,
      action: () => { void choose(voice); }, trailing: <PreviewButton active={playing === voice.media.path} onClick={() => { void toggle(voice.media.path); }} /> })),
  ];
  const status = voices === undefined ? t("common.loading") : voices === null ? t("canvas.gptSovits.voicesUnavailable") : !voices.length ? t("canvas.gptSovits.voicesEmpty") : "";
  return <>
    <audio ref={audioRef} onEnded={ended} preload="none" data-gsv-voice-preview />
    <CascadeMenu anchor={anchor} items={items} label={t("canvas.gptSovits.voice")} appearance="compact" cascadeRight equalHeight firstSubmenuWidthRatio={0.5}
      backLabel={t("create.promptAssistant.back")} attributes={{ "data-canvas-voice-menu": true, "data-canvas-theme": true }} onClose={onClose}
      footer={status && <p role="status" className="px-2.5 py-2 text-xs text-muted-foreground">{status}</p>} />
  </>;
}

function PreviewButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  return <button type="button" data-gsv-voice-play aria-pressed={active} aria-label={t(active ? "canvas.gptSovits.pausePreview" : "canvas.gptSovits.playPreview")}
    onClick={onClick} className="relative grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
    <Play size={13} aria-hidden className={`absolute motion-safe:transition-all ${active ? "scale-75 opacity-0" : "scale-100 opacity-100"}`} />
    <Pause size={13} aria-hidden className={`absolute motion-safe:transition-all ${active ? "scale-100 opacity-100" : "scale-75 opacity-0"}`} />
  </button>;
}
