"use client";

import { useMemo, useState } from "react";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import type { SdImageMetaField } from "@/types/sdImageMeta";
import {
  META_FIELD_ID,
  metaFieldLabelKey,
} from "@/utils/sdImageInspector/metaFieldId";
import { THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";
import { formatMetaFieldJson } from "@/utils/sdImageInspector/formatMetaField";
import { MetaFieldActions, MetaFieldContent, MetaFieldDialog, type MetaFieldViewMode } from "./meta-field-viewer";

const TEXT_VIEW_FIELDS: ReadonlySet<string> = new Set(["prompt", "Description", "Comment", META_FIELD_ID.rawParameters, META_FIELD_ID.prompt, META_FIELD_ID.negativePrompt]);

function useMetaFieldView(field: SdImageMetaField) {
  const { t } = useTranslation(), showToast = useToastStore(state => state.show);
  const [mode, setMode] = useState<MetaFieldViewMode>("raw"), [expanded, setExpanded] = useState(false);
  const formatted = useMemo(() => formatMetaFieldJson(field), [field]);
  // 合成字段取词条；文件自带的 PNG 块关键字原样展示。
  const labelKey = metaFieldLabelKey(field.key), label = labelKey ? t(labelKey) : field.key;
  const activeMode: MetaFieldViewMode = mode === "json" && formatted !== null ? "json" : "raw";
  const text = activeMode === "json" ? formatted ?? field.value : field.value;
  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(text); showToast(t("inspect.metaField.copied", { key: label })); }
    catch { showToast(t("common.copyFailed")); }
  };
  const viewable = formatted !== null || TEXT_VIEW_FIELDS.has(field.key);
  const actions = { mode: activeMode, hasJson: formatted !== null, label, onModeChange: setMode, onCopy: () => { void handleCopy(); } };
  return { actions, text, viewable, expanded, setExpanded };
}

export function MetaFieldRow({ field }: { field: SdImageMetaField }) {
  const { actions, text, viewable, expanded, setExpanded } = useMetaFieldView(field);
  return (
    <div data-meta-field={field.key} className={cn("min-w-0 rounded-lg bg-muted/40 p-3", THIN_BORDER_CLASS)}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 break-all text-xs font-medium text-muted-foreground">{actions.label}</div>
        {viewable && <MetaFieldActions {...actions} onExpand={() => setExpanded(true)} />}
      </div>
      <MetaFieldContent text={text} mode={actions.mode} compact={viewable} />
      {/* 弹窗：当前字段全文，保持原始/JSON 选择同步。 */}
      {expanded && <MetaFieldDialog {...actions} text={text} onClose={() => setExpanded(false)} />}
    </div>
  );
}
