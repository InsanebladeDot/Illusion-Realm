"use client";

/** 文字编辑模板入口：默认 H3 在前，切换只换本次草稿，不清除原 Anima 参数。 */
import { OptionSelect } from "@/view/create/OptionSelect";
import { useTranslation } from "@/i18n";
import type { AnimaEditState } from "@/hooks/use-anima-edit";
import { VideoImageUpload } from "@/view/create/VideoImageUpload";
import { appendEditReferences, removeEditReference } from "@/utils/edit-reference-import";

export function EditWorkflowSelector({ editor }: { editor: AnimaEditState }) {
  const { t } = useTranslation();
  return <OptionSelect ariaLabel={t("create.animaEdit.workflow")} value={editor.editWorkflow} options={[
    { value: "minimax-image-edit", label: "MiniMax H3" }, { value: "anima-edit", label: "Anima" },
  ]} onChange={value => { if (value === "minimax-image-edit" || value === "anima-edit") editor.patch({ editWorkflow: value, error: "" }); }} />;
}

export function EditReferenceSources({ editor }: { editor: AnimaEditState }) {
  const { t } = useTranslation();
  const items = [...(editor.source ? [editor.source] : []), ...editor.references];
  return <section data-edit-references className="space-y-3">
    {/* 输入区：上传和替换继续调用原组件，新增项才允许批量追加。 */}
    <div className="grid grid-cols-2 gap-2">{items.map((item, index) => <VideoImageUpload key={item.url} required={index === 0} label={`${t("create.animaEdit.source")} ${index + 1}`} imageUrl={item.url} onSelect={file => { void appendEditReferences([file], index); }} onRemove={() => removeEditReference(index)} />)}</div>
    {items.length < 8 && <VideoImageUpload label={t("canvas.addReference")} required={!items.length} imageUrl={null} onSelect={file => { void appendEditReferences([file]); }} onSelectFiles={files => { void appendEditReferences(files); }} onRemove={() => {}} />}
    <p className="text-xs text-muted-foreground">{t("create.animaEdit.referencesHint")}</p>
  </section>;
}
