"use client";

import { useRef } from "react";
import { Music, X } from "lucide-react";
import { useTranslation } from "@/i18n";
import { THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type AudioUploadProps = {
  label: string;
  required?: boolean;
  fileName: string | null;
  onSelect: (file: File) => void;
  onRemove: () => void;
  emptyHint?: string;
};

export function AudioUpload({
  label,
  required = false,
  fileName,
  onSelect,
  onRemove,
  emptyHint,
}: AudioUploadProps) {
  const { t } = useTranslation();

  /** 回退值从「参数默认值」挪到函数体内：默认值在函数体外求值，拿不到 hook 的 t */
  const emptyHintText = emptyHint ?? t("create.audioUpload.emptyHintDefault");
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
        accept="audio/mpeg,audio/wav,audio/mp3,audio/x-m4a,audio/flac,audio/*"
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
            "group relative flex min-h-[8rem] w-full cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed px-3 transition-all hover:border-muted-foreground hover:bg-muted/50",
            fileName ? THIN_BORDER_CLASS : "border-border"
          )}
        >
          {fileName ? (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Music className="h-5 w-5 text-foreground" />
              </div>
              <p className="max-w-full truncate text-center text-sm font-medium text-foreground">
                {fileName}
              </p>
              <span className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                {t("create.upload.clickToReplace")}
              </span>
            </>
          ) : (
            <>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted transition-colors group-hover:bg-muted-foreground/10">
                <Music className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
              </div>
              <p className="whitespace-pre-line px-2 text-center text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                {emptyHintText}
              </p>
            </>
          )}
        </button>
        {fileName && (
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
