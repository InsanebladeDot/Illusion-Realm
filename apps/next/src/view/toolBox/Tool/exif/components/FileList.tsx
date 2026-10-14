"use client";

import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileWarning,
  Trash2,
  X,
} from "lucide-react";
import { useTranslation } from "@/i18n";
import { formatBytes } from "@/utils/exif/format";
import type { ProcessedFile } from "@/view/toolBox/Tool/exif/types";

type FileListProps = {
  files: ProcessedFile[];
  onClear: () => void;
  onProcess: () => void;
  processing: boolean;
  /** 已选择的输出文件夹；未选择时回退为浏览器下载 */
  outputFolder: string | null;
  canProcess: boolean;
};

function StatusIcon({ status }: { status: ProcessedFile["status"] }) {
  if (status === "processing") {
    return (
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
    );
  }
  if (status === "done") return <CheckCircle2 className="h-5 w-5 text-green-500" />;
  if (status === "inconsistent")
    return <AlertCircle className="h-5 w-5 text-amber-500" />;
  if (status === "error") return <X className="h-5 w-5 text-red-500" />;
  return null;
}

export function FileList({
  files,
  onClear,
  onProcess,
  processing,
  outputFolder,
  canProcess,
}: FileListProps) {
  const { t } = useTranslation();

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-6 py-4">
        <h3 className="font-semibold text-foreground">
          {t("toolBox.exif.fileList.listLabel")}{files.length})
        </h3>
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700 dark:text-red-300"
        >
          <Trash2 className="h-4 w-4" /> {t("toolBox.exif.fileList.clear")}
        </button>
      </div>

      <div className="max-h-96 divide-y divide-border overflow-y-auto">
        {files.map((file) => (
          <div
            key={file.id}
            className="flex items-center gap-4 p-4 transition-colors hover:bg-muted/40"
          >
            <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={file.preview} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {file.name}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatBytes(file.originalSize)}
                {file.cleanSize !== undefined && (
                  <span className="ml-2">→ {formatBytes(file.cleanSize)}</span>
                )}
                {file.metadata.length > 0 && (
                  <span className="ml-2">• {file.metadata.length} {t("toolBox.exif.fileList.fieldUnit")}</span>
                )}
              </p>
              {file.errorMessage && (
                <p className="mt-1 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                  <FileWarning className="h-3 w-3" /> {file.errorMessage}
                </p>
              )}
            </div>
            <StatusIcon status={file.status} />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/40 p-4">
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {outputFolder
            ? t("toolBox.exif.fileList.outputTo", { path: outputFolder })
            : t("toolBox.exif.fileList.noOutputFolder")}
        </p>
        <button
          type="button"
          onClick={onProcess}
          disabled={!canProcess || processing}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-5 w-5" />
          {processing
            ? t("toolBox.exif.fileList.processing")
            : outputFolder
              ? t("toolBox.exif.fileList.processAndSave", { count: files.length })
              : t("toolBox.exif.fileList.processAndDownload", { count: files.length })}
        </button>
      </div>
    </div>
  );
}
