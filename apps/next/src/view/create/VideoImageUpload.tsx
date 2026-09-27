"use client";

import { useRef } from "react";
import { Image as ImageIcon, X } from "lucide-react";
import { useTranslation } from "@/i18n";
import { THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type VideoImageUploadProps = {
  label: string;
  required?: boolean;
  imageUrl: string | null;
  onSelect: (file: File) => void;
  onRemove: () => void;
};

export function VideoImageUpload({
  label,
  required = false,
  imageUrl,
  onSelect,
  onRemove,
}: VideoImageUploadProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    onSelect(file);
    event.target.value = "";
  };

  return (
    <div>
      <input
        ref={fileInputRef}
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        type="file"
        onChange={handleChange}
      />
      <h2 className="mb-2 text-sm font-semibold">
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
          className={cn(
            "group relative flex min-h-[8rem] w-full cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed transition-all hover:border-muted-foreground hover:bg-muted/50",
            imageUrl ? THIN_BORDER_CLASS : "border-border"
          )}
        >
          {imageUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={t("create.videoImageUpload.previewAlt", { label })}
                className="absolute inset-0 h-full w-full object-contain p-1"
              />
              <div className="absolute inset-0 flex items-end justify-center bg-black/0 p-2 opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">
                <span className="text-xs font-medium text-white">
                  {t("create.upload.clickToReplace")}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted transition-colors group-hover:bg-muted-foreground/10">
                <ImageIcon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
              </div>
              <p className="whitespace-pre-line px-2 text-center text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                <span className="lg:hidden">
                  {t("create.videoImageUpload.clickToSelectOrUpload")}
                </span>
                <span className="hidden lg:inline">
                  {t("create.videoImageUpload.dragHint")}
                  {"\n"}
                  {t("create.videoImageUpload.uploadHint")}
                </span>
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
