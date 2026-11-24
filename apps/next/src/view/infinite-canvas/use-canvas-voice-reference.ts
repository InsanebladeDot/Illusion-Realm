"use client";

/** 音色选用走原工程导入，完成后只更新发起操作的音频节点。 */
import { useLayoutEffect, useRef } from "react";
import type { CanvasReferenceVoice } from "@illusion-realm/shared";
import { unwrapIpc } from "@/utils/ipcResult";
import { t } from "@/i18n";
import type { useCanvasEditor } from "./use-canvas-editor";

type Editor = ReturnType<typeof useCanvasEditor>;

function acceptsVoice(editor: Editor, id: string) {
  const node = editor.nodes.find(item => item.id === id && item.data.kind === "audio");
  if (!node || !editor.persistence.editable) return undefined;
  const audioSources = new Set(editor.nodes.filter(item => item.data.kind === "audio").map(item => item.id));
  return editor.edges.some(edge => edge.target === id && audioSources.has(edge.source)) ? undefined : node;
}

export function useCanvasVoiceReference(editor: Editor, generating: (id: string) => boolean) {
  const latest = useRef<{ editor: Editor; generating: typeof generating } | null>(null);
  useLayoutEffect(() => {
    latest.current = { editor, generating };
    return () => { latest.current = null; };
  }, [editor, generating]);

  return async (id: string, voice: CanvasReferenceVoice) => {
    const node = acceptsVoice(editor, id);
    if (!node || generating(id)) throw Error("VOICE_REFERENCE_CONFLICT");
    const result = unwrapIpc(await window.electronAPI!.canvasImportMedia({ name: editor.name, workspace: editor.workspace, files: [voice.media], mode: "copy" }));
    const current = latest.current;
    if (!current) return;
    const target = acceptsVoice(current.editor, id);
    const media = result.media[0];
    // 导入像给收件人送一份副本，换卡或新连线后只认发起时的节点和参考槽。
    if (!target || current.generating(id) || target.data.audioParameters?.reference !== node.data.audioParameters?.reference) throw Error("VOICE_REFERENCE_CONFLICT");
    if (!media) throw Error(t("canvas.gptSovits.voicesUnavailable"));
    const stem = voice.media.name.replace(/\.[^.]+$/, "");
    // 只把带语句的文件名当作原台词，原始素材编号留空以免误读进模型。
    const transcript = voice.custom ? stem.replace(/^＿(?=\.|(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])\s*(?:\.|$))/iu, "")
      : /^audio[_-]|^[\d_. -]+$/i.test(stem) ? "" : stem.slice(0, 4000);
    // 两个引擎共用参考槽，先保存对应台词，之后切换到 GPT-SoVITS 也能直接使用。
    const audio = target.data.audioParameters;
    current.editor.setWorkspace(result.workspace);
    current.editor.updateNodeData(id, { audioParameters: { ...audio, reference: media, gptSovits: { ...audio?.gptSovits, transcript, referenceLanguage: "auto" } } });
    current.editor.notify(t("canvas.gptSovits.voiceSelected", { name: voice.role, tone: voice.tone }), "success");
  };
}
