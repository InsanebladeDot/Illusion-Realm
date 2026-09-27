"use client";

import type { ReactNode } from "react";
import { CheckCircle2, Download, FolderOutput, Loader2, X } from "lucide-react";
import { useTranslation } from "@/i18n";

type ExportPanelProps = {
  /** 输出文件夹（未选择时展示占位说明） */
  outputFolder: string | null;
  /** 自定义文件名（受控输入框的原始值，不在此处补扩展名，避免打断输入） */
  outputFileName: string;
  /**
   * 固定扩展名（如 GIF 只能导出 .gif）：设置后输入框只编辑**前缀名**，
   * 扩展名以固定后缀展示，用户无需（也无法）改错。
   */
  fileNameSuffix?: string;
  /** 实际写盘时使用的文件名（可能补了扩展名），与输入框不同时提示 */
  resolvedFileName?: string;
  running: boolean;
  progress: number;
  isDesktop: boolean;
  resultPath: string | null;
  /** 标题，默认「导出」 */
  heading?: string;
  /** 标题右侧的说明文案（如「将按列表顺序拼接 2 个片段」） */
  hint?: string;
  /** 额外的参数控件（如「精确剪切」开关），渲染在输出位置之前 */
  extra?: ReactNode;
  /** 未选择输出文件夹时的占位说明 */
  emptyFolderHint?: string;
  /** 处理中的文案前缀，默认「正在处理…」 */
  runningLabel?: string;
  /** 文件名是否被用户改过（决定是否显示「恢复自动命名」） */
  fileNameCustomized?: boolean;
  onFileNameChange: (value: string) => void;
  onResetFileName: () => void;
  onPickFolder: () => void;
  onRun: () => void;
  onCancel: () => void;
  onOpenResult: () => void;
};

/**
 * 导出面板：选择**输出文件夹**（可反复更换）+ 可自定义文件名；
 * 未选择文件夹时点击「开始处理」会弹出系统保存文件对话框。
 * 视频剪辑与 GIF 制作共用。
 */
export function ExportPanel({
  outputFolder,
  outputFileName,
  fileNameSuffix,
  resolvedFileName,
  running,
  progress,
  isDesktop,
  resultPath,
  heading,
  hint,
  extra,
  emptyFolderHint,
  runningLabel,
  fileNameCustomized = false,
  onFileNameChange,
  onResetFileName,
  onPickFolder,
  onRun,
  onCancel,
  onOpenResult,
}: ExportPanelProps) {
  const { t } = useTranslation();

  /**
   * 三个可选文案的回退值从「参数默认值」挪到这里：
   * 参数默认值在函数体外求值，拿不到 hook 的 t，只能硬编码中文。
   * 语义不变 —— 未传时仍渲染同一句话，只是现在来自词条表。
   */
  const headingText = heading ?? t("toolBox.videoEdit.exportPanel.headingDefault");
  const emptyFolderText =
    emptyFolderHint ?? t("toolBox.videoEdit.exportPanel.emptyFolderHintDefault");
  const runningText =
    runningLabel ?? t("toolBox.videoEdit.exportPanel.runningLabelDefault");

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
      <header className="border-b border-gray-100 pb-3">
        <h3 className="text-base font-semibold text-gray-900">
          {headingText}
          {hint && (
            <span className="ml-2 text-xs font-normal text-gray-500">{hint}</span>
          )}
        </h3>
      </header>

      {extra}

      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3">
          <FolderOutput className="h-4 w-4 shrink-0 text-gray-500" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-gray-500">
              {t("toolBox.videoEdit.exportPanel.folderLabel")}
            </p>
            <p className="truncate text-sm text-gray-800" title={outputFolder ?? undefined}>
              {outputFolder ?? emptyFolderText}
            </p>
          </div>
          <button
            type="button"
            onClick={onPickFolder}
            disabled={!isDesktop || running}
            className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            {outputFolder
              ? t("toolBox.videoEdit.exportPanel.changeFolder")
              : t("toolBox.videoEdit.exportPanel.pickFolder")}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <label
            htmlFor="export-file-name"
            className="shrink-0 text-xs font-medium text-gray-500"
          >
            {t("toolBox.videoEdit.exportPanel.fileNameLabel")}
          </label>
          <div className="flex h-9 min-w-0 flex-1 items-stretch overflow-hidden rounded-lg border border-gray-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
            <input
              id="export-file-name"
              type="text"
              value={outputFileName}
              disabled={running}
              onChange={(event) => onFileNameChange(event.target.value)}
              placeholder={
                fileNameSuffix
                  ? t("toolBox.videoEdit.exportPanel.fileNamePrefixPlaceholder")
                  : t("toolBox.videoEdit.exportPanel.fileNamePlaceholder")
              }
              className="min-w-0 flex-1 bg-transparent px-3 text-sm focus:outline-none disabled:opacity-60"
            />
            {fileNameSuffix && (
              <span className="flex shrink-0 items-center border-l border-gray-200 bg-gray-50 px-2.5 text-sm text-gray-500">
                {fileNameSuffix}
              </span>
            )}
          </div>
          {fileNameCustomized && (
            <button
              type="button"
              onClick={onResetFileName}
              disabled={running}
              className="shrink-0 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              {t("toolBox.videoEdit.exportPanel.resetFileName")}
            </button>
          )}
        </div>

        <p className="text-xs text-gray-500">
          {outputFolder
            ? t("toolBox.videoEdit.exportPanel.folderHint")
            : t("toolBox.videoEdit.exportPanel.noFolderHint")}
        </p>

        {resolvedFileName && resolvedFileName !== outputFileName && (
          <p className="truncate text-xs text-gray-500" title={resolvedFileName}>
            {t("toolBox.videoEdit.exportPanel.resolvedPrefix")}
            <span className="text-gray-700">{resolvedFileName}</span>
          </p>
        )}
      </div>

      {running && (
        <div className="space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-blue-600 transition-[width] duration-300 ease-out"
              style={{ width: `${Math.max(2, progress)}%` }}
            />
          </div>
          <p className="text-xs text-gray-500">
            {runningText} {progress}%
          </p>
        </div>
      )}

      {resultPath && !running && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate" title={resultPath}>
            {t("toolBox.videoEdit.exportPanel.donePrefix")}{resultPath}
          </span>
          <button
            type="button"
            onClick={onOpenResult}
            className="shrink-0 rounded border border-green-300 bg-white px-2 py-1 text-xs font-medium hover:bg-green-100"
          >
            {t("toolBox.videoEdit.exportPanel.openFolder")}
          </button>
        </div>
      )}

      <div className="flex justify-end gap-2">
        {running ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <X className="h-4 w-4" />
            {t("common.cancel")}
          </button>
        ) : (
          <button
            type="button"
            onClick={onRun}
            disabled={!isDesktop}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {/* 转圈只在任务真正进行时出现：完成后按进度值判断会一直转 */}
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {t("toolBox.videoEdit.exportPanel.run")}
          </button>
        )}
      </div>
    </section>
  );
}
