"use client";

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Film, GripVertical, Trash2 } from "lucide-react";
import { useTranslation } from "@/i18n";
import { formatBytes } from "@/utils/format";
import { formatTime } from "@/utils/video/time";
import type { ClipItem } from "@/components/videoEdit/types";

type ClipPlaylistProps = {
  clips: ClipItem[];
  selectedId: string | null;
  disabled?: boolean;
  onSelect: (id: string) => void;
  onReorder: (clips: ClipItem[]) => void;
  onRemove: (id: string) => void;
};

function SortableClipCard({
  clip,
  index,
  selected,
  disabled,
  onSelect,
  onRemove,
}: {
  clip: ClipItem;
  index: number;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: clip.id, disabled });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-xl border bg-white p-3 transition-colors ${
        selected ? "border-blue-500 ring-1 ring-blue-500" : "border-gray-200"
      } ${isDragging ? "z-10 shadow-lg" : ""}`}
    >
      <button
        type="button"
        aria-label={t("toolBox.videoEdit.playlist.dragHandle")}
        disabled={disabled}
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 active:cursor-grabbing disabled:opacity-40"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xs font-bold text-blue-600">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <Film className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span className="truncate text-sm font-medium text-gray-900" title={clip.path}>
              {clip.name}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-gray-500">
            {t("toolBox.videoEdit.playlist.trimPrefix")}{" "}
            {formatTime(clip.trim.start, true)} → {formatTime(clip.trim.end, true)}
            （{formatTime(Math.max(0, clip.trim.end - clip.trim.start), true)}）
            · {clip.width}×{clip.height} · {formatBytes(clip.size)}
            {clip.hasAudio ? "" : t("toolBox.videoEdit.playlist.noAudio")}
          </span>
        </span>
      </button>

      <button
        type="button"
        aria-label={t("toolBox.videoEdit.playlist.remove")}
        disabled={disabled}
        onClick={onRemove}
        className="shrink-0 rounded p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
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
  onSelect,
  onReorder,
  onRemove,
}: ClipPlaylistProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = clips.findIndex((clip) => clip.id === active.id);
    const newIndex = clips.findIndex((clip) => clip.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    onReorder(arrayMove(clips, oldIndex, newIndex));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={clips.map((clip) => clip.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          {clips.map((clip, index) => (
            <SortableClipCard
              key={clip.id}
              clip={clip}
              index={index}
              selected={clip.id === selectedId}
              disabled={disabled}
              onSelect={() => onSelect(clip.id)}
              onRemove={() => onRemove(clip.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
