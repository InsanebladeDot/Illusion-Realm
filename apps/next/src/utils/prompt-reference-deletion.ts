/** 引用标签像笔记里的整张名片：删除碰到它时移除完整编号，不留下半个引用。 */
import { restoreEditorOffset } from "./image-prompt-references";

function textOffset(root: HTMLElement, node: Node, offset: number) {
  const prefix = document.createRange();
  prefix.selectNodeContents(root);
  prefix.setEnd(node, offset);
  return prefix.toString().length;
}

/** 只接管碰到命名标签的删除；普通文字、外部选区和禁用输入仍交给浏览器。 */
export function deleteEditorReference(root: HTMLElement, backward: boolean): boolean {
  const selection = window.getSelection();
  if (!root.isContentEditable || !selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return false;
  const start = textOffset(root, range.startContainer, range.startOffset);
  const end = textOffset(root, range.endContainer, range.endOffset);
  let from = start, to = end, touched = false;
  for (const badge of root.querySelectorAll<HTMLElement>("[data-reference-label]")) {
    const prefix = document.createRange();
    prefix.selectNodeContents(root); prefix.setEndBefore(badge);
    const left = prefix.toString().length, right = left + (badge.textContent?.length ?? 0);
    const intersects = range.collapsed
      ? backward ? start > left && start <= right : start >= left && start < right
      : start < right && end > left;
    if (!intersects) continue;
    from = Math.min(from, left); to = Math.max(to, right); touched = true;
  }
  if (!touched) return false;
  const text = root.textContent ?? "";
  root.textContent = text.slice(0, from) + text.slice(to);
  restoreEditorOffset(root, from);
  return true;
}
