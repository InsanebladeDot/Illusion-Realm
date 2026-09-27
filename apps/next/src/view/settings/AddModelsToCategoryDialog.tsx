"use client";

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import type { LocalModel } from "@/types/localModel";
import { useCustomCategoryStore } from "@/stores/useCustomCategoryStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import { PRIMARY_BUTTON_CLASS, THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type AddModelsToCategoryDialogProps = {
  categoryId: string;
  models: LocalModel[];
  onClose: () => void;
};

/** 批量分配：层级展示「分类名 / 模型文件名」，勾选未分配模型加入自定义分类 */
export function AddModelsToCategoryDialog({
  categoryId,
  models,
  onClose,
}: AddModelsToCategoryDialogProps) {
  const { t } = useTranslation();
  const categories = useCustomCategoryStore((state) => state.categories);
  const addModelsToCategory = useCustomCategoryStore(
    (state) => state.addModelsToCategory
  );
  const showToast = useToastStore((state) => state.show);

  const category = categories.find((item) => item.id === categoryId);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  /** 未分配模型的文件级条目，按「顶层文件夹名 / 模型文件名」层级组织 */
  const candidates = useMemo(() => {
    const used = new Set(
      categories.flatMap((item) => item.modelFilePaths)
    );
    const list: Array<{ folder: string; filePath: string; name: string }> =
      [];
    for (const model of models) {
      for (const version of model.versions ?? []) {
        if (used.has(version.filePath)) continue;
        list.push({
          folder: model.category ?? t("settings.models.otherCategory"),
          filePath: version.filePath,
          name: version.name,
        });
      }
    }
    const grouped = new Map<string, typeof list>();
    for (const item of list) {
      const group = grouped.get(item.folder) ?? [];
      group.push(item);
      grouped.set(item.folder, group);
    }
    return [...grouped.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "zh-CN"))
      .map(([folderName, items]) => ({
        folder: folderName,
        items: items.sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
      }));
  }, [categories, models, t]);

  const toggle = (filePath: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    if (!category) return;
    const filePaths = Array.from(selected);
    addModelsToCategory(category.id, filePaths);
    showToast(
      filePaths.length > 0
        ? t("settings.addModels.added", {
            count: filePaths.length,
            name: category.name,
          })
        : t("settings.addModels.noneSelected")
    );
    onClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[89] bg-black/50"
        aria-hidden
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-models-title"
        className={cn(
          "fixed left-1/2 top-1/2 z-[90] flex max-h-[80dvh] w-[calc(100vw-3rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-background shadow-lg",
          THIN_BORDER_CLASS
        )}
      >
        <div className="shrink-0 border-b border-border p-4">
          <h2
            id="add-models-title"
            className="text-base font-semibold text-foreground"
          >
            {t("settings.addModels.titlePrefix")}{category?.name ?? ""}」
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("settings.addModels.description")}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {candidates.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">
              {t("settings.addModels.empty")}
            </p>
          ) : (
            candidates.map((group) => (
              <div key={group.folder} className="mb-4">
                <h3 className="mb-1.5 px-1 text-xs font-semibold text-muted-foreground">
                  {group.folder}
                </h3>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <button
                      key={item.filePath}
                      type="button"
                      onClick={() => toggle(item.filePath)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/50",
                        selected.has(item.filePath) && "bg-muted/60"
                      )}
                    >
                      <span className="truncate">{item.name}</span>
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          selected.has(item.filePath)
                            ? "border-foreground bg-foreground text-background"
                            : "border-border"
                        )}
                      >
                        {selected.has(item.filePath) && (
                          <Check className="h-3 w-3" />
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border p-3">
          <span className="text-xs text-muted-foreground">
            {t("settings.addModels.selectedPrefix")}
            {selected.size}
            {t("settings.addModels.selectedSuffix")}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium transition-colors hover:bg-accent"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selected.size === 0}
              className={cn(
                "inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium transition-colors disabled:opacity-50",
                PRIMARY_BUTTON_CLASS
              )}
            >
              {t("settings.addModels.add")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
