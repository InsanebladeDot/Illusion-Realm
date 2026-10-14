"use client";

// 界面：搜索左侧的「多选」按钮，未按下为单选；分类内弹窗共享同一个选择模式。
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";

interface Props { multiple: boolean; onChange: (multiple: boolean) => void }
export function ResourceSelectionMode({ multiple, onChange }: Props) {
  const { t } = useTranslation();
  // 复用角色库标题栏的单选 / 多选开关样式；只调整文案，未点击始终是单选。
  return <button type="button" role="switch" data-resource-selection-mode="multiple" aria-label={t("create.resourceSelection.mode")}
        aria-checked={multiple} onClick={() => onChange(!multiple)}
        className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-muted">
        <span aria-hidden className={cn("flex h-4 w-4 items-center justify-center rounded-full border transition-colors", multiple ? "border-accent-stroke bg-accent-fill" : "border-border bg-background")}>
          {multiple && <span className="h-1.5 w-1.5 rounded-full bg-accent-fill-foreground" />}
        </span>
        {t("create.resourceSelection.multiple")}
      </button>;
}
