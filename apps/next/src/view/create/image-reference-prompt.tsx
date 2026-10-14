"use client";

// 引用装饰只影响显示；图片预览直接使用全局图库预览，输入值始终是纯文本。
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ImagePreviewOverlay } from "@/components/ImagePreviewOverlay";
import { decorateImageReferences, editorSelectionOffset, restoreEditorOffset, insertEditorPlainText } from "@/utils/image-prompt-references";
import { INPUT_BORDER_CLASS, PROMPT_EDITOR_SCROLL_CLASS } from "@/utils/layout";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";
import type { PromptReferenceMedia } from "@/utils/prompt-media-references";
import { usePromptMediaMentions } from "./use-prompt-media-mentions";
import { PromptMediaMenu } from "./prompt-media-menu";

const EMPTY_MEDIA: readonly PromptReferenceMedia[] = [];
interface Props { value: string; onChange: (value: string) => void; images: (string | null)[]; media?: readonly PromptReferenceMedia[]; disabled: boolean }
/** 自己维护纯文本撤销栈，避免装饰 DOM 后浏览器的撤销栈引用失效节点。 */
function usePromptHistory(value: string, onChange: Props["onChange"]) {
  const history = useRef([value]);
  const cursor = useRef(0);
  const save = (text: string) => {
    if (text !== history.current[cursor.current]) {
      history.current = history.current.slice(0, cursor.current + 1).concat(text).slice(-100);
      cursor.current = history.current.length - 1;
    }
    onChange(text);
  };
  const undo = (redo: boolean) => {
    cursor.current = Math.max(0, Math.min(history.current.length - 1, cursor.current + (redo ? 1 : -1)));
    onChange(history.current[cursor.current]);
  };
  return { save, undo };
}
function decorateEditor(root: HTMLElement, text: string, images: Props["images"], missing: string, media: readonly PromptReferenceMedia[]) {
  const offset = editorSelectionOffset(root);
  decorateImageReferences(root, text, images, missing, media);
  if (offset !== null) restoreEditorOffset(root, offset);
}
/** 中文组词时不碰 DOM；结束后再装饰，光标按纯文本位置恢复。 */
function useReferenceEditing({ value, onChange, images, media = EMPTY_MEDIA }: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const { save, undo } = usePromptHistory(value, onChange);
  useEffect(() => {
    if (!ref.current || composing.current) return;
    decorateEditor(ref.current, value, images, t("create.videoSettings.referenceMissing"), media);
  }, [value, images, media, t]);
  const commit = () => {
    const text = ref.current?.textContent ?? "";
    save(text);
    if (ref.current) decorateEditor(ref.current, text, images, t("create.videoSettings.referenceMissing"), media);
  };
  const insert = (text: string) => {
    if (ref.current) { insertEditorPlainText(ref.current, text); commit(); }
  };
  const setComposing = (enabled: boolean) => { composing.current = enabled; if (!enabled) commit(); };
  return { ref, composing, commit, insert, undo, save, setComposing };
}
function replaceMention(editor: ReturnType<typeof useReferenceEditing>, props: Props, start: number, end: number, token: string, missing: string) {
  const root = editor.ref.current;
  if (!root) return;
  const text = root.textContent ?? "";
  const next = text.slice(0, start) + token + text.slice(end);
  root.focus();
  decorateImageReferences(root, next, props.images, missing, props.media ?? EMPTY_MEDIA);
  restoreEditorOffset(root, start + token.length);
  editor.save(next);
}
function handleEditorKey(event: KeyboardEvent<HTMLDivElement>, editor: ReturnType<typeof useReferenceEditing>, open: (target: EventTarget | null) => void) {
  if (event.key === "Enter" && event.target instanceof HTMLElement && event.target.dataset.imageReference) {
    event.preventDefault(); open(event.target); return;
  }
  if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) {
    event.preventDefault(); editor.undo(event.shiftKey || event.key.toLowerCase() === "y"); return;
  }
  if (event.key === "Enter" && !editor.composing.current) { event.preventDefault(); editor.insert("\n"); }
}
export function ImageReferencePrompt(props: Props) {
  const { t } = useTranslation();
  const editor = useReferenceEditing(props);
  const { ref, composing, commit } = editor;
  const { images, disabled } = props;
  const mentions = usePromptMediaMentions({ ref, media: props.media ?? EMPTY_MEDIA, disabled,
    replace: (start, end, text) => replaceMention(editor, props, start, end, text, t("create.videoSettings.referenceMissing")) });
  const [preview, setPreview] = useState<number | null>(null);
  const openReference = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return;
    const number = Number(target.closest<HTMLElement>("[data-image-reference]")?.dataset.imageReference);
    if (images[number - 1]) setPreview(number - 1);
  };
  return <>
    <div ref={ref} role="textbox" aria-multiline="true" aria-label={t("create.videoCreatePanel.prompt")} data-video-prompt contentEditable={!disabled} suppressContentEditableWarning
      aria-autocomplete="list" aria-controls={mentions.state ? mentions.id : undefined} aria-activedescendant={mentions.state && mentions.items.length ? `${mentions.id}-${mentions.active}` : undefined}
      data-placeholder={t("create.videoCreatePanel.promptPlaceholder")}
      className={cn("min-h-[100px] w-full whitespace-pre-wrap break-words rounded-md bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]", PROMPT_EDITOR_SCROLL_CLASS, INPUT_BORDER_CLASS)}
      onInput={() => { if (!composing.current) { commit(); mentions.update(); } }}
      onCompositionStart={() => { editor.setComposing(true); mentions.close(); }} onCompositionEnd={() => { editor.setComposing(false); mentions.update(); }}
      onClick={(event) => { openReference(event.target); mentions.update(); }} onBlur={() => mentions.close()}
      onPaste={(event) => { event.preventDefault(); editor.insert(event.clipboardData.getData("text/plain")); mentions.update(); }}
      onKeyUp={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) && !composing.current) mentions.update(); }}
      onKeyDown={(event) => {
        if (composing.current || event.nativeEvent.isComposing) return;
        if (!mentions.onKeyDown(event)) { if ((event.ctrlKey || event.metaKey) || event.key === "Enter") mentions.close(); handleEditorKey(event, editor, openReference); }
      }} />
    {/* 浮层：只搜索当前任务传入的素材；选择结果插入光标处并纳入撤销历史 */}
    {mentions.state && !disabled && <PromptMediaMenu id={mentions.id} position={mentions.state.position} items={mentions.items} active={mentions.active} onSelect={mentions.choose} />}
    {/* 弹窗：直接复用图片显示区的缩放、翻页和关闭功能 */}
    {preview !== null && <ImagePreviewOverlay open items={images.flatMap((src, index) => src ? [{ key: String(index), src }] : [])} index={images.slice(0, preview).filter(Boolean).length}
      onIndexChange={(index) => { const indices = images.flatMap((src, original) => src ? [original] : []); setPreview(indices[index]); }} onOpenChange={(open) => { if (!open) setPreview(null); }} seedSrc={images[preview]} />}
  </>;
}
