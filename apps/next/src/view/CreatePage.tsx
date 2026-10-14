"use client";

/**
 * 创建页（左侧应用导航 `nav` 里的「创建」）。
 *
 * ## 区域命名（本文件与 create/* 子组件统一用这套说法）
 * - `nav`   左侧应用导航（`components/Sidebar.tsx`，全局常驻，**不属于本页**）
 * - `rail`  创建页左栏 = 创建表单：模式标签 → 模型系列 → 提示词 → 反向提示词 → 图片尺寸 → 高级设置 → 生成
 * - `stage` 中栏 = 图片显示区（点开进入大图预览层）
 * - `side`  右栏 = 「已生成图片」；开着高级组装时换成「提示词组装」
 * - `pin`   窄屏右上角的图库入口固钉（宽屏右栏常驻，所以不渲染）
 * - `modal` 页面级弹窗（模型 / 扩展 / 提示词指南）
 *
 * ## 组件 ↔ 界面名称对照
 * | 组件 | 界面上叫什么 |
 * |---|---|
 * | `CreateModeTabs` | rail 顶部「图片 / 视频 / Edit / Role 翻唱 / Role TTS」模式标签 |
 * | `ModelSeriesSelector` | 「模型系列」那一行（Anima / SDXL） |
 * | `PromptGuideButton` / `PromptGuideDialog` | 模型卡片上的「如何为 xx 编写提示词？」及其指南弹窗 |
 * | `SelectedExtensionRow` | 已选扩展（LoRA）列表里的一行（可调权重 / 移除） |
 * | `PromptSection` | 「提示词」区（含高级组装开关与工具行） |
 * | `NegativePromptSection` | 「反向提示词」区 |
 * | `ImageSizeSection` | 「图片尺寸」区（比例 / 宽高 / 预设） |
 * | `AdvancedSettings` | 「高级设置」区（采样器 / 步数 / CFG / 种子…） |
 * | `GenerateFooter` | rail 底部的「生成」按钮条 |
 * | `VideoCreatePanel` / `RoleCoverPanel` / `RoleTtsPanel` | 视频 / Role 翻唱 / Role TTS 模式下替换整个 rail 的面板 |
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
  Music2,
  Video as VideoIcon,
} from "lucide-react";
import {
  DEFAULT_MODEL_SERIES_ID,
  ModelSeriesSelector,
} from "@/view/create/ModelSeriesSelector";
import { AdvancedSettings } from "@/view/create/AdvancedSettings";
import { CreateModeTabs } from "@/view/create/CreateModeTabs";
import { ExtensionSelectDialog } from "@/view/create/ExtensionSelectDialog";
import { filterAndSortExtensions } from "@/data/extensions";
import { GenerateFooter } from "@/view/create/GenerateFooter";
import { ImageSizeSection } from "@/view/create/ImageSizeSection";
import { NegativePromptSection } from "@/view/create/NegativePromptSection";
import { ModelSelectDialog } from "@/view/create/ModelSelectDialog";
import { PromptSection } from "@/view/create/PromptSection";
import {
  PromptGuideButton,
  PromptGuideDialog,
} from "@/view/create/PromptGuideDialog";
import { SelectedExtensions } from "@/view/create/selected-extensions";
import { RoleCoverPanel } from "@/view/create/RoleCoverPanel";
import { RoleTtsPanel } from "@/view/create/RoleTtsPanel";
import { VideoCreatePanel } from "@/view/create/VideoCreatePanel";
import { MaskEditorPanel } from "@/view/create/mask-editor-panel";
import { CreateHistorySidebar } from "@/view/create/CreateHistorySidebar";
import {
  GeneratedImageActionLayer,
  type GeneratedImageActionHandle,
} from "@/view/create/GeneratedImageActionLayer";
import { PromptAssemblyPanel } from "@/view/create/promptAssembly/PromptAssemblyPanel";
import {
  DEFAULT_SELECTED_MODEL,
  getSelectedModelDisplay,
} from "@/data/models";
import { ModelCoverSelect } from "@/view/create/model-cover-select";
import { ImagePreviewTrigger } from "@/components/ImagePreviewOverlay";
import type { ImagePreviewItem } from "@/components/ImagePreviewOverlay";
import { useSettingsStore } from "@/stores/useSettingsStore";
import {
  getOpenedFolderDirPath,
  useHistoryFolderStore,
  type HistoryViewMode,
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
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { getDefaultLocalSelectedModel } from "@/utils/localModelResources";
import { listGeneratedImages } from "@/utils/generatedImages";
import { buildGenerateParams } from "@/utils/comfy/buildGenerateParams";
import { getImageWorkflowDefaults } from "@/utils/comfy/imageWorkflow";
import { readEditableText, setEditableText } from "@/utils/promptEditor";
import { readPromptText, setPromptText } from "@/utils/promptTarget";
import { isElectronEnvironment } from "@/utils/electronBridge";
import type { CreateMode } from "@/types/createMode";
import type { SelectedModel } from "@/types/model";
import type { GeneratedImageFile } from "@/types/historyFolder";
import {
  DEFAULT_EXTENSION_WEIGHT,
  type SelectedExtension,
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
 * 窄屏右上角的固钉切换器：三枚方钮就是三个视图档位（网格 / 堆栈 / 收藏）。
 *
 * 为什么把「已生成图片」的入口做成固钉而不是提示词框下面那枚小 chip：
 * 那个位置在滚动里，往下拉一点就看不见了 —— 用户要找的入口必须**一直在**。
 * 点任意一档 = 进入图库页并停在该档；已经在图库页时只换档、不跳走。
 */
const HISTORY_VIEW_OPTIONS: ReadonlyArray<{
  mode: HistoryViewMode;
  labelKey: MessageKey;
  Icon: typeof Grid3x3;
}> = [
  { mode: "grid", labelKey: "create.createHistorySidebar.gridView", Icon: Grid3x3 },
  { mode: "stack", labelKey: "create.createHistorySidebar.stackView", Icon: GalleryVertical },
  { mode: "bookmark", labelKey: "create.createHistorySidebar.bookmarkView", Icon: Bookmark },
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
  const isWideViewport = useMediaQuery("(min-width: 1280px)");
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
  const { generating, previewUrl, generate } = useComfyGenerate();
  const [historyImages, setHistoryImages] = useState<GeneratedImageFile[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [centerPreviewImage, setCenterPreviewImage] =
    useState<GeneratedImageFile | null>(null);
  /**
   * 窄屏（< xl）下图库抽屉。右栏是 `hidden xl:flex`，窄屏时整栏消失，
   * 没有这个抽屉用户就完全看不到已生成图片 —— 见 PromptSection 里的入口按钮。
   */
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const imageActionsRef = useRef<GeneratedImageActionHandle>(null);
  const [createMode, setCreateMode] = useState<CreateMode>("image");
  const [seriesId, setSeriesId] = useState(DEFAULT_MODEL_SERIES_ID);
  const [selectedModel, setSelectedModel] =
    useState<SelectedModel>(DEFAULT_SELECTED_MODEL);
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [extensionDialogOpen, setExtensionDialogOpen] = useState(false);
  const [promptGuideOpen, setPromptGuideOpen] = useState(false);
  const [selectedExtensions, setSelectedExtensions] = useState<
    SelectedExtension[]
  >([]);

  const modelDisplay = getSelectedModelDisplay(selectedModel, localModels);
  const isImageMode = createMode === "image";
  const isVideoMode = createMode === "video";
  const isRoleCoverMode = createMode === "roleCover";
  const isRoleTtsMode = createMode === "roleTts";

  /**
   * 窄屏「已生成图片」= **主显示区换页**，不是覆盖整屏的浮层。
   *
   * 页面本来就是「左侧应用导航 + 右侧主显示区」两栏：低宽度下把整屏盖掉，
   * 导航会跟着消失，用户既回不去别的页、也失去了「我在应用的哪一层」这个上下文。
   * 因此它替换的是创建表单那一栏（`hidden` 保留挂载，编辑中的提示词不丢），
   * 左侧导航（`apps/next/src/components/Sidebar.tsx`，md 以上固定显示）原样留着。
   */
  const showHistoryPage = !isWideViewport && historyDrawerOpen;
  /** 固钉切换器与图库共用同一份视图档位（见 useHistoryFolderStore 的说明） */
  const viewMode = useHistoryFolderStore((state) => state.viewMode);
  const setViewMode = useHistoryFolderStore((state) => state.setViewMode);

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
      apply: () => setHistoryDrawerOpen(open),
      isSettled: () =>
        open
          ? Boolean(document.querySelector('[data-create-subpage="history"]'))
          : !document.querySelector('[data-create-subpage="history"]'),
    });
  }, []);

  const previewIcon = isVideoMode ? (
    <VideoIcon className="h-12 w-12 text-muted-foreground opacity-50" strokeWidth={1.5} />
  ) : isRoleCoverMode ? (
    <Music2 className="h-12 w-12 text-muted-foreground opacity-50" strokeWidth={1.5} />
  ) : isRoleTtsMode ? (
    <Mic className="h-12 w-12 text-muted-foreground opacity-50" strokeWidth={1.5} />
  ) : (
    <ImageIcon className="h-12 w-12 text-muted-foreground opacity-50" strokeWidth={1.5} />
  );

  const historyMediaLabel = isVideoMode
    ? t("create.page.mediaVideo")
    : isRoleCoverMode
      ? t("create.page.mediaRoleCover")
      : isRoleTtsMode
        ? t("create.page.mediaRoleTts")
        : t("create.page.mediaImage");

  useEffect(() => {
    let cancelled = false;

    void listGeneratedImages(outputPath, openedFolderDirPath).then((files) => {
      if (!cancelled) setHistoryImages(files);
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
    const diskItems = historyImages.map((image) => ({
      key: image.filePath,
      filePath: image.filePath,
      alt: image.fileName,
    }));

    if (!previewUrl) return diskItems;

    return [
      { key: "__preview__", src: previewUrl, alt: t("create.page.previewAlt") },
      ...diskItems,
    ];
  }, [historyImages, previewUrl, t]);

  /** 刚生成的预览占据第 0 位，磁盘图片顺延（索引换算用） */
  const previewOffset = previewUrl ? 1 : 0;

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
  const centerPreviewPath = centerPreviewImage?.filePath ?? null;
  if (
    centerPreviewPath !== previousCenterPreviewPath ||
    historyImages.length !== previousHistoryLength ||
    imagesRefreshVersion !== previousImagesRefreshVersion
  ) {
    setPreviousCenterPreviewPath(centerPreviewPath);
    setPreviousHistoryLength(historyImages.length);
    setPreviousImagesRefreshVersion(imagesRefreshVersion);
    if (centerPreviewImage) {
      const index = historyImages.findIndex(
        (image) => image.filePath === centerPreviewImage.filePath
      );
      if (index >= 0) setGalleryIndex(index + previewOffset);
    }
  }

  const handleGalleryIndexChange = useCallback(
    (index: number) => {
      setGalleryIndex(index);
      // 有刚生成的预览时，磁盘图片整体后移一位
      const image = historyImages[index - previewOffset];
      if (image) {
        setCenterPreviewImage(image);
      } else if (previewOffset > 0 && index < previewOffset) {
        setCenterPreviewImage(null);
      }
    },
    [historyImages, previewOffset]
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
  }, [localModels, seriesId]);

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
    [localModels, seriesId, setAdvancedSettings, setAspectRatio, setCustomSize]
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
        const result = await generate(baseParams, imageCount);
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
      t,
    ]
  );

  return (
    <div className="relative mx-auto flex h-full flex-col overflow-hidden xl:flex-row">
      {/**
       * 窄屏固钉：贴在主区右上角，三枚方钮切换图库视图。
       * 点任意一档 = 打开图库页并停在该档（已在图库页时只换档）。
       * 宽屏不渲染：那一栏（≥ xl）右栏本来就常驻展示图库，不需要入口。
       */}
      {!isWideViewport ? (
        <div
          data-history-pin
          /** 离右边 12px：再靠右会压住页面自己的滚动条，拖不动 */
          className="absolute right-3 top-2 z-30 flex flex-col items-end gap-1"
        >
          {/** 图库页里标题已经写着「已生成图片」，这枚标签只在创建表单上做「这是什么入口」的说明 */}
          {showHistoryPage ? null : (
            <span className="pointer-events-none rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] leading-4 text-muted-foreground backdrop-blur">
              {t("create.historyDrawer.openLabel")}
            </span>
          )}
          <div
            className={cn(
              /** 尽量小：它压在表单右侧，越窄越不挡下面的输入框；半透明 + 毛玻璃保证背后内容可读 */
              "motion-fade-in flex flex-col gap-0.5 rounded-2xl bg-background/80 p-1 shadow-md backdrop-blur",
              THIN_BORDER_CLASS
            )}
          >
            {HISTORY_VIEW_OPTIONS.map((option) => (
              <button
                key={option.mode}
                type="button"
                data-history-pin-option={option.mode}
                aria-label={t(option.labelKey)}
                aria-pressed={showHistoryPage ? viewMode === option.mode : undefined}
                onClick={() => {
                  setViewMode(option.mode);
                  openHistoryPage(true);
                }}
                className={cn(
                  "inline-flex h-7 w-7 items-center justify-center rounded-xl transition-[background-color,color,transform] duration-150 active:scale-90",
                  showHistoryPage && viewMode === option.mode
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
        className={cn(
          /** 挂载时淡入：从别的页面切回来不再是「啪」地出现 */
          "motion-fade-in flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-border md:border-r",
          createMode !== "edit" && "xl:w-[31.25%] xl:shrink-0",
          /** 挂载保留（`hidden` 而不是条件卸载）：提示词框是 contenteditable，卸载会丢编辑现场 */
          showHistoryPage && "hidden"
        )}
      >
        {/* 界面：rail 顶部模式标签 ——「图片 / 视频 / Edit / Role 翻唱 / Role TTS」 */}
        <CreateModeTabs value={createMode} onChange={setCreateMode} />

        {isImageMode && (
          <div className="shrink-0">
            {/* 界面：「模型系列」那一行（Anima / SDXL；切换会换工作流与默认相机距离） */}
            <ModelSeriesSelector value={seriesId} onChange={handleSeriesChange} />
          </div>
        )}

        {isImageMode ? (
          <>
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]">
              <div className="flex min-w-0 max-w-full flex-col gap-4 px-2 pb-3 pt-2 sm:px-3 sm:pt-3">
                <div className="space-y-1.5">
                  {/* 界面：「模型」卡片，与视频模型选择共用 */}
                  <ModelCoverSelect name={modelDisplay.name} cover={modelDisplay.cover} label={t("create.page.model")} onClick={() => setModelDialogOpen(true)} priority />
                  {/* 界面：模型卡片里的「如何为 Anima / SDXL 编写提示词？」按钮 */}
                  <PromptGuideButton
                    series={seriesId === "sdxl" ? "sdxl" : "anima"}
                    onClick={() => setPromptGuideOpen(true)}
                  />
                </div>

                <div className="hidden md:block">
                  {/* 界面：「已选扩展 / 添加扩展」图片与视频复用同一个组件 */}
                  <SelectedExtensions value={selectedExtensions} onChange={setSelectedExtensions} onAdd={() => setExtensionDialogOpen(true)} />
                </div>

                {/* 界面：「提示词」区（普通模式是单一输入框；含高级组装开关与工具行） */}
                <PromptSection
        series={seriesId === "sdxl" ? "sdxl" : "anima"}
      />

                {/* 界面：「反向提示词」区 */}
                <NegativePromptSection />

                {/* 界面：「图片尺寸」区（比例 / 宽高 / 预设） */}
                <ImageSizeSection />
                {/* 界面：「高级设置」区（采样器 / 步数 / CFG / 种子…） */}
                <AdvancedSettings series={seriesId === "sdxl" ? "sdxl" : "anima"} />
              </div>
            </div>

            {/* 界面：rail 底部的「生成」按钮条 */}
            <GenerateFooter generating={generating} onGenerate={handleGenerate} />
          </>
        ) : isVideoMode ? (
          /* 界面：视频模式（「视频」标签）下替换整个 rail 的面板 */
          <VideoCreatePanel />
        ) : isRoleCoverMode ? (
          /* 界面：Role 翻唱模式下的角色封面面板 */
          <RoleCoverPanel />
        ) : isRoleTtsMode ? (
          /* 界面：Role TTS 模式下的面板 */
          <RoleTtsPanel />
        ) : (
          /* 界面：Edit 蒙版快速验证，原图尺寸导出并复用 ComfyUI 上传接口 */
          <MaskEditorPanel />
        )}
      </section>

      {/* stage：中栏图片显示区（点开是大图预览层） */}
      <article className={cn("hidden min-h-0 min-w-0 flex-1", createMode !== "edit" && "xl:flex")}>
        <div className="flex h-full w-full items-center justify-center p-3">
          <div
            className="relative flex aspect-[832/1216] max-h-full max-w-full flex-col items-center justify-center overflow-hidden bg-muted dark:bg-zinc-900"
            style={{ height: "min(1216px, 100%)" }}
          >
            {previewGalleryItems.length > 0 ? (
              /* 界面：stage 里那张图 —— 点开是大图预览 */
              <ImagePreviewTrigger
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
              previewIcon
            )}
            {generating && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm font-medium text-white">
                {t("create.page.generating")}
              </div>
            )}
          </div>
        </div>
      </article>

      {/* side：右栏 —— 高级模式是「提示词组装」，否则是「已生成图片」 */}
      <section
        className={cn(
          "relative hidden min-h-0 min-w-0 overflow-visible border-l xl:flex xl:h-full xl:w-[25%] xl:shrink-0 xl:flex-col",
          THIN_DIVIDER_CLASS
        )}
      >
        {advancedPrompt && isWideViewport ? (
          /* 界面：右栏的「提示词组装」面板 */
          <PromptAssemblyPanel
            series={seriesId === "sdxl" ? "sdxl" : "anima"}
            onClose={() => setAdvancedPrompt(false)}
          />
        ) : (
          /* 界面：右栏的「已生成图片」 */
          <CreateHistorySidebar
            mediaLabel={historyMediaLabel}
            centerPreviewPath={centerPreviewImage?.filePath ?? null}
            onCenterPreviewChange={setCenterPreviewImage}
            respondToOpenRequest
          />
        )}
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
              mediaLabel={historyMediaLabel}
              centerPreviewPath={centerPreviewImage?.filePath ?? null}
              onCenterPreviewChange={setCenterPreviewImage}
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
        onDeleted={(filePaths) => {
          if (
            centerPreviewImage &&
            filePaths.includes(centerPreviewImage.filePath)
          ) {
            setCenterPreviewImage(null);
            setGalleryIndex(0);
          }
        }}
      />
    </div>
  );
}
