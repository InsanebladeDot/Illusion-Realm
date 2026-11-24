"use client";

/** 转换浮层内复用原输入样式与胶囊按钮；草稿确认后才写节点，非法前缀不会进入请求。 */
import { useState } from "react";
import { useTranslation } from "@/i18n";
import { PromptReferenceLabelsSchema, type PromptReferenceLabels } from "@/schemas/prompt-reference-labels.schema";
import { referenceLabels } from "@/utils/comfy/prompt-reference-labels";
import { CanvasChip } from "./reference-ui/components";

const KINDS = [{ kind: "image", label: "canvas.image" }, { kind: "video", label: "canvas.video" }, { kind: "audio", label: "canvas.audio" }] as const;
export function CanvasReferenceLabels({ value, disabled, onChange }: { value?: PromptReferenceLabels; disabled?: boolean; onChange: (value: PromptReferenceLabels | undefined) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<PromptReferenceLabels | null>(null), [invalid, setInvalid] = useState(false);
  const labels = draft ?? referenceLabels(value);
  const apply = () => {
    const parsed = PromptReferenceLabelsSchema.safeParse(labels);
    setInvalid(!parsed.success);
    // 保存后放下本地草稿，不卸载输入控件；像改完门牌仍站在原处，Escape 才能继续收起浮层。
    if (parsed.success) { onChange(parsed.data); setDraft(null); }
  };
  return <section className="space-y-2 px-3 py-2" data-reference-labels>
    {/* 转换设置：每种素材一个前缀，数字仍由上传顺序生成，不能手填完整引用抢占别的输入槽。 */}
    <p className="text-xs text-muted-foreground">{t("canvas.referenceLabelsHint")}</p>
    {KINDS.map(({ kind, label }) => <label key={kind} className="flex items-center gap-3 text-xs"><span className="w-9 shrink-0">{t(label)}</span><input data-reference-label={kind} aria-label={t("canvas.referenceLabel", { kind: t(label) })} className="min-w-0 flex-1 border-0 border-b border-border bg-transparent px-1 py-1 outline-none focus:border-foreground/40 disabled:opacity-40" value={labels[kind]} disabled={disabled} maxLength={32} spellCheck={false} onChange={event => { setDraft({ ...labels, [kind]: event.target.value }); setInvalid(false); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); apply(); } }} /><span className="shrink-0 text-muted-foreground">{`<${labels[kind]} 1>`}</span></label>)}
    {invalid && <p role="alert" className="text-xs text-muted-foreground">{t("canvas.referenceLabelsInvalid")}</p>}
    <div className="flex gap-2"><CanvasChip disabled={disabled} onClick={apply}>{t("canvas.apply")}</CanvasChip><CanvasChip disabled={disabled} onClick={() => { setDraft(null); setInvalid(false); onChange(undefined); }}>{t("canvas.referenceLabelsReset")}</CanvasChip></div>
  </section>;
}
