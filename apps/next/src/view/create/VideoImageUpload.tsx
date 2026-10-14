"use client";

import { useRef } from "react";
import { Image as ImageIcon, Film, Music, X } from "lucide-react";
import type { PromptMediaKind } from "@/utils/prompt-media-references";
import { useTranslation } from "@/i18n";
import { THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";
import { REFERENCE_FILE_ACCEPT } from "@/utils/reference-file-types";

type VideoImageUploadProps = {
  label: string;
  required?: boolean;
  imageUrl: string | null;
  onSelect: (file: File) => void;
  onRemove: () => void;
  kind?: PromptMediaKind;
  filename?: string;
  /** 空的参考素材位置支持批量追加；已有素材与首尾帧仍只替换一个文件。 */
  onSelectFiles?: (files: File[]) => void;
};

export function VideoImageUpload({
  label,
  required = false,
  imageUrl,
  onSelect,
  onRemove,
  kind = "image",
  filename,
  onSelectFiles,
}: VideoImageUploadProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    if (onSelectFiles) onSelectFiles(files);
    else onSelect(files[0]);
    event.target.value = "";
  };

  return (
    <div className="min-w-0">
      <input
        ref={fileInputRef}
        accept={REFERENCE_FILE_ACCEPT[kind]}
        multiple={Boolean(onSelectFiles)}
        className="hidden"
        type="file"
        onChange={handleChange}
      />
      <h2 className="mb-2 text-xs font-semibold sm:text-sm">
        {label}
        {required ? (
          <span className="font-normal text-amber-600 dark:text-amber-500">
            {" "}
            {t("create.upload.required")}
          </span>
        ) : (
          <span className="font-normal text-muted-foreground">
            {" "}
            {t("create.upload.optional")}
          </span>
        )}
      </h2>
      <div className="relative">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
          onDrop={(event) => {
            event.preventDefault();
            if (fileInputRef.current?.disabled || fileInputRef.current?.matches(":disabled")) return;
            const files = Array.from(event.dataTransfer.files);
            if (onSelectFiles) onSelectFiles(files);
            else if (files[0]) onSelect(files[0]);
          }}
          className={cn(
            "group relative flex min-h-[8rem] w-full cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed transition-all hover:border-muted-foreground hover:bg-muted/50",
            imageUrl ? THIN_BORDER_CLASS : "border-border"
          )}
        >
          {imageUrl ? (
            <>
              {kind === "image" ? (<>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={t("create.videoImageUpload.previewAlt", { label })}
                className="absolute inset-0 h-full w-full object-contain p-1"
              />
              </>) : <div className="flex max-w-full flex-col items-center gap-2 px-3">{kind === "video" ? <Film className="h-6 w-6 text-muted-foreground" /> : <Music className="h-6 w-6 text-muted-foreground" />}<span className="max-w-full truncate text-xs" title={filename}>{filename}</span></div>}
              <div className="absolute inset-0 flex items-end justify-center bg-black/0 p-2 opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">
                <span className="text-xs font-medium text-white">
                  {t("create.upload.clickToReplace")}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted transition-colors group-hover:bg-muted-foreground/10">
                {kind === "image" ? <ImageIcon className="h-4 w-4 text-muted-foreground" /> : kind === "video" ? <Film className="h-4 w-4 text-muted-foreground" /> : <Music className="h-4 w-4 text-muted-foreground" />}
              </div>
              <p className="whitespace-pre-line px-2 text-center text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                {onSelectFiles ? t("create.videoReferences.batchHint") : <><span className="lg:hidden">
                  {t("create.videoImageUpload.clickToSelectOrUpload")}
                </span>
                <span className="hidden lg:inline">
                  {t("create.videoImageUpload.dragHint")}
                  {"\n"}
                  {t("create.videoImageUpload.uploadHint")}
                </span></>}
              </p>
            </>
          )}
        </button>
        {imageUrl && (
          <button
            type="button"
            aria-label={t("create.upload.removeLabel", { label })}
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
