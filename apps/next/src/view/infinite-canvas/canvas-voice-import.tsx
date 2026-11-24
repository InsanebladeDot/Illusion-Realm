"use client";

/** 音色导入表单使用画布浮层，保存后由原菜单重新读取磁盘。 */
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { canvasVoiceRequestSchema } from "@illusion-realm/shared/schemas/canvas-voice.schema";
import { useTranslation } from "@/i18n";
import { useToastStore } from "@/stores/useToastStore";
import { unwrapIpc } from "@/utils/ipcResult";
import { CanvasOverlay } from "./canvas-overlay";
import { CanvasChip } from "./reference-ui/components";
import styles from "./canvas.module.css";

interface Props {
  returnFocus: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSaved: () => void;
}

const IMPORT_ERRORS = {
  "voice-already-exists": "canvas.gptSovits.voiceAlreadyExists",
  "voice-invalid-file": "canvas.gptSovits.voiceInvalidFile",
} as const;

function importErrorKey(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "voice-already-exists") return IMPORT_ERRORS[message];
  if (message === "voice-invalid-file") return IMPORT_ERRORS[message];
  return "canvas.gptSovits.voiceSaveFailed";
}

export function CanvasVoiceImport({ returnFocus, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  const pending = useRef(false);
  const show = useToastStore.getState().show;
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const result = canvasVoiceRequestSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!result.success) { show(t("canvas.gptSovits.voiceInvalidFields"), "error"); return; }
    pending.current = true;
    setBusy(true);
    try {
      // 系统文件框取消时保留输入，重试不用再填角色和台词。
      const voice = unwrapIpc(await window.electronAPI!.canvasAddReferenceVoice(result.data));
      if (!active.current || !voice) return;
      show(t("canvas.gptSovits.voiceSaved", { name: voice.role, tone: voice.tone }), "success");
      onSaved();
    } catch (error) {
      if (active.current) show(t(importErrorKey(error)), "error");
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }

  const title = t("canvas.gptSovits.addVoice");
  return <CanvasOverlay label={title} returnFocus={returnFocus} onClose={() => { if (!pending.current) onClose(); }}>
    {/* 画布音色导入：使用相同的小表单、确认和取消样式。 */}
    <form className={`${styles.dialog} max-w-[calc(100vw-3rem)]`} data-canvas-voice-import onSubmit={event => { void submit(event); }}>
      <h2>{title}</h2>
      <div className="grid gap-3 text-sm">
        <label className="grid gap-1">{t("canvas.gptSovits.voiceRole")}<input name="role" maxLength={60} required disabled={busy} /></label>
        <label className="grid gap-1">{t("canvas.gptSovits.voiceTone")}<input name="tone" maxLength={60} required disabled={busy} /></label>
        <label className="grid gap-1">{t("canvas.gptSovits.transcript")}<input name="transcript" maxLength={80} required disabled={busy} /></label>
      </div>
      <footer>
        <CanvasChip disabled={busy} onClick={onClose}>{t("canvas.cancel")}</CanvasChip>
        <button className="hy-chip" type="submit" disabled={busy}>{t(busy ? "common.loading" : "canvas.gptSovits.chooseVoiceFile")}</button>
      </footer>
    </form>
  </CanvasOverlay>;
}
