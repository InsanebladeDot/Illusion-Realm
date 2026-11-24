"use client";

// 复用创作页的引用编辑器；节点草稿独立保存。
import { useId, useMemo } from "react";
import { useTranslation } from "@/i18n";
import { ImageReferencePrompt } from "@/view/create/image-reference-prompt";
import { useCanvasPromptMedia } from "./use-canvas-prompt-media";
import { buildLocalFileUrl } from "@/utils/localFileUrl";
import { canvasPromptReferencesEnabled } from "./canvas-prompt-conversion";
import { normalizeVideoReferences } from "@/utils/comfy/video-reference-media";
import { useCanvasMentionLibrary } from "./use-canvas-mention-library";
import { canvasOutputDimensions } from "./canvas-output-size";
import type { CanvasData } from "./canvas-model";

// 只订阅来源数据，移动节点不重建引用列表。
// 连线和已选附件共用一份编号表；资源库候选选中后才加入请求。
export function CanvasVideoPrompt({ nodeId, data, disabled, onChange, onChangeData }: { nodeId: string; data: CanvasData; disabled?: boolean; onChange: (value: string) => void; onChangeData: (patch: Partial<CanvasData>) => void }) {
  const { t } = useTranslation();
  const id = useId();
  const media = useCanvasPromptMedia(nodeId, data);
  const referencesEnabled = canvasPromptReferencesEnabled(data);
  const mentions = useCanvasMentionLibrary(nodeId, data, media, onChangeData, referencesEnabled);
  const images = useMemo(() => media.map(item => item.src || null), [media]);
  // 转译可识别本节点已上传的图片；有参考图时优先使用原输入顺序，不附带生成结果。
  const referenceImages = media.filter(item => item.kind === "image").map(item => item.src);
  const ownImage = data.media?.kind === "image" ? buildLocalFileUrl(data.media.path) : null;
  const assistantImages = referenceImages.length ? referenceImages : ownImage ? [ownImage] : [];
  // 构图坐标按节点准备生成的像素计算，拖大卡片不会改变画幅。
  const compositionSize = data.kind === "image" ? canvasOutputDimensions(data) : undefined;
  return <><ImageReferencePrompt compositionSize={compositionSize} mossPresetScope={data.kind === "image" && data.workflow === "moss"} maxLength={4000} assistantImageSources={assistantImages} referencesEnabled={referencesEnabled} referenceKey={JSON.stringify(data.promptReferenceLabels)} mentionGroups={mentions.groups} resolveMention={mentions.resolve} id={`canvas-video-${id}`} value={data.prompt} onChange={value => onChange(value.slice(0, 4000))} images={images} media={media} kinds={[data.kind === "audio" ? "audio" : "image"]} disabled={!!disabled} appearance="neutral" assistant preparePrompt={referencesEnabled ? text => normalizeVideoReferences(text, media, data.promptReferenceLabels) : undefined} label={t("canvas.prompt")} placeholder={t(data.kind === "audio" ? "create.audio.promptHint" : data.kind === "image" ? "canvas.promptImage" : "canvas.promptVideo")} />{referencesEnabled && mentions.error && <p role="alert">{mentions.error}</p>}</>;
}
