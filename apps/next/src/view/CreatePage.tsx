"use client";

/**
 * 创建页（左侧应用导航 `nav` 里的「创建」）。
 *
 * ## 区域命名（本文件与 create/* 子组件统一用这套说法）
 * - `nav`   左侧应用导航（`components/Sidebar.tsx`，全局常驻，**不属于本页**）
 * - `rail`  创建页左栏 = 创建表单：模式标签 → 模型系列 → 提示词 → 反向提示词 → 图片尺寸 → 高级设置 → 生成
 * - `stage` 中栏 = 图片显示区（点开进入大图预览层）
 * - `side`  右栏 = 「已生成图片」；开着高级组装时换成「提示词组装」
 * - `pin`   单栏主区右侧居中的图库入口固钉（两栏、三栏右栏常驻，所以不渲染）
 * - `modal` 页面级弹窗（模型 / 扩展 / 提示词指南）
 *
 * ## 组件 ↔ 界面名称对照
 * | 组件 | 界面上叫什么 |
 * |---|---|
 * | `CreateModeTabs` | rail 顶部「图片 / 视频 / 编辑 / Role TTS」模式标签 |
 * | `ModelSeriesSelector` | 「模型系列」那一行（Anima / SDXL） |
 * | `PromptGuideButton` / `PromptGuideDialog` | 模型卡片上的「如何为 xx 编写提示词？」及其指南弹窗 |
 * | `SelectedExtensionRow` | 已选扩展（LoRA）列表里的一行（可调权重 / 移除） |
 * | `PromptSection` | 「提示词」区（含高级组装开关与工具行） |
 * | `NegativePromptSection` | 「反向提示词」区 |
 * | `ImageSizeSection` | 「图片尺寸」区（比例 / 宽高 / 预设） |
 * | `AdvancedSettings` | 「高级设置」区（采样器 / 步数 / CFG / 种子…） |
 * | `GenerateFooter` | rail 底部的「生成」按钮条 |
 * | `VideoCreatePanel` / `RoleTtsPanel` | 视频 / Role TTS 模式下替换整个 rail 的面板 |
 * | `ImagePreviewTrigger` | stage 里那张图 —— 点开是大图预览层 |
 * | `PromptAssemblyPanel` | side 的「提示词组装」（高级模式） |
 * | `CreateHistorySidebar` | side 的「已生成图片」（窄屏变成主区整页） |
 * | `ModelSelectDialog` / `ExtensionSelectDialog` | 「选择 Anima / SDXL 模型」/「选择扩展」弹窗 |
 * | `GeneratedImageActionLayer` | 没有界面外壳：图片右键菜单 / 改名 / 删除确认 |
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  Bookmark,
  GalleryVertical,
  Grid3x3,
  ImageIcon,
  Mic,
  Video as VideoIcon,
} from "lucide-react";
import {
  ModelSeriesSelector,
} from "@/view/create/ModelSeriesSelector";
import { AdvancedSettings } from "@/view/create/AdvancedSettings";
// 已检测的边缘 PNG 进入公共图片队列，普通图片生成仍保留原执行入口。
// 不从 DOM 截图提取控制图，使用 Worker 返回的原始 Blob。
// 任务持有 File 字节，切页或改阈值释放预览 URL 不影响已提交的上传。
import { CreateModeTabs } from "@/view/create/CreateModeTabs";
import { ExtensionSelectDialog } from "@/view/create/ExtensionSelectDialog";
import { filterAndSortExtensions } from "@/data/extensions";
import { GenerateFooter } from "@/view/create/GenerateFooter";
import { GeneratingStatus } from "@/view/create/generating-status";
import { ImageSizeSection } from "@/view/create/ImageSizeSection";
import { NegativePromptSection } from "@/view/create/NegativePromptSection";
import { ModelSelectDialog } from "@/view/create/ModelSelectDialog";
import { PromptSection } from "@/view/create/PromptSection";
import {
  PromptGuideButton,
  PromptGuideDialog,
} from "@/view/create/PromptGuideDialog";
import { SelectedExtensions } from "@/view/create/selected-extensions";
import { RoleTtsPanel } from "@/view/create/RoleTtsPanel";
// 音频 stage 使用同一个结果组件，避免将音频 URL 交给图片预览层。
// 宽窗口放在中栏，窄窗口由 Role TTS 自己承载，不额外打开浮层。
// 常驻草稿拥有音频结果，创建页卸载不销毁队列或播放地址。
import { AudioResults } from '@/view/create/audio-results';
import { VideoCreatePanel } from "@/view/create/VideoCreatePanel";
// 编辑模式在原蒙版工具旁新增文字改图，具体工具状态由子组件管理。
// 子组件复用原蒙版面板，不复制或删除画布、导出与上传逻辑。
// 创建页只负责提供可用展示区和进入真实图库的回调。
import { EditWorkspace } from "@/components/create-edit/edit-workspace";
import { CreateHistorySidebar } from "@/view/create/CreateHistorySidebar";
import { CreationPreviewHeader, CreationFilmstrip } from "@/view/create/creation-preview-tools";
import {
  GeneratedImageActionLayer,
  type GeneratedImageActionHandle,
} from "@/view/create/GeneratedImageActionLayer";
import { PromptAssemblyPanel } from "@/view/create/promptAssembly/PromptAssemblyPanel";
import {
  getSelectedModelDisplay,
} from "@/data/models";
import { ModelCoverSelect } from "@/view/create/model-cover-select";
import { ImagePreviewTrigger } from "@/components/ImagePreviewOverlay";
import type { ImagePreviewItem } from "@/components/ImagePreviewOverlay";
import { useSettingsStore } from "@/stores/useSettingsStore";
import {
  getOpenedFolderDirPath,
  useHistoryFolderStore,
} from "@/stores/useHistoryFolderStore";
import { useCreateFormStore, getResolvedSeedFromStore } from "@/stores/useCreateFormStore";
import { useCreateRemixStore } from "@/stores/useCreateRemixStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import type { MessageKey } from "@/i18n";
import type { Translator } from "@/i18n/translate";
import { resolveImageDimensions } from "@/utils/imageSize";
import { findImageSizePresetBySize } from "@/data/imageSizes";
import { useComfyGenerate } from "@/hooks/useComfyGenerate";
import { useCreateLayout } from "@/hooks/use-create-layout";
import { getDefaultLocalSelectedModel } from "@/utils/localModelResources";
import { listGeneratedImages } from "@/utils/generatedImages";
import { buildGenerateParams } from "@/utils/comfy/buildGenerateParams";
// 图片模型加载设置与实际生成读取同一模板，不维护另一组 CLIP/VAE 默认名。
// 辅助覆盖按图片系列隔离，切换到视频或编辑不会改变这里的选择。
import { getImageWorkflowDefaults, getImageWorkflowTemplate } from "@/utils/comfy/imageWorkflow";
// 图片辅助覆盖由 CreatePage 持有，图片与视频切换后仍保留当前页面草稿。
// 系列作为字典键，节点号相同也不能让不同工作流串用同一份文件名。
// 提交时用实际 workflowSeries 取值，不能只依赖屏幕当前展示的系列标签。
// 生成队列继续冻结完整参数，辅助覆盖与主模型、提示词属于同一任务快照。
import { WorkflowModelSettings } from '@/view/create/video-model-settings';
import type { VideoModelOverrides } from '@/utils/comfy/video-workflow-models';
import { readEditableText, setEditableText } from "@/utils/promptEditor";
import { readPromptText, setPromptText } from "@/utils/promptTarget";
import { isElectronEnvironment } from "@/utils/electronBridge";
import type { CreateMode } from "@/types/createMode";
// 图片资源改由单一内存 store 持有，编辑同步直接读取实际生成使用的值。
// 不使用 effect 发布镜像，避免用户快速切换模式后同步到上一帧选择。
// 普通表单与编辑仍是独立草稿，只有显式同步才复制资源。
import { useImageResourceStore } from "@/stores/use-image-resource-store";
import type { GeneratedImageFile } from "@/types/historyFolder";
import {
  DEFAULT_EXTENSION_WEIGHT,
} from "@/types/extension";
import { displayModelFileName } from "@/utils/buildGeneratedImageMeta";
import type { RemixApplyResult } from "@/utils/remixFromMeta";
import {
  ACCENT_TOGGLE_ON_CLASS,
  THIN_BORDER_CLASS,
  THIN_DIVIDER_CLASS,
} from "@/utils/layout";
import { runPageStyleTransition } from "@/utils/pageTransition";
import { cn } from "@/utils/cn";

/**
 * 单栏右侧的固钉切换器：三枚方钮分别导航创建表单、预览和文件管理。
 *
 * 为什么把「已生成图片」的入口做成固钉而不是提示词框下面那枚小 chip：
 * 那个位置在滚动里，往下拉一点就看不见了 —— 用户要找的入口必须**一直在**。
 * 切换展示内容但不卸载表单；图库自己的视图档位不受导航影响。
 */
const CREATE_PAGE_OPTIONS: ReadonlyArray<{
  mode: "form" | "preview" | "history";
  labelKey: MessageKey;
  Icon: typeof Grid3x3;
}> = [
  { mode: "form", labelKey: "nav.create", Icon: Grid3x3 },
  { mode: "preview", labelKey: "create.workspace.preview", Icon: GalleryVertical },
  { mode: "history", labelKey: "create.historyDrawer.openLabel", Icon: Bookmark },
];

function getRemixToastMessage(
  payload: RemixApplyResult,
  translate: Translator
): string {
  const warnings: string[] = [];
  if (payload.unmatchedCheckpoint) {
    warnings.push(translate("create.page.modelNotFound", {
      name: displayModelFileName(payload.unmatchedCheckpoint),
    }));
  }
  if (payload.unmatchedLoras.length > 0) {
    warnings.push(translate("create.page.loraNotFound", {
      count: payload.unmatchedLoras.length,
    }));
  }
  return warnings.length > 0
    ? translate("create.page.remixFilledWithWarnings", {
        warnings: warnings.join(", "),
      })
    : translate("create.page.remixFilled");
}

export function CreatePage() {
  const { t } = useTranslation();
  const localModels = useSettingsStore((state) => state.models);
  const paths = useSettingsStore((state) => state.paths);
  const outputPath = useSettingsStore((state) => state.outputPath);
  const openedFolderId = useHistoryFolderStore((state) => state.openedFolderId);
  const imagesRefreshVersion = useHistoryFolderStore(
    (state) => state.imagesRefreshVersion
  );
  const openedFolderDirPath = getOpenedFolderDirPath(openedFolderId);
  const aspectRatio = useCreateFormStore((state) => state.aspectRatio);
  const setAspectRatio = useCreateFormStore((state) => state.setAspectRatio);
  const setCustomSize = useCreateFormStore((state) => state.setCustomSize);
  const advancedPrompt = useCreateFormStore((state) => state.advancedPrompt);
  const setAdvancedPrompt = useCreateFormStore((state) => state.setAdvancedPrompt);
  /** 与右侧栏一致的宽度断点：窄屏时组装面板改在提示词框下方就地展开 */
  const { ref: layoutRef, layout } = useCreateLayout();
  // side 在两栏和三栏都保留：压缩时先隐藏预览，再隐藏文件管理。
  // 该状态继续供提示词组装与图库使用，避免双栏中复制挂载同一个面板。
  // single 仅展示创作表单，图库由固钉进入，不再插入额外的编辑/预览切换行。
  // 分栏依据是工作区容器而不是窗口：展开nav后，同一窗口可用空间会减少。
  // 三栏时表单使用既有固定宽度，中间预览吸收剩余空间。
  // 两栏去掉表单固定宽度，让它填满被预览让出的区域。
  // 文件管理保持原side实例，包含当前文件夹、列表和多选状态。
  // 高级组装打开时仍替换side内容，不能同时复制到表单产生双实例。
  // 单栏组装移回提示词区域，文件管理则通过原图库子页访问。
  // 该布尔值只控制side可用性；stage仍需单独满足three条件。
  // 编辑模式有自己的蒙版画布，不能借布局变化挂上普通图片预览。
  // 导航开合时useCreateLayout会重新读容器，业务模式不参与宽度计算。
  // 隐藏区域保持挂载，避免尺寸往返导致生成结果和编辑节点被重建。
  // 生成入口仍调用现有队列，视口变化不应再次提交或取消任务。
  // 容器边界与面板可见性在冒烟中分别检查，避免状态标签正确却隐藏错列。
  /**
   * 断点取值对应的是可同时读写的真实列，而不是设备类别：
   * - 三栏需要给表单、预览、文件管理各自留出最小宽度。
   * - 两栏优先保留表单和文件管理，预览在这个阶段先从布局退出。
   * - 单栏将可用空间全部给创作表单，图库改走右侧固钉入口。
   * 这种顺序保护了高频生成输入与文件浏览，缩窄时不先隐藏文件列表。
   * 宽度由 useCreateLayout 观察本容器，因此 nav 展开和收起会立即参与判断。
   * 容器变化时仅更新 layout，不重建 Zustand 表单或重置生成上下文。
   * sideVisible 同步提示词组装的目标位置，避免布局是两栏却继续使用单栏容器。
   * stage 自己读取 three 与模式状态，避免 edit 画布错误显示普通预览。
   */
  const isWideViewport = layout !== "single";
  const [previewZoom, setPreviewZoom] = useState(1);
  const setAdvancedSettings = useCreateFormStore(
    (state) => state.setAdvancedSettings
  );
  const setGenerationContext = useCreateFormStore(
    (state) => state.setGenerationContext
  );
  const remixRequestId = useCreateRemixStore((state) => state.remixRequestId);
  const remixPayload = useCreateRemixStore((state) => state.payload);
  const clearRemix = useCreateRemixStore((state) => state.clearRemix);
  const showToast = useToastStore((state) => state.show);
  // 预览 URL 用于显示，实际保存路径用于确认图库中是不是同一张图。
  // 两者都来自同一个全局任务，切页返回后仍保持同一身份。
  // 不比较图片像素或文件名：相似内容、同名异目录都是独立作品。
  const { generating, previewUrl, previewFilePath, generate } = useComfyGenerate();
  const [historyImages, setHistoryImages] = useState<GeneratedImageFile[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [centerPreviewImage, setCenterPreviewImage] =
    useState<GeneratedImageFile | null>(null);
  /**
   * 窄屏（< xl）下图库抽屉。右栏是 `hidden xl:flex`，窄屏时整栏消失，
   * 没有这个抽屉用户就完全看不到已生成图片 —— 见 PromptSection 里的入口按钮。
   */
  // 单栏固钉切换创建、预览、文件管理三页，不再改动图库的网格/列表偏好。
  // 扩宽时恢复原分栏，但保留当前单栏页，缩回后仍可接着浏览同一内容。
  // 只保存展示状态，提示词、生成队列和图库选择仍由原组件负责。
  const [narrowPage, setNarrowPage] = useState<"form" | "preview" | "history">("form");
  const imageActionsRef = useRef<GeneratedImageActionHandle>(null);
  const [createMode, setCreateMode] = useState<CreateMode>("image");
  // 系列、模型和 LoRA 都从原生成入口的权威状态读取。
  // 保留变量名，后续生成参数组装与二创回填仍使用同一条路径。
  // 资源选择跨路由保留，编辑同步不会因图片表单卸载而丢失来源。
  // setter 保留函数式更新，现有默认模型与系列切换逻辑无需改写。
  // 每个 selector 独立订阅，弹窗开关继续是页面局部状态。
  // 此处只读取 store，不在渲染期间写入另一个组件的状态。
  const seriesId = useImageResourceStore((s) => s.seriesId), setSeriesId = useImageResourceStore((s) => s.setSeriesId);
  // Anima 的独立加载器与 SDXL 的 checkpoint 输出不是同一套槽位。
  // 保留每个系列的草稿，返回时不把上一系列的节点 id 套进当前图。
  // 和视频页相同，这些辅助选择仅保存在当前页面会话中。
  const [modelOverridesBySeries, setModelOverridesBySeries] = useState<Record<string, VideoModelOverrides>>({});
  const imageModelTemplate = useMemo(() => getImageWorkflowTemplate(seriesId === 'sdxl' ? 'sdxl' : 'anima'), [seriesId]);
  const selectedModel = useImageResourceStore((s) => s.selectedModel), setSelectedModel = useImageResourceStore((s) => s.setSelectedModel);
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [extensionDialogOpen, setExtensionDialogOpen] = useState(false);
  const [promptGuideOpen, setPromptGuideOpen] = useState(false);
  // 扩展数组就是图片生成实际输入，不额外维护一份只供同步显示的列表。
  // 编辑复制时深拷贝各行，后续权重变化不会跨模式串联。
  // 清空数组仍表示不使用 LoRA，不从编辑模板自动补项。
  const selectedExtensions = useImageResourceStore((s) => s.selectedExtensions), setSelectedExtensions = useImageResourceStore((s) => s.setSelectedExtensions);

  const modelDisplay = getSelectedModelDisplay(selectedModel, localModels);
  const isImageMode = createMode === "image";
  const isVideoMode = createMode === "video";
  const isRoleTtsMode = createMode === "roleTts";

  /**
   * 窄屏「已生成图片」= **主显示区换页**，不是覆盖整屏的浮层。
   *
   * 页面本来就是「左侧应用导航 + 右侧主显示区」两栏：低宽度下把整屏盖掉，
   * 导航会跟着消失，用户既回不去别的页、也失去了「我在应用的哪一层」这个上下文。
   * 因此它替换的是创建表单那一栏（`hidden` 保留挂载，编辑中的提示词不丢），
   * 左侧导航（`apps/next/src/components/Sidebar.tsx`，md 以上固定显示）原样留着。
   */
  // 单栏每次只展示一个页面；预览页沿用原 stage，不另建一份图片状态。
  // 文件管理返回仍回创建表单，导航固钉也可直接从预览切换到图库。
  // 双栏及三栏忽略单栏页标记，避免扩宽后多出重复的 stage 或图库。
  // 编辑模式占满功能展示区，其文件管理入口在工具标题栏中提供。
  // 即使桌面足够宽，进入图库仍由 main 父组件换页，不能浮动盖住编辑器。
  // 编辑器保留挂载，返回后文字指令与蒙版画布仍为原来的状态。
  // 其他模式继续沿用原单栏图库规则，不改变双栏或三栏业务。
  // 图片详情经图库渲染，跨断点时必须保留原图库实例直到详情关闭。
  // 侧栏与整页分别记录，任一实例清理时不能误清空另一实例的保活状态。
  // 这里只保存生命周期标记，实际图片与 Meta 仍由原图库/详情组件拥有。
  const [sidebarDetailOpen, setSidebarDetailOpen] = useState(false), [pageDetailOpen, setPageDetailOpen] = useState(false);
  // 从整页图库打开详情后扩宽，也保留该来源页，避免 modal 恢复时详情被父树卸载。
  // 标记为 false 后恢复既有单栏图库规则，不常驻渲染重复的数据列表。
  // 顶层窄页选择仍由 narrowPage 决定，详情保活不能主动打开文件管理。
  const showHistoryPage = (!isWideViewport || createMode === "edit" || pageDetailOpen) && narrowPage === "history";
  const showPreviewPage = !isWideViewport && narrowPage === "preview";

  /**
   * 创建表单 ↔ 「已生成图片」的进出，走**和切页面同一套**动画。
   *
   * 为什么不再用 `subpage-enter` 那一套淡入：同一个应用里「进入下一层」出现了三种手感
   * （路由是位移、图库是淡入、详情是缩放），用户会读成「这个软件的动画是随手写的」。
   * 方向和路由一致：进去 = 向右推（新内容从右进），返回 = 镜像。
   */
  const openHistoryPage = useCallback((open: boolean) => {
    runPageStyleTransition({
      direction: open ? "forward" : "backward",
      // 保留图库进出的原页面转场，只更换单栏页面标记。
      // 返回时不清空浏览目录、图片选择或尚未完成的生成任务。
      // 预览与创建固钉也共用这个状态，不与图库显示模式混在一起。
      apply: () => setNarrowPage(open ? "history" : "form"),
      isSettled: () =>
        open
          ? Boolean(document.querySelector('[data-create-subpage="history"]'))
          : !document.querySelector('[data-create-subpage="history"]'),
    });
  }, []);

  const previewIcon = isVideoMode ? (
    <VideoIcon className="h-12 w-12 text-muted-foreground opacity-50" strokeWidth={1.5} />
  ) : isRoleTtsMode ? (
    <Mic className="h-12 w-12 text-muted-foreground opacity-50" strokeWidth={1.5} />
  ) : (
    <ImageIcon className="h-12 w-12 text-muted-foreground opacity-50" strokeWidth={1.5} />
  );

  const historyMediaLabel = isVideoMode
    ? t("create.page.mediaVideo")
    : isRoleTtsMode
        ? t("create.page.mediaRoleTts")
        : t("create.page.mediaImage");

  useEffect(() => {
    let cancelled = false;

    void listGeneratedImages(outputPath, openedFolderDirPath).then((files) => {
      if (!cancelled) setHistoryImages(files);
    }).catch(() => {
      if (!cancelled) setHistoryImages([]);
    });

    return () => {
      cancelled = true;
    };
  }, [outputPath, openedFolderDirPath, imagesRefreshVersion, previewUrl]);

  /**
   * 显示区内容：**刚生成的预览永远排在最前**，后面接当前文件夹的磁盘图片。
   *
   * 修复「ComfyUI 已画完但显示区没有图」：过去只要磁盘列表非空就只用磁盘图片，
   * 而磁盘列表来自「已打开」的文件夹、保存目标来自「已选中」的文件夹，
   * 两者不一致（或落盘刷新慢半拍）时新图就完全不显示。
   */
  const previewGalleryItems = useMemo((): ImagePreviewItem[] => {
    // 像把电子票和纸票合成同一张票：同一路径的结果只占一个缩略图位置。
    // 保存刷新晚到时先保留临时预览，不能等扫描完成才显示新图。
    // 只排除精确的保存路径，其他目录的同名作品继续保留。
    // 预览不存在时不做过滤，保证仅浏览磁盘历史的入口仍完整。
    // 过滤只影响展示数组，不删文件、不修改图库原始清单。
    // 最新结果不在当前浏览目录时仍插入到最前面，保留跨目录预览。
    const diskItems = historyImages.filter((image) => !previewUrl || image.filePath !== previewFilePath).map((image) => ({
      key: image.filePath,
      filePath: image.filePath,
      alt: image.fileName,
    }));

    if (!previewUrl) return diskItems;

    return [
      // 共享同一个 src，缩略图、主图和最新结果不再另造预览地址。
      // 同时保留 filePath，让最新缩略图也能通过原右键菜单操作真实文件。
      // 没有落盘身份的旧任务仍用临时 key，不凭空绑定某张历史图。
      { key: previewFilePath ?? "__preview__", filePath: previewFilePath, src: previewUrl, alt: t("create.page.previewAlt") },
      ...diskItems,
    ];
  }, [historyImages, previewUrl, previewFilePath, t]);

  /**
   * 渲染期同步：刚生成的预览出现变化时，把浏览位置切到第 0 位（预览位）。
   *
   * 原实现是 effect A + effect B 两段：
   * - effect A（依赖 previewUrl）：清空居中预览 + 索引归零
   * - effect B 的 W3（依赖 historyImages 等）：无居中预览且有预览时索引归零
   * 两者其实是同一件事的重复实现。而 effect B 依赖 historyImages **数组引用**，
   * 导致每次列表刷新（重新生成 / 删图 / imagesRefreshVersion 自增）都会把用户
   * 浏览位置重置为 0、右侧缩略图高亮跟着乱跳。
   *
   * 现在收拢为一处、且只在 previewUrl 真正变化时触发；effect B 只保留
   * 「按 centerPreviewImage 反查索引」这一条派生逻辑。
   */
  const [previousPreviewUrl, setPreviousPreviewUrl] = useState(previewUrl);
  if (previousPreviewUrl !== previewUrl) {
    setPreviousPreviewUrl(previewUrl);
    setCenterPreviewImage(null);
    setGalleryIndex(0);
  }

  /**
   * 渲染期同步：按 centerPreviewImage 反查它在列表中的位置，回写 galleryIndex。
   *
   * 保留原语义：反查不到（图片已被删或不在当前文件夹）时**不写** index，
   * 避免浏览位置乱跳。依赖只保留 centerPreviewImage 与 historyImages 长度，
   * 不再依赖 previewUrl —— 「无居中预览且有预览时归零」已由上面那处收拢。
   * 用 historyImages.length 而非数组引用：删/增图片才会重新反查。
   */
  const [previousCenterPreviewPath, setPreviousCenterPreviewPath] = useState<
    string | null
  >(null);
  const [previousHistoryLength, setPreviousHistoryLength] = useState(
    historyImages.length
  );
  const [previousImagesRefreshVersion, setPreviousImagesRefreshVersion] =
    useState(imagesRefreshVersion);
  // 搬走和删除都令旧路径不可再预览，共享失效处理，不共享磁盘副作用。
  // 只有命中当前stage才清空，右键整理其他图片不能把正在看的生成结果关掉。
  // gallery索引随同清零，避免新列表变短后仍引用超出范围的序号。
  // 取消目录框不会调用此回调；用户还可继续查看原文件。
  // 回调接收的是原地址，不能拿搬到新目录后的文件名去比较旧stage身份。
  // 名字相同但目录不同是不同图片，精确路径比较避免关掉另一张同名预览。
  // 两种图库显示形态都注入此回调，不能只修宽屏而让单栏保留失效旧图。
  // 与删除共享的是显示失效行为，不代表移动会调用删除确认或丢弃源元数据。
  // 最新生成URL与图库文件选择分开，清空旧选择后按既有stage逻辑呈现其余结果。
  // 回调不强制切换创建模式，也不把用户从工具子页送回图片模式。
  // 索引恢复为零只在命中当前预览时发生，整理其他文件不会打断浏览位置。
  // 子页仍由原宿主维护生命周期，本轮不新增专门搬运文件的全屏遮罩。
  const invalidatePreviewPaths = (paths: string[]) => {
    if (!centerPreviewImage || !paths.includes(centerPreviewImage.filePath)) return;
    setCenterPreviewImage(null);
    setGalleryIndex(0);
  };
  const centerPreviewPath = centerPreviewImage?.filePath ?? null;
  if (
    centerPreviewPath !== previousCenterPreviewPath ||
    historyImages.length !== previousHistoryLength ||
    imagesRefreshVersion !== previousImagesRefreshVersion
  ) {
    setPreviousCenterPreviewPath(centerPreviewPath);
    setPreviousHistoryLength(historyImages.length);
    setPreviousImagesRefreshVersion(imagesRefreshVersion);
    // 新结果与落盘刷新可能在同一批提交：不能用旧的浏览图片覆盖本轮归零。
    if (centerPreviewImage && previousPreviewUrl === previewUrl) {
      // 合并后索引不再是“磁盘位置加一”，必须查询真实展示数组。
      // 这也覆盖最新结果原来位于磁盘列表中间、被提到首位的情况。
      // 仍按路径匹配，不因两个文件名相同而误选别的作品。
      const index = previewGalleryItems.findIndex(
        (image) => image.filePath === centerPreviewImage.filePath
      );
      // 找不到时保持原行为，不把删除或切换文件夹误当成用户选择首图。
      // 只修改当前浏览位置，不改最新生成结果的来源。
      // 下方手动切换也使用同一展示数组，避免高亮和实际图片错位。
      if (index >= 0) setGalleryIndex(index);
    }
  }

  const handleGalleryIndexChange = useCallback(
    (index: number) => {
      setGalleryIndex(index);
      // 直接从点击项取路径，不能继续用去重前的偏移量换算。
      // 未落盘的临时项没有路径，选中它时清除磁盘浏览标记即可。
      // 目录外的新结果也允许预览，不为补齐标记而额外扫描目录。
      // 保留原 GeneratedImageFile 对象供 side 选择和文件操作使用。
      // 没有命中时用 null，不能留下上一张图的选中状态。
      const filePath = previewGalleryItems[index]?.filePath;
      setCenterPreviewImage(historyImages.find((image) => image.filePath === filePath) ?? null);
    },
    // 数组变化后闭包随之刷新，磁盘回填不会沿用旧的索引映射。
    // 回调仍交给原主图和缩略图组件，不创建第二套切换状态。
    // 这里不创建或释放 URL，预览生命周期继续归任务队列。
    [historyImages, previewGalleryItems]
  );

  useEffect(() => {
    const defaultLocal = getDefaultLocalSelectedModel(
      localModels,
      seriesId === "sdxl" ? "sdxl" : "anima"
    );
    if (!defaultLocal) return;

    const frame = window.requestAnimationFrame(() => {
      setSelectedModel((current) => {
        if (current.modelId.startsWith("local-checkpoint:")) return current;
        return defaultLocal;
      });
    });

    return () => window.cancelAnimationFrame(frame);
  // Zustand 的 setter 引用稳定，显式依赖保持迁移后的 hook 契约完整。
  // 默认模型校正仍读取同一个图片草稿，不创建供同步使用的镜像。
  // 扫描变化不应让编辑同步读取另一个过期的局部选择。
  }, [localModels, seriesId, setSelectedModel]);

  /**
   * 切换模型系列（Anima ⇄ SDXL）：
   * 1. LoRA 扩展跨系列不通用 → 自动清空；
   * 2. 模型换成该系列的本地模型（Anima 取 diffusion_models，SDXL 取 checkpoints）；
   * 3. 采样器 / 调度器 / 步数 / CFG 回到**该系列基础工作流**自带的默认参数；
   * 4. 尺寸同样换成该系列基础工作流的默认尺寸（能对上预设就用预设，否则用自定义宽高）。
   */
  const handleSeriesChange = useCallback(
    (nextSeriesId: string) => {
      if (nextSeriesId === seriesId) return;
      const nextSeries: "anima" | "sdxl" =
        nextSeriesId === "sdxl" ? "sdxl" : "anima";

      setSeriesId(nextSeriesId);
      setSelectedExtensions([]);

      const defaultLocal = getDefaultLocalSelectedModel(localModels, nextSeries);
      if (defaultLocal) setSelectedModel(defaultLocal);

      const defaults = getImageWorkflowDefaults(nextSeries);
      setAdvancedSettings({
        sampler: null,
        scheduler: null,
        steps: defaults.steps,
        cfg: defaults.cfg,
      });

      const preset = findImageSizePresetBySize(defaults.width, defaults.height);
      if (preset) {
        setAspectRatio(preset.id);
      } else {
        setCustomSize({ width: defaults.width, height: defaults.height });
      }
    },
    // 系列切换仍负责清空扩展和选择默认模型，编辑同步不能反向触发它。
    // 显式依赖公共 setter，避免从 useState 迁移后遗留 hook 依赖逃逸。
    // 动作引用稳定，不会增加普通图片页不必要的回调重建。
    [localModels, seriesId, setAdvancedSettings, setAspectRatio, setCustomSize, setSelectedExtensions, setSelectedModel, setSeriesId]
  );

  const appliedRemixRequestIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (
      !remixPayload ||
      appliedRemixRequestIdRef.current === remixRequestId
    ) return;

    // 提交后再应用外部请求；计时器在窗口不可见时仍会执行，不能改成 rAF。
    const timer = window.setTimeout(() => {
      appliedRemixRequestIdRef.current = remixRequestId;
      if (remixPayload.selectedModel) setSelectedModel(remixPayload.selectedModel);
      setSelectedExtensions(remixPayload.selectedExtensions);
      setAspectRatio(remixPayload.aspectRatio);
      setAdvancedSettings({
        steps: remixPayload.steps,
        cfg: remixPayload.cfg,
        sampler: remixPayload.sampler,
        scheduler: remixPayload.scheduler,
        seedMode: "custom",
        customSeed: remixPayload.seed,
      });
      setGenerationContext({ generationKind: "text2img", sourceImagePath: null });
      setCreateMode("image");
      setPromptText(remixPayload.positivePrompt);
      setEditableText("negative-prompt-editor", remixPayload.negativePrompt);
      showToast(getRemixToastMessage(remixPayload, t));
      clearRemix();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [
    remixRequestId,
    // 二创回填写入权威图片资源草稿，之后快速同步读取相同值。
    // 资源 setter 引用稳定，列入依赖不会重放已清除的二创请求。
    // 显式声明两个写入动作，保留完整 hook 依赖关系。
    // 不在这个 effect 同步编辑资源，用户仍需主动点击快速加载。
    // 提示词和尺寸继续按原二创流程回填，不改变其既有行为。
    setSelectedModel,
    setSelectedExtensions,
    remixPayload,
    clearRemix,
    setAspectRatio,
    setAdvancedSettings,
    setGenerationContext,
    showToast,
    t,
  ]);

  const handleGenerate = useCallback(
    async (imageCount: number) => {
      // 高级组装模式下取分类拼接结果，普通模式取单一输入框
      const positivePrompt = readPromptText();
      if (!positivePrompt) {
        showToast(t("create.page.promptRequired"));
        return;
      }

      const negativePrompt = readEditableText("negative-prompt-editor");
      const formState = useCreateFormStore.getState();
      const workflowSeries = seriesId === "sdxl" ? "sdxl" : "anima";
      const workflowDefaults = getImageWorkflowDefaults(workflowSeries);
      const { width, height } = resolveImageDimensions({
        mode: formState.sizeMode,
        aspectRatio,
        customWidth: formState.customWidth,
        customHeight: formState.customHeight,
        scale: formState.sizeScale,
      });
      const baseParams = buildGenerateParams({
        positivePrompt,
        negativePrompt,
        selectedModel,
        selectedExtensions,
        localModels,
        paths,
        width,
        height,
        seed: getResolvedSeedFromStore(formState),
        steps: formState.steps,
        cfg: formState.cfg,
        // 未自定义采样器/调度器时，使用工作流模板自带值
        samplerName: formState.sampler ?? workflowDefaults.samplerName,
        scheduler: formState.scheduler ?? workflowDefaults.scheduler,
        series: workflowSeries,
      });

      try {
        // 普通图片生成只使用文生图参数；边缘控制在编辑工作区单独准备。
        // 此入口保留原数量、尺寸、队列和保存逻辑，不携带任何隐式控制图。
        // 用户离开编辑后，Canny 的开关和阈值不会改变这里的生成行为。
        // 普通参数不会读取边缘草稿，用户换回图片模式后可直接按原设置生成。
        // 保留原生成返回值供统一的保存失败反馈处理，不把准备图当成功输出。
        // 点击时交付当前系列覆盖，公共队列随其他参数一起深拷贝。
        // 生成期间修改下拉框不会追溯改动旧任务或其他模式的图。
        const result = await generate({ ...baseParams, modelOverrides: modelOverridesBySeries[workflowSeries] }, imageCount);
        const lastSavedPath = result.savedPaths[0];

        if (!lastSavedPath && isElectronEnvironment()) {
          showToast(t("create.page.saveFailed"));
        } else if (!lastSavedPath) {
          showToast(
            imageCount > 1
              ? t("create.page.generated", { count: imageCount })
              : t("create.page.generateDone")
          );
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        const message =
          error instanceof Error ? error.message : t("create.page.generateFailed");
        showToast(message);
      }
    },
    [
      generate,
      aspectRatio,
      localModels,
      paths,
      selectedExtensions,
      selectedModel,
      showToast,
      seriesId,
      // 回调读取最新辅助草稿，不能因缺依赖而提交上一次的 CLIP/VAE。
      modelOverridesBySeries,
      t,
    ]
  );

  return (
    <div ref={layoutRef} data-create-layout={layout} data-create-mode={createMode} style={{ "--preview-zoom": previewZoom } as React.CSSProperties} className="create-workspace relative mx-auto flex h-full min-h-0 flex-row overflow-hidden">
      {/**
       * 窄屏固钉：贴在主区右侧中间，三枚方钮竖排切换创建、预览和文件管理。
       * 只改变单栏当前页，不覆盖图库的网格、列表或收藏偏好。
       * 两栏与三栏不渲染：右栏本来就常驻展示图库，不需要重复入口。
       */}
      {/* single 固钉导航创建、预览和文件管理；双栏已有常驻文件管理，无需重复入口。 */}
      {/* 固钉只改变单栏可见页，不修改输出目录、选择状态或生成参数。 */}
      {/* rail 始终挂载，进入图库再返回仍保留 contenteditable 的编辑现场。 */}
      {/* 固钉定位使用工作区容器，不能以整个窗口右缘计算而盖到nav或标题栏。 */}
      {/* top-1/2 与负向半高位移让三个入口作为整体垂直居中。 */}
      {/* 固钉悬浮在展示区右侧，表单和子页都不为其保留额外侧边空栏。 */}
      {/* 固钉留在表单滚动容器外，所以长提示词滚动不会把入口带走。 */}
      {/* 固钉不写入 history store，图库已有的网格、列表和收藏偏好保持独立。 */}
      {/* 返回创建表单时不清理视图偏好，下次进入仍使用原档位。 */}
      {/* 打开图库子页只改变当前展示区，不触发文件上传、模型运行或输出目录切换。 */}
      {/* 去掉顶部文字与切换条后，模式标签可以从表单顶部开始排列。 */}
      {/**
       * 固钉仅在表单旁边的窄布局渲染；宽布局的 side 已经提供完整图库控件。
       * 不把按钮放进rail滚动内容，长提示词滚动到底部时入口仍固定可见。
       * absolute 的定位参照最外层 create-workspace，限定在主内容区而非应用窗口。
       * 固钉不占正常文档流宽度，表单、stage 和图库都可填满展示区。
       * 三个按钮的可访问名称分别为创建、预览和已生成图片。
       * aria-pressed 直接反映当前单栏页，不把图标当成图库筛选。
       * 点击创建恢复表单，点击预览显示原 stage，点击已生成图片显示完整图库。
       * 图库自己的视图选择仍由 history store 持有，导航不会覆盖它。
       * 图库页复用已挂载的 CreateHistorySidebar，不另造第二套分页或多选逻辑。
       * 因此固钉不会改变文件夹选择、输出路径、删除队列或上传目标目录。
       * 进入图库只覆盖rail展示；返回后同一contenteditable节点保留输入状态。
       * 即使处于视频、角色或蒙版模式，固钉也只负责页面导航，不改当前模式值。
       * 样式类只控制浮层视觉，按钮依照 option.mode 切换单栏展示内容。
       * 展示区不添加固钉占位 padding，固钉始终浮在实际内容上方。
       */}
      {/* 编辑已有结果/原图切换和图库入口，不叠加通往普通文生图预览的固钉。 */}
      {/* 其他创建模式仍保留原来的三个入口与原布局。 */}
      {/* 关闭旧固钉也避免它遮住文字编辑的表单输入与参数下拉。 */}
      {!isWideViewport && createMode !== "edit" ? (
        <div
          data-history-pin
          /** 贴展示区右侧悬浮，不占用表单或子页的正常流宽度。 */
          className="absolute right-0 top-1/2 z-30 -translate-y-1/2"
        >
          {/** 界面：创建、预览、文件管理三页入口；不额外渲染占用顶部空间的标签行。 */}
          <div
            className={cn(
              /** 竖排固钉覆盖在展示区右缘，背景与阴影区分它和下方实际内容。 */
              "motion-fade-in flex flex-col gap-0.5 rounded-2xl bg-background/80 p-1 shadow-md backdrop-blur",
              THIN_BORDER_CLASS
            )}
          >
            {CREATE_PAGE_OPTIONS.map((option) => (
              <button
                key={option.mode}
                type="button"
                data-history-pin-option={option.mode}
                aria-label={t(option.labelKey)}
                // 当前页高亮跟随单栏导航，不改变图片多选、收藏或列表视图。
                // 三个按钮都保留原 labelKey，由现有词条生成可访问名称。
                // 固钉本身不提交模型、不读取额外目录，也不创建第二套图库实例。
                aria-pressed={narrowPage === option.mode}
                onClick={() => {
                  // 进入/退出图库保留原转场；预览与创建直接切换同一工作区的可见页。
                  // 原 rail 与 stage 均保持挂载，避免切换时丢失编辑输入或当前图片。
                  // 页面选择不会覆盖 history store 的网格、列表与收藏设置。
                  if (option.mode === "history") openHistoryPage(true); else setNarrowPage(option.mode);
                }}
                className={cn(
                  "inline-flex h-7 w-7 items-center justify-center rounded-xl transition-[background-color,color,transform] duration-150 active:scale-90",
                  // 只有当前单栏页面使用选中样式，固钉三项始终可用。
                  // 悬浮按钮不改变父组件尺寸，缩放或切页不会制造右侧空栏。
                  // 其他两项继续沿用既有 hover 与焦点表现。
                  narrowPage === option.mode
                    ? ACCENT_TOGGLE_ON_CLASS
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <option.Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* rail：创建页左栏 = 创建表单 */}
      <section
        data-create-rail
        className={cn(
          /** 挂载时淡入：从别的页面切回来不再是「啪」地出现 */
          "motion-fade-in flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-border",
          // 三栏限定表单宽度；双栏由表单填满预览让出的空间，不保留幽灵空栏。
          // 模式条紧贴面板顶部，不再为浮动入口预留48px或80px的整行空间。
          // Edit 仍沿用原有可伸展画布，其他业务模式保持各自真实组件。
          // 删除旧pt-12与pt-20后不需要补偿模式条位置，顶部由正常文档流决定。
          // three的border-r只划分预览边界，两栏改由面板之间的既有间距分隔。
          // flex-1与min-w-0配合，允许表单收缩而不产生额外的横向占位。
          // single不再保留固钉侧栏宽度，当前页使用完整展示区。
          // 图库子页出现时只加hidden，返回后提示词的光标与编辑内容仍在原节点。
          layout === "three" && createMode !== "edit" && "create-rail-sized border-r",
          /** 挂载保留（`hidden` 而不是条件卸载）：提示词框是 contenteditable，卸载会丢编辑现场 */
          // 预览和图库都替换整片展示区，表单仅隐藏，返回仍是同一个编辑器节点。
          // 不使用条件卸载，避免 contenteditable 光标、输入和队列订阅丢失。
          // 高级组装的业务开关不随固钉导航改变。
          (showHistoryPage || showPreviewPage) && "hidden"
        )}
      >
        {/* 界面：rail 顶部模式标签 ——「图片 / 视频 / 编辑 / 角色 / Role TTS」 */}
        <CreateModeTabs value={createMode} onChange={setCreateMode} />

        {isImageMode && (
          <div data-model-series className="shrink-0">
            {/* 界面：「模型系列」那一行（Anima / SDXL；切换会换工作流与默认相机距离） */}
            <ModelSeriesSelector value={seriesId} onChange={handleSeriesChange} />
          </div>
        )}

        {isImageMode ? (
          <>
            <div data-create-rail-scroll className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-width:thin]">
              <div data-create-form-sections className="flex min-w-0 max-w-full flex-col gap-4 px-3 pb-3 pt-3 sm:px-4">
                <div data-create-model-section className="space-y-1.5">
                  {/* 界面：「模型」卡片，与视频模型选择共用 */}
                  <ModelCoverSelect name={modelDisplay.name} cover={modelDisplay.cover} label={t("create.page.model")} onClick={() => setModelDialogOpen(true)} priority />
                  {/* 界面：模型卡片下方的「如何为 Anima / SDXL 编写提示词？」按钮 */}
                  <PromptGuideButton
                    series={seriesId === "sdxl" ? "sdxl" : "anima"}
                    onClick={() => setPromptGuideOpen(true)}
                  />
                </div>
                {/* 界面：「添加扩展」独占一行；已选 LoRA 仍保留权重编辑。 */}
                {/**
                 * 指南属于模型系列信息，跟随模型卡片，而不是作为扩展列表里的一个按钮。
                 * 扩展区域是模型卡片的后续兄弟，父级 gap 负责两者间隔。
                 * 不再使用横向 flex 把指南与添加扩展挤成两个小操作。
                 * SelectedExtensions 根据列表是否为空选择大加号或紧凑追加入口。
                 * 本层不判断资源是否下载，也不依赖用户已经打开过选择器才显示图标。
                 * value 与 onChange 继续连接创建表单原有的 selectedExtensions 状态。
                 * 打开选择器只设置可见性，不预先清空已有扩展或覆盖权重。
                 * 选择器取消时没有 onChange，返回后仍展示进入前的扩展列表。
                 * 确认提交继续由原选择器完成，本层不复制它的搜索或版本草稿。
                 * 已选行保留各自 key，增删其他项不会重新初始化未修改行的权重。
                 * 扩展封面使用业务资源数据，不能把参考 HTML 的示例图放入正式默认值。
                 * 分区标记仅用于布局回归定位，不参与用户数据保存或工作流序列化。
                 * 原有模型系列过滤仍从当前 seriesId 传给选择器，不由入口样式推断。
                 * SDXL 与 Anima 的选择值继续隔离，视觉调整不自动迁移系列模型。
                 * 视频有自己的表单调用方，共享添加入口组件而不共享图片模式状态。
                 * 父级 min-w-0 与纵向布局使长词条在当前栏内分配空间。
                 * 窄屏时扩展区域与模型卡片一起留在 rail，不转移到已隐藏的预览区。
                 * 表单滚动区持有二者；不会为扩展入口增加第二层独立滚动。
                 * 入口不提交生成请求，也不改变当前队列和输出目录。
                 * 最后一项移除后由共享组件恢复空态，无需本页添加监听 effect。
                 * 键盘聚焦样式由入口按钮提供，本容器不增加额外 Tab 停靠。
                 * 保持原来的 i18n 词条，布局恢复不会引入只支持中文的展示文本。
                 * 后面的边缘检测与提示词区仍是独立分区，不嵌入扩展按钮的点击范围。
                 * 创建页主区隐藏时保留这份表单树，工具返回不重新构造扩展状态。
                 * 指南按钮继续读取当前模型系列，入口布局不会改变其打开内容。
                 * 指南与添加扩展分别拥有独立点击范围，避免误触进入资源选择。
                 * 扩展行的删除按钮由子组件阻止默认表单提交，父容器不拦截事件。
                 * 切换单栏/双栏/三栏时这一区域仍属于 rail，不随 stage 的显隐移动。
                 * stage 先隐藏只释放中间列宽，不会将扩展入口挤到 side 或文件管理内。
                 * 文件管理主区页切换时 rail 仅隐藏，返回后仍保留扩展列表与模型系列。
                 * 本容器不缓存第二份选择值，避免从工具返回后出现两处状态不同步。
                 * 空态加号的可点击范围覆盖整行，满足鼠标与触屏目标尺寸。
                 * 已选态入口缩小但仍保留整行宽度，不改变连续添加多项的操作方式。
                 * 表单初始渲染即输出扩展入口，图标不依赖用户先打开后才被挂载。
                 * 标签颜色和背景来自主题 token，不固定为浅色原型的色值。
                 * 模式变化沿用原有 selectedExtensions 处理，不能由布局容器主动清空。
                 * 创建页关闭或切换路由时沿用原路由生命周期，不额外写入本地持久化。
                 * 自动化定位属性只供回归脚本使用，不能用作显示逻辑的状态来源。
                 */}
                <div data-create-extension-section>
                  <SelectedExtensions value={selectedExtensions} onChange={setSelectedExtensions} onAdd={() => setExtensionDialogOpen(true)} />
                </div>
                {/* rail：图片沿用视频模型加载外观，只传当前图片模板和独立系列草稿。 */}
                {/* SDXL 无独立槽时明确说明 CLIP/VAE 来自主模型，不展示无效选择。 */}
                {/* 恢复默认仅清辅助文件，不重置图片提示词、LoRA 或采样设置。 */}
                <WorkflowModelSettings key={seriesId} workflowId={seriesId} mediaKind="image" templateOverride={imageModelTemplate} overrides={modelOverridesBySeries[seriesId] ?? {}} onChange={value => setModelOverridesBySeries(current => ({ ...current, [seriesId]: value }))} onReset={() => setModelOverridesBySeries(current => ({ ...current, [seriesId]: {} }))} disabled={generating} />


                {/* 界面：「提示词」区（普通模式是单一输入框；含高级组装开关与工具行） */}
                <PromptSection
                  series={seriesId === "sdxl" ? "sdxl" : "anima"}
                  loraIds={selectedExtensions.map(item => item.extensionId)}
                  sideVisible={isWideViewport}
                />

                {/* 界面：「反向提示词」区 */}
                <NegativePromptSection />

                {/* 界面：普通文生图保留原尺寸与高级参数设置。 */}
                {/* 尺寸草稿独立于编辑控制图，边缘功能搬迁不会清空原宽高。 */}
                {/* 高级参数继续决定采样，不再挂载原图检测开关。 */}
                <ImageSizeSection />
                <AdvancedSettings series={seriesId === "sdxl" ? "sdxl" : "anima"} />
              </div>
            </div>

            {/* 界面：rail 底部的「生成」按钮条 */}
            <GenerateFooter generating={generating} onGenerate={handleGenerate} />
          </>
        ) : isVideoMode ? (
          /* 界面：视频模式（「视频」标签）下替换整个 rail 的面板 */
          <VideoCreatePanel />
        ) : isRoleTtsMode ? (
          /* 界面：Role TTS 模式下的面板 */
          // Role TTS 在无 stage 的布局内直接提供播放器，保留同一份结果数据。
          // 三栏由 stage 承载，避免两个可见播放器同时播放同一条音频。
          // 布局切换只变更展示位置，已经生成的文件和任务不受影响。
          <RoleTtsPanel showResults={layout !== 'three'} />
        ) : (
          // 界面：编辑功能分组，文字改图与原始蒙版工具并列保留。
          // 图库入口复用父组件换页，目录浏览和图片右键仍走既有实现。
          // 普通 stage 在编辑模式继续隐藏，由文字工具提供自己的结果区。
          <EditWorkspace onOpenHistory={() => openHistoryPage(true)} />
        )}
      </section>

      {/* stage：中栏图片显示区（点开是大图预览层） */}
      {/* stage在三栏或单栏预览页出现；hidden保留预览与生成状态，返回无需重建图片数据。 */}
      {/* 双栏隐藏中间列，side 的文件管理继续显示，生成仍走原队列。 */}
      {/* 不向隐藏预览添加顶部 padding，避免模式切换后残留不可见占位。 */}
      {/* 保留previewGalleryItems与缩放状态，扩宽窗口后可以继续查看同一张生成图。 */}
      {/* 预览从布局中退出时不卸载图片操作层，右键等操作仍由原业务组件管理。 */}
      {/* 两栏是否保留文件管理由side控制，不能再用同一个布尔条件同时隐藏两列。 */}
      {/* 这里使用CSS显示切换，不通过重置数据来制造空面板或规避溢出。 */}
      {/* 三栏时预览避开编辑模式；单栏固钉可单独展示已有图片，不改变当前生成模式。 */}
      {/* 用户缩窄窗口时不清空中心预览、缩放比例或缩略图索引。 */}
      {/* 再次满足三栏条件后，CreationPreviewHeader会继续操作同一份preview状态。 */}
      {/* 大图入口仍由 ImagePreviewTrigger 提供，固钉不复制预览放大功能。 */}
      {/* 右键动作层继续留在stage中，布局隐藏不更改作品保存和删除行为。 */}
      {/* 这里的显示分支只表达列是否参加当前布局，不代表生成任务是否完成。 */}
      {/**
       * stage 的存在依赖实际三栏状态，而不是“非窄屏”这一泛化条件。
       * two 时主区空间不足以维持预览和文件管理，因此先从布局中移除预览列。
       * single 时表单占据主区，作品入口由固钉打开完整图库，不挤压编辑器。
       * createMode 为 edit 时显示蒙版编辑流程，普通图片预览必须保持隐藏。
       * showHistoryPage 打开时由图库页面接管主显示区，stage 不与图库并排争宽。
       * 使用 hidden 类保留 React 子树，以便返回时恢复相同的预览内容和操作状态。
       * 缩窄过程中不清除 previewUrl，它仍代表最近一次真实生成结果。
       * galleryIndex 由同一份作品数组维护，视口变化不会把当前图片索引归零。
       * previewZoom 是该舞台的显示参数，不会参与生成尺寸或发送给 ComfyUI。
       * disabled 只在任务正在运行或没有可预览作品时保护图片切换操作。
       * 放大入口转发到现有 ImagePreviewTrigger，继续使用统一的图片详情层。
       * filmstrip 仍使用原索引回调，让缩略图选择与主图保持同步。
       * 右键菜单按 filePath 查找真实图库条目，缺少路径时不展示文件操作。
       * 菜单定位使用鼠标页面坐标，并复用原有 viewport clamp。
       * stage 的宽度由 flex 分配，不按窗口尺寸硬编码，nav 状态变化后重新排版。
       * min-w-0 允许 flex 子项实际收缩，避免图片固有尺寸撑出隐藏列。
       * min-h-0 允许中间预览区域在有限窗口高度内滚动与收缩。
       * empty state 根据当前模式选择说明文案，编辑器空态仍由蒙版面板负责。
       * 生成中状态叠加在预览内容上，不会替代图片或更换任务状态来源。
       * 作品隐藏期间生成通知仍更新原 store，恢复三栏时呈现最新数据。
       * 因此这里仅决定舞台何时参与布局，作品生命周期交给原生成与图库逻辑。
       */}
      {/* stage：单栏预览页使用同一个舞台并填满展示区；三栏仍按原来的中栏展示。 */}
      {/* 窗口变宽或返回创建时不清空预览索引、缩放及真实生成结果。 */}
      {/* 当前选中页与 rail 互斥，不通过覆盖浮层保留后台边缘。 */}
      <article data-create-stage data-has-preview={previewGalleryItems.length > 0} className={cn("min-h-0 min-w-0 flex-1 flex-col", showPreviewPage || (createMode !== "edit" && !showHistoryPage && layout === "three") ? "flex" : "hidden")}>
        {/* stage：音频模式替换整个预览内容，图片缩放工具不会作用到音频。 */}
        {/* 单栏预览固钉仍可打开此区域，展示的始终是音频而非上次生成图片。 */}
        {/* 图片子树只在其他模式出现，原缩略图、右键和放大逻辑保持原样。 */}
        {isRoleTtsMode ? <AudioResults /> : <>
        <CreationPreviewHeader zoom={previewZoom} onZoom={setPreviewZoom} disabled={generating || !previewGalleryItems.length} onExpand={() => document.querySelector<HTMLButtonElement>('[data-create-stage] [data-image-preview-trigger]')?.click()} />
        <div data-stage-hero className="flex min-h-0 flex-1 items-center justify-center p-3">
          <div
            className="relative flex h-full w-full min-w-0 flex-col items-center justify-center overflow-hidden rounded-xl bg-muted/30"
          >
            {previewGalleryItems.length > 0 ? (
              /* 界面：stage 里那张图 —— 点开是大图预览 */
              <ImagePreviewTrigger
                className="create-preview-image"
                imageClassName={cn(previewZoom !== 1 && "transition-transform")}
                items={previewGalleryItems}
                index={galleryIndex}
                onIndexChange={handleGalleryIndexChange}
                disabled={generating}
                onItemContextMenu={(event, item) => {
                  if (!item.filePath) return;
                  const image = historyImages.find(
                    (entry) => entry.filePath === item.filePath
                  );
                  if (!image) return;
                  event.preventDefault();
                  imageActionsRef.current?.openContextMenu(
                    event.clientX,
                    event.clientY,
                    image
                  );
                }}
              />
            ) : (
              <div data-create-preview-empty className="flex max-w-sm flex-col items-center gap-3 px-5 text-center">{previewIcon}{isImageMode && <><h2 className="text-sm font-semibold">{t("create.workspace.emptyTitle")}</h2><p className="text-xs leading-6 text-muted-foreground">{t(layout === "single" ? "create.workspace.emptyHintMobile" : "create.workspace.emptyHint")}</p></>}</div>
            )}
            {/* 界面：生成状态直接放在 stage，省略号循环变化。 */}
            {generating && <GeneratingStatus />}
          </div>
        </div>
        <CreationFilmstrip items={previewGalleryItems} index={galleryIndex} onChange={handleGalleryIndexChange} />
        {/* stage：最近一次生成结果独立展示，浏览旧图时仍能看到真实产出。 */}
        {/* 只有实际生成结果存在时展示结果区，浏览历史图片不再额外占用一块空态。 */}
        {/* 单栏预览因此可以把更多高度交给当前图和缩略图，三栏也避免无内容的重复提示。 */}
        {/* 最近生成图仍按原previewUrl显示，不改变生成状态、保存或放大入口。 */}
        {previewGalleryItems.length > 0 && Boolean(previewUrl) && <section data-create-result className="mx-[14px] mb-4 flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/50 p-3 text-center text-muted-foreground">
          {previewUrl ? <><span className="mb-2 text-xs">{t("create.workspace.latestResult")}</span><div className="min-h-0 w-full flex-1"><ImagePreviewTrigger items={[{ key: "latest-result", src: previewUrl, alt: t("create.page.previewAlt") }]} index={0} /></div></> : <><ImageIcon className="mb-3 h-9 w-9 opacity-60" /><h2 className="text-sm font-semibold">{t("create.workspace.emptyResult")}</h2><p className="mt-1 text-xs">{t("create.workspace.startCreating")}</p></>}
        </section>}
        </>}
      </article>

      {/* side：右栏 —— 高级模式是「提示词组装」，否则是「已生成图片」 */}
      {/**
       * side 在三栏和两栏都可用：缩窄时优先让预览让位给文件管理。
       * 单栏则不创建可见侧栏，避免仍有一个空列参与flex宽度计算。
       * isWideViewport 对应 two/three，不能替换成窗口的 innerWidth 判断。
       * 因为 nav 展开会改变主区宽度，同一屏幕在两种 nav 状态下可能跨越断点。
       * 侧栏的基础宽度由 create-side-sized 设置，避免窄布局下被父级压扁。
       * min-w-0 让包含搜索框和文件名的子组件能在布局变化时正确收缩。
       * overflow-visible 保留图库卡片菜单与浮层越过面板边界的显示空间。
       * border-left 与紧邻的预览/表单划分区域，视觉间隔由workspace gap共同决定。
       * advancedPrompt 为真时显示提示词组装，避免文件管理和组装面板并列重复。
       * 关闭组装回调只修改用户已有的advancedPrompt开关。
       * 非组装状态复用 CreateHistorySidebar，保留文件夹筛选与图片操作。
       * centerPreviewPath 与右侧列表选择共享，stage当前图与文件列表可互相同步。
       * respondToOpenRequest 维持双击图片打开stage预览的既有跨区行为。
       * 当side隐藏时组件分支不读写新数据，文件和选择状态仍在 store 中。
       * 再次扩宽后side使用同一套图库视图，不生成另一份列表实例。
       * two 布局隐藏的是stage，不是side，测试会分别断言两个元素的display值。
       * single 的图库页面在主区渲染，同一组浏览状态不需要复制到此侧栏。
       * 屏幕宽度不是判断依据，容器实际可用空间才是三栏的可靠条件。
       */}
      <section
        data-create-side
        className={cn(
          "create-side-sized relative min-h-0 min-w-0 overflow-visible border-l",
          // 编辑使用完整的功能展示区，不额外挤入模板中不存在的常驻第三列。
          // 图库仍可由编辑标题栏进入，返回保留本栏原选择及作品操作能力。
          // 这里只改变参与布局的状态，不清除图片、多选或输出目录数据。
          isWideViewport && createMode !== "edit" ? "flex h-full shrink-0 flex-col" : "hidden",
          THIN_DIVIDER_CLASS
        )}
      >
        {advancedPrompt && isWideViewport ? (
          /* 界面：右栏的「提示词组装」面板 */
          <PromptAssemblyPanel
            series={seriesId === "sdxl" ? "sdxl" : "anima"}
            onClose={() => setAdvancedPrompt(false)}
          />
        // 详情未关闭时仅隐藏窄屏 side，保留其 portal 与 Meta 读取会话。
        // 没有打开详情则仍按原宽度规则挂载，不增加常驻隐藏图库。
        // 侧栏收缩后的实际详情形态由共享主区 hook 决定，不在父层复制几何规则。
        ) : isWideViewport || sidebarDetailOpen ? (
          /* 界面：右栏的「已生成图片」 */
          <CreateHistorySidebar
            mediaLabel={historyMediaLabel}
            centerPreviewPath={centerPreviewImage?.filePath ?? null}
            onCenterPreviewChange={setCenterPreviewImage}
            onImagesMoved={invalidatePreviewPaths}
            respondToOpenRequest
            // 只反馈挂载需求，不把详情选择镜像到创建表单。
            // 原组件的关闭、删除和跨路由清理会同时解除保活。
            // 稳定 setter 避免通知 effect 因父页重渲染而重复清理。
            onDetailOpenChange={setSidebarDetailOpen}
          />
        ) : null}
      </section>

      {/**
       * 窄屏「已生成图片」= **主显示区换页**（不是盖住整屏的浮层，也不是半屏抽屉）。
       *
       * 低宽度下「生成 → 看产出 → 回来改提示词」本来就是**两个页面**的关系：抽屉那种
       * 「半屏盖 + 暗遮罩」会让主区既看不清也用不了；而盖住整屏又会连同左侧导航一起盖掉，
       * 用户于是既回不去别的页、也看不出自己在哪一层。正确的位置是**创建表单那一栏**
       * （见 `showHistoryPage`），顶部 ◀ 返回回到原状态。
       *
       * 与宽屏右栏共用同一个 CreateHistorySidebar 实例与同一份 centerPreview 状态，
       * 所以「子页里双击缩略图」和「宽屏右栏双击」行为一致。
       *
       * 单栏模式下该子页替换主区的表单显示，但 rail React 子树保持挂载。
       * 返回按钮只关闭子页标记，不重建表单，所以编辑器节点、焦点和输入仍然有效。
       * 进入子页时通过 history store 读取当前文件夹、图片集和选择范围。
       * 网格、列表与收藏筛选沿用 CreateHistorySidebar 的现有视图模式。
       * 分页继续按图库真实数据计算，不因单栏临时展示而改为全部加载。
       * 图片右键、文件夹右键与空白处右键仍交由图库原组件处理。
       * 上传入口继续调用原文件 API，并使用当前用户选择的目录。
       * 删除、重命名和另存仍按文件路径走原有 IPC 校验。
       * 此子页不承载生成控件，生成队列在表单 footer 中保留状态。
       * 生成完成后的文件刷新通过 imagesRefreshVersion 通知当前图库。
       * 双栏/三栏已有常驻side时不会显示这份主区子页，避免重复图库。
       * solid background 让页面替换层清楚地区别于抽屉或遮罩式浮层。
       * 返回标题保留既有无障碍 label 与键盘焦点行为。
       * 子页的动画只作用于入口状态，内容滚动仍归图库面板本身管理。
       * 按下文件管理入口后沿用原图库档位，创建和预览入口不修改它。
       * 若窗口扩大到 two/three，容器布局恢复side，create layout并不强制重置页内数据。
       * 测试会从900px进入并返回图库，确认提示词保持同一节点和原文。
       *
       * 版式（2026-09-20）：低宽度下直接复用 25% 宽度的右栏版式会横向拉满 —— 文件夹行变成
       * 整条、缩略图被摊成 5 列细条、中间大片空白。因此换页走 `CreateHistorySidebar` 的
       * `page` 版式（居中列 + 卡片行 + 大圆角），外壳用「细线标题栏 + 白色画布」与
       * 其余主区页面对齐（不是暗遮罩、也不是浮在灰底上的圆角板）。
       */}
      {showHistoryPage ? (
        <section
          data-create-subpage="history"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background motion-safe:subpage-enter"
        >
          <header
            className={cn(
              "flex shrink-0 items-center gap-2 border-b px-2 py-2",
              THIN_DIVIDER_CLASS
            )}
          >
            <button
              type="button"
              data-subpage-back
              aria-label={t("create.historyDrawer.closeLabel")}
              onClick={() => openHistoryPage(false)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold leading-tight">
                {t("create.historyDrawer.openLabel")}
              </h2>
              <p className="truncate text-[11px] text-muted-foreground">
                {historyMediaLabel}
              </p>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-hidden">
            {/* 界面：窄屏下的「已生成图片」整页（主显示区换页，不是浮层） */}
            <CreateHistorySidebar
              variant="page"
              // 整页图库打开的详情扩宽后仍属于同一个来源组件。
              // 独立标记避免侧栏图库初始化的 false 通知撤销它。
              // 详情关闭后恢复创建页原有分栏与图库呈现策略。
              onDetailOpenChange={setPageDetailOpen}
              mediaLabel={historyMediaLabel}
              centerPreviewPath={centerPreviewImage?.filePath ?? null}
              onCenterPreviewChange={setCenterPreviewImage}
            onImagesMoved={invalidatePreviewPaths}
            />
          </div>
        </section>
      ) : null}

      {/* 弹窗：选择模型（标题随系列变化：「选择 Anima 模型」/「选择 SDXL 模型」） */}
      <ModelSelectDialog
        open={modelDialogOpen}
        selected={selectedModel}
        series={seriesId === "sdxl" ? "sdxl" : "anima"}
        onOpenChange={setModelDialogOpen}
        onSelect={setSelectedModel}
      />

      {/* 弹窗：提示词编写指南 */}
      <PromptGuideDialog
        open={promptGuideOpen}
        series={seriesId === "sdxl" ? "sdxl" : "anima"}
        onOpenChange={setPromptGuideOpen}
      />

      {/* 弹窗：选择扩展（LoRA） */}
      <ExtensionSelectDialog
        open={extensionDialogOpen}
        selectedIds={selectedExtensions.map((item) => item.extensionId)}
        resources={filterAndSortExtensions("", localModels, paths, null, seriesId === "sdxl" ? "sdxl" : "anima")}
        onOpenChange={setExtensionDialogOpen}
        onConfirm={(models) => setSelectedExtensions((prev) => [
          ...prev,
          ...models.filter((model) => !prev.some((item) => item.extensionId === model.id))
            .map((model) => ({ extensionId: model.id, weight: DEFAULT_EXTENSION_WEIGHT })),
        ])}
      />

      {/* 无界面外壳：图片右键菜单 / 改名 / 删除确认（stage 与图库共用同一个实例） */}
      <GeneratedImageActionLayer
        ref={imageActionsRef}
        onRenamed={(oldPath, image) => {
          if (centerPreviewImage?.filePath === oldPath) {
            setCenterPreviewImage(image);
          }
        }}
        onMoved={invalidatePreviewPaths}
        onDeleted={invalidatePreviewPaths}
      />
    </div>
  );
}
