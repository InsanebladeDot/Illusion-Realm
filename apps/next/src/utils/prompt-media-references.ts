/** 提示词素材引用的纯数据规则：三种素材共用结构，按 @ 后的文字过滤，选择后插入稳定的类型编号。 */
export type PromptMediaKind = "image" | "video" | "audio";
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
export function promptMediaMatches(text: string) {
  return [...text.matchAll(/(?<![\p{L}\p{N}_])(?:@(?:image|图|video|视频|audio|音频)|image)([1-9]\d*)(?![\p{L}\p{N}_])/giu)];
}
export function findPromptReferenceMedia(token: string, media: readonly PromptReferenceMedia[]) {
  const match = token.match(/^@?(image|图|video|视频|audio|音频)([1-9]\d*)$/iu);
  if (!match) return undefined;
  const alias = match[1].toLowerCase();
  // 中文别名是用户输入协议的一部分，不是界面文案。
  const kind: PromptMediaKind = /^(?:image|图)$/i.test(alias) ? "image" : /^(?:video|视频)$/i.test(alias) ? "video" : "audio";
  return media.find((item) => item.kind === kind && item.number === Number(match[2]));
}
