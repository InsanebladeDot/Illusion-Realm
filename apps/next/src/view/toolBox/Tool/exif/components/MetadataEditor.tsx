"use client";

import { Edit2, Lock, Plus, Trash2 } from "lucide-react";
import { useTranslation, type MessageKey } from "@/i18n";
import type { BatchMode, MetaItem } from "@/view/toolBox/Tool/exif/types";

/**
 * 模式标签：模块级常量里存**词条 key**，渲染时用组件里的 t 取文案。
 * 这里不能直接用模块级 t —— 会被组件内的 `const { t } = useTranslation()` 遮蔽，
 * 而且模块级求值会冻结在 import 时刻，切换语言后不会更新。
 */
const MODE_LABELS: Record<BatchMode, MessageKey> = {
  edit: "toolBox.exif.metadataEditor.modeEdit",
  add: "toolBox.exif.metadataEditor.modeAdd",
  clear: "toolBox.exif.metadataEditor.modeClear",
};

const BATCH_MODES: BatchMode[] = ["edit", "add", "clear"];

type MetadataEditorProps = {
  title: string;
  /** 是否启用元数据编辑 */
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  items: MetaItem[];
  onChange: (items: MetaItem[]) => void;
  /** 传入表示批量模式：显示 编辑/添加/清除 切换 */
  mode?: BatchMode;
  onModeChange?: (mode: BatchMode) => void;
  /** 批量模式下元数据被锁定（结构不一致且选择保留原样） */
  locked?: boolean;
};

function Toggle({
  checked,
  activeClass,
  onToggle,
}: {
  checked: boolean;
  activeClass: string;
  onToggle: () => void;
}) {
  return (
    <div
      className={`relative h-5 w-10 cursor-pointer rounded-full transition-colors ${
        checked ? activeClass : "bg-gray-300"
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

export function MetadataEditor({
  title,
  enabled,
  onToggle,
  items,
  onChange,
  mode,
  onModeChange,
  locked = false,
}: MetadataEditorProps) {
  const { t } = useTranslation();
  const isBatch = mode !== undefined;
  const showList = !isBatch || mode !== "clear";

  const updateItem = (index: number, patch: Partial<MetaItem>) => {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <Edit2 className="h-5 w-5 text-blue-600" />
          {title}
          {locked && (
            <span className="ml-2 flex items-center gap-1 text-xs font-normal text-amber-600">
              <Lock className="h-3 w-3" /> {t("toolBox.exif.metadataEditor.locked")}
            </span>
          )}
        </h3>
        <label className="flex cursor-pointer items-center gap-2">
          <span className="text-sm text-gray-600">{t("toolBox.exif.metadataEditor.enable")}</span>
          <Toggle
            checked={enabled}
            activeClass="bg-blue-600"
            onToggle={() => onToggle(!enabled)}
          />
        </label>
      </div>

      {enabled && (
        <div className="space-y-3">
          {isBatch && onModeChange && (
            <div className="flex gap-2">
              {BATCH_MODES.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => onModeChange(item)}
                  className={`rounded-lg px-4 py-2 font-medium transition-colors ${
                    mode === item
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {t(MODE_LABELS[item])}
                </button>
              ))}
            </div>
          )}

          {showList && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" /> {t("toolBox.exif.metadataEditor.clearAll")}
                </button>
              </div>

              {items.length === 0 && (
                <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-4 text-center text-sm text-gray-500">
                  {t("toolBox.exif.metadataEditor.emptyHint")}
                </p>
              )}

              {items.map((item, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 rounded-lg bg-gray-50 p-3"
                >
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      placeholder={t("toolBox.exif.metadataEditor.keyPlaceholder")}
                      value={item.key}
                      onChange={(event) =>
                        updateItem(index, { key: event.target.value })
                      }
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <textarea
                      placeholder={t("toolBox.exif.metadataEditor.valuePlaceholder")}
                      value={item.value}
                      rows={2}
                      onChange={(event) =>
                        updateItem(index, { value: event.target.value })
                      }
                      className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => onChange(items.filter((_, i) => i !== index))}
                    className="rounded p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => onChange([...items, { key: "", value: "" }])}
                className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                <Plus className="h-4 w-4" /> {t("toolBox.exif.metadataEditor.addField")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
