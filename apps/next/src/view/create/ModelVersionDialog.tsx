"use client";

// 分类下的模型沿用旧版卡片弹窗；Portal 避免创建栏裁切，Esc 只关闭这一层并恢复入口焦点。
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ResourceSelectionCard } from "./resource-selection-card";
import { getResourceDialogTypography } from "@/utils/resourceDialogFontSize";
import { useCreateFormStore } from "@/stores/useCreateFormStore";
import { useTranslation } from "@/i18n";
import { PRIMARY_BUTTON_CLASS, THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";
import type { ModelCover } from "@/types/model";

interface ModelOption { key: string; name: string; label: string; cover: ModelCover }
interface Props {
  title: string; options: ModelOption[]; selectedKeys: string[];
  multiple: boolean;
  onOpenChange: (open: boolean) => void; onSelect: (key: string) => void;
}
function useNestedDialog(close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    // 页面滚动由外层 ResourceDialogShell 锁定；内层重复锁定会在同时关闭时遗留 hidden。
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key !== "Tab") return;
      const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>("button, [tabindex='0']") ?? []);
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [close]);
  return ref;
}
function ModelOptionCard({ option, selected, choose }: { option: ModelOption; selected: boolean; choose: () => void }) {
  const { t } = useTranslation();
  const size = useCreateFormStore((state) => state.resourceDialogFontSize);
  const typography = getResourceDialogTypography(size);
  return <ResourceSelectionCard name={option.name} cover={option.cover} selected={selected} typography={typography}
    optionId={option.key} onPick={choose} meta={option.label !== option.name ? <span title={option.label} className="block truncate">{option.label}</span> : undefined}>
      <button type="button" data-resource-model-select className={cn("mt-3 inline-flex w-full items-center justify-center rounded-xl px-3 font-medium", typography.action, typography.actionHeight, PRIMARY_BUTTON_CLASS)}>
        {t(selected ? "create.extensionSelectDialog.selected" : "create.extensionSelectDialog.select")}
      </button>
  </ResourceSelectionCard>;
}
export function ModelVersionDialog({ title, options, selectedKeys, multiple, onOpenChange, onSelect }: Props) {
  const { t } = useTranslation();
  const ref = useNestedDialog(() => onOpenChange(false));
  return createPortal(<>
    <div data-lora-model-backdrop className="fixed inset-0 z-[95] bg-black/50" aria-hidden onClick={() => onOpenChange(false)} />
    {/* 弹窗：分类内的主模型 / LoRA 卡片，层级高于分类库，窗口标题栏仍在最上方 */}
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="model-version-dialog-title"
      style={{ top: "calc((100dvh + var(--window-chrome-height, 0px)) / 2)" }}
      className={cn("fixed left-1/2 z-[96] flex max-h-[calc(100dvh-var(--window-chrome-height,0px)-2rem)] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-background text-foreground shadow-xl", THIN_BORDER_CLASS)}>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h2 id="model-version-dialog-title" className="min-w-0 flex-1 truncate text-base font-semibold" title={title}>{title}</h2>
        <button type="button" aria-label={t("common.close")} onClick={() => onOpenChange(false)} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div data-resource-model-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="grid auto-rows-max grid-cols-2 items-start gap-x-3 gap-y-7 p-4 pt-7 sm:grid-cols-3">
        {options.map((option) => <ModelOptionCard key={option.key} option={option} selected={selectedKeys.includes(option.key)} choose={() => { onSelect(option.key); if (!multiple) onOpenChange(false); }} />)}
      </div>
      </div>
      {/* 界面：分类内确认只返回分类库，所有模型数据最后由外层 footer 统一提交。 */}
      <div className="shrink-0 border-t border-border px-4 py-3">
        <button type="button" data-resource-model-done onClick={() => onOpenChange(false)} className={cn("ml-auto block h-9 rounded-xl px-4 text-sm font-medium", PRIMARY_BUTTON_CLASS)}>{t("common.confirm")}</button>
      </div>
    </div>
  </>, document.body);
}
