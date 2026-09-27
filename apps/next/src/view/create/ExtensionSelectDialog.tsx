"use client";

import { useEffect, useMemo, useState } from "react";
import { Info, Search, Star, ChevronDown } from "lucide-react";
import {
  EXTENSION_TAG_CLASS,
  filterAndSortExtensions,
  getLocalExtensionCategories,
} from "@/data/extensions";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useCreateFormStore } from "@/stores/useCreateFormStore";
import { useTranslation } from "@/i18n";
import { ResourceCoverImage } from "@/components/ResourceCoverImage";
import { ResourceDialogShell } from "@/components/ResourceDialogShell";
import type { CreateExtension } from "@/types/extension";
import {
  INPUT_BORDER_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "@/utils/layout";
import { cn } from "@/utils/cn";
import { getResourceDialogTypography } from "@/utils/resourceDialogFontSize";
import { useMediaQueryAfterHydration } from "@/hooks/useMediaQuery";
import { ModelVersionDialog } from "@/view/create/ModelVersionDialog";
import { ResourceCategoryFilter } from "@/view/create/ResourceCategoryFilter";

type ExtensionSelectDialogProps = {
  open: boolean;
  selectedIds: string[];
  /** 当前模型系列：anima 时仅允许使用 diffusion_models/Anima 下的扩展，sdxl 同理 */
  series?: "anima" | "sdxl";
  onOpenChange: (open: boolean) => void;
  onSelect: (extensionId: string) => void;
};

function isPathUnderFolder(filePath: string, folder: string): boolean {
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

const VERSION_KEY_SEP = "\u001f";

function extensionVersionKey(extensionId: string, versionId: string) {
  return `${extensionId}${VERSION_KEY_SEP}${versionId}`;
}

function parseExtensionVersionKey(key: string) {
  const index = key.indexOf(VERSION_KEY_SEP);
  return index >= 0 ? key.slice(index + VERSION_KEY_SEP.length) : key;
}

function getExtensionVersions(extension: CreateExtension) {
  if (extension.versions && extension.versions.length > 0) {
    return extension.versions;
  }
  return [{ id: extension.id, label: extension.versionLabel }];
}

export function ExtensionSelectDialog({
  open,
  selectedIds,
  series = "anima",
  onOpenChange,
  onSelect,
}: ExtensionSelectDialogProps) {
  const { t } = useTranslation();
  const localModels = useSettingsStore((state) => state.models);
  const paths = useSettingsStore((state) => state.paths);
  const resourceDialogFontSize = useCreateFormStore(
    (state) => state.resourceDialogFontSize
  );
  const setResourceDialogFontSize = useCreateFormStore(
    (state) => state.setResourceDialogFontSize
  );
  const resourceCategoryUiMode = useCreateFormStore(
    (state) => state.resourceCategoryUiMode
  );
  const setResourceCategoryUiMode = useCreateFormStore(
    (state) => state.setResourceCategoryUiMode
  );
  const typography = getResourceDialogTypography(resourceDialogFontSize);
  /** 与 `ResourceDialogShell` 同一个断点：紧凑形态下工具栏控件占满整行（外壳负责抬最小高度） */
  const isCompact = !useMediaQueryAfterHydration("(min-width: 1280px)");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [draftVersions, setDraftVersions] = useState<Record<string, string>>({});
  const [versionDialogExtension, setVersionDialogExtension] =
    useState<CreateExtension | null>(null);

  useEffect(() => {
    if (!open) return;

    const frame = window.requestAnimationFrame(() => {
      setSearch("");
      setSelectedCategory(null);
      setVersionDialogExtension(null);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const source = filterAndSortExtensions("", localModels, paths);
    const initialVersions: Record<string, string> = {};

    source.forEach((extension) => {
      const versions = getExtensionVersions(extension);
      const selectedVersion = versions.find((version) =>
        selectedIds.includes(version.id)
      );
      initialVersions[extension.id] =
        selectedVersion?.id ?? versions[0]?.id ?? extension.id;
    });

    const frame = window.requestAnimationFrame(() => {
      setDraftVersions(initialVersions);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open, selectedIds, localModels, paths]);

  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (versionDialogExtension) {
          setVersionDialogExtension(null);
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
  }, [open, onOpenChange, versionDialogExtension]);

  const categories = useMemo(
    () => getLocalExtensionCategories(localModels, paths),
    [localModels, paths]
  );

  const extensions = useMemo(() => {
    // 按系列限定扩展来源（LoRA 目录）：
    // anima → {lorasPath}/Anima，sdxl → {lorasPath}/SDXL
    const lorasRoot = (
      paths.lorasPath ||
      (paths.searchPath ? `${paths.searchPath}/loras` : "")
    ).trim();
    const seriesFolder = lorasRoot
      ? `${lorasRoot.replace(/[\\/]+$/, "")}/${
          series === "sdxl" ? "SDXL" : "Anima"
        }`
      : "";

    return filterAndSortExtensions(
      search,
      localModels,
      paths,
      selectedCategory
    ).filter((extension) => {
      if (!seriesFolder || !extension.filePath) return true;
      return isPathUnderFolder(extension.filePath, seriesFolder);
    });
  }, [localModels, paths, search, selectedCategory, series]);

  if (!open) return null;

  const handleSelectExtension = (extension: CreateExtension) => {
    const versions = getExtensionVersions(extension);
    const versionId = draftVersions[extension.id] ?? versions[0]?.id;
    if (!versionId) return;

    if (versions.length <= 1) {
      onSelect(versionId);
      onOpenChange(false);
      return;
    }

    setVersionDialogExtension(extension);
  };

  const handleVersionPick = (extension: CreateExtension, versionId: string) => {
    setDraftVersions((prev) => ({ ...prev, [extension.id]: versionId }));
    onSelect(versionId);
    onOpenChange(false);
  };

  return (
    <>
      <ResourceDialogShell
        open={open}
        title={t("create.extensionSelectDialog.title")}
        titleId="extension-select-dialog-title"
        bodyPadded={false}
        bodyClassName="px-3 pb-3 pt-2 sm:px-6 sm:pt-4"
        toolbar={
          <div className="flex items-center justify-between gap-3">
            <ResourceCategoryFilter
              categories={categories}
              selectedCategory={selectedCategory}
              uiMode={resourceCategoryUiMode}
              fontSize={resourceDialogFontSize}
              onCategoryChange={setSelectedCategory}
              onUiModeChange={setResourceCategoryUiMode}
              onFontSizeChange={setResourceDialogFontSize}
            />
            {/*
              紧凑形态（< xl）下搜索是整块面板的主操作，让它占满剩余宽度；
              宽屏保持固定宽度（那一档 `w-32`/`sm:w-40` 与卡片网格的节奏一致）。
            */}
            <div
              className={cn(
                "relative pb-1",
                isCompact ? "min-w-0 flex-1" : "shrink-0"
              )}
            >
              <Search className={cn("pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground", typography.searchIcon)} />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("create.extensionSelectDialog.searchPlaceholder")}
                className={cn(
                  "rounded-full border-0 bg-muted pl-7 pr-2.5 font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/30 dark:bg-gray-700 dark:focus:ring-zinc-100/30",
                  isCompact ? "w-full" : "w-32 sm:w-40",
                  typography.toolbar,
                  typography.toolbarHeight
                )}
              />
            </div>
          </div>
        }
        onOpenChange={onOpenChange}
      >
        {extensions.length === 0 ? (
          <div className={cn("flex min-h-[240px] items-center justify-center text-muted-foreground", typography.empty)}>
            {t("create.extensionSelectDialog.empty")}
          </div>
        ) : (
          <div className="grid auto-rows-auto grid-cols-2 items-start gap-2 pb-4 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {extensions.map((extension) => {
              const versions = getExtensionVersions(extension);
              const versionId =
                draftVersions[extension.id] ?? versions[0]?.id ?? extension.id;
              const version =
                versions.find((item) => item.id === versionId) ?? versions[0];
              const isSelected = versions.some((item) =>
                selectedIds.includes(item.id)
              );

              return (
                <div
                  key={extension.id}
                  className={cn(
                    "group flex h-full flex-col rounded-xl border bg-background transition-colors dark:hover:shadow-none",
                    isSelected && "relative",
                    isSelected
                      ? "overflow-visible border-green-500 outline outline-1 outline-green-500 dark:border-green-500 dark:outline-green-500"
                      : "overflow-hidden border-border/60 dark:border-gray-700"
                  )}
                >
                  {isSelected && (
                    <div className="absolute -top-5 right-2 z-30 rounded-t-md bg-green-500 px-2 py-0.5 font-bold uppercase text-white shadow-lg">
                      <span className={typography.selectedBadge}>
                        {t("create.extensionSelectDialog.selected")}
                      </span>
                    </div>
                  )}

                  <div
                    className="relative isolate flex flex-col justify-end overflow-hidden rounded-t-xl bg-gray-900 pb-3"
                    style={{ aspectRatio: "4 / 5" }}
                  >
                    <ResourceCoverImage
                      cover={extension.cover}
                      alt={`${extension.name} example image`}
                      fill
                      sizes="(max-width: 768px) 50vw, 33vw"
                      className="absolute inset-0 -z-10 h-full w-full object-cover"
                    />
                    <div
                      className={cn(
                        "absolute left-2 top-2 max-w-[70%] truncate rounded-full px-2 py-1 font-semibold",
                        typography.coverTag,
                        extension.isLocal
                          ? "bg-purple-500/80 text-white"
                          : EXTENSION_TAG_CLASS[extension.seriesTag]
                      )}
                      title={
                        extension.isLocal
                          ? extension.category ?? "LoRA"
                          : extension.seriesTag
                      }
                    >
                      {extension.isLocal
                        ? extension.category ?? "LoRA"
                        : extension.seriesTag}
                    </div>
                    <div className="absolute right-2 top-2 z-20 flex gap-1">
                      <button
                        type="button"
                        className="rounded-full bg-black/50 p-1.5 transition-colors hover:bg-black/70"
                        title={t("create.extensionSelectDialog.viewInfo")}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Info className="h-4 w-4 text-white" />
                      </button>
                      <button
                        type="button"
                        className="rounded-full bg-black/50 p-1.5 transition-colors hover:bg-black/70"
                        title={t("create.extensionSelectDialog.addToFavorites")}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Star className="h-4 w-4 text-white" />
                      </button>
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col px-3 pb-3 pt-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <h3
                            className={cn(
                              "truncate font-semibold text-primary",
                              typography.cardTitle
                            )}
                            title={extension.name}
                          >
                            {extension.name}
                          </h3>
                          <p className={cn("text-muted-foreground", typography.cardMeta)}>
                            {versions.length}{" "}
                            {t("create.extensionSelectDialog.versionUnit")}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid min-w-0 grid-cols-2 items-center gap-2">
                      {versions.length === 1 ? (
                        <span className={cn("truncate text-muted-foreground", typography.action)}>
                          {version?.label}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setVersionDialogExtension(extension)}
                          className={cn(
                            "flex w-full items-center justify-between gap-1.5 whitespace-nowrap rounded-xl bg-muted/40 px-3 py-2 transition-colors hover:bg-muted/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 dark:bg-gray-800/60 dark:hover:bg-gray-800",
                            typography.action,
                            typography.actionHeight,
                            INPUT_BORDER_CLASS,
                            "dark:border-gray-700"
                          )}
                        >
                          <span className="min-w-0 truncate">{version?.label}</span>
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSelectExtension(extension)}
                        className={cn(
                          "inline-flex w-full items-center justify-center rounded-xl px-3 py-1 font-medium shadow transition-colors",
                          typography.action,
                          typography.actionHeight,
                          PRIMARY_BUTTON_CLASS
                        )}
                      >
                        {t("create.extensionSelectDialog.select")}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ResourceDialogShell>

      {versionDialogExtension && (
        <ModelVersionDialog
          open
          title={t("create.extensionSelectDialog.versionDialogTitle", {
            name: versionDialogExtension.name,
          })}
          description={t("create.extensionSelectDialog.versionDialogDescription", {
            name: versionDialogExtension.name,
          })}
          selectedKey={extensionVersionKey(
            versionDialogExtension.id,
            draftVersions[versionDialogExtension.id] ??
              getExtensionVersions(versionDialogExtension)[0]?.id ??
              ""
          )}
          options={getExtensionVersions(versionDialogExtension).map((item) => ({
            key: extensionVersionKey(versionDialogExtension.id, item.id),
            name: versionDialogExtension.name,
            label: item.label,
            cover: versionDialogExtension.cover,
          }))}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setVersionDialogExtension(null);
          }}
          onSelect={(key) => {
            const versionId = parseExtensionVersionKey(key);
            if (versionId) {
              handleVersionPick(versionDialogExtension, versionId);
            }
            setVersionDialogExtension(null);
          }}
        />
      )}
    </>
  );
}
