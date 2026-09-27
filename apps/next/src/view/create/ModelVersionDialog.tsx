"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { ResourceCoverImage } from "@/components/ResourceCoverImage";
import { TruncatedTextPopover } from "@/components/TruncatedTextPopover";
import { useTranslation } from "@/i18n";
import type { ModelCover } from "@/types/model";
import { PRIMARY_BUTTON_CLASS, THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type ModelVersionDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  selectedKey: string;
  options: Array<{
    key: string;
    name: string;
    label: string;
    cover: ModelCover;
  }>;
  onOpenChange: (open: boolean) => void;
  onSelect: (key: string) => void;
};

export function ModelVersionDialog({
  open,
  title,
  description,
  selectedKey,
  options,
  onOpenChange,
  onSelect,
}: ModelVersionDialogProps) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
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
        aria-labelledby="model-version-dialog-title"
        className={cn(
          "fixed left-1/2 top-1/2 z-[96] grid w-full max-h-[85vh] max-w-2xl -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto border bg-background p-6 shadow-lg duration-200 outline-none sm:rounded-xl",
          THIN_BORDER_CLASS
        )}
      >
        <button
          type="button"
          aria-label={t("common.close")}
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 z-[200] rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 max-sm:left-4 max-sm:right-auto sm:left-auto"
        >
          <X className="h-5 w-5 sm:h-4 sm:w-4" />
        </button>

        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h2
            id="model-version-dialog-title"
            className="text-xl font-semibold tracking-tight"
          >
            {title}
          </h2>
          {description && (
            <p className="sr-only">{description}</p>
          )}
        </div>

        <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3">
          {options.map((option) => {
            const selected = option.key === selectedKey;

            return (
              <div
                key={option.key}
                role="button"
                tabIndex={0}
                onClick={() => {
                  onSelect(option.key);
                  onOpenChange(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(option.key);
                    onOpenChange(false);
                  }
                }}
                className={cn(
                  "group relative flex h-full cursor-pointer flex-col overflow-visible rounded-xl border",
                  selected
                    ? "border-green-500 outline outline-1 outline-green-500 dark:border-green-500 dark:outline-green-500"
                    : "border-border hover:border-primary/50 dark:border-gray-700"
                )}
              >
                {selected && (
                  <div className="absolute -top-5 right-2 z-30 rounded-t-md bg-green-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white shadow-lg">
                    {t("create.modelVersionDialog.selected")}
                  </div>
                )}

                <div
                  className="relative isolate flex flex-col justify-end overflow-hidden rounded-t-xl bg-gray-900 pb-3"
                  style={{ aspectRatio: "4 / 5" }}
                >
                  <ResourceCoverImage
                    cover={option.cover}
                    alt={option.name}
                    fill
                    sizes="(max-width: 768px) 50vw, 33vw"
                    className="absolute inset-0 -z-10 h-full w-full object-cover"
                  />
                </div>

                <div className="flex min-w-0 flex-1 flex-col px-3 pb-3 pt-2">
                  <div className="min-w-0 flex-1">
                    <TruncatedTextPopover
                      text={option.name}
                      className="text-sm font-semibold leading-6 text-primary"
                    />
                    <TruncatedTextPopover
                      text={option.label}
                      className="text-xs text-muted-foreground"
                    />
                  </div>
                  <div className="mt-3">
                    <button
                      type="button"
                      className={cn(
                        "inline-flex h-8 w-full items-center justify-center rounded-xl px-3 text-sm font-medium text-white shadow transition-colors",
                        selected
                          ? "bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
                          : PRIMARY_BUTTON_CLASS
                      )}
                    >
                      {selected
                        ? t("create.modelVersionDialog.selected")
                        : t("create.modelVersionDialog.select")}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
