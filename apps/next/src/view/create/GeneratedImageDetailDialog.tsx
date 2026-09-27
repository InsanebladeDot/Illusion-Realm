"use client";

import {
  useCallback,
  useEffect,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Copy, RefreshCcw, X } from "lucide-react";
import { LocalFileImage } from "@/components/LocalFileImage";
import type { GeneratedImageFile } from "@/types/historyFolder";
import type { GeneratedImageMetaDocument } from "@/types/generatedImageMeta";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useCreateRemixStore } from "@/stores/useCreateRemixStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import { displayModelFileName } from "@/utils/buildGeneratedImageMeta";
import { buildRemixApplyResult } from "@/utils/remixFromMeta";
import { formatRemixWarnings } from "@/utils/remixFromInspect";
import { inspectImageMetaForRemix } from "@/utils/sdImageInspector/inspectImageMetaForRemix";
import { LoraStrengthRow } from "@/view/create/LoraStrengthRow";
import { cn } from "@/utils/cn";
import { useIsHydrated } from "@/hooks/useIsHydrated";
import { useMediaQueryAfterHydration } from "@/hooks/useMediaQuery";
import { useSidebarStore } from "@/stores/useSidebarStore";
import {
  SIDEBAR_WIDTH_COLLAPSED,
  SIDEBAR_WIDTH_EXPANDED,
} from "@/data/navigation";
import { THIN_DIVIDER_CLASS } from "@/utils/layout";
import { runPageStyleTransition } from "@/utils/pageTransition";

type GeneratedImageDetailDialogProps = {
  image: GeneratedImageFile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImageContextMenu?: (
    event: ReactMouseEvent<HTMLDivElement>,
    image: GeneratedImageFile
  ) => void;
};

function CopyButton({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.show);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      showToast(t("create.generatedImageDetailDialog.copiedLabel", { label }));
    } catch {
      showToast(t("common.copyFailed"));
    }
  };

  return (
    <button
      type="button"
      aria-label={t("create.generatedImageDetailDialog.copyLabel", { label })}
      onClick={handleCopy}
      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <Copy className="h-3 w-3" />
    </button>
  );
}

function MetaField({
  label,
  value,
  copyValue,
  mono = false,
}: {
  label: string;
  value: string;
  copyValue?: string;
  mono?: boolean;
}) {
  if (!value) return null;

  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        {copyValue != null ? <CopyButton value={copyValue} label={label} /> : null}
      </div>
      <div className={cn("text-sm", mono && "font-mono")}>{value}</div>
    </div>
  );
}

export function GeneratedImageDetailDialog({
  image,
  open,
  onOpenChange,
  onImageContextMenu,
}: GeneratedImageDetailDialogProps) {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.show);
  const localModels = useSettingsStore((state) => state.models);
  const queueRemix = useCreateRemixStore((state) => state.queueRemix);
  const isHydrated = useIsHydrated();
  const [meta, setMeta] = useState<GeneratedImageMetaDocument | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);

  /**
   * 窄屏（< lg）走「主显示区里的页」版式，宽屏保持原来的两栏弹窗。
   *
   * 为什么窄屏要换版式：原来的窄屏形态是「屏幕居中、整宽、85dvh」——
   * 图片区独占 `min(58vh, 560px)`，剩下的信息全被挤到下面还要再滚一次，
   * 而且它把**左侧应用导航一起盖掉**（页面本来就是「左导航 + 右主区」两栏，
   * 盖掉导航等于用户看不出自己在哪一层，也回不去别的页）。
   * 现在窄屏把它挂进主区（左边缘让开导航、四周留 8px），图片区改成「按比例吃一段高度」，
   * 元信息区独立滚动，关闭按钮从「浮在图上」挪到标题栏里。
   */
  /** 首帧就取值：本弹窗只在打开时挂载，用 `useMediaQuery` 会先渲染一帧紧凑版式（见 hook 注释） */
  const isCompact = !useMediaQueryAfterHydration("(min-width: 1024px)");
  const navExpanded = useSidebarStore((state) => state.expanded);
  const hasDesktopNav = useMediaQueryAfterHydration("(min-width: 768px)");
  const navOffset = hasDesktopNav
    ? navExpanded
      ? SIDEBAR_WIDTH_EXPANDED
      : SIDEBAR_WIDTH_COLLAPSED
    : 0;
  /**
   * 渲染期同步：未打开或没有图片时清空 meta。
   * 用「记录前值 + 渲染期比较」替代 useEffect 里的 setMeta(null)
   * （react-hooks/set-state-in-effect 会拦后者），语义等价且少一次级联渲染。
   * 注意：这里只做状态调整，不提前 return —— 下方还有 hook，提前返回会破坏调用顺序。
   */
  const [previousMetaKey, setPreviousMetaKey] = useState<string | null>(null);
  const metaKey = `${open}|${image?.filePath ?? ""}`;
  if ((!open || !image) && metaKey !== previousMetaKey) {
    setPreviousMetaKey(metaKey);
    setMeta(null);
  }

  useEffect(() => {
    if (!open || !image) return;

    let cancelled = false;
    // setLoading 放在 async IIFE 内部：与原先同步调用处于同一批次，
    // 但不属于「effect 体内同步 setState」（react-hooks/set-state-in-effect）
    const filePath = image.filePath;
    const fileName = image.fileName;

    void (async () => {
      setLoadingMeta(true);
      try {
        const result = await inspectImageMetaForRemix(filePath, fileName);
        if (!cancelled) {
          setMeta(result.meta);
        }
      } catch {
        if (!cancelled) {
          setMeta(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingMeta(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, image]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onOpenChange]);

  /**
   * 关闭 = 返回上一层：窄屏下这一层是**主区里的一页**（占满），
   * 所以走和「已生成图片 → 返回创建」同一条位移（方向 mirror），而不是弹窗的淡出。
   * 宽屏仍是居中弹窗，没有进出动画上的强诉求，直接关。
   */
  const handleClose = useCallback(() => {
    if (!isCompact) {
      onOpenChange(false);
      return;
    }
    runPageStyleTransition({
      direction: "backward",
      apply: () => onOpenChange(false),
      isSettled: () => !document.querySelector("[data-image-detail-panel]"),
    });
  }, [isCompact, onOpenChange]);

  const handleRemix = useCallback(() => {
    if (!meta) {
      showToast(t("create.generatedImageDetailDialog.notOursRemix"));
      return;
    }

    const result = buildRemixApplyResult({
      meta,
      localModels,
    });

    queueRemix(result);
    onOpenChange(false);

    const warnings = formatRemixWarnings(result);
    showToast(
      warnings.length > 0
        ? t("create.generatedImageDetailDialog.remixLoadedWithWarnings", {
            warnings: warnings.join(", "),
          })
        : t("create.generatedImageDetailDialog.remixLoaded")
    );
  }, [localModels, meta, onOpenChange, queueRemix, showToast, t]);

  if (!open || !image || !isHydrated) return null;

  const params = meta?.params;

  return createPortal(
    <>
      {/** 窄屏不需要遮罩：这一层本来就占满主区，遮罩只会多一层没用的灰 */}
      {isCompact ? null : (
        <div
          className="fixed inset-0 z-[89] bg-black/50"
          aria-hidden
          onClick={handleClose}
        />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="generated-image-detail-title"
        data-image-detail-panel={isCompact ? "" : undefined}
        className={cn(
          "z-[90] overflow-hidden bg-background outline-none",
          isCompact
            ? cn(
                /**
                 * 挂 `motion-none` 退出「所有弹窗统一缩放淡入」那条规则：
                 * 这一层窄屏下**是主区里的一页**，入场交给页面切换那套位移
                 * （`view-transition-name: page-panel`），不是弹窗的缩放。
                 */
                "motion-none fixed inset-y-0 right-0 flex flex-col rounded-none border-0 shadow-none",
                /** 占满主区：左边缘让开侧栏，四周不留缝（用户要「和图 1 一样占满」） */
                "bottom-0"
              )
            : cn(
                "fixed left-1/2 top-1/2 w-full max-w-[86vw] -translate-x-1/2 -translate-y-1/2 rounded-xl border-0 p-0 shadow-lg",
                "h-[calc(85dvh-env(safe-area-inset-top))] max-h-[calc(95dvh-env(safe-area-inset-top))]"
              )
        )}
        style={isCompact ? { left: navOffset } : undefined}
      >
        {/**
         * 窄屏标题栏与「已生成图片」那一页**同一条**：◀ 返回 + 文件名。
         * 用 ◀ 而不是 ✕：它是「上一层」而不是「关掉一个弹窗」，动线与图标该一致。
         */}
        {isCompact ? (
          <div
            className={cn(
              "flex shrink-0 items-center gap-2 border-b px-2 py-2",
              THIN_DIVIDER_CLASS
            )}
          >
            <button
              type="button"
              aria-label={t("common.close")}
              onClick={handleClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span
              id="generated-image-detail-title"
              className="min-w-0 flex-1 truncate text-sm font-semibold"
              title={image.fileName}
            >
              {image.fileName}
            </span>
          </div>
        ) : (
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={handleClose}
            className="absolute right-3 top-3 z-[200] inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        <div
          className={cn(
            isCompact ? "flex min-h-0 flex-1 flex-col" : "h-full overflow-y-auto"
          )}
        >
          <div
            className={cn(
              "bg-background",
              isCompact
                ? "flex min-h-0 flex-1 flex-col"
                : "grid gap-6 p-4 pt-14 sm:p-6 lg:h-full lg:grid-cols-2 lg:pt-6"
            )}
          >
            {/**
             * 图片区（**高度驱动**，不是形状驱动）。
             *
             * 原来这里是 `aspect-square max-h-[…]`：容器高度由**宽度**决定，而它处在
             * `grid-cols-2` 的左列（宽屏约 600px 宽）——于是竖图被 `object-contain`
             * 缩进一个方形里，左右各留一大片空白（「大面积留白、很丑」的成因）。
             * 现在改为「吃掉这一格的高度、宽度自适应」，图片按 `max-h-full max-w-full`
             * 等比撑满可用空间；`bg-muted/40` 让不可避免的留白看起来是**有意的画框**，
             * 而不是没画好的空白。
             */}
            <div
              className={cn(
                "relative flex items-center justify-center overflow-hidden rounded-xl bg-muted/40",
                isCompact
                  ? "m-3 h-[32dvh] max-h-[380px] shrink-0"
                  : "h-full min-h-0"
              )}
              onContextMenu={(event) => {
                if (!onImageContextMenu) return;
                event.preventDefault();
                onImageContextMenu(event, image);
              }}
            >
              <LocalFileImage
                filePath={image.filePath}
                alt={image.fileName}
                className="max-h-full max-w-full object-contain"
              />
            </div>

            <div
              className={cn(
                "space-y-4",
                isCompact && "min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-1"
              )}
            >
              <div className="space-y-1">
                {/** 窄屏的标题在标题栏里（同一个 id 只能有一个：那边拿它做 aria-labelledby） */}
                {isCompact ? null : (
                  <h2
                    id="generated-image-detail-title"
                    className="break-all pr-12 text-lg font-semibold leading-snug"
                  >
                    {image.fileName}
                  </h2>
                )}
                <p className="text-xs text-muted-foreground">
                  {loadingMeta
                    ? t("create.generatedImageDetailDialog.parsingMeta")
                    : meta
                      ? t("create.generatedImageDetailDialog.metaFromImage")
                      : t("create.generatedImageDetailDialog.notOurs")}
                </p>
              </div>

              {!loadingMeta && !meta ? (
                <div
                  data-generated-image-not-ours
                  /** 警告卡片同样不描边：琥珀底色本身就说明问题，加线只是多一道边（填充略提亮补回分量） */
                  className="space-y-1 rounded-2xl bg-amber-500/15 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300"
                >
                  <p className="font-medium">
                    {t("create.generatedImageDetailDialog.notOurs")}
                  </p>
                  <p>
                    {t("create.generatedImageDetailDialog.notOursDescription")}
                  </p>
                </div>
              ) : null}

              {params ? (
                /** 同样不描边：分组靠标题字号与内层字段的浅色底，不靠线 */
                <div className="space-y-3 rounded-2xl p-3">
                  <div className="flex h-8 items-center justify-between">
                    <h3 className="font-medium">
                      {t("create.generatedImageDetailDialog.generatedData")}
                    </h3>
                    <button
                      type="button"
                      onClick={handleRemix}
                      disabled={!meta}
                      className="inline-flex h-8 items-center justify-center gap-1 rounded-xl bg-purple-500 px-3 text-xs font-medium text-white shadow hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RefreshCcw className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        {t("create.generatedImageDetailDialog.remix")}
                      </span>
                    </button>
                  </div>

                  <div className="space-y-3 text-sm">
                    {params.checkpointName ? (
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground">
                          {t("create.generatedImageDetailDialog.model")}
                        </div>
                        <div className="rounded-lg bg-muted/50 p-2 text-xs font-medium">
                          {displayModelFileName(params.checkpointName)}
                        </div>
                      </div>
                    ) : null}

                    {params.loras.length > 0 ? (
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground">
                          {t("create.generatedImageDetailDialog.extensionLora")}
                        </div>
                        <div className="space-y-2">
                          {params.loras.map((lora) => (
                            <LoraStrengthRow
                              key={`${lora.name}-${lora.strength}`}
                              name={lora.name}
                              strength={lora.strength}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <MetaField
                      label={t("create.generatedImageDetailDialog.prompt")}
                      value={params.positivePrompt}
                      copyValue={params.positivePrompt}
                      mono
                    />

                    <MetaField
                      label={t("create.generatedImageDetailDialog.negativePrompt")}
                      value={params.negativePrompt}
                      copyValue={params.negativePrompt}
                      mono
                    />

                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                        <div>
                          <div className="text-xs font-medium text-muted-foreground">
                            {t("create.generatedImageDetailDialog.seed")}
                          </div>
                          <div className="font-mono">{params.seed}</div>
                        </div>
                        <CopyButton
                          value={String(params.seed)}
                          label={t("create.generatedImageDetailDialog.seed")}
                        />
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3">
                        <div className="text-xs font-medium text-muted-foreground">
                          {t("create.generatedImageDetailDialog.steps")}
                        </div>
                        <div>{params.steps}</div>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3">
                        <div className="text-xs font-medium text-muted-foreground">
                          {t("create.generatedImageDetailDialog.cfgRatio")}
                        </div>
                        <div>{params.cfg}</div>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3">
                        <div className="text-xs font-medium text-muted-foreground">
                          {t("create.generatedImageDetailDialog.sampler")}
                        </div>
                        <div className="truncate">{params.samplerName}</div>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3">
                        <div className="text-xs font-medium text-muted-foreground">
                          {t("create.generatedImageDetailDialog.size")}
                        </div>
                        <div>
                          {params.width} × {params.height}
                        </div>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3">
                        <div className="text-xs font-medium text-muted-foreground">
                          {t("create.generatedImageDetailDialog.batch")}
                        </div>
                        <div>{params.batchSize}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
