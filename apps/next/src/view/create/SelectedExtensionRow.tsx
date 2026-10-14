"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { getExtensionDisplay } from "@/data/extensions";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { ResourceCoverImage } from "@/components/ResourceCoverImage";
import { useTranslation } from "@/i18n";
import {
  EXTENSION_WEIGHT_MAX,
  EXTENSION_WEIGHT_MIN,
} from "@/types/extension";
import { clampExtensionWeight } from "@/utils/extensionWeight";
import { RangeSlider } from "@/view/create/RangeSlider";

type SelectedExtensionRowProps = {
  extensionId: string;
  weight: number;
  onWeightChange: (weight: number) => void;
  onRemove: () => void;
  display?: Pick<ReturnType<typeof getExtensionDisplay>, "name" | "cover">;
};

export function SelectedExtensionRow({
  extensionId,
  weight,
  onWeightChange,
  onRemove,
  display,
}: SelectedExtensionRowProps) {
  const { t } = useTranslation();
  const localModels = useSettingsStore((state) => state.models);
  const extension = display ?? getExtensionDisplay(extensionId, localModels);
  const [editingWeight, setEditingWeight] = useState(false);
  const [draftWeight, setDraftWeight] = useState("");
  const weightInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editingWeight) return;
    weightInputRef.current?.focus();
    weightInputRef.current?.select();
  }, [editingWeight]);

  const startEditingWeight = () => {
    setDraftWeight(String(weight));
    setEditingWeight(true);
  };

  const commitWeight = () => {
    const parsed = Number.parseFloat(draftWeight);
    if (Number.isFinite(parsed)) {
      onWeightChange(clampExtensionWeight(parsed));
    }
    setEditingWeight(false);
  };

  const cancelEditingWeight = () => {
    setEditingWeight(false);
  };

  return (
    <div className="mb-4">
      <div className="flex w-full items-center gap-3 px-2 py-3">
        <ResourceCoverImage
          cover={extension.cover}
          alt={extension.name}
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded-full object-cover"
        />

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center">
            <div className="mr-2 min-w-0 flex-1">
              <h3
                className="truncate text-sm font-semibold"
                title={extension.name}
              >
                {extension.name}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {editingWeight ? (
              <input
                ref={weightInputRef}
                type="number"
                min={EXTENSION_WEIGHT_MIN}
                max={EXTENSION_WEIGHT_MAX}
                step={0.01}
                value={draftWeight}
                aria-label={t("create.selectedExtensionRow.weightLabel", {
                  name: extension.name,
                })}
                onChange={(event) => setDraftWeight(event.target.value)}
                onBlur={commitWeight}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitWeight();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelEditingWeight();
                  }
                }}
                className="h-6 w-12 shrink-0 rounded border border-input bg-background px-1 text-xs tabular-nums shadow-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            ) : (
              <p className="w-12 shrink-0 text-xs text-muted-foreground">
                <span
                  className="font-normal"
                  onDoubleClick={startEditingWeight}
                  title={t("create.selectedExtensionRow.editWeightHint")}
                >
                  {weight.toFixed(2)}
                </span>
              </p>
            )}
            <RangeSlider
              min={EXTENSION_WEIGHT_MIN}
              max={EXTENSION_WEIGHT_MAX}
              step={0.01}
              value={weight}
              bipolar
              onChange={(next) => onWeightChange(clampExtensionWeight(next))}
              trackClassName="bg-muted"
              fillClassName="bg-green-500"
              thumbClassName="border-4 border-white bg-green-500 shadow-md dark:shadow-none"
            />
          </div>
        </div>

        <button
          type="button"
          aria-label={t("create.selectedExtensionRow.removeLabel", {
            name: extension.name,
          })}
          onClick={onRemove}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md p-0 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
