"use client";
/** 节点生成按钮左侧的轻量预览，复用原转换正文与参数浮层，不上传任何文件。 */
import { useTranslation } from "@/i18n";
import { PromptConversionPreview } from "@/view/create/prompt-conversion-preview";
import { ParameterPopover } from "./reference-ui/parameter-popover";
import { useCanvasPromptMedia } from "./use-canvas-prompt-media";
import { canvasPromptReferencesEnabled } from "./canvas-prompt-conversion";
import type { CanvasData } from "./canvas-model";
import { mediaReferenceToken } from "@/utils/prompt-media-references";
import { normalizeVideoReferences, orderedReferences } from "@/utils/comfy/video-reference-media";
import { CanvasSwitch } from "./reference-ui/components";
import { CanvasReferenceLabels } from "./canvas-reference-labels";

// 未启用引用的工作流保留原文；预览不触发生成，也不把转换结果自动写回草稿。
const unchanged = (text: string) => text;
export function CanvasPromptPreview({ nodeId, data, onChange, disabled }: { nodeId: string; data: CanvasData; onChange: (patch: Partial<CanvasData>) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const media = useCanvasPromptMedia(nodeId, data);
  const enabled = data.promptConversion !== false;
  const supported = canvasPromptReferencesEnabled(data);
  const normalize = enabled && supported ? (text: string) => normalizeVideoReferences(text, media, data.promptReferenceLabels) : unchanged;
  return <ParameterPopover marker="prompt-preview" label={t("canvas.promptParameterChanges")}>
    {() => <div className="hy-prompt-preview" tabIndex={0} role="region" aria-label={t("canvas.promptParameterChanges")}>
      <div className="flex items-center justify-between gap-3 px-3 py-2"><span>{t("canvas.promptParameterChanges")}</span><CanvasSwitch label={t("canvas.promptParameterChanges")} checked={enabled} disabled={disabled} onChange={promptConversion => onChange({ promptConversion })} /></div>
      {/* 映射与正文使用同一转换器，展示名仅帮助辨认，真实编号按输入槽排列。 */}
      {enabled && <CanvasReferenceLabels value={data.promptReferenceLabels} disabled={disabled} onChange={promptReferenceLabels => onChange({ promptReferenceLabels })} />}
      {enabled && supported && <ul data-canvas-prompt-mappings className="px-3 pt-2 text-xs text-muted-foreground">{orderedReferences(media).map(item => <li key={item.id}>{`@${item.displayName ?? item.name} => ${normalize(mediaReferenceToken(item))}`}</li>)}</ul>}
      {/* 界面：实际请求的只读提示词，异常沿用原转换器提示，不显示未解析的成功正文。 */}
      <PromptConversionPreview value={data.prompt} media={media} variant="content" normalize={normalize} />
    </div>}
  </ParameterPopover>;
}
