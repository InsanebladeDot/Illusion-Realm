"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Folder,
  GalleryVertical,
  Grid3x3,
  ImagePlay,
  Lock,
  Unlock,
  Plus,
  Search,
  SquareCheck,
  Trash2,
} from "lucide-react";
import { AppLogo } from "@/assets/AppLogo";
import {
  ALL_HISTORY_FOLDER,
  DEFAULT_FOLDER_ID,
  filterHistoryFolders,
} from "@/data/historyFolders";
import {
  getOpenedFolderDirPath,
  useHistoryFolderStore,
  type HistoryViewMode,
} from "@/stores/useHistoryFolderStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import { LocalFileImage } from "@/components/LocalFileImage";
import { AddImagesToFolderDialog } from "@/view/create/AddImagesToFolderDialog";
import { CreateFolderDialog } from "@/view/create/CreateFolderDialog";
import { DeleteFolderDialog } from "@/view/create/DeleteFolderDialog";
import { DeleteImagesDialog } from "@/view/create/DeleteImagesDialog";
import {
  GeneratedImageActionLayer,
  type GeneratedImageActionHandle,
} from "@/view/create/GeneratedImageActionLayer";
import { GeneratedImageDetailDialog } from "@/view/create/GeneratedImageDetailDialog";
import { HistoryFolderContextMenu } from "@/view/create/HistoryFolderContextMenu";
import {
  buildHistoryFolderList,
  canCreateSubfolder,
  collectExpandableFolderIds,
  folderHasChildren,
  getVisibleDiskFolders,
  historyFolderFromDiskEntry,
  isDefaultHistoryFolder,
} from "@/utils/historyFolders";
import {
  isPathWithinOutputRoot,
  listGeneratedImages,
  listOutputFoldersOnDisk,
} from "@/utils/generatedImages";
import { formatShortDateTime } from "@/utils/dateTimeFormat";
import { runPageStyleTransition } from "@/utils/pageTransition";
import {
  hasDeleteFolderSupport,
  hasDeleteImagesSupport,
  resolveEffectiveOutputPath,
  selectLocalFolder,
} from "@/utils/electronBridge";
import type { GeneratedImageFile, HistoryFolder } from "@/types/historyFolder";
import {
  ACCENT_SELECTED_SOFT_CLASS,
  ACCENT_TOGGLE_ON_CLASS,
  INPUT_BORDER_CLASS,
  PRIMARY_BUTTON_CLASS,
  THIN_BORDER_CLASS,
  THIN_DIVIDER_CLASS,
} from "@/utils/layout";
import { cn } from "@/utils/cn";

/**
 * 两套版式共用同一份 JSX 与同一份状态，只差类名：
 *   · `sidebar` = 宽屏右栏（25% 窄栏，现有形态）
 *   · `page`    = 窄屏「已生成图片」整页子页（< xl）
 *
 * 为什么要分开：低宽度下把 25% 栏横向铺满 = 文件夹行变成整条、缩略图摊成 5 列细条、
 * 中间留出大片空白。子页要的是**居中列 + 卡片行 + 大圆角**（移动端图库的版式）。
 * 共用 JSX 而不是复制一份页面，是为了让「子页里双击缩略图」与「右栏双击」永远是同一个行为。
 */
type HistorySidebarVariant = "sidebar" | "page";

/**
 * 版式分支的取值点收成一个函数：每个调用点一眼能看出「两种版式各是什么」，
 * 且决策紧贴它影响的元素，不必跳到远处的样式表去对照。
 */
function pick(pageValue: string, sidebarValue: string, isPage: boolean): string {
  return isPage ? pageValue : sidebarValue;
}

/**
 * 图片网格的列定义集中在这里：真网格与**骨架屏**必须用同一套列数，
 * 否则加载时是另一种密度，内容一到就「跳一下」（那比没有骨架屏更难受）。
 */
function historyGridClass(isPage: boolean, viewMode: HistoryViewMode): string {
  if (viewMode === "stack") return "grid-cols-1";
  if (isPage) {
    return viewMode === "bookmark"
      ? "gap-2 grid-cols-5 lg:grid-cols-6"
      : "gap-2 grid-cols-4 sm:grid-cols-5 lg:grid-cols-6";
  }
  return "gap-0.5 grid-cols-4 md:grid-cols-5 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5";
}

/** 加载态骨架：行 / 图块两种形状，尺寸由调用点给（与真实内容一致才不会跳） */
function SkeletonBlocks({
  count,
  itemClassName,
  containerClassName,
  testId,
  label,
}: {
  count: number;
  itemClassName: string;
  containerClassName: string;
  testId: string;
  /** 读屏播报名（骨架块本身是装饰，靠它说明「正在加载什么」） */
  label: string;
}) {
  return (
    <div
      data-gallery-skeleton={testId}
      className={containerClassName}
      role="status"
      aria-label={label}
    >
      {Array.from({ length: count }, (_item, index) => (
        <div key={index} className={cn("motion-skeleton", itemClassName)} aria-hidden />
      ))}
    </div>
  );
}

type CreateHistorySidebarProps = {
  variant?: HistorySidebarVariant;
  mediaLabel?: string;
  centerPreviewPath?: string | null;
  onCenterPreviewChange?: (image: GeneratedImageFile) => void;
  /** 是否为当前活跃实例：只有它会消费「生成完成通知 → 打开图片详情」请求 */
  respondToOpenRequest?: boolean;
};

/**
 * 「新建文件夹」入口。两种版式是同一个动作、两种分量：
 *   · page   → 卡片列表上方的**整宽主按钮**（移动端图库里的 Create New Folder）
 *   · sidebar → 列表末尾的一行次要入口（现有形态）
 */
function NewFolderButton({
  label,
  primary,
  onClick,
}: {
  label: string;
  primary: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center text-left transition-colors",
        primary
          ? cn(
              "h-11 justify-center gap-2 rounded-xl text-sm font-medium shadow-sm",
              PRIMARY_BUTTON_CLASS
            )
          : "h-10 gap-2 rounded-md px-1 text-sm hover:bg-muted/50"
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded",
          primary ? "h-5 w-5" : "h-8 w-8"
        )}
      >
        <Plus
          className={cn(
            primary ? "h-4 w-4" : "h-6 w-6 text-gray-300 dark:text-gray-500"
          )}
        />
      </span>
      <span className={cn(primary ? "" : "flex-1 text-muted-foreground")}>
        {label}
      </span>
    </button>
  );
}

function CollapsibleSearch({
  open,
  placeholder,
  value,
  onChange,
}: {
  open: boolean;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden transition-all duration-200 ease-in-out",
        open ? "max-h-16 opacity-100" : "max-h-0 opacity-20"
      )}
    >
      <div className="px-2 pb-2">
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={cn(
            /** 底色透明、层次交给描边：深色下原来是 `dark:bg-primary-foreground`（近白），搜索框会整块发白 */
            "flex h-9 w-full rounded-md bg-transparent px-3 py-1 text-xs shadow-none transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
            INPUT_BORDER_CLASS
          )}
        />
      </div>
    </div>
  );
}

function FolderIcon({ selected, isAll }: { selected: boolean; isAll: boolean }) {
  if (isAll) {
    return (
      <AppLogo
        className={cn(
          "h-8 w-8 rounded",
          selected
            ? "text-foreground dark:text-zinc-100"
            : "text-muted-foreground"
        )}
      />
    );
  }

  return (
    <Folder
      className={cn(
        "h-6 w-6",
        selected ? "text-foreground" : "text-muted-foreground"
      )}
    />
  );
}

/**
 * 文件夹行副信息：`N 张 · 9月20日 12:13`（缺哪项就少哪项，两项都没有则整行不渲染）。
 *
 * 只用在 `page` 版式：宽屏右栏只有 25% 宽、行高 40px，塞第二行会把它挤成两行文字墙。
 * 张数口径见主进程 `countImagesInDirectory` —— 与「点开这个文件夹看到的张数」同一个判据。
 */
function FolderRowMeta({ folder }: { folder: HistoryFolder }) {
  const { t, locale } = useTranslation();
  const parts: string[] = [];
  if (typeof folder.imageCount === "number") {
    parts.push(
      t("create.createHistorySidebar.folderImageCount", {
        count: folder.imageCount,
      })
    );
  }
  const modifiedLabel = formatShortDateTime(folder.modifiedAt, locale);
  if (modifiedLabel) parts.push(modifiedLabel);
  if (parts.length === 0) return null;

  return (
    <span className="truncate text-[11px] leading-4 text-muted-foreground">
      {parts.join(" · ")}
    </span>
  );
}

export function CreateHistorySidebar({
  variant = "sidebar",
  mediaLabel,
  centerPreviewPath = null,
  onCenterPreviewChange,
  respondToOpenRequest = false,
}: CreateHistorySidebarProps) {
  const { t } = useTranslation();
  const isPage = variant === "page";

  /** 回退值从「参数默认值」挪到函数体内：默认值在函数体外求值，拿不到 hook 的 t */
  const mediaLabelText = mediaLabel ?? t("create.createHistorySidebar.mediaLabelDefault");
  const outputPath = useSettingsStore((state) => state.outputPath);
  const showToast = useToastStore((state) => state.show);
  const selectedFolderId = useHistoryFolderStore(
    (state) => state.selectedFolderId
  );
  const outputMode = useHistoryFolderStore((state) => state.outputMode);
  const fixedOutputPath = useHistoryFolderStore((state) => state.fixedOutputPath);
  const setOutputMode = useHistoryFolderStore((state) => state.setOutputMode);
  const setFixedOutputPath = useHistoryFolderStore(
    (state) => state.setFixedOutputPath
  );
  const openedFolderId = useHistoryFolderStore((state) => state.openedFolderId);
  const openFolder = useHistoryFolderStore((state) => state.openFolder);
  const setSelectedFolderId = useHistoryFolderStore(
    (state) => state.setSelectedFolderId
  );
  const imagesRefreshVersion = useHistoryFolderStore(
    (state) => state.imagesRefreshVersion
  );
  const foldersRefreshVersion = useHistoryFolderStore(
    (state) => state.foldersRefreshVersion
  );
  const refreshGeneratedImages = useHistoryFolderStore(
    (state) => state.refreshGeneratedImages
  );
  const refreshFolders = useHistoryFolderStore((state) => state.refreshFolders);
  const pendingOpenImagePath = useHistoryFolderStore(
    (state) => state.pendingOpenImagePath
  );
  const clearOpenImageRequest = useHistoryFolderStore(
    (state) => state.clearOpenImageRequest
  );

  const [diskFolders, setDiskFolders] = useState<HistoryFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [effectiveOutputRoot, setEffectiveOutputRoot] = useState("");

  /**
   * 「全部」是**内置项**，不是用户数据 —— 它的名字必须走词条表。
   *
   * shared 里的 `ALL_HISTORY_FOLDER.name` 是中文常量（那是身份，不该当界面文案），
   * 以前列表、搜索都直接用 `folder.name`，于是切成英文后这一行仍然是「全部」。
   * 这里在**进列表之前**换名，显示与搜索（`filterHistoryFolders` 按 name 匹配）就都跟着语言走了。
   */
  const allHistoryFolder = useMemo(
    () => ({
      ...ALL_HISTORY_FOLDER,
      name: t("create.createHistorySidebar.all"),
    }),
    [t]
  );

  const allFolders = useMemo(
    () =>
      buildHistoryFolderList(diskFolders).map((folder) =>
        isDefaultHistoryFolder(folder.id) ? allHistoryFolder : folder
      ),
    [diskFolders, allHistoryFolder]
  );

  const openedFolderDirPath = useMemo(
    () => getOpenedFolderDirPath(openedFolderId),
    [openedFolderId]
  );

  const openedFolderName = useMemo(() => {
    if (isDefaultHistoryFolder(openedFolderId)) {
      return t("create.createHistorySidebar.all");
    }
    return (
      allFolders.find((folder) => folder.id === openedFolderId)?.name ??
      t("create.createHistorySidebar.folder")
    );
  }, [allFolders, openedFolderId, t]);

  const [foldersOpen, setFoldersOpen] = useState(true);
  const [foldersSearchOpen, setFoldersSearchOpen] = useState(false);
  const [folderSearch, setFolderSearch] = useState("");
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [createFolderParent, setCreateFolderParent] =
    useState<HistoryFolder | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] =
    useState<HistoryFolder | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    () => new Set()
  );
  const [folderMenu, setFolderMenu] = useState<{
    x: number;
    y: number;
    folder: HistoryFolder;
  } | null>(null);
  const [addImagesTarget, setAddImagesTarget] = useState<HistoryFolder | null>(
    null
  );

  const [mediaOpen, setMediaOpen] = useState(true);
  const [mediaSearchOpen, setMediaSearchOpen] = useState(false);
  const [mediaSearch, setMediaSearch] = useState("");
  /** 视图档位来自 store：宽屏右栏、窄屏换页、窄屏右上角固钉三处入口共用同一份状态 */
  const viewMode = useHistoryFolderStore((state) => state.viewMode);
  const setViewMode = useHistoryFolderStore((state) => state.setViewMode);
  const [images, setImages] = useState<GeneratedImageFile[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [selectedImage, setSelectedImage] = useState<GeneratedImageFile | null>(
    null
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const [imageSelectionMode, setImageSelectionMode] = useState(false);
  const [selectedImagePaths, setSelectedImagePaths] = useState<Set<string>>(
    () => new Set()
  );
  const [deleteImagesOpen, setDeleteImagesOpen] = useState(false);
  const imageActionsRef = useRef<GeneratedImageActionHandle>(null);

  const selectedImageCount = selectedImagePaths.size;

  const filteredFolders = useMemo(() => {
    const keyword = folderSearch.trim();
    if (keyword) {
      return filterHistoryFolders(allFolders, keyword);
    }

    const visibleDiskFolders = getVisibleDiskFolders(
      diskFolders,
      expandedFolderIds,
      folderSearch
    );
    return [allHistoryFolder, ...visibleDiskFolders];
  }, [allFolders, allHistoryFolder, diskFolders, expandedFolderIds, folderSearch]);

  const filteredImages = useMemo(() => {
    const keyword = mediaSearch.trim().toLowerCase();
    if (!keyword) return images;
    return images.filter((image) =>
      image.fileName.toLowerCase().includes(keyword)
    );
  }, [images, mediaSearch]);

  /**
   * 渲染期同步：退出多选模式时清空已选图片。
   * 用「记录前值 + 渲染期比较」替代 effect 内 setSelectedImagePaths。
   */
  const [previousSelectionKey, setPreviousSelectionKey] = useState<string | null>(null);
  const selectionKey = `${imageSelectionMode}|${openedFolderDirPath}`;
  if (!imageSelectionMode && selectionKey !== previousSelectionKey) {
    setPreviousSelectionKey(selectionKey);
    setSelectedImagePaths(new Set());
  }

  const toggleImageSelection = (filePath: string) => {
    setSelectedImagePaths((previous) => {
      const next = new Set(previous);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  const handleSelectAllVisibleImages = () => {
    setSelectedImagePaths(new Set(filteredImages.map((image) => image.filePath)));
  };

  const exitImageSelectionMode = () => {
    setImageSelectionMode(false);
    setSelectedImagePaths(new Set());
  };

  const handleNewFolder = () => {
    setCreateFolderParent(null);
    setCreateFolderOpen(true);
  };

  useEffect(() => {
    let cancelled = false;
    void resolveEffectiveOutputPath(outputPath).then((path) => {
      if (!cancelled) setEffectiveOutputRoot(path ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [outputPath]);

  const handlePickFixedOutputPath = async () => {
    const selected = await selectLocalFolder(effectiveOutputRoot || undefined);
    if (!selected) return;
    if (!isPathWithinOutputRoot(effectiveOutputRoot, selected)) {
      showToast(t("create.createHistorySidebar.fixedOutputOutsideRoot"), "error");
      return;
    }
    setFixedOutputPath(selected);
    setOutputMode("fixed");
    showToast(t("create.createHistorySidebar.fixedOutputUpdated"));
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // setLoadingFolders 放在 async IIFE 内部（P3）
      setLoadingFolders(true);
      try {
        const entries = await listOutputFoldersOnDisk(outputPath);
        if (!cancelled) {
          const nextFolders = entries.map(historyFolderFromDiskEntry);
          setDiskFolders(nextFolders);
          setExpandedFolderIds(
            new Set(collectExpandableFolderIds(nextFolders))
          );

          const folderIds = new Set(nextFolders.map((folder) => folder.id));
          const { selectedFolderId: currentSelected, openedFolderId: currentOpened } =
            useHistoryFolderStore.getState();

          if (
            !isDefaultHistoryFolder(currentSelected) &&
            !folderIds.has(currentSelected)
          ) {
            setSelectedFolderId(DEFAULT_FOLDER_ID);
          }
          if (
            !isDefaultHistoryFolder(currentOpened) &&
            !folderIds.has(currentOpened)
          ) {
            openFolder(DEFAULT_FOLDER_ID);
          }
        }
      } finally {
        if (!cancelled) setLoadingFolders(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [outputPath, createFolderOpen, foldersRefreshVersion, imagesRefreshVersion, openFolder, setSelectedFolderId]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // setLoadingImages 放在 async IIFE 内部（P3）
      setLoadingImages(true);
      try {
        const files = await listGeneratedImages(outputPath, openedFolderDirPath);
        if (!cancelled) setImages(files);
      } finally {
        if (!cancelled) setLoadingImages(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [outputPath, openedFolderDirPath, createFolderOpen, imagesRefreshVersion]);

  /**
   * 生成完成通知里的「查看图片」：由当前活跃实例消费请求。
   *
   * 窄屏会有两个实例同时挂载（隐藏的宽屏右栏 + 可见的换页版），
   * 因此不能无条件响应，否则会同时弹出两份详情。
   */
  useEffect(() => {
    if (!respondToOpenRequest || !pendingOpenImagePath) return;

    const image = images.find(
      (item) => item.filePath === pendingOpenImagePath
    );
    if (!image) return;

    void (async () => {
      setSelectedImage(image);
      setDetailOpen(true);
      onCenterPreviewChange?.(image);
      clearOpenImageRequest();
    })();
  }, [
    clearOpenImageRequest,
    images,
    onCenterPreviewChange,
    pendingOpenImagePath,
    respondToOpenRequest,
  ]);

  return (
    <>
      <div
        data-history-sidebar
        data-history-variant={variant}
        className={cn(
          "relative flex h-full w-full flex-col opacity-100",
          isPage ? "overflow-y-auto" : "overflow-visible"
        )}
      >
        {/**
         * page 版式：居中列 + 上下留白（底部 pb-28 给悬浮「全部」按钮让位）。
         * 滚动放在**根节点**而不是图片区：子页是一页内容，文件夹与图片要一起滚，
         * 而不是「文件夹固定 200px 自己滚、图片区再滚一次」。
         */}
        <div
          className={cn(
            "no-scrollbar flex w-full flex-col rounded-[inherit]",
            pick(
              /**
               * 窄屏换页：列宽放到 1000px 并让缩略图占满 —— 之前卡在 760px，
               * 9xx 宽的窗口里缩略图会被撑到 240px 上下（题目里的「图片过大」），
               * 而且右侧还空着一条。文件夹行仍是同一列，宽度上看着不挤。
               */
              "mx-auto max-w-[1000px] gap-4 px-3 pb-28 pt-4",
              "h-full lg:overflow-visible",
              isPage
            )
          )}
        >
          <div className={cn("flex w-full flex-col", isPage ? "gap-4" : "h-full")}>
            <div
              className={cn(
                "flex flex-col",
                isPage ? "gap-2" : "min-h-0 flex-none"
              )}
              data-state={foldersOpen ? "open" : "closed"}
            >
              <div
                className={cn(
                  "bg-background",
                  isPage
                    ? "flex flex-col gap-1"
                    : cn("border-b", THIN_DIVIDER_CLASS)
                )}
              >
                <div
                  className={cn(
                    "flex w-full items-center gap-2",
                    isPage ? "px-1 py-1" : "px-2 py-1.5"
                  )}
                >
                  <button
                    type="button"
                    aria-expanded={foldersOpen}
                    aria-controls="history-folder-panel"
                    onClick={() => setFoldersOpen((prev) => !prev)}
                    className={cn(
                      "flex items-center gap-2 rounded transition-colors hover:bg-muted/50",
                      isPage ? "px-1.5 py-1" : "px-2 py-1"
                    )}
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform duration-200",
                        foldersOpen && "rotate-180"
                      )}
                    />
                    <span
                      className={cn(
                        "font-medium",
                        isPage ? "text-sm font-semibold" : "text-xs"
                      )}
                    >
                      {t("create.createHistorySidebar.folder")}
                    </span>
                  </button>
                  <span className="text-[10px] text-muted-foreground">
                    {t("create.createHistorySidebar.doubleClickToOpen")}
                  </span>
                  <button
                    type="button"
                    aria-label={t("create.createHistorySidebar.searchFolder")}
                    onClick={() => setFoldersSearchOpen((prev) => !prev)}
                    className="ml-auto flex h-6 w-6 items-center justify-center rounded-lg transition-colors hover:bg-muted/50"
                  >
                    <Search className="h-3 w-3" />
                  </button>
                </div>
                <CollapsibleSearch
                  open={foldersSearchOpen}
                  placeholder={t("create.createHistorySidebar.searchFolderPlaceholder")}
                  value={folderSearch}
                  onChange={setFolderSearch}
                />
                <div
                  className={cn(
                    "flex flex-wrap items-center gap-2 border-t px-2 py-2",
                    THIN_DIVIDER_CLASS,
                    isPage && "rounded-xl bg-muted/30"
                  )}
                >
                  <button
                    type="button"
                    role="switch"
                    aria-checked={outputMode === "free"}
                    aria-label={t("create.createHistorySidebar.freeOutputMode")}
                    onClick={() => setOutputMode(outputMode === "free" ? "fixed" : "free")}
                    className="inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "relative inline-flex h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors",
                        outputMode === "free" ? "bg-primary" : "bg-muted-foreground/35"
                      )}
                    >
                      <span
                        className={cn(
                          "h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                          outputMode === "free" ? "translate-x-4" : "translate-x-0"
                        )}
                      />
                    </span>
                    {outputMode === "free" ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                    {t("create.createHistorySidebar.freeOutputMode")}
                  </button>
                  <button
                    type="button"
                    disabled={outputMode === "free" || !effectiveOutputRoot}
                    onClick={() => void handlePickFixedOutputPath()}
                    className={cn(
                      "min-w-0 max-w-full rounded-md px-2 py-1 text-left text-[11px] transition-colors",
                      outputMode === "free"
                        ? "cursor-not-allowed text-muted-foreground/50"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      INPUT_BORDER_CLASS
                    )}
                    title={fixedOutputPath || effectiveOutputRoot}
                  >
                    <span className="mr-1 font-medium">
                      {t("create.createHistorySidebar.fixedOutputPath")}
                    </span>
                    <span className="inline-block max-w-[16rem] truncate align-bottom">
                      {fixedOutputPath || t("create.createHistorySidebar.chooseFixedOutput")}
                    </span>
                  </button>
                </div>
              </div>

              {foldersOpen && (
                <div
                  id="history-folder-panel"
                  className={cn(
                    "flex flex-col",
                    isPage ? "gap-2" : cn("border-b", THIN_DIVIDER_CLASS)
                  )}
                >
                  {isPage ? (
                    <NewFolderButton
                      label={t("create.createHistorySidebar.newFolder")}
                      primary
                      onClick={handleNewFolder}
                    />
                  ) : null}
                  <div
                    className={pick(
                      "space-y-1.5",
                      "h-[200px] min-h-[200px] space-y-1 overflow-y-auto p-2",
                      isPage
                    )}
                  >
                    {loadingFolders ? (
                      /** 骨架屏取代「正在加载…」纯文字：先给出**形状**，内容到位时不跳版 */
                      <SkeletonBlocks
                        testId="folders"
                        count={isPage ? 3 : 4}
                        containerClassName="space-y-1.5"
                        label={t("create.createHistorySidebar.loadingFolders")}
                        itemClassName={cn(
                          "w-full rounded-xl",
                          isPage ? "h-16" : "h-10"
                        )}
                      />
                    ) : (
                      filteredFolders.map((folder) => {
                      const isSelected = folder.id === selectedFolderId;
                      const isOpened = folder.id === openedFolderId;
                      const isAll = isDefaultHistoryFolder(folder.id);
                      const hasChildren = folderHasChildren(folder, diskFolders);
                      const isExpanded = folder.dirPath
                        ? expandedFolderIds.has(folder.dirPath)
                        : false;
                      const depth = folder.depth ?? 1;

                      return (
                        <div
                          key={folder.id}
                          onContextMenu={(event) => {
                            if (isAll || !folder.dirPath) {
                              return;
                            }
                            event.preventDefault();
                            setFolderMenu({
                              x: event.clientX,
                              y: event.clientY,
                              folder,
                            });
                          }}
                          className={cn(
                            "motion-rise-in flex w-full items-center text-sm transition-colors",
                            isPage
                              ? cn(
                                  "h-16 gap-2 rounded-xl bg-muted px-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-muted/70",
                                  isSelected &&
                                    "bg-foreground/[0.07] ring-1 ring-foreground/25"
                                )
                              : cn(
                                  "h-10 gap-1 rounded-md px-1",
                                  isSelected
                                    ? ACCENT_SELECTED_SOFT_CLASS
                                    : "text-foreground hover:bg-muted/50",
                                  isOpened && !isSelected && "bg-muted/30"
                                ),
                            !isAll && "cursor-context-menu"
                          )}
                          style={
                            !isAll
                              ? { paddingLeft: `${(depth - 1) * 12 + 4}px` }
                              : undefined
                          }
                        >
                          {!isAll ? (
                            hasChildren ? (
                              <button
                                type="button"
                                aria-label={
                                  isExpanded
                                    ? t("create.createHistorySidebar.collapse")
                                    : t("create.createHistorySidebar.expand")
                                }
                                onClick={() => {
                                  if (!folder.dirPath) return;
                                  setExpandedFolderIds((previous) => {
                                    const next = new Set(previous);
                                    if (next.has(folder.dirPath!)) {
                                      next.delete(folder.dirPath!);
                                    } else {
                                      next.add(folder.dirPath!);
                                    }
                                    return next;
                                  });
                                }}
                                className="flex h-6 w-5 shrink-0 items-center justify-center rounded hover:bg-muted/60"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                              </button>
                            ) : (
                              <span className="h-6 w-5 shrink-0" aria-hidden />
                            )
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setSelectedFolderId(folder.id)}
                            onDoubleClick={() => openFolder(folder.id)}
                            className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left"
                          >
                            <div
                              className={cn(
                                "flex shrink-0 items-center justify-center overflow-hidden rounded",
                                isPage
                                  ? "h-9 w-9 rounded-xl bg-background"
                                  : "h-8 w-8"
                              )}
                            >
                              <FolderIcon
                                isAll={isAll}
                                selected={isSelected || isOpened}
                              />
                            </div>
                            <span
                              className={cn(
                                "flex min-w-0 flex-1 flex-col",
                                isPage ? "justify-center" : ""
                              )}
                            >
                              <span
                                className={cn(
                                  "truncate",
                                  isOpened && "font-semibold"
                                )}
                              >
                                {folder.name}
                              </span>
                              {isPage ? <FolderRowMeta folder={folder} /> : null}
                            </span>
                          </button>
                        </div>
                      );
                    })
                    )}

                    {isPage ? null : (
                      <NewFolderButton
                        label={t("create.createHistorySidebar.newFolder")}
                        primary={false}
                        onClick={handleNewFolder}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            <div
              className={cn(
                "flex flex-col",
                isPage ? "gap-2" : "min-h-0 flex-1"
              )}
              data-state={mediaOpen ? "open" : "closed"}
            >
              <div
                className={cn(
                  "bg-background",
                  isPage
                    ? "flex flex-col gap-1"
                    : cn("border-b", THIN_DIVIDER_CLASS)
                )}
              >
                <div
                  className={cn(
                    "relative flex w-full items-center",
                    isPage ? "px-1 py-1" : "px-2 py-1.5"
                  )}
                >
                  <button
                    type="button"
                    aria-expanded={mediaOpen}
                    onClick={() => setMediaOpen((prev) => !prev)}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2 rounded transition-colors hover:bg-muted/50",
                      isPage ? "px-1.5 py-1" : "px-2 py-1"
                    )}
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                        mediaOpen && "rotate-180"
                      )}
                    />
                    <span
                      className={cn(
                        "min-w-0 truncate font-medium",
                        isPage ? "text-sm font-semibold" : "text-xs"
                      )}
                    >
                      {isDefaultHistoryFolder(openedFolderId)
                        ? mediaLabelText
                        : `${mediaLabelText} · ${openedFolderName}`}
                    </span>
                  </button>

                  {/**
                   * 视图切换器：宽屏右栏放在这里（居中）。
                   * `page` 版式**不渲染它** —— 窄屏换页上方有一枚固钉在右上角管同一件事，
                   * 两处并存既是重复入口、又把标题栏挤得只剩一条。
                   */}
                  <div
                    className={cn(
                      "absolute left-1/2 flex -translate-x-1/2 items-center gap-2",
                      isPage && "hidden"
                    )}
                  >
                    <div
                      className={cn(
                        "inline-flex items-center justify-center rounded-lg",
                        THIN_BORDER_CLASS
                      )}
                    >
                      <button
                        type="button"
                        aria-label={t("create.createHistorySidebar.gridView")}
                        aria-pressed={viewMode === "grid"}
                        onClick={() => setViewMode("grid")}
                        className={cn(
                          "flex h-6 w-8 items-center justify-center rounded-lg transition-all",
                          viewMode === "grid"
                            ? ACCENT_TOGGLE_ON_CLASS
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Grid3x3 className="h-3 w-3" />
                        <span className="sr-only">
                          {t("create.createHistorySidebar.gridView")}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={t("create.createHistorySidebar.stackView")}
                        aria-pressed={viewMode === "stack"}
                        onClick={() => setViewMode("stack")}
                        className={cn(
                          "flex h-6 w-8 items-center justify-center rounded-lg transition-all",
                          viewMode === "stack"
                            ? ACCENT_TOGGLE_ON_CLASS
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <GalleryVertical className="h-3 w-3" />
                        <span className="sr-only">
                          {t("create.createHistorySidebar.stackView")}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={t("create.createHistorySidebar.bookmarkView")}
                        aria-pressed={viewMode === "bookmark"}
                        onClick={() => setViewMode("bookmark")}
                        className={cn(
                          "flex h-6 w-8 items-center justify-center rounded-lg transition-all",
                          viewMode === "bookmark"
                            ? ACCENT_TOGGLE_ON_CLASS
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Bookmark className="h-3 w-3" />
                        <span className="sr-only">
                          {t("create.createHistorySidebar.bookmarkView")}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={
                        imageSelectionMode
                          ? t("create.createHistorySidebar.exitSelection")
                          : t("create.createHistorySidebar.batchSelect")
                      }
                      aria-pressed={imageSelectionMode}
                      onClick={() => {
                        if (imageSelectionMode) {
                          exitImageSelectionMode();
                          return;
                        }
                        setImageSelectionMode(true);
                      }}
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-lg transition-colors hover:bg-muted/50",
                        imageSelectionMode && ACCENT_TOGGLE_ON_CLASS
                      )}
                    >
                      <SquareCheck className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "hidden h-6 items-center gap-1 rounded-lg px-2 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:outline-none focus-visible:ring-0 lg:inline-flex",
                        INPUT_BORDER_CLASS
                      )}
                      aria-label={t("create.createHistorySidebar.filterAll")}
                    >
                      <ImagePlay className="h-3.5 w-3.5" />
                      <ChevronDown className="h-3 w-3" />
                      <span className="sr-only">All</span>
                    </button>
                    <button
                      type="button"
                      aria-label={t("create.createHistorySidebar.searchMedia", { label: mediaLabelText })}
                      onClick={() => setMediaSearchOpen((prev) => !prev)}
                      className="flex h-6 w-6 items-center justify-center rounded-lg transition-colors hover:bg-muted/50"
                    >
                      <Search className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                <CollapsibleSearch
                  open={mediaSearchOpen}
                  placeholder={t("create.createHistorySidebar.searchPlaceholder")}
                  value={mediaSearch}
                  onChange={setMediaSearch}
                />
              </div>

              {mediaOpen && (
                <div
                  className={cn(
                    "relative flex flex-col",
                    isPage ? "" : "min-h-0 flex-1 overflow-y-auto"
                  )}
                >
                  <div className={cn("flex w-full flex-col", isPage ? "" : "flex-1")}>
                    <div
                      className={cn(
                        "w-full",
                        isPage ? "" : "flex-1 pb-20 sm:pb-0 lg:p-2"
                      )}
                    >
                      <div className="mt-0 w-full">
                        {loadingImages ? (
                          <SkeletonBlocks
                            testId="images"
                            count={isPage ? 12 : 10}
                            containerClassName={cn("grid", historyGridClass(isPage, viewMode))}
                            label={t("create.createHistorySidebar.loadingImages")}
                            itemClassName={cn(
                              "w-full rounded-xl",
                              viewMode === "stack" ? "aspect-[16/10]" : "aspect-square"
                            )}
                          />
                        ) : filteredImages.length === 0 ? (
                          <p
                            className={cn(
                              "motion-fade-in text-center text-muted-foreground",
                              isPage ? "py-16 text-sm" : "py-8 text-xs"
                            )}
                          >
                            {isDefaultHistoryFolder(openedFolderId)
                              ? t("create.historyEmptyState.noGeneratedImages")
                              : t("create.createHistorySidebar.emptyInFolder", {
                                  name: openedFolderName,
                                })}
                          </p>
                        ) : (
                          <div
                            className={cn(
                              /**
                               * 列数由 historyGridClass 统一给（骨架屏与真网格同一套）。
                               * 入场用 motion-rise-in：此前写的 `animate-in fade-in-0` 是
                               * tailwindcss-animate 的类，而项目没装那个插件 —— 等于一直是硬切。
                               */
                              "grid motion-rise-in",
                              historyGridClass(isPage, viewMode)
                            )}
                          >
                            {filteredImages.map((image) => {
                              const isImageSelected = selectedImagePaths.has(
                                image.filePath
                              );

                              return (
                              <button
                                key={image.filePath}
                                type="button"
                                aria-label={image.fileName}
                                aria-pressed={
                                  imageSelectionMode ? isImageSelected : undefined
                                }
                                onClick={() => {
                                  if (imageSelectionMode) {
                                    toggleImageSelection(image.filePath);
                                    return;
                                  }
                                  const openDetail = () => {
                                    onCenterPreviewChange?.(image);
                                    setSelectedImage(image);
                                    setDetailOpen(true);
                                  };
                                  /** 宽屏直接打开详情弹窗；窄屏详情作为下一层页面进入。 */
                                  if (!isPage) {
                                    openDetail();
                                    return;
                                  }
                                  runPageStyleTransition({
                                    direction: "forward",
                                    apply: openDetail,
                                    isSettled: () =>
                                      Boolean(
                                        document.querySelector(
                                          "[data-image-detail-panel]"
                                        )
                                      ),
                                  });
                                }}
                                onContextMenu={(event) => {
                                  if (imageSelectionMode) return;
                                  event.preventDefault();
                                  imageActionsRef.current?.openContextMenu(
                                    event.clientX,
                                    event.clientY,
                                    image
                                  );
                                }}
                                className={cn(
                                  /** group + 悬停微放大：缩略图直接「动起来」比整体降透明度更有反馈感 */
                                  "group relative overflow-hidden bg-muted/30 text-left transition-[opacity,box-shadow] duration-200 hover:shadow-md",
                                  isPage && "rounded-xl",
                                  viewMode === "stack"
                                    ? "aspect-[16/10] w-full"
                                    : "aspect-square w-full",
                                  !imageSelectionMode &&
                                    centerPreviewPath === image.filePath &&
                                    "ring-2 ring-foreground/70 ring-offset-1 ring-offset-background",
                                  imageSelectionMode &&
                                    isImageSelected &&
                                    "ring-2 ring-red-500 ring-offset-1 ring-offset-background"
                                )}
                              >
                                <LocalFileImage
                                  filePath={image.filePath}
                                  alt={image.fileName}
                                  className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
                                />
                                {imageSelectionMode ? (
                                  <span
                                    className={cn(
                                      "absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border bg-background/90 shadow-sm",
                                      isImageSelected &&
                                        "border-red-500 bg-red-500 text-white"
                                    )}
                                  >
                                    {isImageSelected ? (
                                      <Check className="h-3 w-3" />
                                    ) : null}
                                  </span>
                                ) : null}
                              </button>
                            );
                            })}
                          </div>
                        )}

                        {/** 空列表下面再挂一条「已经到底了」是自相矛盾的，只在真有产出时收尾 */}
                        {!loadingImages && filteredImages.length > 0 ? (
                          <div
                            className={cn(
                              "flex flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground",
                              isPage ? "py-8" : "py-6"
                            )}
                          >
                            <div className="h-px w-full bg-[#d4d4d8]/70 dark:bg-[#e4e4e7]/25" />
                            <span>{t("create.createHistorySidebar.endOfList")}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div
                    className={cn(
                      "pointer-events-none sticky z-20 justify-center px-2",
                      pick("bottom-4 flex", "bottom-3 hidden md:flex", isPage)
                    )}
                  >
                    {imageSelectionMode ? (
                      <div
                        className={cn(
                          "pointer-events-auto flex flex-wrap items-center justify-center gap-2 bg-white px-3 py-2 dark:bg-muted",
                          isPage
                            ? "w-full max-w-[640px] justify-between rounded-2xl shadow-lg"
                            : "rounded-xl shadow-sm",
                          INPUT_BORDER_CLASS
                        )}
                      >
                        <span className="text-xs text-muted-foreground">
                          {t("create.createHistorySidebar.selected")}{" "}
                          {selectedImageCount} / {filteredImages.length}
                        </span>
                        <button
                          type="button"
                          onClick={handleSelectAllVisibleImages}
                          className="inline-flex h-8 items-center rounded-md px-2 text-xs font-medium hover:bg-muted/60"
                        >
                          {t("create.createHistorySidebar.selectAll")}
                        </button>
                        <button
                          type="button"
                          onClick={exitImageSelectionMode}
                          className="inline-flex h-8 items-center rounded-md px-2 text-xs font-medium hover:bg-muted/60"
                        >
                          {t("common.cancel")}
                        </button>
                        <button
                          type="button"
                          disabled={selectedImageCount === 0}
                          onClick={() => {
                            if (!hasDeleteImagesSupport()) {
                              showToast(
                                t("create.createHistorySidebar.deleteUnsupported")
                              );
                              return;
                            }
                            setDeleteImagesOpen(true);
                          }}
                          className="inline-flex h-8 items-center gap-1 rounded-md bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t("common.delete")}
                        </button>
                      </div>
                    ) : isPage && isDefaultHistoryFolder(openedFolderId) ? null : (
                    <button
                      type="button"
                      onClick={() => openFolder(DEFAULT_FOLDER_ID)}
                      className={cn(
                        "pointer-events-auto inline-flex w-auto items-center justify-center gap-2 whitespace-nowrap bg-white font-medium text-foreground transition-colors hover:bg-gray-100 dark:bg-muted dark:hover:bg-gray-700",
                        pick(
                          "h-11 rounded-full px-6 text-sm shadow-lg",
                          "h-12 rounded-xl px-8 py-2 text-base shadow-sm sm:h-14",
                          isPage
                        ),
                        INPUT_BORDER_CLASS,
                        isDefaultHistoryFolder(openedFolderId) &&
                          "ring-2 ring-foreground/20"
                      )}
                    >
                      {t("create.createHistorySidebar.all")}
                    </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <CreateFolderDialog
        open={createFolderOpen}
        parentFolder={createFolderParent}
        onOpenChange={(open) => {
          setCreateFolderOpen(open);
          if (!open) setCreateFolderParent(null);
        }}
        onCreated={(folderId) => {
          refreshFolders();
          openFolder(folderId);
          setCreateFolderOpen(false);
          setCreateFolderParent(null);
        }}
      />

      {folderMenu && (
        <HistoryFolderContextMenu
          x={folderMenu.x}
          y={folderMenu.y}
          folderName={folderMenu.folder.name}
          canCreateSubfolder={canCreateSubfolder(folderMenu.folder)}
          onAddImages={() => setAddImagesTarget(folderMenu.folder)}
          onCreateSubfolder={() => {
            setCreateFolderParent(folderMenu.folder);
            setCreateFolderOpen(true);
          }}
          onDelete={() => {
            if (!hasDeleteFolderSupport()) {
              showToast(
                t("create.createHistorySidebar.deleteUnsupported")
              );
              return;
            }
            setDeleteFolderTarget(folderMenu.folder);
          }}
          onClose={() => setFolderMenu(null)}
        />
      )}

      <DeleteFolderDialog
        open={Boolean(deleteFolderTarget)}
        folder={deleteFolderTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteFolderTarget(null);
        }}
        onDeleted={() => {
          refreshFolders();
          refreshGeneratedImages();
        }}
      />

      {addImagesTarget?.dirPath && (
        <AddImagesToFolderDialog
          open
          onOpenChange={(open) => {
            if (!open) setAddImagesTarget(null);
          }}
          folderName={addImagesTarget.name}
          folderDirPath={addImagesTarget.dirPath}
          onAdded={() => {
            refreshGeneratedImages();
            refreshFolders();
          }}
        />
      )}

      <DeleteImagesDialog
        open={deleteImagesOpen}
        filePaths={[...selectedImagePaths]}
        onOpenChange={setDeleteImagesOpen}
        onDeleted={() => {
          if (
            selectedImage &&
            selectedImagePaths.has(selectedImage.filePath)
          ) {
            setDetailOpen(false);
            setSelectedImage(null);
          }
          exitImageSelectionMode();
          refreshGeneratedImages();
          refreshFolders();
        }}
      />

      <GeneratedImageDetailDialog
        image={selectedImage}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onImageContextMenu={(event, image) => {
          event.preventDefault();
          imageActionsRef.current?.openContextMenu(
            event.clientX,
            event.clientY,
            image
          );
        }}
      />

      <GeneratedImageActionLayer
        ref={imageActionsRef}
        onRenamed={(oldPath, image) => {
          if (selectedImage?.filePath === oldPath) {
            setSelectedImage(image);
            onCenterPreviewChange?.(image);
          }
        }}
        onDeleted={(filePaths) => {
          if (selectedImage && filePaths.includes(selectedImage.filePath)) {
            setDetailOpen(false);
            setSelectedImage(null);
          }
        }}
      />
    </>
  );
}
