"use client";

import { useEffect, useState } from "react";
import { ImageIcon, X } from "lucide-react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { LocalFileImage } from "@/components/LocalFileImage";
import { useTranslation } from "@/i18n";
import { listGeneratedImages } from "@/utils/generatedImages";
import { INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type QuickPhraseImagePickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPath?: string | null;
  onSelect: (filePath: string) => void;
};

export function QuickPhraseImagePickerDialog({
  open,
  onOpenChange,
  selectedPath,
  onSelect,
}: QuickPhraseImagePickerDialogProps) {
  const { t } = useTranslation();
  const outputPath = useSettingsStore((state) => state.outputPath);
  const [images, setImages] = useState<
    Array<{ filePath: string; fileName: string }>
  >([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    void (async () => {
      // setLoading 放在 async IIFE 内部：与原先同步调用处于同一批次，
      // 但不属于「effect 体内同步 setState」（react-hooks/set-state-in-effect）
      setLoading(true);
      try {
        const files = await listGeneratedImages(outputPath, null);
        if (!cancelled) setImages(files);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, outputPath]);

  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[95] bg-black/50"
        aria-hidden
        onClick={() => onOpenChange(false)}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-phrase-image-picker-title"
        className={cn(
          "fixed left-1/2 top-1/2 z-[96] flex max-h-[70vh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 border bg-background p-6 shadow-lg outline-none sm:rounded-xl",
          INPUT_BORDER_CLASS
        )}
      >
        <div className="space-y-1">
          <h2
            id="quick-phrase-image-picker-title"
            className="text-lg font-semibold"
          >
            {t("create.quickPhraseImagePicker.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("create.quickPhraseImagePicker.description")}
          </p>
        </div>

        <div className="min-h-[200px] flex-1 overflow-y-auto rounded-md border p-2">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("create.quickPhraseImagePicker.loading")}
            </p>
          ) : images.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("create.quickPhraseImagePicker.empty")}
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-1">
              {images.map((image) => (
                <button
                  key={image.filePath}
                  type="button"
                  onClick={() => {
                    onSelect(image.filePath);
                    onOpenChange(false);
                  }}
                  className={cn(
                    "aspect-square overflow-hidden rounded-sm bg-muted/30 ring-2 ring-transparent hover:opacity-90",
                    selectedPath === image.filePath && "ring-purple-500"
                  )}
                >
                  <LocalFileImage
                    filePath={image.filePath}
                    alt={image.fileName}
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          aria-label={t("common.close")}
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}

function ImagePlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
      <ImageIcon className="h-5 w-5" />
    </div>
  );
}

export function QuickPhraseImagePreview({
  imagePath,
  className,
}: {
  imagePath: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border bg-muted",
        className
      )}
    >
      <LocalFileImage
        filePath={imagePath}
        alt=""
        className="h-full w-full object-cover"
        fallback={<ImagePlaceholder />}
      />
    </div>
  );
}
