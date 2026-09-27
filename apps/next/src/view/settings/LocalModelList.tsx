"use client";

import { useMemo, useState } from "react";
import { ChevronDown, FolderOpen, Plus, Trash2 } from "lucide-react";
import { useLocalImageSrc } from "@/hooks/useLocalImageSrc";
import type { LocalModel } from "@/types/localModel";
import { useCustomCategoryStore } from "@/stores/useCustomCategoryStore";
import { useTranslation } from "@/i18n";
import { INPUT_BORDER_CLASS, PRIMARY_BUTTON_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";
import { NewCategoryDialog } from "@/view/settings/NewCategoryDialog";
import { AddModelsToCategoryDialog } from "@/view/settings/AddModelsToCategoryDialog";

function FileCard({
  name,
  source,
  iconPath,
  onRemove,
}: {
  name: string;
  source: string;
  iconPath: string | null;
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  const iconUrl = useLocalImageSrc(iconPath);

  return (
    <article
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-xl bg-background p-3 transition-colors hover:bg-muted/40",
        INPUT_BORDER_CLASS
      )}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
        {iconUrl ? (
          <img
            src={iconUrl}
            alt={`${name} logo`}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-[10px] font-medium text-muted-foreground">
            {t("settings.models.badge")}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="truncate text-sm font-medium text-foreground">{name}</h4>
        <p
          className="mt-1 truncate text-xs text-muted-foreground"
          title={source}
        >
          {t("settings.models.sourcePrefix")}{source}
        </p>
      </div>
      {onRemove && (
        <button
          type="button"
          aria-label={t("settings.models.removeFromCategory")}
          onClick={onRemove}
          className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </article>
  );
}

type DrawerProps = {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

function FolderDrawer({ title, count, defaultOpen, children }: DrawerProps) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl bg-background",
        INPUT_BORDER_CLASS
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-2 px-3 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-semibold">{title}</span>
        <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {count}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-2 px-2 pb-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

type FileEntry = {
  category: string;
  name: string;
  source: string;
  filePath: string;
  iconPath: string | null;
};

type LocalModelListProps = {
  models: LocalModel[];
  scanning: boolean;
};

export function LocalModelList({ models, scanning }: LocalModelListProps) {
  const { t } = useTranslation();
  const categories = useCustomCategoryStore((state) => state.categories);
  const assignedPaths = useMemo(
    () =>
      new Set(categories.flatMap((category) => category.modelFilePaths)),
    [categories]
  );

  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [addToCategoryId, setAddToCategoryId] = useState<string | null>(null);

  /** 全部文件条目（含分类名，分类名 = 根目录下的主要文件夹名，如 checkpoints） */
  const allFiles = useMemo<FileEntry[]>(() => {
    const entries: FileEntry[] = [];

    for (const model of models) {
      const category = model.category || model.type

      for (const version of model.versions ?? []) {
        entries.push({
          category,
          name: version.name,
          source: version.filePath,
          filePath: version.filePath,
          iconPath: model.iconPath,
        });
      }
    }
    return entries;
  }, [models]);

  /** 默认分类抽屉：按文件夹名（分类）聚合；已分配自定义分类的文件不重复显示；无文件分类不显示 */
  const categoryDrawers = useMemo(() => {
    const map = new Map<string, FileEntry[]>();
    for (const file of allFiles) {
      if (assignedPaths.has(file.filePath)) continue;
      const list = map.get(file.category) ?? [];
      list.push(file);
      map.set(file.category, list);
    }

    return [...map.entries()]
      .map(([category, files]) => ({
        category,
        files: files.sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
      }))
      .sort((a, b) => a.category.localeCompare(b.category, "zh-CN"));
  }, [allFiles, assignedPaths]);

  /** 自定义分类（优先级高于默认分类） */
  const customGroups = useMemo(
    () =>
      categories
        .map((category) => ({
          category,
          files: allFiles.filter((file) =>
            category.modelFilePaths.includes(file.filePath)
          ),
        }))
        .filter((group) => group.files.length > 0),
    [categories, allFiles]
  );

  if (scanning) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        {t("settings.models.scanning")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setNewCategoryOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-muted px-3 text-xs font-medium transition-colors hover:bg-accent"
      >
        <Plus className="h-3.5 w-3.5" />
        {t("settings.newCategory.title")}
      </button>

      {models.length === 0 && categories.length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {t("settings.models.empty")}
        </div>
      )}

      {customGroups.map(({ category, files }) => (
        <FolderDrawer
          key={category.id}
          title={`${category.name}${t("settings.models.customSuffix")}`}
          count={category.modelFilePaths.length}
          defaultOpen
        >
          {files.map((file) => (
            <FileCard
              key={file.filePath}
              name={file.name}
              source={file.source}
              iconPath={file.iconPath}
              onRemove={() =>
                useCustomCategoryStore
                  .getState()
                  .removeModelFromCategory(category.id, file.filePath)
              }
            />
          ))}
          <button
            type="button"
            onClick={() => setAddToCategoryId(category.id)}
            className={cn(
              "inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors",
              PRIMARY_BUTTON_CLASS
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("settings.models.addModels")}
          </button>
        </FolderDrawer>
      ))}

      {categoryDrawers.map(({ category, files }) => (
        <FolderDrawer key={category} title={category} count={files.length}>
          {files.map((file) => (
            <FileCard
              key={file.filePath}
              name={file.name}
              source={file.source}
              iconPath={file.iconPath}
            />
          ))}
        </FolderDrawer>
      ))}

      <NewCategoryDialog
        open={newCategoryOpen}
        onOpenChange={setNewCategoryOpen}
      />

      {addToCategoryId && (
        <AddModelsToCategoryDialog
          categoryId={addToCategoryId}
          models={models}
          onClose={() => setAddToCategoryId(null)}
        />
      )}
    </div>
  );
}
