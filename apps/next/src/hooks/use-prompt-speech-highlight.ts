"use client";

/** 用浏览器高亮层给提示词着色；像透明荧光笔覆在纸上，不改正文、光标或撤销记录。 */
import { useEffect, type RefObject } from "react";
import { promptSpeechRanges, type PromptSpeechRange } from "@/utils/prompt-speech";

const EDITORS = new Map<HTMLElement, Range[]>();
const HIGHLIGHT_NAME = "prompt-speech";

/** 多个输入框共用一个命名色层，卸载只撤掉本框，不擦掉其他节点的高亮。 */
function publishHighlight() {
  if (typeof CSS === "undefined" || !CSS.highlights || typeof Highlight === "undefined") return;
  const ranges = [...EDITORS].flatMap(([root, values]) => root.isConnected ? values : []);
  if (ranges.length) CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));
  else CSS.highlights.delete(HIGHLIGHT_NAME);
}

/** 资源标签可能把正文拆成多个文本节点；区间按纯文本偏移对齐，图片本身不占文字长度。 */
function textRanges(root: HTMLElement, spans: PromptSpeechRange[]) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: { node: Node; start: number; end: number }[] = [];
  let node = walker.nextNode(), offset = 0;
  while (node) {
    const end = offset + (node.textContent?.length ?? 0);
    nodes.push({ node, start: offset, end });
    offset = end; node = walker.nextNode();
  }
  return spans.flatMap(span => {
    const start = nodes.find(item => item.end > span.start);
    const end = nodes.find(item => item.end >= span.end);
    if (!start || !end) return [];
    const range = document.createRange();
    range.setStart(start.node, span.start - start.start);
    range.setEnd(end.node, span.end - end.start);
    return [range];
  });
}

/** 手动输入、预设和转译写回都观察同一DOM；清理观察器后，旧结果不会占着命名色层。 */
export function usePromptSpeechHighlight(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof CSS === "undefined" || !CSS.highlights || typeof Highlight === "undefined") return;
    const refresh = () => {
      EDITORS.set(root, textRanges(root, promptSpeechRanges(root.textContent ?? "")));
      publishHighlight();
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(root, { childList: true, characterData: true, subtree: true });
    return () => { observer.disconnect(); EDITORS.delete(root); publishHighlight(); };
  }, [ref]);
}
