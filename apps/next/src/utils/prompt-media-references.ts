/** 提示词素材引用的纯数据规则：三种素材共用结构，按 @ 后的文字过滤，选择后插入稳定的类型编号。 */
export type PromptMediaKind = "image" | "video" | "audio";
export const MEDIA_REFERENCE_LABELS = {
  image: "create.mediaReferences.image", video: "create.mediaReferences.video", audio: "create.mediaReferences.audio",
} as const;
export interface PromptReferenceMedia {
  // 画布按图片编号展示 Picture；旧创建页省略后保持既有 @image 写法。
  // 这里只改变文本别名，资源身份、编号和类型仍是原字段。
  tokenPrefix?: "picture";
  // 可选显示别名由资源所有者提供，画布用文件主体，旧创作表单继续显示原 token。
  // 别名不进入请求正文，也不替代稳定 id；同名图片仍由类型和编号区分。
  // 改名只刷新装饰，不对普通对白做搜索替换，防止误改用户提及的人名。
  displayName?: string;
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
// 引用像书里的插图编号：展示名称可以改，编号负责把文字指回这张图。
// 旧调用没有 tokenPrefix 时继续输出 image，不能让创建页已有提示词突然换格式。
// picture 仅是图片别名，音频和视频不能因为附带该字段变成图片引用。
// number 已由调用方建立同类型顺位，本函数不能根据数组位置重新编号。
// 字符串是编辑器协议，不走界面翻译；切换语言后已写正文必须保持原样。
// 生成返回值没有在这里登记，新结果必须先成为明确的媒体输入才可被引用。
export function mediaReferenceToken(media: PromptReferenceMedia) { return `@${media.kind === "image" ? media.tokenPrefix ?? "image" : media.kind}${media.number}`; }
const MEDIA_ALIASES: Record<PromptMediaKind, string> = { image: "image picture 图 图片", video: "video 视频", audio: "audio 音频" };

/** 只搜索光标前未完成的 @ 片段，不打扰邮箱、完整引用、其它位置的普通文字。 */
// 匹配范围只到光标之前，不能因为后面还有 @ 就跳转到另一个词。
// 完整 picture 加正整数已经是引用，不再弹未完成候选菜单遮住正常输入。
// 大小写不影响英文别名，但插入时仍沿用统一小写机器形式。
// Unicode 字母数字边界用于保护普通单词，中文正文也不能被简单 ASCII 边界误切。
// 邮箱中间的 @ 不是资源引用，不能在输入邮箱时不断弹出图片列表。
// query 保留用户尚未输入完的内容，后续可搜索名称、类型和编号。
// start 与 end 是原纯文本偏移，装饰 DOM 的 span 数量不参与光标索引。
// 新增 picture 只扩展完整引用判断，没有放开任意 @ 前缀为资源类型。
// 没有匹配返回 null，意味着保持普通文本输入，不是生成失败。
// 空 @ 可以开始搜索，但编号零不是合法已完成引用。
// 不在这里截断正文，编辑器原限长与任务校验负责各自边界。
export function getMediaMentionQuery(text: string, offset: number): MediaMentionQuery | null {
  const match = text.slice(0, offset).match(/(?:^|[^\p{L}\p{N}_])@([^@\s]*)$/u);
  if (!match || /^(?:image|picture|图|video|视频|audio|音频)[1-9]\d*$/iu.test(match[1])) return null;
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
// 图片、视频和音频共用匹配器，新增别名必须在这一处同步装饰识别。
// 编号捕获仍为第一个分组，原调用用 match[1] 读取编号的代码不需要迁移。
// 使用 matchAll 保留每个原文区间，替换时不会误改普通自然语言。
// 负向前看阻止把单词后缀 image 当作引用开头。
// 编号后面仍要求词边界，picture1abc 不能被拆成有效的 picture1 加普通 abc。
// 水平空格与制表符可以分隔类型和数字，换行不能把两段文字连成一个引用。
// 这个宽松装饰协议与服务提交规范化不是一回事，提交方仍检查可用图片。
// 原文大小写保留给用户显示，查资源时才做别名归一。
// 数组是一次匹配的结果，不在模块里保留带 lastIndex 的全局可变正则。
// 没有资源也可以识别语法，缺失提示应由实际候选表决定。
// 语法成功不能作为本地路径存在或图片已经上传的证据。
export function promptMediaMatches(text: string) {
  return [...text.matchAll(/(?<![\p{L}\p{N}_])(?:@(?:image|picture|图|video|视频|audio|音频)|image)[\t ]*([1-9]\d*)(?![\p{L}\p{N}_])/giu)];
}
// 查找先解析类型再解析编号，audio1 与 picture1 可以合法同时存在。
// picture 和 image 最终都查 kind=image，因此共用原图片预览而不是新增媒体类型。
// 允许手输别名不代表允许任意文件地址，最终仍只在给定 media 表中寻找。
// 这个表属于当前任务，不能退到全局图库找一个同编号的无关图片。
// 没有匹配必须返回 undefined，不能默认第一张造成静默错图。
// 同一类型编号本应唯一，维护唯一性的责任在构造候选表的业务入口。
// 这里没有按名称模糊匹配，名字相近不是可替代资源的依据。
// 大小写归一只影响别名，文件地址和资源 ID 不做大小写改写。
// 返回原资源对象方便预览与装饰使用一致身份，不另造一份路径副本。
// Number 只转换正整数捕获，不能把空白、负数或科学记数法解释成编号。
export function findPromptReferenceMedia(token: string, media: readonly PromptReferenceMedia[]) {
  // 可选空格只位于类型与编号之间，不能把普通段落拼成一个引用。
  // 菜单依旧插入紧凑写法，手动输入的有空格别名也能映射同一素材。
  // 实际素材必须在当前任务列表中存在，正则匹配本身不提供资源。
  const match = token.match(/^@?(image|picture|图|video|视频|audio|音频)[\t ]*([1-9]\d*)$/iu);
  if (!match) return undefined;
  const alias = match[1].toLowerCase();
  // 中文别名是用户输入协议的一部分，不是界面文案。
  const kind: PromptMediaKind = /^(?:image|picture|图)$/i.test(alias) ? "image" : /^(?:video|视频)$/i.test(alias) ? "video" : "audio";
  return media.find((item) => item.kind === kind && item.number === Number(match[2]));
}
