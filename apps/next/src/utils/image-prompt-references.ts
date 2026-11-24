/** 统一图片引用别名；编辑和复制保留原文，提交 Minimax 时转换成官方 <Picture N>。 */
import { findPromptReferenceMedia, promptMediaMatches, type PromptReferenceMedia } from "./prompt-media-references";
// 画布允许 @picture，服务提交仍使用已有官方 Picture 占位符协议。
// 这个匹配器只认图片，不应该把 @video1 也转成 Picture 一。
// 普通文本中的 picture 没有 @ 时不视为新别名，避免改写叙述里的英文单词。
// 保留旧 image 不带 @ 的兼容入口，不为了新增写法破坏已有草稿。
// 捕获区间依据原文计算，normalize 会从后往前替换以免前面的偏移失效。
// 可用列表第一个布尔值对应编号一，不能忘记从编号减一。
// 任一引用缺失时保留整个原文和具体缺号，不返回一段半转换的提示词。
// 这使调用方可以明确提示用户补图，而不是提交语法正确但引用错位的请求。
// 装饰时保留 @picture 原文，只有真正服务提交才生成尖括号语法。
// 复制正文因此仍得到用户熟悉的编辑写法，而非混入 HTML 或资源 Base64。
export function imageReferenceMatches(text: string) {
  return [...text.matchAll(/(?<![\p{L}\p{N}_])(?:@(?:image|picture|图)|image)([1-9]\d*)(?![\p{L}\p{N}_])/giu)];
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
      // 文件名标签是一个完整资源，不把光标放进不可编辑的图片和文件名内部。
      // 纯文本偏移仍按原 token 计数，光标在 token 末尾时落到整个标签之后。
      // 像把一张名片作为整体插入笔记，文字只能写在名片前后，不能改掉其中半个编号。
      // 旧表单没有命名标签，保持原来的文字光标定位，不改变旧视频或音频输入。
      // 起点恰在资源前时保留前侧位置，不能无条件跳到所有标签之后。
      // 不用选中节点或最后点击图片推断资源，定位只依赖当前编辑器实际 DOM。
      const badge = node.parentElement?.closest("[data-reference-label]");
      if (badge) { if (offset === 0) range.setStartBefore(badge); else range.setStartAfter(badge); range.collapse(true); }
      const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); return;
    }
    offset -= length; node = walker.nextNode();
  }
  // 最后一个标签删掉后正文没有文本节点，仍把光标留在输入框，方便接着打字。
  const range = document.createRange(); range.selectNodeContents(root); range.collapse(false);
  const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
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
// 标签的可编辑正文仍为@pictureN，显示名只是当前媒体表对该编号的解释。
// 例如两个上游都叫“人物”，它们仍分别是@picture1和@picture2。
// 父级重命名文件后不用改这两个token，所以普通文本中的“人物”也不会被误替换。
// 这里不拼innerHTML，文件名中的字符不能作为标签或属性注入执行。
// data属性与aria名称分别服务视觉和读屏，二者都使用同一个完整主体。
// 缩略图失败时名字仍能显示，不能因为封面缺失就把引用从正文删除。
// 只有定位到实际资源的token获得命名样式，越界资源仍保留原缺失提示。
// 所有标签都重新从受控文本构建，不保留上一节点的DOM装饰缓存。
function configureReferenceName(span: HTMLSpanElement, asset: PromptReferenceMedia | undefined) {
    // 文件主体属于显示层，原 token 文本保留在 DOM，提交和复制不会变成可歧义的名字。
    // 标签通过 CSS 展示名字，因此重名图片不会让两个 @ 引用指向同一编号。
    // 只有提供 displayName 的画布候选使用这套外观，原创作页调用保持原样。
    // contentEditable=false 把缩略图和名字作为原子，Backspace 不会留下半个机器引用。
    // aria-label 给读屏完整文件主体，零字号的机器文本不承担可访问名称。
    // title 保留全名，长名字在窄输入区省略后仍可以核对准确来源。
    // data-reference-label 是装饰属性，不是 HTML 注入；名字里的引号和尖括号按普通文本处理。
    // 不将完整路径放入标签，避免截图或复制提示词时暴露用户的私人目录。
    // 文件名改变会由原受控 media effect 重建装饰，不改用户写下的纯文本提示词。
    // span 原有稳定资源 id 和图片编号仍保留，点击预览与缺图检查继续走原组件。
    // 原始图片 src 仍来自本地媒体协议，标签不读取文件正文或创建 Base64 副本。
    // 字号和缩略图边长交给专用类，不用图片天然分辨率挤开输入行高。
    if (asset?.displayName) {
      span.dataset.referenceLabel = asset.displayName; span.contentEditable = "false";
      span.setAttribute("aria-label", asset.displayName); span.title = asset.displayName;
      span.classList.add("hy-reference-name");
    }
}
export function decorateImageReferences(root: HTMLElement, text: string, images: (string | null)[], missingLabel: string, media: readonly PromptReferenceMedia[] = []) {
  const fragment = document.createDocumentFragment();
  let offset = 0;
  for (const match of promptMediaMatches(text)) {
    fragment.append(document.createTextNode(text.slice(offset, match.index)));
    const span = document.createElement("span");
    const asset = findPromptReferenceMedia(match[0], media);
    const imageToken = /^@?(?:image|picture|图)/i.test(match[0]);
    if (imageToken) span.dataset.imageReference = match[1];
    span.dataset.mediaReference = asset?.id ?? match[0]; span.setAttribute("role", "button"); span.tabIndex = 0;
    span.className = "rounded bg-sky-100/70 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 cursor-pointer";
    configureReferenceName(span, asset);
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
