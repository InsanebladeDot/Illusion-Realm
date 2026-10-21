"use client";

import { Grid3x3, List } from "lucide-react";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";

export type ResourceView = "grid" | "list";
interface ResourceViewToggleProps { value: ResourceView; onChange: (value: ResourceView) => void }

// 界面：「网格 / 列表」纯展示切换；帖子、收藏夹传入相同参数复用。
export function ResourceViewToggle({ value, onChange }: ResourceViewToggleProps) {
  const { t } = useTranslation();
  return <div className="inline-flex shrink-0 gap-1 rounded-lg bg-muted p-1">
    {([{ value: "grid", Icon: Grid3x3, key: "profile.tabs.gridView" }, { value: "list", Icon: List, key: "profile.tabs.listView" }] as const).map(item => <button key={item.value} type="button" data-resource-view={item.value} aria-label={t(item.key)} title={t(item.key)} aria-pressed={value === item.value} onClick={() => onChange(item.value)} className={cn("inline-flex h-8 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-accent-stroke", value === item.value ? "bg-background text-foreground shadow-sm" : "hover:text-foreground")}><item.Icon size={16} aria-hidden="true" /></button>)}
  </div>;
}
