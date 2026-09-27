/**
 * 解析结果里「我们合成的字段」的稳定标识（只在内存用、不落盘）；细节见下方注释。
 */
import type { MessageKey } from "@/i18n";

/**
 * 我们**自己合成**的 Meta 字段标识（只在内存里用，不落盘）。
 *
 * 背景：`inspectSdImage` 把解析结果摊成若干「字段」交给详情页展示与二创消费。
 * 其中一部分字段由我们合成 —— A1111 的提示词 / 负面提示词 / 其他参数，
 * 以及文件名 / 文件大小 / 完整生成信息；另一部分直接沿用**图片文件里的块关键字**
 * （ComfyUI 的 `prompt` / `workflow` / `Comment`、EXIF 标签名等）。
 *
 * 前者以前拿中文当 key，于是 `remixFromInspect` 与 `MetaFieldRow` 只能按中文字面量匹配。
 * 那串中文其实是**界面文案**（详情页要显示它），把文案当标识用有两个后果：
 * 接入第二门语言后匹配会失配，且同一句话在数据层与词条表各留一份。
 *
 * 现在改成与语言无关的标识：标识负责匹配、词条表负责显示。
 * 落盘的 PNG 块关键字本来就是全 ASCII 的（`prompt` / `workflow` / `Comment`），
 * 因此**不存在需要兼容读取的旧格式** —— 这组标识从来不会被写进文件。
 *
 * 前缀 `app:` 保证不会与文件自带的块关键字撞名。
 */
export const META_FIELD_ID = {
  prompt: "app:prompt",
  negativePrompt: "app:negativePrompt",
  otherParams: "app:otherParams",
  fileName: "app:fileName",
  fileSize: "app:fileSize",
  rawParameters: "app:rawParameters",
} as const;

export type MetaFieldId = (typeof META_FIELD_ID)[keyof typeof META_FIELD_ID];

const META_FIELD_ID_SET: ReadonlySet<string> = new Set<string>(
  Object.values(META_FIELD_ID)
);

/** 该字段标识是不是我们合成的（否则是文件自带的块关键字 / 标签名） */
export function isMetaFieldId(key: string): key is MetaFieldId {
  return META_FIELD_ID_SET.has(key);
}

/** 标识 → 展示文案词条；文件自带的块关键字没有词条，原样展示 */
const META_FIELD_LABEL_KEYS: Record<MetaFieldId, MessageKey> = {
  [META_FIELD_ID.prompt]: "inspect.metaField.prompt",
  [META_FIELD_ID.negativePrompt]: "inspect.metaField.negativePrompt",
  [META_FIELD_ID.otherParams]: "inspect.metaField.otherParams",
  [META_FIELD_ID.fileName]: "inspect.metaField.fileName",
  [META_FIELD_ID.fileSize]: "inspect.metaField.fileSize",
  [META_FIELD_ID.rawParameters]: "inspect.metaField.rawParameters",
};

/**
 * 取字段的展示文案词条 key；返回 `null` 表示这是文件自带的关键字，按原样显示。
 * 组件里用 `t(metaFieldLabelKey(key) ?? key)` 的写法会有类型问题，
 * 因此这里返回 `null` 而不是回落成 `MessageKey`。
 */
export function metaFieldLabelKey(key: string): MessageKey | null {
  return isMetaFieldId(key) ? META_FIELD_LABEL_KEYS[key] : null;
}
