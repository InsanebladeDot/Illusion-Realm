/** 语言括号到中文句号是一段说话内容；只返回原文区间，不改语言名、资源编号或正文。 */
export interface PromptSpeechRange { start: number; end: number }

// 英文句号不结束这段；未打完中文句号时先标到末尾。
// 这里只识别格式，不校验或纠正语言名称，因此用户写的 Chiness 也按原样显示。
export function promptSpeechRanges(text: string): PromptSpeechRange[] {
  return [...text.matchAll(/\[[A-Za-z][A-Za-z -]{0,47}\][^。]*(?:。|$)/g)]
    .map(match => ({ start: match.index, end: match.index + match[0].length }));
}
