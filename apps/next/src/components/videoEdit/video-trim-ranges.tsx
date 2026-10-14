"use client";

/** 同源视频区间切换栏：按处理列表顺序显示，新增区间复用源视频，无需再次导入。 */
import { Plus } from "lucide-react";
import { useTranslation } from "@/i18n";
import { formatTime } from "@/utils/video/time";
import type { ClipItem } from "./types";

interface VideoTrimRangesProps {
  ranges: ClipItem[];
  selectedId: string;
  disabled: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
}

export function VideoTrimRanges({ ranges, selectedId, disabled, onSelect, onAdd }: VideoTrimRangesProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={t("toolBox.video.rangeList")}>
      <span className="text-xs text-muted-foreground">{t("toolBox.video.sourceRanges", { count: ranges.length })}</span>
      {ranges.map((range, index) => (
        <button key={range.id} type="button" disabled={disabled} onClick={() => onSelect(range.id)}
          aria-pressed={range.id === selectedId} title={`${formatTime(range.trim.start, true)} → ${formatTime(range.trim.end, true)}`}
          className={`rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:opacity-40 ${range.id === selectedId
            ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
          {t("toolBox.video.rangeLabel", { index: index + 1 })}
        </button>
      ))}
      {/* 界面：「添加剪切区间」按钮 */}
      <button type="button" disabled={disabled} onClick={onAdd}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40">
        <Plus className="h-3.5 w-3.5" />{t("toolBox.video.addRange")}
      </button>
    </div>
  );
}
