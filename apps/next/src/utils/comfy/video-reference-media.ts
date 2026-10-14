/** 参考素材按类型、编号排序后接入官方动态端口；提交时把 UI 稳定编号转换为当前素材的连续序号。 */
import type { ComfyApiPrompt } from "@/types/comfy";
import { t } from "@/i18n";
import { findPromptReferenceMedia, promptMediaMatches, type PromptMediaKind, type PromptReferenceMedia } from "@/utils/prompt-media-references";

export const REFERENCE_MEDIA_LIMITS = { image: 9, video: 3, audio: 3 } as const;
export const REFERENCE_MEDIA_KINDS = ["image", "video", "audio"] as const;
export interface UploadedVideoReference { kind: PromptMediaKind; number: number; name: string }
export interface VideoReferenceFile extends PromptReferenceMedia { file: File }
export function orderedReferences<T extends { kind: PromptMediaKind; number: number }>(media: readonly T[]) {
  return REFERENCE_MEDIA_KINDS.flatMap((kind) => media.filter((item) => item.kind === kind).sort((a, b) => a.number - b.number));
}
export function normalizeVideoReferences(text: string, media: readonly PromptReferenceMedia[]) {
  const ordered = orderedReferences(media);
  const labels = { image: "Picture", video: "Video", audio: "Audio" } as const;
  let result = text;
  for (const match of promptMediaMatches(text).reverse()) {
    const item = findPromptReferenceMedia(match[0], ordered);
    if (!item) throw new Error(t("create.videoReferences.missing", { token: match[0] }));
    const ordinal = ordered.filter((entry) => entry.kind === item.kind).findIndex((entry) => entry.id === item.id) + 1;
    result = result.slice(0, match.index) + `<${labels[item.kind]} ${ordinal}>` + result.slice(match.index + match[0].length);
  }
  // 手输官方标记也要检查，不能引用删除的素材。
  for (const match of result.matchAll(/<(Picture|Video|Audio)\s+(\d+)>/g)) {
    const kind = REFERENCE_MEDIA_KINDS.find((item) => labels[item] === match[1])!;
    if (Number(match[2]) < 1 || Number(match[2]) > ordered.filter((item) => item.kind === kind).length)
      throw new Error(t("create.videoReferences.missing", { token: match[0] }));
  }
  return result;
}
function validateReferences(media: readonly UploadedVideoReference[]) {
  for (const kind of REFERENCE_MEDIA_KINDS) {
    const items = media.filter((item) => item.kind === kind);
    if (items.length > REFERENCE_MEDIA_LIMITS[kind] || new Set(items.map((item) => item.number)).size !== items.length
      || items.some((item) => !item.name || !Number.isInteger(item.number) || item.number < 1))
      throw new Error(t("create.videoSettings.invalid"));
  }
}
function connectReference(prompt: ComfyApiPrompt, kind: PromptMediaKind, name: string, index: number) {
  let id = `ir_ref_${kind}_${index}`;
  while (prompt[id] || prompt[`${id}_frames`]) id += "_";
  const classType = { image: "LoadImage", video: "LoadVideo", audio: "LoadAudio" }[kind];
  const input = { image: "image", video: "file", audio: "audio" }[kind];
  prompt[id] = { class_type: classType, inputs: { [input]: name } };
  if (kind !== "video") return [id, 0];
  // 模板只引用视频画面，不自动加入其音轨，避免改变独立音频的 <Audio N> 编号。
  prompt[`${id}_frames`] = { class_type: "GetVideoComponents", inputs: { video: [id, 0] } };
  return [`${id}_frames`, 0];
}
export function applyVideoReferences(prompt: ComfyApiPrompt, media: readonly UploadedVideoReference[]) {
  validateReferences(media);
  const video = Object.values(prompt).find((node) => node.class_type === "MiniMaxH3ReferenceToVideo");
  if (!video) throw new Error(t("create.videoModels.missingNode", { name: "MiniMaxH3ReferenceToVideo" }));
  // 不保留模板里的个人素材文件名，未上传的动态端口完全删除。
  for (const key of Object.keys(video.inputs)) if (/^ref_(images|videos|video_audios|audios)\./.test(key)) delete video.inputs[key];
  for (const [id, node] of Object.entries(prompt))
    if (["LoadImage", "LoadVideo", "GetVideoComponents", "LoadAudio"].includes(node.class_type)) delete prompt[id];
  const groups = { image: "images", video: "videos", audio: "audios" } as const;
  for (const kind of REFERENCE_MEDIA_KINDS) {
    orderedReferences(media).filter((item) => item.kind === kind).forEach((item, index) => {
      video.inputs[`ref_${groups[kind]}.ref_${kind}_${index}`] = connectReference(prompt, kind, item.name, index);
    });
  }
}
