"use client";

// 详情打开时在绘制前通知父页保留图库实例，避免缩窄窗口先卸载来源组件。
// 普通数据读取仍使用原 effect，挂载保活通知不发起文件或网络访问。
// layout effect 只传递布尔状态，不把图片数据复制给父层。
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderInput,
  GalleryVertical,
  Grid3x3,
  ArrowDownUp,
  Lock,
  Unlock,
  Plus,
  Search,
  SquareCheck,
  Trash2,
  Upload,
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
import { useMoveGeneratedImages } from "@/hooks/use-move-generated-images";
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
  ACCENT_TOGGLE_ON_CLASS,
  INPUT_BORDER_CLASS,
  PRIMARY_BUTTON_CLASS,
  THIN_BORDER_CLASS,
  THIN_DIVIDER_CLASS,
} from "@/utils/layout";
import { cn } from "@/utils/cn";
import { importLocalArtwork } from "@/utils/import-local-artwork";
// 图库入口复用现有资源弹窗和拖拽能力，排序业务单独放在明确的窗口边界。
// 排列方法仅映射扫描记录，不承担磁盘读取；这里仍使用原有列表加载与错误处理。
// 宽屏侧栏和单栏文件管理页都会执行这两个引用，不维护两套排序界面。
// 排序不会修改生成参数或任务队列，只改变已经生成图片的浏览先后。
import { HistoryImageOrderDialog } from "@/view/create/history-image-order-dialog";
import { applyHistoryImageOrder } from "@/utils/history-image-order";
import { HistoryPagination } from "@/view/create/history-pagination";

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
  return "gap-2 grid-cols-3";
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
  // 文件移动成功后通知stage丢弃旧路径；取消和错误不触碰父页预览。
  onImagesMoved?: (paths: string[]) => void;
  /** 是否为当前活跃实例：只有它会消费「生成完成通知 → 打开图片详情」请求 */
  respondToOpenRequest?: boolean;
  // 通知父页保留承载详情的图库；不决定详情自身的资源或版式。
  // 可选以兼容其他图库入口，只有创建页需要跨单栏断点维持来源实例。
  // 父页使用稳定 setter，回调身份不能在每帧改变而重复清理保活状态。
  onDetailOpenChange?: (open: boolean) => void;
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
  onImagesMoved,
  respondToOpenRequest = false,
  // 详情状态仍属于当前图库，只把保活需求通知父页。
  // 侧栏与整页图库分别通知各自标记，不能互相清空对方的会话。
  // 打开/关闭方式不变，右键删除等既有动作也通过同一 detailOpen 生效。
  onDetailOpenChange,
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
  const browseFolder = useHistoryFolderStore((state) => state.browseFolder);
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
  const [foldersError, setFoldersError] = useState(false);
  const [effectiveOutputRoot, setEffectiveOutputRoot] = useState("");
  const importInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const importFiles = async (files: File[]) => {
    setImporting(true);
    try {
      const directory = getOpenedFolderDirPath(openedFolderId) ?? effectiveOutputRoot;
      const count = await importLocalArtwork(files, directory);
      showToast(t("create.workspace.imported", { count }));
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("create.workspace.importFailed"));
    } finally {
      refreshGeneratedImages(); refreshFolders(); setImporting(false);
    }
  };

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
  const [imagesError, setImagesError] = useState(false);
  // 图库：排序窗口开关是当前实例的局部状态，不随文件夹展开偏好全局共享。
  // 页面和侧栏可以共用已确认队列，但不应互相打开对方的弹窗。
  // Trigger 引用指向本实例的入口，关闭窗口后键盘焦点回到原操作点。
  // images 仍是磁盘扫描结果，不把拖动后的数组覆盖成一份假的磁盘清单。
  // 先根据持久化路径排列，再做搜索和分页，两个入口看到一致的队列前后关系。
  const [imageOrderOpen, setImageOrderOpen] = useState(false);
  const imageOrderTrigger = useRef<HTMLButtonElement>(null);
  // 订阅 store 的完整目录映射，保存一个目录只会替换其对应队列。
  // 未存在此可选字段的历史用户文档回退空队列，保持原扫描顺序。
  // 不用 displayName 作为键，用户重名文件夹或翻译“全部”不会覆盖别的偏好。
  const imageOrders = useHistoryFolderStore(state => state.imageOrderByFolder);
  const saveImageOrder = useHistoryFolderStore(state => state.setImageOrderForFolder);
  // 默认“全部”实际对应输出根；切换输出根后不能沿用旧根的排序队列。
  // 已打开具体文件夹直接用其路径，保持保存位置与实际扫描位置相同。
  // effectiveOutputRoot 在加载完成后才确定，排序按钮仍受原加载状态保护。
  const orderFolderKey = openedFolderDirPath ?? effectiveOutputRoot;
  // 图片对象来自最新 images，已保存的只是一串位置名单。
  // 外部新生成的文件会被接到队尾，已删除的文件不会因为旧名单又显示出来。
  // memo 同时依赖目录键和队列，切换目录或确认顺序都能立即刷新画面。
  // 不把 orderedImages 写回 images，避免下次扫描失败时失去最后的原始结果。
  // 分页数量继续来自筛选结果，而排序窗口明确使用全目录记录。
  // 用户保存一次排列后切到堆栈视图，同一顺序仍生效，不另建按视图保存的名单。
  // 九宫格和收藏视图也使用同一文件队列，视图切换不会恢复默认日期顺序。
  // 当前页缩略图并非独立文件集合，不能在页码变化时创建新的持久化排序键。
  // 图片刷新版本仍按原机制订阅，不为排序增加另一个扫描计时器。
  // 新顺序只改变 map 渲染次序，原图片按钮上的选择、详情和右键动作继续复用。
  // 文件名重命名后搜索可能不再命中，这是基于新真实名称的正常筛选结果。
  // 关闭排序时重扫不会主动清空搜索词，用户原来的浏览条件继续保留。
  // 若改名导致当前页项目减少，原分页逻辑会把页码限制在合法范围内。
  // 新文件接到队尾是排列名单的规则，不修改原主进程的扫描排序规则。
  // 其他未接入自定义排序的文件服务调用方因此仍保持原来行为。
  // onRenamed 只在本窗口明确完成文件操作时更新父层，拖动不会触发它。
  // 这种分离使图库中的名字、选中路径和预览路径不会提前变成尚不存在的目标。
  // 标题省略与此数据排序彼此独立，CSS 改动不会改变文件夹 ID 或生成保存目标。
  const orderedImages = useMemo(() => applyHistoryImageOrder(images, imageOrders?.[orderFolderKey] ?? []), [images, imageOrders, orderFolderKey]);
  const [selectedImage, setSelectedImage] = useState<GeneratedImageFile | null>(
    null
  );
  const [detailOpen, setDetailOpen] = useState(false);
  // 在浏览器绘制前更新保活标记，下一次缩放不能提前卸载详情来源。
  // 通知不重建详情组件，正在读取的 Meta 与图片选择继续保留。
  // 宽屏侧栏在单栏时只退出布局，其内部 portal 仍可迁移到正常流宿主。
  // 关闭详情后标记恢复 false，父页回到原本按实际宽度挂载图库的策略。
  // 不监听动画结束，窗口遮挡时仍能完成同步通知。
  // effect 没有条件调用，两个图库版式都遵守相同 hook 顺序。
  // 排序弹窗同样依赖这个来源实例；跨单栏断点时保留草稿，关闭后再释放。
  // 复用既有详情保活通知，不在创建外壳增加第二套“排序页面保活”状态。
  // 两个条件按或合并，关闭排序时若详情还开着，来源仍不能被卸载。
  // useLayoutEffect 在布局提交时通知，避免先卸载来源再尝试迁移 portal。
  // 保活不意味着让全部图库永久挂载；两个窗口都关闭后交回原响应式策略。
  useLayoutEffect(() => { onDetailOpenChange?.(detailOpen || imageOrderOpen); }, [detailOpen, imageOrderOpen, onDetailOpenChange]);
  // 路由离开、来源图库删除或异常卸载时清理保活，不能留下一直隐藏挂载的图库。
  // cleanup 只管理父页布尔标记，不触碰本地图片文件或其他图库的选择。
  // 独立清理 effect 避免 detailOpen 改变时先发出多余 false 通知。
  useLayoutEffect(() => () => onDetailOpenChange?.(false), [onDetailOpenChange]);
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
    // 搜索仅缩小当前显示集合，不能改变已经确认的全目录顺序。
    // 先排序后筛选意味着清空搜索时可恢复完整队列，不需要重排未命中的图片。
    // 搜索用原文件名，批量改名回执刷新 images 后会自然使用新名称匹配。
    const keyword = mediaSearch.trim().toLowerCase();
    if (!keyword) return orderedImages;
    return orderedImages.filter((image) =>
      image.fileName.toLowerCase().includes(keyword)
    );
  }, [orderedImages, mediaSearch]);
  const [page, setPage] = useState(0);
  const pageSize = viewMode === "stack" ? 6 : 9;
  const pages = Math.max(1, Math.ceil(filteredImages.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const pageKey = `${openedFolderId}|${mediaSearch}|${viewMode}`;
  const [previousPageKey, setPreviousPageKey] = useState(pageKey);
  if (pageKey !== previousPageKey) { setPreviousPageKey(pageKey); setPage(0); }
  const visibleImages = isPage ? filteredImages : filteredImages.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

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

  // 批量工具栏与单图菜单共用真实搬运流程，UI收尾仍只属于当前图库实例。
  // 原生选目录取消不进入这里，因此不会丢掉用户尚未处理的勾选。
  // 旧详情指向移动前的地址，成功后关闭；刷新后的新地址由磁盘扫描重新取得。
  // 父级stage只清命中旧路径的图，生成队列与其他预览不受整理文件影响。
  // 两个图库实例分别持有各自选择，不把当前退出多选广播成全局清空。
  // 磁盘层返回真实完成量，成功提示和全局重扫由共享hook负责。
  // 单图菜单成功也进入相同收尾，不能只在批量按钮后刷新侧栏。
  // 文件夹展开和搜索词不重置，用户整理完仍停在原来的浏览位置。
  // 若源目录已搬空，后续扫描显示真实空态，而不是自动跳到目的目录掩盖结果。
  // 多选Set清空发生在完成之后，原生对话框取消或目标越界不会丢失勾选。
  // 关闭旧详情避免它继续请求不存在的缩略图，不靠相似文件名推测新地址。
  // onImagesMoved只通知旧路径失效，不替代全局刷新，也不更改中心预览的其他对象。
  // 页面版与侧栏版各有独立实例，回调通过当前调用方连接对应stage。
  // 成功Toast已经在hook内提供，这里不能再重复报告一次搬运完成。
  // 实际磁盘数量和当前界面选择数不同，UI收尾不计算或展示第二份完成统计。
  // 图片生成中的任务不由文件整理停止，已提交任务仍保持原输出目录快照。
  // 不调用系统剪贴板接口，因此复制的提示词或其他应用剪贴板内容不会被覆盖。
  // 批量与右键入口都继续受已有输出根规则约束，不能因新增菜单开放任意磁盘搬运。
  const completeImageMove = (paths: string[]) => {
    setDetailOpen(false);
    setSelectedImage(null);
    exitImageSelectionMode();
    onImagesMoved?.(paths);
  };
  const { moving: movingImages, move: handleMoveImages } = useMoveGeneratedImages(completeImageMove);

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
      setFoldersError(false);
      try {
        const entries = await listOutputFoldersOnDisk(outputPath, true);
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
      } catch {
        if (!cancelled) setFoldersError(true);
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
      setImagesError(false);
      try {
        const files = await listGeneratedImages(outputPath, openedFolderDirPath, true);
        if (!cancelled) setImages(files);
      } catch {
        if (!cancelled) setImagesError(true);
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
   * 仅由可见的宽屏右栏或窄屏换页版响应，避免其它调用方意外消费请求。
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
        {/* side：文件管理，搜索及导入继续复用本地图库能力。 */}
        <div data-file-manager-head>
          <h2>{t("create.workspace.files")}</h2>
          <input data-file-search aria-label={t("create.createHistorySidebar.searchPlaceholder")} placeholder={t("create.createHistorySidebar.searchPlaceholder")} value={mediaSearch} onChange={event => setMediaSearch(event.target.value)} />
          <input ref={importInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (files.length) void importFiles(files); }} />
          <button data-file-upload type="button" disabled={importing || !effectiveOutputRoot} onClick={() => importInput.current?.click()} className="flex items-center justify-center gap-2 disabled:opacity-50"><Upload size={15} />{t(importing ? "create.workspace.importing" : "create.workspace.upload")}</button>
        </div>
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
                      "max-h-[min(240px,28vh)] space-y-1 overflow-y-auto p-2",
                      isPage
                    )}
                  >
                    {foldersError ? (
                      <div role="alert" data-folders-error className="p-2 text-xs text-muted-foreground">
                        <p>{t("create.workspace.folderLoadFailed")}</p>
                        <button type="button" onClick={refreshFolders} className="mt-2 min-h-8 rounded border border-border px-3">{t("create.workspace.retry")}</button>
                      </div>
                    ) : loadingFolders ? (
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
                                    ? "bg-accent-soft text-foreground"
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
                  data-history-toolbar
                  className={cn(
                    "flex w-full min-w-0 items-center gap-1",
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
                    <span data-history-media-title title={isDefaultHistoryFolder(openedFolderId) ? mediaLabelText : `${mediaLabelText} · ${openedFolderName}`}
                      className={cn(
                        "block min-w-0 flex-1 truncate text-left font-medium",
                        isPage ? "text-sm font-semibold" : "text-xs"
                      )}
                    >
                      {isDefaultHistoryFolder(openedFolderId)
                        ? mediaLabelText
                        : `${mediaLabelText} · ${openedFolderName}`}
                    </span>
                  </button>

                  {/**
                   * 视图切换器：宽屏右栏按正常 flex 顺序排列，不再绝对定位覆盖标题。
                   * 标题只使用剩余宽度，图标宽度固定；目录很长时由文本产生省略号。
                   * 完整标题保留在 title，不因为截断显示而修改实际文件夹名称。
                   * 图标与操作按钮仍各自是原生按钮，省略规则不裁掉其点击区域。
                   * `page` 版式**不渲染它** —— 窄屏换页上方有一枚固钉在右上角管同一件事，
                   * 两处并存既是重复入口、又把标题栏挤得只剩一条。
                   */}
                  <div
                    className={cn(
                      "flex shrink-0 items-center gap-2",
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

                  <div data-history-actions className="ml-auto flex shrink-0 items-center gap-1">
                    {/* 图库：排序窗口接收当前目录全部图片，包含搜索隐藏的项目和其他页。 */}
                    {/* 不依赖多选模式，用户无需先选中当前分页的图才能打开完整目录排列。 */}
                    {/* 空筛选结果时不开放入口，避免“没有搜到图”却突然显示全库造成误解。 */}
                    {/* 加载或扫描失败时拒绝打开，不能拿不完整结果去安排一份新的顺序。 */}
                    {/* 移动正在改变文件路径时禁用，防止排序和磁盘移动争用同一批身份。 */}
                    {/* 入口只占一个小图标，与现有批量选择和搜索按钮使用相同尺寸。 */}
                    {/* 悬停说明与可访问名称相同，不要求用户猜测上下箭头的业务意义。 */}
                    {/* 操作区自身不收缩，目录标题才是允许压缩和省略的区域。 */}
                    <button ref={imageOrderTrigger} type="button" data-history-order-open
                      aria-label={t("create.historyOrder.title")} title={t("create.historyOrder.title")}
                      disabled={movingImages || loadingImages || imagesError || filteredImages.length === 0}
                      onClick={() => setImageOrderOpen(true)}
                      className="flex h-6 w-6 items-center justify-center rounded-lg hover:bg-muted/50 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-stroke">
                      <ArrowDownUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={
                        imageSelectionMode
                          ? t("create.createHistorySidebar.exitSelection")
                          : t("create.createHistorySidebar.batchSelect")
                      }
                      disabled={movingImages}
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
                        {imagesError ? (
                          <div role="alert" data-images-error className="p-4 text-center text-xs text-muted-foreground">
                            <p>{t("create.workspace.loadFailed")}</p>
                            <button type="button" onClick={refreshGeneratedImages} className="mt-2 min-h-8 rounded border border-border px-3">{t("create.workspace.retry")}</button>
                          </div>
                        ) : loadingImages ? (
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
                          <div data-images-empty
                            className={cn(
                              "motion-fade-in text-center text-muted-foreground",
                              isPage ? "py-16 text-sm" : "py-8 text-xs"
                            )}
                          >
                            {images.length > 0 ? t("create.workspace.noMatches") : isDefaultHistoryFolder(openedFolderId)
                              ? t("create.historyEmptyState.noGeneratedImages")
                              : t("create.createHistorySidebar.emptyInFolder", {
                                  name: openedFolderName,
                                })}
                            {!isDefaultHistoryFolder(openedFolderId) && images.length === 0 && <button type="button" data-browse-all onClick={() => browseFolder(DEFAULT_FOLDER_ID)} className="mx-auto mt-3 block min-h-8 rounded border border-border px-3">{t("create.workspace.browseAll")}</button>}
                          </div>
                        ) : (
                          <div
                            data-history-grid={viewMode}
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
                            {visibleImages.map((image) => {
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
                                onClick={(event) => {
                                  if (imageSelectionMode) {
                                    toggleImageSelection(image.filePath);
                                    return;
                                  }
                                  const openDetail = () => {
                                    onCenterPreviewChange?.(image);
                                    setSelectedImage(image);
                                    setDetailOpen(true);
                                  };
                                  // 图片详情与资源窗口共用主区 760px 两栏门槛。
                                  // 读取常驻父容器，不能用右侧图库本身的窄列宽判断整个创建区。
                                  // 文件管理全页即使 isPage=true，主区够宽时也必须直接开原弹窗。
                                  // 不为宽屏套用页面位移动画，避免弹窗打开后仍等待紧凑页标记。
                                  // 事件仅作触发信号，点击时重新读取实际几何，不缓存 resize 事件载荷。
                                  // 非创建页没有该宿主时沿用原 isPage 行为，避免更改其他图库入口。
                                  const mainWidth = event.currentTarget.closest('[data-create-main-area]')?.getBoundingClientRect().width ?? 0;
                                  if (!isPage || mainWidth >= 760) {
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
                                    // 选中只用一像素半透明细线，取消外侧留白避免拼成三像素粗框。
                                    // 暗色进一步降低红色对比，图片本身仍是视觉主体。
                                    // 沿用 ring 不改变卡片布局尺寸，网格密度和多选命中区保持不变。
                                    "ring-1 ring-red-400/40 dark:ring-red-300/30"
                                )}
                              >
                                <LocalFileImage
                                  filePath={image.filePath}
                                  alt={image.fileName}
                                  className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
                                />
                                <span data-file-caption><span className="block truncate text-xs font-medium">{image.fileName}</span><span className="mt-1 block truncate text-[10px] text-muted-foreground">{t("create.workspace.localFile")}</span></span>
                                {imageSelectionMode ? (
                                  <span
                                    className={cn(
                                      "absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border bg-background/90 shadow-sm",
                                      isImageSelected &&
                                        // 勾选圆点同步减淡，不能只改外框仍留下刺眼的纯红色块。
                                        // 保留白色勾与原二十像素命中提示，不改变多选行为。
                                        // 主题分支只改变颜色透明度，选择状态仍来自原 selectedImagePaths。
                                        "border-red-400/40 bg-red-500/75 text-white dark:border-red-300/30 dark:bg-red-400/45"
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
                          disabled={movingImages}
                          className="inline-flex h-8 items-center rounded-md px-2 text-xs font-medium hover:bg-muted/60"
                        >
                          {t("create.createHistorySidebar.selectAll")}
                        </button>
                        <button
                          type="button"
                          onClick={exitImageSelectionMode}
                          disabled={movingImages}
                          className="inline-flex h-8 items-center rounded-md px-2 text-xs font-medium hover:bg-muted/60"
                        >
                          {t("common.cancel")}
                        </button>
                        {/* 图片多选：与删除并列的移动入口，两种图库版式共用这一处 JSX。 */}
                        {/* 系统选择器取消不清空勾选；等待期间锁定选择管理与删除，避免同时操作同一批文件。 */}
                        {/* title 在原生选择器打开前说明输出目录限制，图标与字体沿用既有工具栏。 */}
                        {/* 目标文件夹在点击后选择，不借用顶部“新建文件夹”按钮的生成保存目标。 */}
                        {/* 无选择时只禁用移动入口，不隐藏它，用户能在批量模式中发现此能力。 */}
                        {/* 忙碌文案替换同一按钮文字，保留稳定 DOM 焦点而不临时换成另一个控件。 */}
                        {/* 图标来自现有 lucide 集合，语义由可见文本提供，不要求用户只认图形。 */}
                        {/* flex-wrap 沿用原工具栏，窄栏增加一项后可自然换行，不把删除挤出可点击区域。 */}
                        {/* 成功后工具栏随选择模式退出，失败则仍显示同一批勾选和可重试操作。 */}
                        {/* 删除继续使用原破坏性色，移动沿用浅边框，两种副作用不会共用一个按钮。 */}
                        {/* 外层 sticky 区负责停靠，按钮不引入 fixed 层遮住图片或窗口控制。 */}
                        {/* 选择器由同一 click 快照传参，按钮渲染后用户继续勾选不会改写旧数组。 */}
                        {/* 不新增第二套 loading 遮罩，原图片列表的滚动和加载状态仍归列表自己管理。 */}
                        <button type="button" data-history-move title={t("create.createHistorySidebar.moveHint")} disabled={movingImages || selectedImageCount === 0} onClick={() => void handleMoveImages([...selectedImagePaths])} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50">
                          <FolderInput className="h-3.5 w-3.5" />
                          {t(movingImages ? "create.createHistorySidebar.moving" : "create.createHistorySidebar.move")}
                        </button>
                        <button
                          type="button"
                          disabled={movingImages || selectedImageCount === 0}
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
                    ) : !isPage || isDefaultHistoryFolder(openedFolderId) ? null : (
                    <button
                      type="button"
                      onClick={() => openFolder(DEFAULT_FOLDER_ID)}
                      className={cn(
                        "pointer-events-auto inline-flex w-auto items-center justify-center gap-2 whitespace-nowrap bg-background font-medium text-foreground transition-colors hover:bg-muted",
                        pick(
                          "h-11 rounded-full px-6 text-sm shadow-lg",
                          "min-h-8 rounded-lg px-3 py-1 text-xs",
                          isPage
                        ),
                        INPUT_BORDER_CLASS,
                      )}
                    >
                      {t("create.workspace.fileCount", { count: filteredImages.length })}
                    </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {!isPage && <HistoryPagination count={filteredImages.length} page={currentPage} pages={pages} onChange={next => { setPage(next); }} />}
      </div>

      {imageOrderOpen && <HistoryImageOrderDialog
        // 文件夹作为实例 key：真正换目录时销毁旧草稿，不把排列写到新目录。
        // images 传完整的 orderedImages，不能传 visibleImages 丢失分页外的文件。
        // 也不能传 filteredImages：目标名冲突检查必须看见搜索隐藏的同目录图片。
        // 已有顺序单独传入，窗口草稿与 store 的最终结果之间保持确认边界。
        key={orderFolderKey} images={orderedImages}
        outputPath={outputPath} folderKey={orderFolderKey} savedOrder={imageOrders?.[orderFolderKey] ?? []} onSave={saveImageOrder}
        onRenamed={(oldPath, image) => {
          // 类似联系人改名后先按旧号码定位，匹配成功才替换成新的资料卡。
          // 不能按数组下标更新，拖动、分页和刷新都可能让原下标指向另一张图。
          // 不把新回执直接 push 到末尾，否则同一文件会同时出现旧名和新名两张卡。
          setImages(current => current.map(item => item.filePath === oldPath ? image : item));
          // 当前详情和中央预览如果指向旧图，同步指向真实新路径。
          // 不修改其他选中的图片，也不因为批量改名就主动打开一个新的详情页。
          if (selectedImage?.filePath === oldPath) { setSelectedImage(image); onCenterPreviewChange?.(image); }
          // 多选集合保存的是路径身份，成功改名后必须迁移，否则后续移动会使用旧路径。
          // Set 保持去重；没有命中的条目原样保留，不清空用户其他选择。
          setSelectedImagePaths(current => new Set([...current].map(path => path === oldPath ? image.filePath : path)));
        }}
        // 关闭触发正式重扫，既刷新图片名称，也刷新文件夹的数量和修改时间摘要。
        // 微任务等 React 完成关闭提交后恢复焦点，避免焦点落在将要卸载的弹窗按钮上。
        // 入口若因路由离开已卸载，optional chaining 不把焦点恢复变成异常。
        onClose={() => { setImageOrderOpen(false); refreshGeneratedImages(); refreshFolders(); queueMicrotask(() => imageOrderTrigger.current?.focus()); }}
      />}
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
        onMoved={completeImageMove}
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
