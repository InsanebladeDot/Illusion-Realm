"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Download, ExternalLink } from "lucide-react";
import { SimpleSelect } from "@/components/SimpleSelect";
import { useTranslation } from "@/i18n";
import { civitaiDescription, civitaiDownload, type CivitaiFile, type CivitaiModel, type CivitaiVersion } from "@/utils/civitai";
import { CivitaiPreview } from "./civitai-preview";
import { ModelDownloadForm } from "./model-download-form";
// 在线仅适配版本数据；阅读高度、标签拆分与复制都使用本地同一组件。
// 预览和下载仍保留在线版本自己的状态，不合并不同来源的业务流程。
// 说明来自原有纯文字净化器，公共阅读器不负责解析远端 HTML。
import { ModelDescription } from "./model-description";
import { ModelTriggerWords } from "./model-trigger-words";

function DetailSection({ title, open = false, children }: { title: string; open?: boolean; children: ReactNode }) {
  return <details open={open || undefined} className="group rounded-lg border border-border bg-background">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-foreground hover:bg-muted/50 [&::-webkit-details-marker]:hidden">{title}<ChevronDown size={14} className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" /></summary>
    <div className="border-t border-border p-3">{children}</div>
  </details>;
}
function DownloadFooter({ model, version, source, fileId, onFileChange, onConfigure }: { model: CivitaiModel; version?: CivitaiVersion; source: string; fileId: number; onFileChange: (id: number) => void; onConfigure: (file: CivitaiFile) => void }) {
  const { t } = useTranslation();
  const file = version?.files.find((file) => file.id === fileId) || version?.files.find((file) => file.primary) || version?.files[0];
  const download = file ? civitaiDownload(file, source) : "";
  return <footer data-civitai-actions className="shrink-0 space-y-2 border-t border-border bg-background p-3">
    {version && version.files.length > 1 && <SimpleSelect value={String(file?.id || 0)} ariaLabel={t("toolBox.civitai.files")} onChange={(value) => onFileChange(Number(value))} options={version.files.map((item) => ({ value: String(item.id), label: item.name }))} portal />}
    {file && <p className="text-[10px] text-muted-foreground"><span className="block truncate" title={file.name}>{file.name}</span>{(file.sizeKB / 1024).toFixed(1)} MB · {file.format}</p>}
    {download && file ? <button type="button" data-civitai-download onClick={() => onConfigure(file)} className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-xs text-white hover:bg-sky-700"><Download size={14} />{t("toolBox.civitai.download")}</button> : <button type="button" disabled className="flex w-full items-center justify-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground"><Download size={14} />{t("toolBox.civitai.unavailable")}</button>}
    <a href={`${source}/models/${model.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted">{t("toolBox.civitai.modelPage")}<ExternalLink size={14} /></a>
    <p className="text-[10px] leading-relaxed text-muted-foreground">{t("toolBox.civitai.downloadHint")}</p>
  </footer>;
}
interface VersionContentProps { model: CivitaiModel; version?: CivitaiVersion; source: string; previewIndex: number; onPreviewChange: (index: number) => void; onConfigure: (file: CivitaiFile) => void }
function VersionContent({ model, version, source, previewIndex, onPreviewChange, onConfigure }: VersionContentProps) {
  const { t } = useTranslation();
  const [fileId, setFileId] = useState(0);
  const file = version?.files.find((file) => file.id === fileId) || version?.files.find((file) => file.primary) || version?.files[0];
  const description = civitaiDescription(version?.description || model.description) || t("toolBox.civitai.noDescription");
  return <div className="flex min-h-0 flex-1 flex-col">
    {/* 界面：可折叠内容独立滚动；预览默认展开 */}
    <div data-civitai-detail-scroll className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      {version && <DetailSection title={t("toolBox.civitai.preview")} open><CivitaiPreview key={version.id} images={version.images} title={model.name} index={previewIndex} onIndexChange={onPreviewChange} /></DetailSection>}
      {/* 在线触发词：标题与复制入口由公共组件维护，避免摘要中嵌套按钮。 */}
      {/* 保留版本自己的词组；拆分只影响显示，不篡改下载时保存的来源 JSON。 */}
      {!!version?.trainedWords.length && <div className="rounded-lg border border-border bg-background p-3"><ModelTriggerWords words={version.trainedWords} /></div>}
      {/* 触发词默认可见，复制按钮不放进 summary，防止复制时误收起整个分组。 */}
      {/* 在线模型说明：原生分组展开后测量真实高度，窄栏也按实际行数截断。 */}
      {/* 以内容为键确保换到短说明后不会遗留上一版本的滚动与展开状态。 */}
      {/* 文件信息和下载底栏不受内部滚动影响，仍由原有详情布局管理。 */}
      <DetailSection title={t("toolBox.civitai.about")}><ModelDescription key={description} text={description} /></DetailSection>
      <DetailSection title={t("toolBox.civitai.fileInfo")}>{file ? <div className="space-y-2 text-xs text-muted-foreground"><p className="break-all">{file.name}</p><p>{(file.sizeKB / 1024).toFixed(1)} MB · {file.format}</p>{file.sha256 && <p className="break-all font-mono text-[10px]">SHA256 · {file.sha256}</p>}</div> : <p className="text-xs text-muted-foreground">{t("toolBox.civitai.noFiles")}</p>}</DetailSection>
    </div>
    {/* 界面：底部固定下载与官网入口，明确当前文件 */}
    <DownloadFooter model={model} version={version} source={source} fileId={fileId} onFileChange={setFileId} onConfigure={onConfigure} />
  </div>;
}
export function CivitaiDetails({ model, source }: { model: CivitaiModel; source: string }) {
  const { t } = useTranslation();
  const [versionId, setVersionId] = useState(model.versions[0]?.id || 0);
  const [downloadFile, setDownloadFile] = useState<CivitaiFile | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const version = model.versions.find((version) => version.id === versionId) || model.versions[0];
  return <div className="flex h-full min-h-0 flex-col" data-civitai-details={model.id}>
    {/* 界面：顶部固定模型名称与版本 */}
    <header data-civitai-version-bar className="shrink-0 space-y-2 border-b border-border bg-background p-3">
      <h3 className="truncate text-sm font-semibold" title={model.name}>{model.name}</h3><p className="truncate text-[10px] text-muted-foreground">{model.type} · {model.creator}</p>
      {version && <SimpleSelect value={String(version.id)} ariaLabel={t("toolBox.civitai.version")} onChange={(value) => { setDownloadFile(null); setPreviewIndex(0); setVersionId(Number(value)); }} options={model.versions.map((item) => ({ value: String(item.id), label: `${item.name} · ${item.baseModel}` }))} portal />}
    </header>
    {downloadFile && version ? <ModelDownloadForm key={`${version.id}/${downloadFile.id}`} model={model} version={version} file={downloadFile} source={source} previewUrl={version.images[previewIndex] || ""} onBack={() => setDownloadFile(null)} /> : <VersionContent key={version?.id || 0} model={model} version={version} source={source} previewIndex={previewIndex} onPreviewChange={setPreviewIndex} onConfigure={setDownloadFile} />}
  </div>;
}
