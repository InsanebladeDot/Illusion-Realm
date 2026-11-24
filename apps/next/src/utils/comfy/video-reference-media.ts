/** 参考素材按类型、编号排序后接入官方动态端口；提交时把 UI 稳定编号转换为当前素材的连续序号。 */
import type { ComfyApiPrompt } from "@/types/comfy";
import { t } from "@/i18n";
import { findPromptReferenceMedia, promptMediaMatches, type PromptMediaKind, type PromptReferenceMedia } from "@/utils/prompt-media-references";
import type { PromptReferenceLabels } from "@/schemas/prompt-reference-labels.schema";
import { referenceLabels, DEFAULT_REFERENCE_LABELS } from "./prompt-reference-labels";

export const REFERENCE_MEDIA_KINDS = ["image", "video", "audio"] as const;
export interface UploadedVideoReference { kind: PromptMediaKind; number: number; name: string }
export interface VideoReferenceFile extends PromptReferenceMedia { file: File }
/** 预览按稳定编号保留空位，不截断第 10 张之后的图片，也不把删除后的编号映射到别的图片。 */
export function referenceImageSources(media: readonly PromptReferenceMedia[]): (string | null)[] {
  const images = media.filter((item) => item.kind === "image");
  const last = images.reduce((max, item) => Math.max(max, item.number), 0);
  const sources = new Map(images.map((item) => [item.number, item.src]));
  return Array.from({ length: last }, (_, index) => sources.get(index + 1) ?? null);
}
export function orderedReferences<T extends { kind: PromptMediaKind; number: number }>(media: readonly T[]) {
  return REFERENCE_MEDIA_KINDS.flatMap((kind) => media.filter((item) => item.kind === kind).sort((a, b) => a.number - b.number));
}
export function normalizeVideoReferences(text: string, media: readonly PromptReferenceMedia[], custom?: PromptReferenceLabels) {
  const ordered = orderedReferences(media);
  const labels = referenceLabels(custom);
  let result = text;
  for (const match of promptMediaMatches(text).reverse()) {
    const item = findPromptReferenceMedia(match[0], ordered);
    if (!item) throw new Error(t("create.videoReferences.missing", { token: match[0] }));
    const ordinal = ordered.filter((entry) => entry.kind === item.kind).findIndex((entry) => entry.id === item.id) + 1;
    result = result.slice(0, match.index) + `<${labels[item.kind]} ${ordinal}>` + result.slice(match.index + match[0].length);
  }
  // 兼容旧草稿的 Slot 写法；预览、助手和实际提交统一使用 Audio。
  return normalizeReferenceMarkers(result, ordered, labels);
}
/** 助手返回的默认标记、旧 Slot 和自定义标记均按同一张输入表校验；重复转换不改变结果。 */
function normalizeReferenceMarkers(text: string, media: readonly PromptReferenceMedia[], labels: ReturnType<typeof referenceLabels>) {
  return text.replace(/<([A-Za-z][A-Za-z0-9_-]{0,31})\s+(\d+)>/g, (token: string, label: string, number: string) => {
    const kind = REFERENCE_MEDIA_KINDS.find(item => labels[item] === label || DEFAULT_REFERENCE_LABELS[item] === label || item === "audio" && label === "Slot");
    if (!kind) return token;
    if (Number(number) < 1 || Number(number) > media.filter(item => item.kind === kind).length) throw Error(t("create.videoReferences.missing", { token }));
    return `<${labels[kind]} ${Number(number)}>`;
  });
}
function validateReferences(media: readonly UploadedVideoReference[]) {
  for (const kind of REFERENCE_MEDIA_KINDS) {
    const items = media.filter((item) => item.kind === kind);
    if (new Set(items.map((item) => item.number)).size !== items.length
      || items.some((item) => !item.name || !Number.isSafeInteger(item.number) || item.number < 1))
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
