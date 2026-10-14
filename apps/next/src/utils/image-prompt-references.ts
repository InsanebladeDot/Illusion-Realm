/** 统一图片引用别名；编辑和复制保留原文，提交 Minimax 时转换成官方 <Picture N>。 */
import { findPromptReferenceMedia, promptMediaMatches, type PromptReferenceMedia } from "./prompt-media-references";
export function imageReferenceMatches(text: string) {
  return [...text.matchAll(/(?<![\p{L}\p{N}_])(?:@(?:image|图)|image)([1-9]\d*)(?![\p{L}\p{N}_])/giu)];
}
export function normalizeImageReferences(text: string, available: boolean[]) {
  let result = text;
  for (const match of imageReferenceMatches(text).reverse()) {
    const number = Number(match[1]);
    if (!available[number - 1]) return { text, missing: number };
    result = result.slice(0, match.index) + `<Picture ${number}>` + result.slice(match.index + match[0].length);
  }
  return { text: result, missing: undefined };
}
/** 光标用纯文本偏移保存；重新装饰引用后恢复到相同位置，不让输入跳到末尾。 */
export function editorSelectionOffset(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !root.contains(selection.anchorNode)) return null;
  const range = selection.getRangeAt(0).cloneRange();
  range.selectNodeContents(root);
  range.setEnd(selection.anchorNode!, selection.anchorOffset);
  return range.toString().length;
}
export function restoreEditorOffset(root: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (offset <= length) {
      const range = document.createRange(); range.setStart(node, offset); range.collapse(true);
      const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); return;
    }
    offset -= length; node = walker.nextNode();
  }
}
/** 直接插入纯文本节点，保留换行；浏览器的 insertText 会把换行变成 div/br，textContent 会丢掉它。 */
export function insertEditorPlainText(root: HTMLElement, text: string) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !root.contains(selection.anchorNode)) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node); range.setStartAfter(node); range.collapse(true);
  selection.removeAllRanges(); selection.addRange(range);
}
export function decorateImageReferences(root: HTMLElement, text: string, images: (string | null)[], missingLabel: string, media: readonly PromptReferenceMedia[] = []) {
  const fragment = document.createDocumentFragment();
  let offset = 0;
  for (const match of promptMediaMatches(text)) {
    fragment.append(document.createTextNode(text.slice(offset, match.index)));
    const span = document.createElement("span");
    const asset = findPromptReferenceMedia(match[0], media);
    const imageToken = /^@?(?:image|图)/i.test(match[0]);
    if (imageToken) span.dataset.imageReference = match[1];
    span.dataset.mediaReference = asset?.id ?? match[0]; span.setAttribute("role", "button"); span.tabIndex = 0;
    span.className = "rounded bg-sky-100/70 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 cursor-pointer";
    const image = asset?.thumbnail ?? (asset?.kind === "image" ? asset.src : imageToken ? images[Number(match[1]) - 1] : undefined);
    if (image) {
      const thumbnail = document.createElement("img"); thumbnail.src = image; thumbnail.alt = ""; thumbnail.draggable = false;
      thumbnail.className = "inline-block h-[1em] w-[1em] object-cover align-middle mr-1 rounded-sm";
      span.append(thumbnail);
    } else if (asset) { span.title = asset.name; }
    else { span.title = missingLabel; span.dataset.missingImage = "true"; }
    span.append(document.createTextNode(match[0])); fragment.append(span);
    offset = match.index + match[0].length;
  }
  fragment.append(document.createTextNode(text.slice(offset)));
  root.replaceChildren(fragment);
}
