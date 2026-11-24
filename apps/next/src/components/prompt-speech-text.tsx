"use client";

/** 转译预览和历史共用提示词的荧光标注，复制仍读取原来的纯文本。 */
import { useRef } from "react";
import { usePromptSpeechHighlight } from "@/hooks/use-prompt-speech-highlight";

export function PromptSpeechText({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  usePromptSpeechHighlight(ref);
  return <span ref={ref} data-prompt-speech-text>{text}</span>;
}
