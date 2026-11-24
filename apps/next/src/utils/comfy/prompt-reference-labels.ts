/** 自定义标签像改座位牌，座位次序和实际上传端口保持原样。 */
import { PromptReferenceLabelsSchema, type PromptReferenceLabels } from "@/schemas/prompt-reference-labels.schema";
import { t } from "@/i18n";

export const DEFAULT_REFERENCE_LABELS = { image: "Picture", video: "Video", audio: "Audio" } as const;
export function referenceLabels(custom?: PromptReferenceLabels) {
  if (custom !== undefined && !PromptReferenceLabelsSchema.safeParse(custom).success) throw Error(t("canvas.referenceLabelsInvalid"));
  return { image: custom?.image ?? DEFAULT_REFERENCE_LABELS.image, video: custom?.video ?? DEFAULT_REFERENCE_LABELS.video, audio: custom?.audio ?? DEFAULT_REFERENCE_LABELS.audio };
}
