"use client";

// 界面：统一批量导入参考资源，按图片 / 视频 / 音频排序，卡片换行显示；上传仍由生成逻辑负责。
import { useRef } from "react";
import { Upload, X } from "lucide-react";
import { useTranslation } from "@/i18n";
import { REFERENCE_MEDIA_KINDS, orderedReferences, type VideoReferenceFile } from "@/utils/comfy/video-reference-media";
import { MIXED_REFERENCE_ACCEPT, REFERENCE_FILE_ACCEPT } from "@/utils/reference-file-types";
import { MEDIA_REFERENCE_LABELS, mediaReferenceToken } from "@/utils/prompt-media-references";
import { MediaThumbnail } from "./media-thumbnail";
import type { useVideoReferenceMedia } from "./use-video-reference-media";

interface Props { references: ReturnType<typeof useVideoReferenceMedia>; disabled: boolean }
function ResourceTile({ item, references }: { item: VideoReferenceFile; references: Props["references"] }) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const token = mediaReferenceToken(item);
  return <div data-reference-kind={item.kind} data-reference-number={item.number} className="group relative aspect-square min-w-0">
    <input ref={input} type="file" accept={REFERENCE_FILE_ACCEPT[item.kind]} className="hidden" onChange={(event) => {
      const file = event.target.files?.[0];
      if (file) references.select(item.kind, item.number, file);
      event.target.value = "";
    }} />
    <button type="button" title={`${token} · ${item.name} · ${t("create.upload.clickToReplace")}`} aria-label={`${token} · ${item.name}`}
      onClick={() => input.current?.click()} className="absolute inset-0 block h-full w-full overflow-hidden rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <MediaThumbnail item={item} className="h-full w-full rounded-none" />
      <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-center text-[10px] text-white">{token}</span>
    </button>
    <button type="button" data-reference-remove aria-label={t("create.upload.removeLabel", { label: token })} onClick={() => references.remove(item.id)}
      className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75 focus-visible:ring-2 focus-visible:ring-ring"><X className="h-3 w-3" /></button>
  </div>;
}

function ResourceImport({ references, disabled }: Props) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  return <>
    <input ref={input} type="file" multiple accept={MIXED_REFERENCE_ACCEPT} data-reference-import className="hidden" onChange={(event) => {
      if (!disabled) references.addFiles(Array.from(event.target.files ?? []));
      event.target.value = "";
    }} />
    <button type="button" data-reference-drop onClick={() => input.current?.click()}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = disabled ? "none" : "copy"; }}
      onDrop={(event) => { event.preventDefault(); if (!disabled) references.addFiles(Array.from(event.dataTransfer.files)); }}
      className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-3 text-sm font-medium text-primary transition-colors hover:border-primary/60 hover:bg-primary/5 disabled:opacity-50">
      <Upload className="h-4 w-4" />{t("create.videoReferences.importResources")}
    </button>
  </>;
}

export function VideoReferenceInputs({ references, disabled }: Props) {
  const { t } = useTranslation();
  const items = orderedReferences(references.media);
  return <fieldset disabled={disabled} data-video-reference-inputs className="min-w-0 space-y-2">
    {/* 界面：混合文件导入入口；拖放和文件选择共用同一分类、容量校验。 */}
    <ResourceImport references={references} disabled={disabled} />
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">{t("create.videoReferences.resources")}</span>
      {REFERENCE_MEDIA_KINDS.map((kind) => <span key={kind} data-reference-count={kind}>{t(MEDIA_REFERENCE_LABELS[kind])} {items.filter((item) => item.kind === kind).length}</span>)}
    </div>
    {/* 界面：仅用方形缩略图展示资源，视频首帧与 @ 搜索共用封面。 */}
    <div data-reference-grid className="grid max-h-64 grid-cols-[repeat(auto-fill,minmax(4rem,1fr))] gap-2 overflow-y-auto overscroll-contain p-0.5">
      {items.map((item) => <ResourceTile key={item.id} item={item} references={references} />)}
    </div>
    <p className="text-xs leading-relaxed text-muted-foreground">{t("create.videoReferences.hint")}</p>
  </fieldset>;
}
