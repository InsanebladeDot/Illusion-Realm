/** 计算需要追加的 LoRA 触发词：拆分逗号标签，忽略大小写和多余空白，保留原有提示词。 */
function normalize(word: string): string { return word.trim().replace(/\s+/g, " ").toLowerCase(); }

export function missingLoraTriggerWords(words: string[], prompt: string): string[] {
  const split = (text: string) => text.split(/[,，\n]+/).map(word => word.trim()).filter(Boolean);
  const known = new Set(split(prompt).map(normalize));
  return words.flatMap(split).filter(word => {
    const key = normalize(word);
    if (known.has(key)) return false;
    known.add(key);
    return true;
  });
}
