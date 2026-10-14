"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import {
  listImageFiles,
  pickFolder,
  readFileAsArrayBuffer,
  writeFilesToFolder,
} from "@/utils/exif/electronFs";
import { buildRenamedName } from "@/utils/exif/format";
import {
  checkMetadataConsistency,
  type MetadataConsistency,
} from "@/utils/exif/metadataConsistency";
import { parsePngTextChunks } from "@/utils/exif/pngTextChunks";
import { blobToBase64, processImage } from "@/utils/exif/processImage";
import { useIsElectronEnvironment } from "@/hooks/useIsElectronEnvironment";
import { useTranslation } from "@/i18n";
import { useExifToolStore } from "@/stores/useExifToolStore";
import { useToastStore } from "@/stores/useToastStore";
import { cn } from "@/utils/cn";
import { FileList } from "@/view/toolBox/Tool/exif/components/FileList";
import { ForceClearModal } from "@/view/toolBox/Tool/exif/components/ForceClearModal";
import { MetadataEditor } from "@/view/toolBox/Tool/exif/components/MetadataEditor";
import { RenameConfig } from "@/view/toolBox/Tool/exif/components/RenameConfig";
import { UploadZone } from "@/view/toolBox/Tool/exif/components/UploadZone";
import type {
  BatchMode,
  MetaItem,
  ProcessedFile,
} from "@/view/toolBox/Tool/exif/types";

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  avif: "image/avif",
};

function createId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function guessMime(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[ext] ?? "image/png";
}

function readMetadata(buffer: ArrayBuffer, mimeType: string): MetaItem[] {
  return mimeType === "image/png" ? parsePngTextChunks(buffer) : [];
}

export default function ExifEditorPage() {
  const { t } = useTranslation();
  const isDesktop = useIsElectronEnvironment();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<ProcessedFile[]>([]);
  const filesRef = useRef<ProcessedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [processing, setProcessing] = useState(false);

  // 输入/输出文件夹：持久化到 illusion-realm.json 的 exifTool 段
  const inputFolder = useExifToolStore((state) => state.inputFolder);
  const outputFolder = useExifToolStore((state) => state.outputFolder);
  const setInputFolder = useExifToolStore((state) => state.setInputFolder);
  const setOutputFolder = useExifToolStore((state) => state.setOutputFolder);

  const showToast = useToastStore((state) => state.show);
  const [lastResult, setLastResult] = useState<{
    success: number;
    failed: number;
    savedTo: string | null;
  } | null>(null);
  // 单文件配置
  const [enableSingleMeta, setEnableSingleMeta] = useState(false);
  const [singleMetadata, setSingleMetadata] = useState<MetaItem[]>([]);
  const [enableSingleRename, setEnableSingleRename] = useState(false);
  const [singleRenamePrefix, setSingleRenamePrefix] = useState("");
  const [singleRenameNum, setSingleRenameNum] = useState(1);

  // 批量配置
  const [enableBatchMeta, setEnableBatchMeta] = useState(false);
  const [metaEditingLocked, setMetaEditingLocked] = useState(false);
  const [batchMode, setBatchMode] = useState<BatchMode>("edit");
  const [batchMetadata, setBatchMetadata] = useState<MetaItem[]>([]);
  const [consistency, setConsistency] = useState<MetadataConsistency>({
    passed: true,
    message: "",
    inconsistentKeys: new Set<string>(),
  });
  const [showForceClearModal, setShowForceClearModal] = useState(false);

  const [enableBatchRename, setEnableBatchRename] = useState(false);
  const [renamePrefix, setRenamePrefix] = useState("");
  const [renameStartNum, setRenameStartNum] = useState(1);
  const [renameAscending, setRenameAscending] = useState(true);

  const isSingleMode = files.length === 1;
  const isBatchMode = files.length >= 2;

  /** 统一的 files 写入入口，保持 filesRef 与状态同步 */
  const commitFiles = useCallback((next: ProcessedFile[]) => {
    filesRef.current = next;
    setFiles(next);
  }, []);

  /** 导入新图片：重置锁定、计算一致性、按单/批量分派元数据 */
  const applyImportedFiles = useCallback(
    (added: ProcessedFile[]) => {
      if (added.length === 0) return;

      const next = [...filesRef.current, ...added];
      setMetaEditingLocked(false);
      setLastResult(null);

      if (next.length === 1) {
        setSingleMetadata([...next[0].metadata]);
        setConsistency({ passed: true, message: "", inconsistentKeys: new Set() });
        commitFiles(next);
        return;
      }

      const result = checkMetadataConsistency(next.map((item) => item.metadata));
      setConsistency(result);
      if (result.passed) {
        setBatchMetadata([...next[0].metadata]);
      } else {
        setShowForceClearModal(true);
      }

      commitFiles(
        next.map((item) => ({
          ...item,
          status: result.passed ? ("pending" as const) : ("inconsistent" as const),
          errorMessage: result.passed ? undefined : t("toolBox.exif.inconsistent"),
        }))
      );
    },
    [commitFiles, t]
  );

  /** 浏览器上传 / 拖拽：File → ProcessedFile */
  const handleBrowserFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList) return;
      const imageFiles = Array.from(fileList).filter((file) =>
        file.type.startsWith("image/")
      );
      if (imageFiles.length === 0) return;

      const added = await Promise.all(
        imageFiles.map(async (file): Promise<ProcessedFile> => {
          const buffer = await file.arrayBuffer();
          const mimeType = file.type || "image/png";
          return {
            id: createId(),
            name: file.name,
            mimeType,
            buffer,
            preview: URL.createObjectURL(file),
            status: "pending",
            originalSize: file.size,
            metadata: readMetadata(buffer, mimeType),
          };
        })
      );

      applyImportedFiles(added);
    },
    [applyImportedFiles]
  );

  /** 批量导入：选择文件夹 → 读取该文件夹下所有图片 */
  const handleImportFolder = useCallback(async () => {
    const folder = await pickFolder();
    if (!folder) return;

    setInputFolder(folder);
    setImporting(true);
    try {
      const entries = await listImageFiles(folder);
      const added: ProcessedFile[] = [];

      for (const entry of entries) {
        const buffer = await readFileAsArrayBuffer(entry.filePath);
        if (!buffer) continue;
        const mimeType = guessMime(entry.fileName);
        added.push({
          id: createId(),
          name: entry.fileName,
          mimeType,
          buffer,
          preview: URL.createObjectURL(new Blob([buffer], { type: mimeType })),
          status: "pending",
          originalSize: buffer.byteLength,
          metadata: readMetadata(buffer, mimeType),
        });
      }

      applyImportedFiles(added);
    } finally {
      setImporting(false);
    }
  }, [applyImportedFiles]);

  const handlePickOutputFolder = useCallback(async () => {
    const folder = await pickFolder();
    if (folder) setOutputFolder(folder);
  }, []);

  const handleForceClearConfirm = () => {
    setShowForceClearModal(false);
    setEnableBatchMeta(true);
    setMetaEditingLocked(false);
    setBatchMode("add");
    setBatchMetadata([]);
    commitFiles(
      filesRef.current.map((file) => ({
        ...file,
        status: "pending" as const,
        errorMessage: undefined,
      }))
    );
    setConsistency({
      passed: true,
      message: t("toolBox.exif.forceClearBanner"),
      inconsistentKeys: new Set(),
    });
  };

  const handleForceClearCancel = () => {
    setShowForceClearModal(false);
    setEnableBatchMeta(false);
    setMetaEditingLocked(true);
    commitFiles(
      filesRef.current.map((file) => ({
        ...file,
        status: "pending" as const,
        errorMessage: undefined,
      }))
    );
    setConsistency((prev) => ({
      passed: false,
      message: t("toolBox.exif.forceKeepBanner"),
      inconsistentKeys: prev.inconsistentKeys,
    }));
  };

  /** 解析当前应写入的元数据选项（清空优先于写入） */
  const resolveMetadataOptions = () => {
    if (isSingleMode) {
      if (!enableSingleMeta) return { metadata: null, clearMetadata: false };
      if (singleMetadata.length === 0) return { metadata: null, clearMetadata: true };
      return { metadata: singleMetadata, clearMetadata: false };
    }
    if (!enableBatchMeta || metaEditingLocked) {
      return { metadata: null, clearMetadata: false };
    }
    if (batchMode === "clear" || batchMetadata.length === 0) {
      return { metadata: null, clearMetadata: true };
    }
    return { metadata: batchMetadata, clearMetadata: false };
  };

  const handleProcess = async () => {
    if (files.length === 0) return;
    setProcessing(true);
    commitFiles(
      filesRef.current.map((file) => ({ ...file, status: "processing" }))
    );

    const metadataOptions = resolveMetadataOptions();
    const processed: ProcessedFile[] = [];

    files.forEach((file, index) => {
      const rename = isSingleMode
        ? enableSingleRename
          ? { prefix: singleRenamePrefix, sequence: singleRenameNum }
          : null
        : enableBatchRename
          ? {
              prefix: renamePrefix,
              sequence: renameAscending ? renameStartNum + index : renameStartNum - index,
            }
          : null;

      try {
        const result = processImage(
          { buffer: file.buffer, name: file.name, mimeType: file.mimeType },
          { ...metadataOptions, rename }
        );
        processed.push({
          ...file,
          status: "done",
          outputBlob: result.blob,
          cleanSize: result.size,
          finalFileName: result.fileName,
          errorMessage: undefined,
        });
      } catch {
        processed.push({ ...file, status: "error", errorMessage: t("toolBox.exif.processFailed") });
      }
    });

    commitFiles(processed);

    const done = processed.filter((file) => file.status === "done" && file.outputBlob);
    const failed = processed.filter((file) => file.status !== "done");

    if (done.length > 0) {
      if (outputFolder) {
        await writeFilesToFolder(
          outputFolder,
          await Promise.all(
            done.map(async (file) => ({
              filename: file.finalFileName ?? file.name,
              dataBase64: await blobToBase64(file.outputBlob!),
            }))
          )
        );
      } else {
        // 浏览器环境回退：逐个下载
        for (const file of done) {
          const url = URL.createObjectURL(file.outputBlob!);
          const link = document.createElement("a");
          link.href = url;
          link.download = file.finalFileName ?? file.name;
          link.click();
          URL.revokeObjectURL(url);
        }
      }
    }

    // 处理完毕清空队列；若有失败文件则仅保留失败项供用户复查
    done.forEach((file) => URL.revokeObjectURL(file.preview));
    commitFiles(failed);
    setEnableSingleMeta(false);
    setEnableSingleRename(false);
    setEnableBatchMeta(false);
    setEnableBatchRename(false);
    setMetaEditingLocked(false);

    setLastResult({
      success: done.length,
      failed: failed.length,
      savedTo: outputFolder,
    });

    if (failed.length === 0) {
      showToast(
        t("toolBox.exif.toastSaved", {
          count: done.length,
          action: outputFolder
            ? t("toolBox.exif.toastSavedToFolder")
            : t("toolBox.exif.toastDownloaded"),
        }),
        "success"
      );
    } else {
      showToast(
        t("toolBox.exif.toastSuccess", {
          success: done.length,
          failed: failed.length,
        }),
        "error"
      );
    }

    setProcessing(false);
  };

  const handleClear = () => {
    filesRef.current.forEach((file) => URL.revokeObjectURL(file.preview));
    commitFiles([]);
    setEnableSingleMeta(false);
    setEnableSingleRename(false);
    setEnableBatchMeta(false);
    setEnableBatchRename(false);
    setMetaEditingLocked(false);
    setConsistency({ passed: true, message: "", inconsistentKeys: new Set() });
  };

  const singlePreview = useMemo(() => {
    if (files.length !== 1) return null;
    const target = buildRenamedName(files[0].name, singleRenamePrefix, singleRenameNum);
    return (
      <p className="truncate font-mono text-xs text-foreground">
        {files[0].name} → <span className="font-bold text-sky-700 dark:text-sky-300">{target}</span>
      </p>
    );
  }, [files, singleRenamePrefix, singleRenameNum]);

  const batchPreview = useMemo(() => {
    if (files.length < 2) return null;
    return (
      <div className="flex flex-wrap gap-2">
        {files.slice(0, 3).map((file, index) => {
          const sequence = renameAscending
            ? renameStartNum + index
            : renameStartNum - index;
          return (
            <span
              key={file.id}
              className="max-w-[200px] truncate rounded border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
            >
              {file.name} →{" "}
              <span className="font-bold text-sky-700 dark:text-sky-300">
                {buildRenamedName(file.name, renamePrefix, sequence)}
              </span>
            </span>
          );
        })}
      </div>
    );
  }, [files, renamePrefix, renameStartNum, renameAscending]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{t("toolBox.exif.title")}</h2>
        <p className="mt-1 text-muted-foreground">
          {isSingleMode
            ? t("toolBox.exif.subtitleSingle")
            : isBatchMode
              ? t("toolBox.exif.subtitleBatch")
              : t("toolBox.exif.subtitleEmpty")}
        </p>
      </div>

      {lastResult && (
        <div
          className={cn(
            "result-banner-in flex items-start gap-3 rounded-xl border p-4",
            lastResult.failed === 0
              ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300"
              : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          )}
        >
          {lastResult.failed === 0 ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {lastResult.failed === 0
                ? t("toolBox.exif.bannerAllSuccess", { count: lastResult.success })
                : t("toolBox.exif.bannerPartial", {
                    success: lastResult.success,
                    failed: lastResult.failed,
                  })}
            </p>
            <p className="mt-0.5 text-sm">
              {lastResult.failed > 0
                ? t("toolBox.exif.bannerQueueKept")
                : lastResult.savedTo
                  ? t("toolBox.exif.bannerSavedTo", { path: lastResult.savedTo })
                  : t("toolBox.exif.bannerDownloaded")}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("toolBox.exif.closeBanner")}
            onClick={() => setLastResult(null)}
            className="shrink-0 rounded p-1 transition-colors hover:bg-black/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <UploadZone
        isDragging={isDragging}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          void handleBrowserFiles(event.dataTransfer.files);
        }}
        onBrowse={() => fileInputRef.current?.click()}
        onPickInputFolder={handleImportFolder}
        onPickOutputFolder={handlePickOutputFolder}
        inputFolder={inputFolder}
        outputFolder={outputFolder}
        importing={importing}
        isDesktop={isDesktop}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          void handleBrowserFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {isSingleMode && (
        <div className="space-y-4">
          <MetadataEditor
            title={t("toolBox.exif.metadataTitle")}
            enabled={enableSingleMeta}
            onToggle={setEnableSingleMeta}
            items={singleMetadata}
            onChange={setSingleMetadata}
          />
          <RenameConfig
            title={t("toolBox.exif.renameTitle")}
            enabled={enableSingleRename}
            onToggle={setEnableSingleRename}
            prefix={singleRenamePrefix}
            onPrefixChange={setSingleRenamePrefix}
            startNumber={singleRenameNum}
            onStartNumberChange={setSingleRenameNum}
            preview={
              <>
                <p className="mb-2 text-xs font-medium text-muted-foreground">{t("toolBox.exif.renamePreview")}</p>
                {singlePreview}
              </>
            }
          />
        </div>
      )}

      {isBatchMode && (
        <div className="space-y-4">
          <div
            className={`rounded-lg border p-4 ${
              consistency.passed
                ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300"
                : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            }`}
          >
            <div className="flex items-start gap-3">
              {consistency.passed ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
              )}
              <div className="flex-1">
                <p className="font-medium">{consistency.message}</p>
                {!consistency.passed && consistency.inconsistentKeys.size > 0 && (
                  <p className="mt-1 text-sm">
                    {t("toolBox.exif.inconsistentKeys")}{Array.from(consistency.inconsistentKeys).join(", ")}
                  </p>
                )}
              </div>
            </div>
          </div>

          {!metaEditingLocked && (
            <MetadataEditor
              title={t("toolBox.exif.batchMetadataTitle")}
              enabled={enableBatchMeta}
              onToggle={setEnableBatchMeta}
              items={batchMetadata}
              onChange={setBatchMetadata}
              mode={batchMode}
              onModeChange={setBatchMode}
              locked={metaEditingLocked}
            />
          )}

          <RenameConfig
            title={t("toolBox.exif.batchRenameTitle")}
            enabled={enableBatchRename}
            onToggle={setEnableBatchRename}
            prefix={renamePrefix}
            onPrefixChange={setRenamePrefix}
            startNumber={renameStartNum}
            onStartNumberChange={setRenameStartNum}
            ascending={renameAscending}
            onAscendingChange={setRenameAscending}
            preview={
              <>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {t("toolBox.exif.batchRenamePreview")}
                </p>
                {batchPreview}
              </>
            }
          />
        </div>
      )}

      {files.length > 0 && (
        <FileList
          files={files}
          onClear={handleClear}
          onProcess={() => void handleProcess()}
          processing={processing}
          outputFolder={outputFolder}
          canProcess={!files.some((file) => file.status === "inconsistent")}
        />
      )}

      <ForceClearModal
        open={showForceClearModal}
        onConfirm={handleForceClearConfirm}
        onCancel={handleForceClearCancel}
      />
    </div>
  );
}
