"use client";

import { Plus } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "@/i18n";
import type { ExtensionCover, SelectedExtension } from "@/types/extension";
import { SelectedExtensionRow } from "./SelectedExtensionRow";

interface ExtensionDisplay { name: string; cover: ExtensionCover }
interface SelectedExtensionsProps {
  value: SelectedExtension[];
  onChange: Dispatch<SetStateAction<SelectedExtension[]>>;
  onAdd: () => void;
  disabled?: boolean;
  displays?: Record<string, ExtensionDisplay>;
}

export function SelectedExtensions({ value, onChange, onAdd, disabled, displays }: SelectedExtensionsProps) {
  const { t } = useTranslation();
  return <fieldset disabled={disabled} className="min-w-0" data-selected-extensions>
    {/* 界面：已选扩展（LoRA）列表里的一行，图片与视频共用 */}
    {value.map((extension) => <div key={extension.extensionId} data-selected-extension={extension.extensionId}>
      <SelectedExtensionRow extensionId={extension.extensionId} weight={extension.weight} display={displays?.[extension.extensionId]}
        onWeightChange={(weight) => onChange((current) => current.map((item) => item.extensionId === extension.extensionId ? { ...item, weight } : item))}
        onRemove={() => onChange((current) => current.filter((item) => item.extensionId !== extension.extensionId))} />
    </div>)}
    <button type="button" data-extension-picker-trigger onClick={onAdd} className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-3 text-left hover:bg-muted">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        {/* 界面：「添加扩展」按钮左侧的 + 图标 */}
        <Plus className="h-6 w-6 text-muted-foreground/60" />
      </div>
      <div className="text-sm font-medium text-muted-foreground/60">{t("create.page.addExtension")}</div>
    </button>
  </fieldset>;
}
