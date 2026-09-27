"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { useTranslation } from "@/i18n";
import { INSPECTABLE_IMAGE_EXTENSIONS } from "@/utils/sdImageInspector/guessImageMime";
import { cn } from "@/utils/cn";

const ACCEPT = INSPECTABLE_IMAGE_EXTENSIONS.map((ext) => `.${ext}`).join(",");

type ImageUploadDropzoneProps = {
  disabled?: boolean;
  onFileSelect: (file: File) => void;
};

export function ImageUploadDropzone({
  disabled = false,
  onFileSelect,
}: ImageUploadDropzoneProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    onFileSelect(file);
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        if (disabled) return;
        handleFiles(event.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center transition-colors",
        dragOver
          ? "border-foreground/40 bg-muted/60"
          : "border-border/80 bg-muted/20 hover:bg-muted/40",
        disabled && "pointer-events-none opacity-60"
      )}
    >
      <Upload className="h-5 w-5 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium">{t("inspect.uploadDropzone.title")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("inspect.uploadDropzone.hint")}
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
