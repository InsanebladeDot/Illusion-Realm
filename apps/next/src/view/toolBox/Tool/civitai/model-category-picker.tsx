"use client";

import { SimpleSelect } from "@/components/SimpleSelect";
import { useTranslation } from "@/i18n";

interface CategoryProps {
  id: string; category: string; custom: boolean; categories: string[]; valid: boolean;
  hint?: string; onSelect: (value: string) => void; onInput: (value: string) => void;
}
export function ModelCategoryPicker({ id, category, custom, categories, valid, hint, onSelect, onInput }: CategoryProps) {
  const { t } = useTranslation();
  return <section className="space-y-2"><label className="text-xs font-medium" htmlFor={id}>{t("toolBox.civitai.localCategory")}</label>
    <SimpleSelect value={custom ? "/custom" : category} ariaLabel={t("toolBox.civitai.localCategory")} onChange={onSelect} options={[...new Set(["Uncategorized", ...categories])].map((value) => ({ value, label: value })).concat([{ value: "/custom", label: t("toolBox.civitai.transfer.newCategory") }])} portal />
    {custom && <input id={id} value={category} maxLength={120} onChange={(event) => onInput(event.target.value)} placeholder={t("toolBox.civitai.transfer.categoryPlaceholder")} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary" />}
    {!valid && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{t("toolBox.civitai.transfer.invalidCategory")}</p>}
    {hint && <p className="text-[10px] leading-relaxed text-muted-foreground">{hint}</p>}
  </section>;
}
