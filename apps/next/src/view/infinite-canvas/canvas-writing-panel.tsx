"use client";

// 文本和便签共用正文输入，转译直接写回当前节点，不经过生成参数或另存提示词。
import { useEffect, useRef } from "react";
import { useTranslation } from "@/i18n";
import { PromptAssistantToolbar } from "@/components/prompt-assistant/prompt-assistant-toolbar";
import styles from "./canvas-writing-panel.module.css";

interface Props {
  nodeId: string;
  value: string;
  focusRequest: number;
  onChange: (value: string) => void;
}

export function CanvasWritingPanel({ nodeId, value, focusRequest, onChange }: Props) {
  const { t } = useTranslation();
  const input = useRef<HTMLTextAreaElement>(null);
  // 双击或工具条是明确的书写意图；普通选择不强抢键盘，拖动仍能正常结束。
  useEffect(() => { if (focusRequest > 0) input.current?.focus({ preventScroll: true }); }, [focusRequest]);
  const write = (text: string) => {
    // 译文返回时输入框可能已关闭；旧结果不能写入其他节点或已卸载的草稿。
    if (input.current?.isConnected) onChange(text);
  };
  return <section data-canvas-theme data-canvas-writing-panel className={`${styles.panel} nodrag nopan nowheel`} aria-label={t("canvas.manual")} onKeyDown={event => event.stopPropagation()}>
    {/* 书写区：完整复用设置、复制、撤销和转译工具栏，不接生成参数。 */}
    <textarea ref={input} value={value} aria-label={t("canvas.manual")} placeholder={t("canvas.promptText")} maxLength={8000} onChange={event => onChange(event.target.value)} />
    <PromptAssistantToolbar appearance="neutral" contextId={`canvas-writing-${nodeId}`} maxLength={8000} read={() => input.current?.value ?? ""} write={write} />
  </section>;
}
