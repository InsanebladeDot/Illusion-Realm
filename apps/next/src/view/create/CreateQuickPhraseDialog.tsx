"use client";

import { useEffect, useMemo, useState } from "react";
import { Info, X } from "lucide-react";
import { useTranslation } from "@/i18n";
import type { QuickPhrase } from "@/types/quickPhrase";
import { normalizeQuickPhraseKeyword } from "@/utils/quickPhrases";
import {
  QuickPhraseImagePickerDialog,
  QuickPhraseImagePreview,
} from "@/view/create/QuickPhraseImagePicker";
import { INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type CreateQuickPhraseDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingPhrase?: QuickPhrase | null;
  onSave: (input: {
    keyword: string;
    promptText: string;
    imagePath: string | null;
  }) => void;
};

export function CreateQuickPhraseDialog({
  open,
  onOpenChange,
  editingPhrase = null,
  onSave,
}: CreateQuickPhraseDialogProps) {
  const { t } = useTranslation();
  const [keywordInput, setKeywordInput] = useState("");
  const [promptText, setPromptText] = useState("");
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);

  const isEditing = Boolean(editingPhrase);

  /**
   * 渲染期同步：**每次**打开都按 editingPhrase 回填表单（新建则为空）。
   * 记录前值到 state、渲染期比较后立即 set，替代 effect 内 setState。
   *
   * 注意：key 里带了 open，因此必须在**两个方向**上都记录前值
   * ——若加上 `open &&` 前置条件，关闭时前值不会更新，再次打开时会跳过回填，
   * 残留上次未保存的草稿。
   */
  const [previousFillKey, setPreviousFillKey] = useState<string | null>(null);
  const fillKey = `${open}|${editingPhrase?.id ?? "new"}`;
  if (fillKey !== previousFillKey) {
    setPreviousFillKey(fillKey);
    if (open) {
      setKeywordInput(editingPhrase?.keyword ?? "");
      setPromptText(editingPhrase?.promptText ?? "");
      setImagePath(editingPhrase?.imagePath ?? null);
    }
  }

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

  const normalizedKeyword = useMemo(
    () => normalizeQuickPhraseKeyword(keywordInput),
    [keywordInput]
  );

  const canSave =
    normalizedKeyword.length > 0 && promptText.trim().length > 0;

  const handleKeywordChange = (value: string) => {
    setKeywordInput(value.replace(/\s/g, "-"));
  };

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      keyword: normalizedKeyword,
      promptText: promptText.trim(),
      imagePath,
    });
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[91] bg-black/50"
        aria-hidden
        onClick={() => onOpenChange(false)}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-quick-phrase-title"
        className={cn(
          "fixed left-1/2 top-1/2 z-[92] grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg outline-none duration-200 sm:max-w-[720px] sm:rounded-xl",
          INPUT_BORDER_CLASS
        )}
      >
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <h2
              id="create-quick-phrase-title"
              className="text-lg font-semibold leading-none tracking-tight"
            >
              {isEditing
                ? t("create.quickPhraseFormDialog.titleEdit")
                : t("create.quickPhraseFormDialog.titleCreate")}
            </h2>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted/60 focus:outline-none"
              aria-label={t("create.createQuickPhraseDialog.help")}
            >
              <Info className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              {t("create.createQuickPhraseDialog.showImage")}
            </label>
            <div className="flex items-center gap-3">
              <QuickPhraseImagePreview
                imagePath={imagePath}
                className="h-14 w-14 shrink-0"
              />
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setImagePickerOpen(true)}
                    className={cn(
                      "inline-flex h-8 items-center justify-center rounded-md border bg-background px-3 text-xs font-medium shadow-sm hover:bg-accent hover:text-accent-foreground",
                      INPUT_BORDER_CLASS
                    )}
                  >
                    {t("create.createQuickPhraseDialog.chooseImage")}
                  </button>
                  {imagePath && (
                    <button
                      type="button"
                      onClick={() => setImagePath(null)}
                      className={cn(
                        "inline-flex h-8 items-center justify-center rounded-md border px-3 text-xs font-medium shadow-sm hover:bg-muted",
                        INPUT_BORDER_CLASS
                      )}
                    >
                      {t("create.createQuickPhraseDialog.clear")}
                    </button>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {t("create.createQuickPhraseDialog.chooseImageHint")}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              {t("create.createQuickPhraseDialog.keyword")}
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                #
              </div>
              <input
                type="text"
                value={keywordInput}
                onChange={(event) => handleKeywordChange(event.target.value)}
                placeholder="mystyle"
                className={cn(
                  "flex h-9 w-full rounded-md border bg-transparent py-1 pl-6 pr-3 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:text-sm",
                  INPUT_BORDER_CLASS
                )}
              />
            </div>
            <div className="text-[11px] text-muted-foreground">
              {t("create.createQuickPhraseDialog.keywordHint")}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              {t("create.createQuickPhraseDialog.promptText")}
            </label>
            <textarea
              value={promptText}
              onChange={(event) => setPromptText(event.target.value)}
              rows={8}
              placeholder="portrait, backlighting, dark background, "
              className={cn(
                "flex min-h-[60px] w-full resize-y rounded-md border bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:text-sm",
                INPUT_BORDER_CLASS
              )}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={cn(
              "inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground",
              INPUT_BORDER_CLASS
            )}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={handleSave}
            className="inline-flex h-9 items-center justify-center rounded-md bg-purple-500 px-4 py-2 text-sm font-medium text-white shadow hover:bg-purple-600 disabled:pointer-events-none disabled:opacity-50"
          >
            {t("common.save")}
          </button>
        </div>

        <button
          type="button"
          aria-label={t("common.close")}
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 z-[200] rounded-sm opacity-70 transition-opacity hover:opacity-100 max-sm:left-4 max-sm:right-auto sm:left-auto"
        >
          <X className="h-5 w-5 sm:h-4 sm:w-4" />
        </button>
      </div>

      <QuickPhraseImagePickerDialog
        open={imagePickerOpen}
        onOpenChange={setImagePickerOpen}
        selectedPath={imagePath}
        onSelect={setImagePath}
      />
    </>
  );
}
