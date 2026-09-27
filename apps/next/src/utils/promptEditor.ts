/**
 * `contenteditable` 提示词框（普通模式那个单一输入框）的读写。
 *
 * 怎么做：按元素 id 取 DOM，读 / 写 `textContent`；追加时按需补逗号，
 * 保证不产生双逗号与结尾逗号。
 */
export function readEditableText(id: string): string {
  if (typeof document === "undefined") return "";
  const element = document.getElementById(id);
  return element?.textContent?.trim() ?? "";
}

export function setEditableText(id: string, text: string): void {
  if (typeof document === "undefined") return;
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = text;
}

/**
 * 在现有内容末尾追加文本（3D 视角提示词等），
 * 自动补一个逗号分隔符，避免与已有标签粘连。
 */
export function appendEditableText(id: string, text: string): void {
  if (typeof document === "undefined") return;
  const element = document.getElementById(id);
  if (!element) return;

  const addition = text.trim();
  if (!addition) return;

  const current = (element.textContent ?? "").trim();
  if (!current) {
    element.textContent = addition;
    return;
  }

  const separator = /[,，]\s*$/.test(current) ? " " : ", ";
  element.textContent = `${current}${separator}${addition}`;
}
