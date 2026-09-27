"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@/i18n";
import type { QuickPhrase } from "@/types/quickPhrase";
import { formatQuickPhraseKeyword } from "@/utils/quickPhrases";
import { QuickPhraseImagePreview } from "@/view/create/QuickPhraseImagePicker";
import { INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type QuickPhraseCardProps = {
  phrase: QuickPhrase;
  onUse: (phrase: QuickPhrase) => void;
  onEdit: (phrase: QuickPhrase) => void;
  onDelete: (phrase: QuickPhrase) => void;
};

export function QuickPhraseCard({
  phrase,
  onUse,
  onEdit,
  onDelete,
}: QuickPhraseCardProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "group w-full rounded-xl border bg-card p-3 transition-colors hover:border-purple-300 dark:border-gray-700 dark:bg-muted dark:hover:border-purple-500",
        INPUT_BORDER_CLASS
      )}
    >
      <div className="flex items-start gap-3">
        <QuickPhraseImagePreview
          imagePath={phrase.imagePath ?? null}
          className="h-14 w-14 shrink-0"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                {formatQuickPhraseKeyword(phrase.keyword)}
              </div>
            </div>
          </div>
          <div className="mt-2 line-clamp-2 text-xs text-muted-foreground">
            {phrase.promptText}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => onUse(phrase)}
            className="inline-flex h-8 items-center justify-center rounded-md bg-purple-500 px-3 text-xs font-medium text-white shadow hover:bg-purple-600"
          >
            {t("create.quickPhraseCard.use")}
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={t("create.quickPhraseCard.edit")}
              title={t("create.quickPhraseCard.edit")}
              onClick={() => onEdit(phrase)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={t("create.quickPhraseCard.deletePhrase")}
              title={t("create.quickPhraseCard.deletePhrase")}
              onClick={() => onDelete(phrase)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-destructive hover:bg-accent hover:text-accent-foreground"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
