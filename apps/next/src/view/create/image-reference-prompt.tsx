"use client";

// 引用装饰只影响显示；图片预览直接使用全局图库预览，输入值始终是纯文本。
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ImagePreviewOverlay } from "@/components/ImagePreviewOverlay";
import { decorateImageReferences, editorSelectionOffset, restoreEditorOffset, insertEditorPlainText } from "@/utils/image-prompt-references";
import { INPUT_BORDER_CLASS, PROMPT_EDITOR_SCROLL_CLASS } from "@/utils/layout";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";
// 同一编辑面服务视频与音频，差异只通过类型、标签和工具条开关注入。
// 原有图片预览仅在传入图片时生效，音频入口无需创建假的图片资源。
// 不把生成、上传或草稿所有权搬到共享编辑器。
import type { PromptMediaKind, PromptReferenceMedia } from "@/utils/prompt-media-references";
import { PromptAssistantToolbar } from "@/components/prompt-assistant/prompt-assistant-toolbar";
import { usePromptMediaMentions } from "./use-prompt-media-mentions";
import { PromptMediaMenu } from "./prompt-media-menu";

const EMPTY_MEDIA: readonly PromptReferenceMedia[] = [];
// id/label/placeholder 保留各表单真实语义，audio-prompt 仍关联音频标签。
// kinds 是引用类别边界，不代表浏览器 file input 的 accept 配置。
// assistant 按调用方启用：音频保留原有复制翻译能力，旧视频默认不增加工具条。
// readonly 素材只用于展示，组件不拥有也不释放上传 File 的生命周期。
// 缺省参数保持已有视频行为，其他调用处无需复制一套兼容组件。
interface Props { value: string; onChange: (value: string) => void; images: (string | null)[]; media?: readonly PromptReferenceMedia[]; disabled: boolean; id?: string; label?: string; placeholder?: string; kinds?: readonly PromptMediaKind[]; assistant?: boolean }
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
    // 音频范围向下传到统一补全 hook，搜索与分类都遵守它。
    // 未传值时由 hook 保留视频三类默认，不从 images 是否为空猜模式。
    // 不修改原始 media，因此只读预览仍可核对同一份素材身份。
    kinds: props.kinds,
    replace: (start, end, text) => replaceMention(editor, props, start, end, text, t("create.videoSettings.referenceMissing")) });
  const [preview, setPreview] = useState<number | null>(null);
  const openReference = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return;
    const number = Number(target.closest<HTMLElement>("[data-image-reference]")?.dataset.imageReference);
    if (images[number - 1]) setPreview(number - 1);
  };
  return <>
    {/* 界面：共用的视频/音频引用输入，工具条定位于同一个相对容器。 */}
    {/* 正文仍由编辑器 ref 管理，不能把 React children 填进 contentEditable。 */}
    {/* id 落在真实编辑面，现有音频标签与键盘焦点可以继续使用。 */}
    <div className="relative min-w-0">
    <div id={props.id} ref={ref} role="textbox" aria-multiline="true" aria-label={props.label ?? t("create.videoCreatePanel.prompt")} data-video-prompt contentEditable={!disabled} suppressContentEditableWarning
      aria-autocomplete="list" aria-controls={mentions.state ? mentions.id : undefined} aria-activedescendant={mentions.state && mentions.entries.length ? `${mentions.id}-${mentions.active}` : undefined}
      // placeholder 仅作空态提示，不插入正文，也不参与最终生成内容。
      // Role TTS 可解释音频引用，视频仍使用既有视频提示词文案。
      // 值来自词条调用方，公共组件内不硬编码中文或另一份提示词。
      data-placeholder={props.placeholder ?? t("create.videoCreatePanel.promptPlaceholder")}
      // 工具条开启才增加底部预留，长文本不会覆盖助手按钮。
      // 其余边框、字体与滚动沿用视频原样，不另建音频专属输入样式。
      // 窄栏允许换行而非撑宽 main，候选菜单仍通过 portal 避免裁切。
      className={cn("min-h-[100px] w-full whitespace-pre-wrap break-words rounded-md bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]", props.assistant && "pb-10", PROMPT_EDITOR_SCROLL_CLASS, INPUT_BORDER_CLASS)}
      onInput={() => { if (!composing.current) { commit(); mentions.update(); } }}
      onCompositionStart={() => { editor.setComposing(true); mentions.close(); }} onCompositionEnd={() => { editor.setComposing(false); mentions.update(); }}
      onClick={(event) => { openReference(event.target); mentions.update(); }} onBlur={() => mentions.close()}
      onPaste={(event) => { event.preventDefault(); editor.insert(event.clipboardData.getData("text/plain")); mentions.update(); }}
      onKeyUp={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) && !composing.current && !mentions.state) mentions.update(); }}
      onKeyDown={(event) => {
        if (composing.current || event.nativeEvent.isComposing) return;
        if (!mentions.onKeyDown(event)) { if ((event.ctrlKey || event.metaKey) || ["Enter", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) mentions.close(); handleEditorKey(event, editor, openReference); }
      }} />
    {/* 界面：音频保留原提示词助手，读写同一正文与撤销历史。 */}
    {/* 异步助手返回时核对实际禁用状态，锁定后不把旧响应写回输入。 */}
    {/* save 更新同一个受控 value，装饰 effect 随后恢复引用标记。 */}
    {props.assistant && !disabled && <PromptAssistantToolbar contextId={props.id ?? 'reference-prompt'} read={() => ref.current?.textContent?.trim() ?? ''} write={text => { if (ref.current?.isContentEditable) editor.save(text); }} />}
    </div>
    {/* 浮层：只搜索当前任务传入的素材；选择结果插入光标处并纳入撤销历史 */}
    {mentions.state && !disabled && <PromptMediaMenu id={mentions.id} position={mentions.state.position} entries={mentions.entries} active={mentions.active}
      category={mentions.category} onBack={mentions.back} onChoose={mentions.chooseEntry} />}
    {/* 弹窗：直接复用图片显示区的缩放、翻页和关闭功能 */}
    {preview !== null && <ImagePreviewOverlay open items={images.flatMap((src, index) => src ? [{ key: String(index), src }] : [])} index={images.slice(0, preview).filter(Boolean).length}
      onIndexChange={(index) => { const indices = images.flatMap((src, original) => src ? [original] : []); setPreview(indices[index]); }} onOpenChange={(open) => { if (!open) setPreview(null); }} seedSrc={images[preview]} />}
  </>;
}
