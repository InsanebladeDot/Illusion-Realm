"use client";

import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, List, Plus, Search, X } from "lucide-react";
import {
  filterQuickPhrases,
  QUICK_PHRASE_DESCRIPTION,
} from "@/data/quickPhrases";
import { useQuickPhraseStore } from "@/stores/useQuickPhraseStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import type { QuickPhrase, QuickPhraseViewMode } from "@/types/quickPhrase";
import { insertPromptText } from "@/utils/quickPhrases";
import { CreateQuickPhraseDialog } from "@/view/create/CreateQuickPhraseDialog";
import { QuickPhraseCard } from "@/view/create/QuickPhraseCard";
import { INPUT_BORDER_CLASS, THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type QuickPhraseDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUsed?: () => void;
};

export function QuickPhraseDialog({
  open,
  onOpenChange,
  onUsed,
}: QuickPhraseDialogProps) {
  const { t } = useTranslation();
  const phrases = useQuickPhraseStore((state) => state.phrases);
  const addPhrase = useQuickPhraseStore((state) => state.addPhrase);
  const updatePhrase = useQuickPhraseStore((state) => state.updatePhrase);
  const removePhrase = useQuickPhraseStore((state) => state.removePhrase);
  const showToast = useToastStore((state) => state.show);

  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<QuickPhraseViewMode>("list");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingPhrase, setEditingPhrase] = useState<QuickPhrase | null>(null);

  /**
   * 渲染期同步：**每次**「关闭 → 打开」都回到初始视图（清搜索、回列表、关闭新建/编辑）。
   * 记录前值到 state、渲染期比较后立即 set，替代 effect 内 setState。
   *
   * 注意：必须在两个方向上记录前值（而不是只在 open 为真时记录），
   * 否则第二次打开时 `open === 前值` 会跳过重置。
   */
  const [previousOpen, setPreviousOpen] = useState(false);
  if (open !== previousOpen) {
    setPreviousOpen(open);
    if (open) {
      setSearch("");
      setViewMode("list");
      setCreateOpen(false);
      setEditingPhrase(null);
    }
  }

  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (createOpen) {
          setCreateOpen(false);
          setEditingPhrase(null);
          return;
        }
        onOpenChange(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, onOpenChange, createOpen]);

  const filteredPhrases = useMemo(
    () => filterQuickPhrases(phrases, search),
    [phrases, search]
  );

  const handleOpenCreate = () => {
    setEditingPhrase(null);
    setCreateOpen(true);
  };

  const handleEdit = (phrase: QuickPhrase) => {
    setEditingPhrase(phrase);
    setCreateOpen(true);
  };

  const handleUse = (phrase: QuickPhrase) => {
    insertPromptText(phrase.promptText);
    onUsed?.();
    onOpenChange(false);
  };

  const handleSave = (input: {
    keyword: string;
    promptText: string;
    imagePath: string | null;
  }) => {
    const duplicate = phrases.some(
      (phrase) =>
        phrase.keyword === input.keyword && phrase.id !== editingPhrase?.id
    );
    if (duplicate) {
      showToast(t("create.quickPhraseDialog.duplicate", { keyword: input.keyword }));
      return;
    }

    if (editingPhrase) {
      updatePhrase(editingPhrase.id, input);
    } else {
      addPhrase(input);
    }
    setEditingPhrase(null);
  };

  if (!open) return null;

  const handleClose = () => onOpenChange(false);

  return (
    <>
      <div
        className="fixed inset-0 z-[89] bg-black/50"
        aria-hidden
        onClick={handleClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-phrase-dialog-title"
        className={cn(
          "fixed left-1/2 top-1/2 z-[90] flex h-[100dvh] max-h-[100dvh] w-[calc(100vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden border bg-background shadow-lg duration-200 outline-none sm:h-[min(85vh,640px)] sm:max-h-[min(85vh,640px)] sm:w-[min(calc(100vw-2rem),560px)] sm:rounded-xl",
          THIN_BORDER_CLASS
        )}
        style={{
          paddingTop: "max(1rem, env(safe-area-inset-top))",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <button
          type="button"
          aria-label={t("common.close")}
          onClick={handleClose}
          className="absolute right-4 top-4 z-[200] rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 max-sm:left-4 max-sm:right-auto sm:left-auto"
        >
          <X className="h-5 w-5 sm:h-4 sm:w-4" />
        </button>

        <div className="flex shrink-0 flex-col space-y-1.5 px-3 pb-2 text-center sm:px-6 sm:text-left">
          <h2
            id="quick-phrase-dialog-title"
            className="text-lg font-semibold leading-none tracking-tight"
          >
            {t("create.quickPhraseDialog.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {QUICK_PHRASE_DESCRIPTION}
          </p>
        </div>

        <div
          className={cn(
            "shrink-0 border-b px-3 py-3 dark:border-gray-700 sm:px-6",
            THIN_BORDER_CLASS
          )}
        >
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("create.quickPhraseDialog.searchPlaceholder")}
                className={cn(
                  "flex h-8 w-full rounded-md bg-transparent py-1 pl-8 pr-3 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:text-sm",
                  INPUT_BORDER_CLASS
                )}
              />
            </div>

            <div className="flex items-center overflow-hidden rounded-lg border bg-background">
              <button
                type="button"
                aria-label={t("create.quickPhraseDialog.listView")}
                aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}
                className={cn(
                  "inline-flex h-8 items-center justify-center rounded-none px-2 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                  viewMode === "list" && "bg-muted"
                )}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={t("create.quickPhraseDialog.gridView")}
                aria-pressed={viewMode === "grid"}
                onClick={() => setViewMode("grid")}
                className={cn(
                  "inline-flex h-8 items-center justify-center rounded-none px-2 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                  viewMode === "grid" && "bg-muted"
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleOpenCreate}
              className="inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-purple-500 px-3 text-xs font-medium text-white shadow transition-colors hover:bg-purple-600"
            >
              <Plus className="h-4 w-4" />
              {t("create.quickPhraseDialog.create")}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6">
          {filteredPhrases.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
              <p className="text-sm">
                {t("create.quickPhraseDialog.empty")}
              </p>
              <p className="mt-1 text-xs opacity-80">
                {t("create.quickPhraseDialog.emptyHint")}
              </p>
              <button
                type="button"
                onClick={handleOpenCreate}
                className="mt-3 inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-purple-500 px-3 text-xs font-medium text-white shadow transition-colors hover:bg-purple-600"
              >
                <Plus className="h-4 w-4" />
                {t("create.quickPhraseDialog.createPhrase")}
              </button>
            </div>
          ) : (
            <div
              className={cn(
                viewMode === "grid"
                  ? "grid grid-cols-1 gap-2 sm:grid-cols-2"
                  : "space-y-2"
              )}
            >
              {filteredPhrases.map((phrase) => (
                <QuickPhraseCard
                  key={phrase.id}
                  phrase={phrase}
                  onUse={handleUse}
                  onEdit={handleEdit}
                  onDelete={(item) => removePhrase(item.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <CreateQuickPhraseDialog
        open={createOpen}
        onOpenChange={(nextOpen) => {
          setCreateOpen(nextOpen);
          if (!nextOpen) setEditingPhrase(null);
        }}
        editingPhrase={editingPhrase}
        onSave={handleSave}
      />
    </>
  );
}
