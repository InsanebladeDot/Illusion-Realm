/**
 * 参考素材的文件格式规则，与上传控件的 accept 使用同一份配置。
 * MIME 缺失时按扩展名判断；批量导入仍逐个校验，防止拖放绕过文件选择器的过滤。
 */
import type { PromptMediaKind } from "@/utils/prompt-media-references";

export const REFERENCE_FILE_ACCEPT = {
  image: "image/jpeg,image/png,image/webp",
  video: "video/mp4,video/webm,video/quicktime",
  audio: "audio/*",
} as const;
const EXTENSIONS = {
  image: /\.(jpe?g|png|webp)$/i,
  video: /\.(mp4|webm|mov)$/i,
  audio: /\.(mp3|wav|flac|m4a|aac|ogg|opus|aiff?|wma|weba)$/i,
};
export function isReferenceFile(kind: PromptMediaKind, file: File) {
  if (!file.type) return EXTENSIONS[kind].test(file.name);
  return kind === "audio" ? file.type.startsWith("audio/") : REFERENCE_FILE_ACCEPT[kind].split(",").includes(file.type);
}
