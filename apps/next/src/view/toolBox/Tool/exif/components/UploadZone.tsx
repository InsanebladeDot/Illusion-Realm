"use client";

import { FolderInput, FolderOutput, Loader2, Upload } from "lucide-react";
import { useTranslation } from "@/i18n";

type UploadZoneProps = {
  isDragging: boolean;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent) => void;
  onBrowse: () => void;
  onPickInputFolder: () => void;
  onPickOutputFolder: () => void;
  inputFolder: string | null;
  outputFolder: string | null;
  importing: boolean;
  isDesktop: boolean;
};

function FolderRow({
  icon,
  label,
  folder,
  buttonText,
  disabled,
  onPick,
}: {
  icon: React.ReactNode;
  label: string;
  folder: string | null;
  buttonText: string;
  disabled: boolean;
  onPick: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="truncate text-sm text-gray-800" title={folder ?? undefined}>
          {folder ?? t("toolBox.exif.uploadZone.none")}
        </p>
      </div>
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {buttonText}
      </button>
    </div>
  );
}

export function UploadZone({
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onBrowse,
  onPickInputFolder,
  onPickOutputFolder,
  inputFolder,
  outputFolder,
  importing,
  isDesktop,
}: UploadZoneProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onBrowse}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition-all duration-200 ${
          isDragging
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300 bg-white hover:border-gray-400"
        }`}
      >
        {importing ? (
          <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-blue-500" />
        ) : (
          <Upload className="mx-auto mb-4 h-12 w-12 text-gray-400" />
        )}
        <p className="text-lg font-medium text-gray-700">
          {importing ? (
            t("toolBox.exif.uploadZone.importing")
          ) : (
            <>
              {t("toolBox.exif.uploadZone.dropHint")}{" "}
              <span className="text-blue-600">{t("toolBox.exif.uploadZone.browse")}</span>
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <FolderRow
          icon={<FolderInput className="h-4 w-4" />}
          label={t("toolBox.exif.uploadZone.inputFolderLabel")}
          folder={inputFolder}
          buttonText={t("toolBox.exif.uploadZone.pickFolder")}
          disabled={!isDesktop || importing}
          onPick={onPickInputFolder}
        />
        <FolderRow
          icon={<FolderOutput className="h-4 w-4" />}
          label={t("toolBox.exif.uploadZone.outputFolderLabel")}
          folder={outputFolder}
          buttonText={t("toolBox.exif.uploadZone.pickFolder")}
          disabled={!isDesktop || importing}
          onPick={onPickOutputFolder}
        />
      </div>

      {!isDesktop && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {t("toolBox.exif.uploadZone.desktopOnly")}
        </p>
      )}
    </div>
  );
}
