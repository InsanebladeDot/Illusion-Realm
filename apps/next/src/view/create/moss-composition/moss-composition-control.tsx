"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Scan } from "lucide-react";
import { INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";
import { useTranslation } from "@/i18n";
import type { ImageSizeSelection } from "@/utils/imageSize";
import { serializeMossComposition, type CompositionDraft } from "./composition-draft";
import { deserializeMossComposition } from "./composition-json";
import { useToastStore } from "@/stores/useToastStore";

const Editor = dynamic(() => import("./moss-composition-editor").then(module => module.MossCompositionEditor));
const ACTION = "inline-flex h-8 shrink-0 items-center gap-1 rounded-md bg-background px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-fill motion-reduce:transition-none";

export function MossCompositionControl({ draft, readPrompt, readSize, onApply }: {
  draft: CompositionDraft | null;
  readPrompt: () => string;
  readSize: () => ImageSizeSelection;
  onApply: (draft: CompositionDraft, size: ImageSizeSelection) => boolean | void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<{ draft: CompositionDraft; size: ImageSizeSelection } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  // 打开时从当前表单或画布节点取尺寸，编辑期间只改这份草稿。
  function open() {
    const size = readSize();
    const prompt = readPrompt().trim();
    // 提示词可能是刚转译或粘贴的。只有仍是上次应用的构图，才保留旧框的颜色和底图。
    if (draft && prompt === serializeMossComposition(draft, size)) {
      setEditing({ draft, size });
      return;
    }
    const imported = deserializeMossComposition(prompt, size);
    if (!imported && prompt.startsWith("{")) {
      useToastStore.getState().show(t("create.promptAssistant.mossCompositionJsonInvalid"));
      return;
    }
    setEditing({ draft: imported ?? { summary: prompt, regions: [] }, size });
  }
  const close = () => {
    setEditing(null);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  function apply(value: CompositionDraft, size?: ImageSizeSelection) {
    if (!editing) return;
    // 回填被拒绝时留在编辑页，方便用户缩短描述或删减区域。
    if (onApply(value, size ?? editing.size) === false) return;
    close();
  }
  return <>
    {/* 提示词标题栏：一个入口打开构图页，箭头留给提示词本身的开合。 */}
    <button type="button" ref={trigger} data-moss-composition data-moss-edit className={cn(ACTION, INPUT_BORDER_CLASS)} onClick={open}>
      <Scan className="size-3.5 shrink-0" aria-hidden />
      <span>{t("create.mossComposition.title")}</span>
    </button>
    {editing && <Editor initial={editing.draft} initialSize={editing.size} onClose={close} onApply={apply} />}
  </>;
}
