"use client";

// 视频与提示词共用同一拖拽容器；片段卡片的选择、删除仍由本组件负责。
import { SortableList } from "@/components/sortable-list";
import { arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Film, GripVertical, Trash2 } from "lucide-react";
import { useTranslation } from "@/i18n";
import { formatBytes } from "@/utils/format";
import { formatTime } from "@/utils/video/time";
import { getClipEffects, getClipOutputDuration } from "@/utils/video/clip-effects";
import type { ClipItem } from "@/components/videoEdit/types";

type ClipPlaylistProps = {
  clips: ClipItem[];
  selectedId: string | null;
  disabled?: boolean;
  /** 视频剪辑页为同一来源的多个区间显示区间序号。 */
  showRanges?: boolean;
  onSelect: (id: string) => void;
  onReorder: (clips: ClipItem[]) => void;
  onRemove: (id: string) => void;
  onContextMenu?: (event: React.MouseEvent<HTMLElement>, id: string) => void;
};

function SortableClipCard({
  clip,
  index,
  selected,
  disabled,
  onSelect,
  onRemove,
  rangeIndex,
  onContextMenu,
}: {
  clip: ClipItem;
  index: number;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onRemove: () => void;
  rangeIndex?: number;
  onContextMenu?: (event: React.MouseEvent<HTMLElement>) => void;
}) {
  const { t } = useTranslation();
  const effects = getClipEffects(clip);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: clip.id, disabled });

  return (
    <div
      ref={setNodeRef}
      onContextMenu={event => { if (!disabled) onContextMenu?.(event); }}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-xl border bg-background p-3 transition-colors ${
        selected ? "border-blue-500 ring-1 ring-blue-500" : "border-border"
      } ${isDragging ? "z-10 shadow-lg" : ""}`}
    >
      <button
        type="button"
        aria-label={t("toolBox.videoEdit.playlist.dragHandle")}
        disabled={disabled}
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted hover:text-muted-foreground active:cursor-grabbing disabled:opacity-40"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-xs font-bold text-blue-700 dark:text-blue-300">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <Film className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-medium text-foreground" title={clip.path}>
              {clip.name}
            </span>
            {rangeIndex !== undefined && (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {t("toolBox.video.rangeLabel", { index: rangeIndex })}
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {t("toolBox.videoEdit.playlist.trimPrefix")}{" "}
            {formatTime(clip.trim.start, true)} → {formatTime(clip.trim.end, true)}
            （{formatTime(Math.max(0, clip.trim.end - clip.trim.start), true)}）
            · {clip.width}×{clip.height} · {formatBytes(clip.size)}
            {clip.hasAudio ? "" : t("toolBox.videoEdit.playlist.noAudio")}
            {rangeIndex !== undefined && <span className="ml-2 text-primary" data-clip-effects={clip.id}>
              {t("toolBox.video.clipMenu.effects", { speed: effects.speed, volume: Math.round(effects.volume * 100) })}
              {effects.muted && ` · ${t("toolBox.video.clipMenu.mutedLabel")}`}
              {effects.reverse && ` · ${t("toolBox.video.clipMenu.reverseLabel")}`}
              {` · ${formatTime(getClipOutputDuration(clip), true)}`}
            </span>}
          </span>
        </span>
      </button>

      <button
        type="button"
        aria-label={t("toolBox.videoEdit.playlist.remove")}
        disabled={disabled}
        onClick={onRemove}
        className="shrink-0 rounded p-2 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-700 dark:text-red-300 disabled:opacity-40"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

/** 片段列表：拖拽卡片即可调整拼接顺序，点击卡片可编辑该片段的剪切区间 */
export function ClipPlaylist({
  clips,
  selectedId,
  disabled = false,
  showRanges = false,
  onSelect,
  onReorder,
  onRemove,
  onContextMenu,
}: ClipPlaylistProps) {
  // 回调只提供稳定身份；从当前 clips 重新定位，不使用拖起时的旧下标。
  // 视频仍把完整片段交回原业务，保留剪切范围和特效等视频专有字段。
  // 视频与 GIF 都继续使用这份片段列表。
  // 它们的导入、预览、剪切和导出不进入公共拖拽容器。
  // 原有 onReorder 仍收到 ClipItem 数组，调用方不用改变业务契约。
  // 当前片段依旧由 selectedId 定位，列表换位不把选中身份改成数组下标。
  // 同一视频的多个剪切区间有各自 id，按路径排序会把它们错误地合并。
  // 所以起止定位仍使用 clip.id，路径只用于视频业务显示与范围编号。
  // arrayMove 沿用原算法，公共部分的抽取不重新解释拼接先后。
  // 找不到起点或终点时不调用业务回调，保持原有片段集合。
  // 父页可以在 onReorder 中调整首段相关设置，这个既有责任没有挪到公共组件。
  // 卡片的 useSortable 仍注册完整行，碰撞尺寸不会退化成小手柄宽度。
  // 原有 disabled 一并传进容器，忙碌时不只禁用删除与选中。
  // 上下文菜单继续由本卡片负责，共享排序不拦截右键业务事件。
  const handleMove = (activeId: string, overId: string) => {
    const oldIndex = clips.findIndex((clip) => clip.id === activeId);
    const newIndex = clips.findIndex((clip) => clip.id === overId);
    if (oldIndex < 0 || newIndex < 0) return;

    onReorder(arrayMove(clips, oldIndex, newIndex));
  };

  return (
    <SortableList ids={clips.map(clip => clip.id)} layout="vertical" disabled={disabled} onMove={handleMove}>
        <div className="space-y-2">
          {clips.map((clip, index) => (
            <SortableClipCard
              key={clip.id}
              clip={clip}
              index={index}
              selected={clip.id === selectedId}
              disabled={disabled}
              rangeIndex={showRanges ? clips.slice(0, index + 1).filter((item) => item.path === clip.path).length : undefined}
              onSelect={() => onSelect(clip.id)}
              onRemove={() => onRemove(clip.id)}
              onContextMenu={event => onContextMenu?.(event, clip.id)}
            />
          ))}
        </div>
    </SortableList>
  );
}
