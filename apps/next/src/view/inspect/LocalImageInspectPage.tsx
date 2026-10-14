"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCcw, ScanSearch, Upload } from "lucide-react";
import { LocalFileImage } from "@/components/LocalFileImage";
import { useCreateRemixStore } from "@/stores/useCreateRemixStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import type { GeneratedImageFile } from "@/types/historyFolder";
import type { SdImageInspectResult } from "@/types/sdImageMeta";
import { listGeneratedImages } from "@/utils/generatedImages";
import { inspectGeneratedImageFromPath } from "@/utils/sdImageInspector/inspectImageFromPath";
import {
  inspectUploadedImageFile,
  isInspectableImageFile,
} from "@/utils/sdImageInspector/inspectUploadedFile";
import {
  buildRemixApplyResultFromInspect,
  canRemixFromInspect,
  formatRemixWarnings,
  isMetaVersionTooNew,
} from "@/utils/remixFromInspect";
import { GENERATED_IMAGE_META_VERSION } from "@/types/generatedImageMeta";
import { isElectronEnvironment } from "@/utils/electronBridge";
import { THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";
import { logParsedComfyWorkflowFromInspect } from "@/utils/sdImageInspector/parseComfyWorkflow";
import { MetaFieldRow } from "@/view/inspect/MetaFieldRow";

type InspectSource =
  | { kind: "path"; filePath: string; fileName: string }
  | { kind: "upload"; previewUrl: string; fileName: string };

function InspectResultPanel({
  inspecting,
  source,
  embeddedMeta,
  canRemix,
  onRemix,
}: {
  inspecting: boolean;
  source: InspectSource | null;
  embeddedMeta: SdImageInspectResult | null;
  canRemix: boolean;
  onRemix: () => void;
}) {
  const { t } = useTranslation();
  /** 比当前应用更新版本的图：提示升级，而不是笼统说「非本生成器生成」 */
  const metaVersionTooNew = isMetaVersionTooNew(embeddedMeta);

  return (
    <section
      className={cn(
        "flex min-h-[320px] flex-col overflow-hidden rounded-xl border bg-background/80 lg:min-h-0",
        THIN_BORDER_CLASS
      )}
    >
      <div className="shrink-0 border-b border-border/60 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-medium">{t("inspect.result.title")}</h2>
            {inspecting ? (
              <p className="text-xs text-muted-foreground">
                {t("inspect.result.inspecting")}
              </p>
            ) : source ? (
              <p
                className="truncate text-xs text-muted-foreground"
                title={source.fileName}
              >
                {source.fileName}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("inspect.result.placeholder")}
              </p>
            )}
          </div>
          {canRemix ? (
            <button
              type="button"
              onClick={onRemix}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              {t("inspect.result.loadRemix")}
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 [scrollbar-gutter:stable]">
        {!source && !inspecting ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {t("inspect.result.emptyHint")}
          </p>
        ) : null}

        {source ? (
          <div className="overflow-hidden rounded-lg bg-muted/20">
            {source.kind === "path" ? (
              <LocalFileImage
                filePath={source.filePath}
                alt={source.fileName}
                className="mx-auto max-h-48 w-full object-contain"
              />
            ) : (
              <img
                src={source.previewUrl}
                alt={source.fileName}
                className="mx-auto max-h-48 w-full object-contain"
              />
            )}
          </div>
        ) : null}

        {embeddedMeta ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {t("inspect.result.metaLabel")}
              <span className="ml-2 font-normal">
                （{embeddedMeta.metaType}
                {embeddedMeta.metaType === "NONE"
                  ? t("inspect.result.metaUnrecognized")
                  : ""}）
              </span>
            </p>
            <div className="space-y-2">
              {embeddedMeta.fields.map((field) => (
                <MetaFieldRow key={`${source?.fileName}:${field.key}`} field={field} />
              ))}
            </div>
          </div>
        ) : null}

        {embeddedMeta && !canRemix ? (
          <div
            data-inspect-not-ours
            className={cn(
              "rounded-lg bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300",
              THIN_BORDER_CLASS
            )}
          >
            {metaVersionTooNew
              ? t("inspect.result.metaVersionTooNew", {
                  version: embeddedMeta.metaVersion ?? 0,
                  supported: GENERATED_IMAGE_META_VERSION,
                })
              : t("inspect.result.notOurs")}
          </div>
        ) : null}

        {embeddedMeta && embeddedMeta.exif.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">EXIF</p>
            <div className="space-y-2">
              {embeddedMeta.exif.map((item) => (
                <div
                  key={item.key}
                  className={cn("rounded-lg bg-muted/30 p-2.5", THIN_BORDER_CLASS)}
                >
                  <div className="text-xs font-medium text-muted-foreground">
                    {item.key}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-all text-xs">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function LocalImageInspectPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const outputPath = useSettingsStore((state) => state.outputPath);
  const localModels = useSettingsStore((state) => state.models);
  const queueRemix = useCreateRemixStore((state) => state.queueRemix);
  const showToast = useToastStore((state) => state.show);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadPreviewRef = useRef<string | null>(null);
  const [images, setImages] = useState<GeneratedImageFile[]>([]);
  const [loadingImages, setLoadingImages] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [source, setSource] = useState<InspectSource | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [embeddedMeta, setEmbeddedMeta] = useState<SdImageInspectResult | null>(
    null
  );

  const revokeUploadPreview = useCallback(() => {
    if (uploadPreviewRef.current) {
      URL.revokeObjectURL(uploadPreviewRef.current);
      uploadPreviewRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // setLoadingImages 放在 async IIFE 内部（P3）
      setLoadingImages(true);
      try {
        const files = await listGeneratedImages(outputPath, null);
        if (!cancelled) setImages(files);
      } finally {
        if (!cancelled) setLoadingImages(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [outputPath]);

  useEffect(() => revokeUploadPreview, [revokeUploadPreview]);

  useEffect(() => {
    if (!embeddedMeta) return;
    // 参数来源只有图片内嵌 Meta（不再有旁车 JSON）
    logParsedComfyWorkflowFromInspect({
      fields: embeddedMeta.fields,
      fileName: embeddedMeta.fileName ?? source?.fileName,
    });
  }, [embeddedMeta, source?.fileName]);

  const resetResults = useCallback(() => {
    setEmbeddedMeta(null);
  }, []);

  const inspectFromPath = useCallback(
    async (filePath: string, fileName: string) => {
      if (!isElectronEnvironment()) {
        showToast(t("inspect.page.electronOnly"));
        return;
      }

      revokeUploadPreview();
      setInspecting(true);
      setSource({ kind: "path", filePath, fileName });
      resetResults();

      try {
        const embedded = await inspectGeneratedImageFromPath(filePath, fileName);
        setEmbeddedMeta(embedded);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t("inspect.page.parseFailed");
        showToast(message);
      } finally {
        setInspecting(false);
      }
    },
    [resetResults, revokeUploadPreview, showToast, t]
  );

  const inspectFromFile = useCallback(
    async (file: File) => {
      if (!isInspectableImageFile(file)) {
        showToast(t("inspect.page.invalidFile"));
        return;
      }

      revokeUploadPreview();
      const previewUrl = URL.createObjectURL(file);
      uploadPreviewRef.current = previewUrl;

      setInspecting(true);
      setSource({ kind: "upload", previewUrl, fileName: file.name });
      resetResults();

      try {
        const embedded = await inspectUploadedImageFile(file);
        setEmbeddedMeta(embedded);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t("inspect.page.parseFailed");
        showToast(message);
      } finally {
        setInspecting(false);
      }
    },
    [resetResults, revokeUploadPreview, showToast, t]
  );

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      const file = fileList?.[0];
      if (file) void inspectFromFile(file);
    },
    [inspectFromFile]
  );

  const selectedPath =
    source?.kind === "path" ? source.filePath : null;

  const canRemix =
    !inspecting &&
    canRemixFromInspect({
      embeddedMeta,
    });

  const handleRemix = useCallback(() => {
    const result = buildRemixApplyResultFromInspect({
      embeddedMeta,
      localModels,
    });

    if (!result || !embeddedMeta) {
      showToast(t("inspect.page.cannotRemix"));
      return;
    }

    queueRemix(result);
    router.push("/create");

    const warnings = formatRemixWarnings(result);
    showToast(
      warnings.length > 0
        ? t("inspect.page.remixLoadedWithWarnings", {
            warnings: warnings.join(", "),
          })
        : t("inspect.page.remixLoaded")
    );
  }, [
    embeddedMeta,
    localModels,
    queueRemix,
    router,
    showToast,
    t,
  ]);

  return (
    /**
     * 窄屏（< lg）这一页**自己滚**：外壳是 `fillViewport`（main 为
     * `h-[100dvh] overflow-hidden`），页面不滚就会被裁掉。
     */
    <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-4 overflow-y-auto px-4 py-6 sm:px-6 lg:overflow-hidden lg:gap-6">
      <header className="shrink-0">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
            <ScanSearch className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("inspect.page.title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("inspect.page.description")}
            </p>
          </div>
        </div>
      </header>

      {/*
        窄屏单列时**不要**保留 `flex-1 / min-h-0`：那等于让三张卡共享「一屏高度」，
        `align-content: stretch` 会把网格行压到比内容还矮，卡片内容溢出自己的行、
        后一张卡直接盖住前一张（2026-09-26 实测 960×900 有图状态：
        上传卡 226px 只分到 206px 的格子，解析卡从 y=302 压上来 20px，
        中间的「从生成路径选择」被压成 2px）。宽屏两列时再交给 `flex-1` 各自内部滚动。
      */}
      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-6">
        <div className="flex min-h-0 flex-col gap-4">
          <section
            className={cn(
              "shrink-0 rounded-xl border bg-background/80 p-4",
              THIN_BORDER_CLASS
            )}
          >
            <h2 className="text-sm font-medium">{t("inspect.page.uploadTitle")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("inspect.page.uploadHint")}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/bmp,image/avif,.png,.jpg,.jpeg,.webp,.bmp,.avif"
              className="sr-only"
              onChange={(event) => {
                handleFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={inspecting}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                handleFiles(event.dataTransfer.files);
              }}
              className={cn(
                "mt-3 flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors disabled:opacity-60",
                dragOver
                  ? "border-foreground/40 bg-muted/60"
                  : "border-border/70 bg-muted/20 hover:bg-muted/40"
              )}
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm font-medium">
                {t("inspect.page.dropzoneTitle")}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("inspect.page.dropzoneHint")}
              </span>
            </button>
          </section>

          <section
            className={cn(
              /**
               * 窄屏给一个高度上限：这是条目数无界的列表（输出目录里可能有几百张图），
               * 放开会让整页拉成几千像素；上限内用它自己的滚动条。
               * 宽屏是两列布局、这一栏本来就吃满列高，交给 `flex-1`。
               */
              "flex min-h-0 max-h-[45vh] flex-1 flex-col overflow-hidden rounded-xl border bg-background/80 lg:max-h-none",
              THIN_BORDER_CLASS
            )}
          >
            <div className="shrink-0 border-b border-border/60 px-4 py-3">
              <h2 className="text-sm font-medium">{t("inspect.page.pathTitle")}</h2>
              <p className="text-xs text-muted-foreground">
                {t("inspect.page.pathHint")}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-gutter:stable]">
              {loadingImages ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {t("inspect.page.loadingImages")}
                </p>
              ) : images.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {t("inspect.page.emptyImages")}
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {images.map((image) => (
                    <button
                      key={image.filePath}
                      type="button"
                      disabled={inspecting}
                      onClick={() =>
                        void inspectFromPath(image.filePath, image.fileName)
                      }
                      className={cn(
                        "aspect-square overflow-hidden rounded-lg bg-muted/30 ring-2 ring-transparent transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-foreground/30 disabled:opacity-60",
                        selectedPath === image.filePath && "ring-foreground/70"
                      )}
                    >
                      <LocalFileImage
                        filePath={image.filePath}
                        alt={image.fileName}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <InspectResultPanel
          inspecting={inspecting}
          source={source}
          embeddedMeta={embeddedMeta}
          canRemix={canRemix}
          onRemix={handleRemix}
        />
      </div>
    </div>
  );
}
