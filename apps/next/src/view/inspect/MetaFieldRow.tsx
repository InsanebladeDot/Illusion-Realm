"use client";

import { Copy } from "lucide-react";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import type { SdImageMetaField } from "@/types/sdImageMeta";
import {
  META_FIELD_ID,
  metaFieldLabelKey,
} from "@/utils/sdImageInspector/metaFieldId";
import { THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

export function MetaFieldRow({ field }: { field: SdImageMetaField }) {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.show);

  /**
   * 字段名分两类：我们合成的用标识（取词条展示），文件自带的块关键字 / EXIF 标签名
   * 按原样展示。以前这里直接渲染中文字段名，等于让数据层兼当文案层。
   */
  const labelKey = metaFieldLabelKey(field.key);
  const label = labelKey ? t(labelKey) : field.key;

  const handleCopy = async () => {
    try {
      const text =
        field.json != null ? JSON.stringify(field.json, null, 2) : field.value;
      await navigator.clipboard.writeText(text);
      showToast(t("inspect.metaField.copied", { key: label }));
    } catch {
      showToast(t("common.copyFailed"));
    }
  };

  // 可复制的是「有完整文本可拿」的那几类：描述 / ComfyUI 的 Comment 块，
  // 以及我们自己合成的提示词、反向提示词与完整生成信息
  const copyable =
    field.key === "Description" ||
    field.key === "Comment" ||
    field.key === META_FIELD_ID.rawParameters ||
    field.key === META_FIELD_ID.prompt ||
    field.key === META_FIELD_ID.negativePrompt;

  return (
    <div className={cn("rounded-lg bg-muted/40 p-3", THIN_BORDER_CLASS)}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        {copyable ? (
          <button
            type="button"
            aria-label={t("inspect.metaField.copyLabel", { key: label })}
            onClick={handleCopy}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Copy className="h-3 w-3" />
          </button>
        ) : null}
      </div>
      {field.json != null ? (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-background/60 p-2 text-xs leading-relaxed">
          {JSON.stringify(field.json, null, 2)}
        </pre>
      ) : (
        <p className="whitespace-pre-wrap break-all text-sm leading-relaxed text-foreground/90">
          {field.value}
        </p>
      )}
    </div>
  );
}
