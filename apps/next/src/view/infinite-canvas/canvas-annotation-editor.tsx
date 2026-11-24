"use client";

// 标注表单复用公共浮层与调色器；回车或确认按钮才把草稿交给节点保存。
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Check, Tag, Trash2 } from "lucide-react";
import { ContextMenuShell } from "@/components/context-menu-shell";
import { ColorPickerControls } from "@/components/color-picker-controls";
import { HoverTip } from "@/components/hover-tip";
import { useTranslation } from "@/i18n";
import { ANNOTATION_COLORS, type CanvasAnnotation } from "./canvas-annotations";
import styles from "./canvas-annotations.module.css";

interface Props {
  value?: CanvasAnnotation;
  x: number;
  y: number;
  onSave: (value: CanvasAnnotation) => void;
  onRemove: () => void;
  onClose: () => void;
}

export function CanvasAnnotationEditor({ value, x, y, onSave, onRemove, onClose }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState(value?.text ?? "");
  const [color, setColor] = useState(value?.color ?? "#fde047");
  const [custom, setCustom] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!composing.current && text.trim()) onSave({ id: value?.id ?? crypto.randomUUID(), text: text.trim(), color });
  };
  // 文字框自己接回车，不依赖浮层冒泡或浏览器的隐式表单提交。
  const saveOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.nativeEvent.isComposing) submit(event);
  };
  return <ContextMenuShell x={x} y={y} label={t(value ? "canvas.annotationSettings" : "canvas.addAnnotation")} role="dialog" onClose={onClose} className={`${styles.editor} hy-canvas-ui`}>
    <form data-canvas-annotation-editor onSubmit={submit} onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      // RGB 数字框不触发浏览器的隐式提交，避免调整颜色时提前保存。
      if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault();
    }}>
      {/* 标注输入：回车保存，Escape 或点外部取消，不在失焦时偷偷创建牌子。 */}
      <div className={styles.inputRow}><Tag size={15} aria-hidden /><input ref={input} autoFocus data-annotation-text value={text} maxLength={80} placeholder={t("canvas.annotationPlaceholder")} aria-label={t("canvas.annotationText")} onKeyDown={saveOnEnter} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onChange={event => setText(event.target.value)} />
        {text.trim() && <HoverTip asChild label={t("common.save")}><button type="submit" data-annotation-save className={styles.save} aria-label={t("common.save")}><Check size={15} /></button></HoverTip>}
        {value && <HoverTip asChild label={t("canvas.removeAnnotation")}><button type="button" data-annotation-remove className={styles.remove} aria-label={t("canvas.removeAnnotation")} onClick={onRemove}><Trash2 size={14} /></button></HoverTip>}
      </div>
      <div className={styles.colorPanel}>
        <div className={styles.palette} role="group" aria-label={t("canvas.annotationColor")}>
          {ANNOTATION_COLORS.map(item => <button key={item} type="button" data-annotation-color={item} aria-label={t("canvas.annotationColorValue", { color: item })} aria-pressed={color.toLowerCase() === item} className={styles.swatch} style={{ backgroundColor: item }} onClick={() => { setColor(item); input.current?.focus({ preventScroll: true }); }} />)}
        </div>
        <button type="button" data-annotation-custom className={styles.custom} aria-expanded={custom} onClick={() => setCustom(open => !open)}>{t("canvas.annotationCustomColor")}</button>
      </div>
      {custom && <div className={styles.customPanel}><ColorPickerControls value={color} label={t("canvas.annotationColor")} disabled={false} onChange={setColor} /></div>}
    </form>
  </ContextMenuShell>;
}
