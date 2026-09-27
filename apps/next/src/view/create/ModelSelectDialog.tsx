"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useCreateFormStore } from "@/stores/useCreateFormStore";
import { useTranslation } from "@/i18n";
import { ResourceCoverImage } from "@/components/ResourceCoverImage";
import { ResourceDialogShell } from "@/components/ResourceDialogShell";
import type { SelectedModel } from "@/types/model";
import { makeLocalCheckpointId } from "@/utils/localModelResources";
import { PRIMARY_BUTTON_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";
import { getResourceDialogTypography } from "@/utils/resourceDialogFontSize";
import { useMediaQueryAfterHydration } from "@/hooks/useMediaQuery";

type ModelSelectDialogProps = {
  open: boolean;
  selected: SelectedModel;
  /** 当前模型系列：anima → diffusion_models/Anima，sdxl → checkpoint/SDXL */
  series?: "anima" | "sdxl";
  onOpenChange: (open: boolean) => void;
  onSelect: (selected: SelectedModel) => void;
};

function isUnderFolder(filePath: string, folder: string): boolean {
  const normalizedFile = filePath.replace(/\\/g, "/").toLowerCase();
  const normalizedFolder = folder
    .replace(/\\/g, "/")
    .replace(/\/+$/, "")
    .toLowerCase();
  return (
    normalizedFile === normalizedFolder ||
    normalizedFile.startsWith(`${normalizedFolder}/`)
  );
}

export function ModelSelectDialog({
  open,
  selected,
  series = "anima",
  onOpenChange,
  onSelect,
}: ModelSelectDialogProps) {
  const { t } = useTranslation();
  const localModels = useSettingsStore((state) => state.models);
  const paths = useSettingsStore((state) => state.paths);
  const resourceDialogFontSize = useCreateFormStore(
    (state) => state.resourceDialogFontSize
  );
  const typography = getResourceDialogTypography(resourceDialogFontSize);
  /** 与 `ResourceDialogShell` 同一个断点：紧凑形态下工具栏控件占满整行（外壳负责抬最小高度） */
  const isCompact = !useMediaQueryAfterHydration("(min-width: 1280px)");
  const [search, setSearch] = useState("");

  const isAnima = series === "anima";
  const seriesName = isAnima ? "Anima" : "SDXL";

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      setSearch("");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

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

  /**
   * 仅加载当前系列对应文件夹下的模型文件：
   * - anima → {diffusionModelsPath}/Anima
   * - sdxl  → {checkpointPath}/SDXL
   * 其余模型文件一律不使用。
   */
  const fileModels = useMemo(() => {
    const baseRoot = (isAnima ? paths.diffusionModelsPath : paths.checkpointPath || "").trim();
    const useCategory = !baseRoot;
    const seriesFolder = useCategory
      ? ""
      : `${baseRoot.replace(/[\\/]+$/, "")}/${seriesName}`;

    const base = useCategory
      ? localModels.filter((model) => model.category === seriesName)
      : localModels.filter((model) => isUnderFolder(model.filePath, seriesFolder));

    const normalized = search.trim().toLowerCase();
    const entries: Array<{
      key: string;
      modelId: string;
      versionId: string;
      name: string;
      cover: string | null;
    }> = [];
    for (const model of base) {
      for (const version of model.versions ?? []) {
        if (normalized && !version.name.toLowerCase().includes(normalized)) {
          continue;
        }
        entries.push({
          key: version.filePath,
          modelId: makeLocalCheckpointId(model.filePath),
          versionId: version.filePath,
          name: version.name,
          cover: model.iconPath,
        });
      }
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }, [localModels, paths.diffusionModelsPath, paths.checkpointPath, search, isAnima, seriesName]);

  if (!open) return null;

  const handleSelectFile = (modelId: string, versionId: string) => {
    onSelect({ modelId, versionId });
    onOpenChange(false);
  };

  const guidance = isAnima
    ? t("create.modelSelectDialog.emptyAnima")
    : t("create.modelSelectDialog.emptySdxl");

  return (
    <ResourceDialogShell
      open={open}
      title={t("create.modelSelectDialog.title", { name: seriesName })}
      titleId="model-select-dialog-title"
      description={
        isAnima ? t("create.modelSelectDialog.description") : undefined
      }
      titleAccessory={
        <div className="hidden items-center gap-0.5 md:flex">
          <button
            type="button"
            role="switch"
            aria-checked={false}
            className={cn(
              "peer inline-flex h-5 w-9 shrink-0 scale-75 cursor-pointer items-center rounded-full border-2 border-transparent bg-gray-300 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:bg-gray-700",
              "data-[state=checked]:bg-zinc-900 dark:data-[state=checked]:bg-zinc-100"
            )}
          >
            <span className="pointer-events-none block h-4 w-4 translate-x-0 rounded-full bg-white shadow-lg ring-0 transition-transform" />
          </button>
          <label className="cursor-pointer text-xs text-muted-foreground">
            {t("create.modelSelectDialog.showDescription")}
          </label>
        </div>
      }
      toolbar={
        <div className="flex items-center justify-between gap-3">
          <div
            className={cn(
              "flex items-center gap-2 pb-1",
              isCompact ? "min-w-0 flex-1" : "shrink-0"
            )}
          >
            <div className={cn("relative", isCompact && "min-w-0 flex-1")}>
              <Search
                className={cn(
                  "pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground",
                  typography.searchIcon
                )}
              />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("create.modelSelectDialog.searchPlaceholder")}
                className={cn(
                  "rounded-full border-0 bg-muted pl-7 pr-2.5 font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/30 dark:bg-gray-700 dark:focus:ring-zinc-100/30",
                  /** 紧凑形态占满剩余宽度：窄屏下搜索是主操作，固定 128px 反而比宽屏更小 */
                  isCompact ? "w-full" : "w-32 sm:w-40",
                  typography.toolbar,
                  typography.toolbarHeight
                )}
              />
            </div>
          </div>
        </div>
      }
      onOpenChange={onOpenChange}
    >
      {fileModels.length === 0 ? (
        <div
          className={cn(
            "flex min-h-[240px] items-center justify-center text-muted-foreground",
            typography.empty
          )}
        >
          {guidance}
        </div>
      ) : (
        <div className="grid auto-rows-auto grid-cols-2 items-start gap-2 pb-4 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {fileModels.map((entry) => {
            const isSelected =
              selected.modelId === entry.modelId &&
              selected.versionId === entry.versionId;
            return (
              <div
                key={entry.key}
                className={cn(
                  "group relative flex h-full flex-col rounded-xl border dark:hover:shadow-none",
                  isSelected
                    ? "overflow-visible border-green-500 outline outline-1 outline-green-500 dark:border-green-500 dark:outline-green-500"
                    : "overflow-hidden dark:border-gray-700"
                )}
              >
                {isSelected && (
                  <div className="absolute -top-5 right-2 z-30 rounded-t-md bg-green-500 px-2 py-0.5 font-bold uppercase text-white shadow-lg">
                    <span className={typography.selectedBadge}>
                      {t("create.modelSelectDialog.selected")}
                    </span>
                  </div>
                )}
                <div
                  className="relative isolate flex flex-col justify-end overflow-hidden rounded-t-xl bg-gray-900 pb-3"
                  style={{ aspectRatio: "4 / 5" }}
                >
                  <ResourceCoverImage
                    cover={entry.cover ?? ""}
                    alt={`${entry.name} example image`}
                    fill
                    sizes="(max-width: 768px) 50vw, 33vw"
                    className="absolute inset-0 -z-10 h-full w-full object-cover"
                  />
                  <span
                    className={cn(
                      "absolute left-2 top-2 rounded-full px-2 py-1 font-medium",
                      typography.coverTag,
                      "bg-zinc-700/80 text-white"
                    )}
                  >
                    {seriesName}
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col px-3 pb-3 pt-2">
                  <h3
                    className={cn(
                      "block truncate font-semibold text-primary",
                      typography.cardTitle
                    )}
                    title={entry.name}
                  >
                    {entry.name}
                  </h3>
                  <button
                    type="button"
                    onClick={() => handleSelectFile(entry.modelId, entry.versionId)}
                    className={cn(
                      "mt-3 inline-flex w-full items-center justify-center rounded-xl px-3 py-1 font-medium shadow transition-colors",
                      typography.action,
                      typography.actionHeight,
                      PRIMARY_BUTTON_CLASS
                    )}
                  >
                    {t("create.modelSelectDialog.select")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ResourceDialogShell>
  );
}
