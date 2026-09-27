"use client";

import { useCallback, useEffect, useState } from "react";
import { useCustomCategoryStore } from "@/stores/useCustomCategoryStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import { INPUT_BORDER_CLASS, PRIMARY_BUTTON_CLASS, THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type NewCategoryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NewCategoryDialog({
  open,
  onOpenChange,
}: NewCategoryDialogProps) {
  const { t } = useTranslation();
  const addCategory = useCustomCategoryStore((state) => state.addCategory);
  const showToast = useToastStore((state) => state.show);
  const [name, setName] = useState("");

  const closeDialog = useCallback(() => {
    setName("");
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDialog();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, closeDialog]);

  if (!open) return null;

  const handleSubmit = () => {
    const id = addCategory(name);
    if (!id) {
      showToast(t("settings.newCategory.invalid"));
      return;
    }
    showToast(t("settings.newCategory.created"));
    closeDialog();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[89] bg-black/50"
        aria-hidden
        onClick={closeDialog}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-category-title"
        className={cn(
          "fixed left-1/2 top-1/2 z-[90] w-[calc(100vw-3rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background p-5 shadow-lg",
          THIN_BORDER_CLASS
        )}
      >
        <h2
          id="new-category-title"
          className="text-base font-semibold text-foreground"
        >
          {t("settings.newCategory.title")}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("settings.newCategory.description")}
        </p>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleSubmit();
          }}
          placeholder={t("settings.newCategory.namePlaceholder")}
          autoFocus
          className={cn(
            "mt-4 flex h-10 w-full rounded-lg bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1",
            INPUT_BORDER_CLASS
          )}
        />
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={closeDialog}
            className="inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium transition-colors hover:bg-accent"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!name.trim()}
            className={cn(
              "inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium transition-colors disabled:opacity-50",
              PRIMARY_BUTTON_CLASS
            )}
          >
            {t("settings.newCategory.create")}
          </button>
        </div>
      </div>
    </>
  );
}
