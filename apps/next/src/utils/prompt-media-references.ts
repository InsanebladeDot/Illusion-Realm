/** 提示词素材引用的纯数据规则：三种素材共用结构，按 @ 后的文字过滤，选择后插入稳定的类型编号。 */
export type PromptMediaKind = "image" | "video" | "audio";
export const MEDIA_REFERENCE_LABELS = {
  image: "create.mediaReferences.image", video: "create.mediaReferences.video", audio: "create.mediaReferences.audio",
} as const;
export interface PromptReferenceMedia {
  id: string;
  kind: PromptMediaKind;
  /** 同类型从 1 开始的编号；删除素材不重新编号，避免已有引用指向另一份素材。 */
  number: number;
  name: string;
  label?: string;
  src: string;
  thumbnail?: string;
}
export interface MediaMentionQuery { start: number; end: number; query: string }
export function mediaReferenceToken(media: PromptReferenceMedia) { return `@${media.kind}${media.number}`; }
const MEDIA_ALIASES: Record<PromptMediaKind, string> = { image: "image 图 图片", video: "video 视频", audio: "audio 音频" };

/** 只搜索光标前未完成的 @ 片段，不打扰邮箱、完整引用、其它位置的普通文字。 */
export function getMediaMentionQuery(text: string, offset: number): MediaMentionQuery | null {
  const match = text.slice(0, offset).match(/(?:^|[^\p{L}\p{N}_])@([^@\s]*)$/u);
  if (!match || /^(?:image|图|video|视频|audio|音频)[1-9]\d*$/iu.test(match[1])) return null;
  return { start: offset - match[1].length - 1, end: offset, query: match[1] };
}
export function filterPromptMedia(media: readonly PromptReferenceMedia[], query: string) {
  const search = query.trim().toLocaleLowerCase();
  return media.filter((item) => `${item.name} ${item.label ?? ""} ${mediaReferenceToken(item)} ${MEDIA_ALIASES[item.kind]}${item.number}`.toLocaleLowerCase().includes(search));
}
// 手输 @audio 1 与菜单插入 @audio1 等价，允许水平空格但不能跨换行引用。
// 编号捕获组位置保持不变，现有装饰器仍能用 match[1] 找对应素材。
// 左右文字边界继续阻止邮箱或单词中的 image1 被意外改写。
// 显式共用同一个匹配入口，预览、编辑装饰与提交不会各认一套空格写法。
// 返回 match 原始区间，替换时可精确保留周边对白和换行。
// 不 trim 整段提示词，避免用户有意义的格式被引用处理顺手删除。
export function promptMediaMatches(text: string) {
  return [...text.matchAll(/(?<![\p{L}\p{N}_])(?:@(?:image|图|video|视频|audio|音频)|image)[\t ]*([1-9]\d*)(?![\p{L}\p{N}_])/giu)];
}
export function findPromptReferenceMedia(token: string, media: readonly PromptReferenceMedia[]) {
  // 可选空格只位于类型与编号之间，不能把普通段落拼成一个引用。
  // 菜单依旧插入紧凑写法，手动输入的有空格别名也能映射同一素材。
  // 实际素材必须在当前任务列表中存在，正则匹配本身不提供资源。
  const match = token.match(/^@?(image|图|video|视频|audio|音频)[\t ]*([1-9]\d*)$/iu);
  if (!match) return undefined;
  const alias = match[1].toLowerCase();
  // 中文别名是用户输入协议的一部分，不是界面文案。
  const kind: PromptMediaKind = /^(?:image|图)$/i.test(alias) ? "image" : /^(?:video|视频)$/i.test(alias) ? "video" : "audio";
  return media.find((item) => item.kind === kind && item.number === Number(match[2]));
}
