"use client";

import { FileWarning, Minus, Plus } from "lucide-react";
import { useTranslation } from "@/i18n";

type RenameConfigProps = {
  title: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  prefix: string;
  onPrefixChange: (value: string) => void;
  startNumber: number;
  onStartNumberChange: (value: number) => void;
  /** 批量模式：排序方向切换 */
  ascending?: boolean;
  onAscendingChange?: (ascending: boolean) => void;
  /** 重命名预览（由父组件渲染，单文件/批量格式不同） */
  preview?: React.ReactNode;
};

function Toggle({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`relative h-5 w-10 cursor-pointer rounded-full transition-colors ${
        checked ? "bg-purple-600" : "bg-gray-300"
      }`}
      onClick={onToggle}
    >
      <div
        className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </div>
  );
}

function NumberStepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="w-32">
      <label className="mb-1 block text-xs font-medium text-gray-500">
        {label}
      </label>
      <div className="flex items-center overflow-hidden rounded-lg border border-gray-300">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          className="border-r border-gray-300 bg-gray-50 px-2 py-2 text-gray-600 hover:bg-gray-100"
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          type="number"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full px-2 py-2 text-center text-sm focus:outline-none"
        />
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="border-l border-gray-300 bg-gray-50 px-2 py-2 text-gray-600 hover:bg-gray-100"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function RenameConfig({
  title,
  enabled,
  onToggle,
  prefix,
  onPrefixChange,
  startNumber,
  onStartNumberChange,
  ascending,
  onAscendingChange,
  preview,
}: RenameConfigProps) {
  const { t } = useTranslation();
  const isBatch = ascending !== undefined;

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <FileWarning className="h-5 w-5 text-purple-600" />
          {title}
        </h3>
        <label className="flex cursor-pointer items-center gap-2">
          <span className="text-sm text-gray-600">{t("toolBox.exif.renameConfig.enable")}</span>
          <Toggle checked={enabled} onToggle={() => onToggle(!enabled)} />
        </label>
      </div>

      {enabled && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-500">
                {t("toolBox.exif.renameConfig.prefixLabel")}
              </label>
              <input
                type="text"
                placeholder={t("toolBox.exif.renameConfig.prefixPlaceholder")}
                value={prefix}
                onChange={(event) => onPrefixChange(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <NumberStepper
              label={isBatch ? t("toolBox.exif.renameConfig.startNumber") : t("toolBox.exif.renameConfig.numberSuffix")}
              value={startNumber}
              onChange={onStartNumberChange}
            />
            {isBatch && onAscendingChange && (
              <div className="w-24">
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  {t("toolBox.exif.renameConfig.direction")}
                </label>
                <button
                  type="button"
                  onClick={() => onAscendingChange(!ascending)}
                  className={`flex w-full items-center justify-center gap-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    ascending
                      ? "border-purple-200 bg-purple-50 text-purple-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  {ascending ? t("toolBox.exif.renameConfig.ascending") : t("toolBox.exif.renameConfig.descending")}
                </button>
              </div>
            )}
          </div>

          {preview && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              {preview}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
