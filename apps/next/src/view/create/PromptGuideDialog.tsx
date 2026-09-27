"use client";

import { BookOpen } from "lucide-react";
import { DocumentDialog } from "@/components/DocumentDialog";
import { MarkdownDocument } from "@/components/MarkdownDocument";
import { getPromptGuide, type PromptGuideSeries } from "@/data/promptGuides";
import { useTranslation } from "@/i18n";
import { INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type PromptGuideDialogProps = {
  open: boolean;
  series: PromptGuideSeries;
  onOpenChange: (open: boolean) => void;
};

/** 提示词教程弹框：内容随模型系列（Anima / SDXL）切换，正文为内置静态 md 文档 */
export function PromptGuideDialog({
  open,
  series,
  onOpenChange,
}: PromptGuideDialogProps) {
  const { t } = useTranslation();
  const guide = getPromptGuide(series);

  return (
    <DocumentDialog
      open={open}
      eyebrow={t("create.promptGuideDialog.eyebrow")}
      title={t(guide.title)}
      titleId="prompt-guide-dialog-title"
      onClose={() => onOpenChange(false)}
    >
      <MarkdownDocument markdown={guide.markdown} />
    </DocumentDialog>
  );
}

type PromptGuideButtonProps = {
  series: PromptGuideSeries;
  onClick: () => void;
};

/** 「如何为 X 编写提示词？」入口按钮（文案随系列切换） */
export function PromptGuideButton({ series, onClick }: PromptGuideButtonProps) {
  const { t } = useTranslation();
  const guide = getPromptGuide(series);

  return (
    <button
      type="button"
      data-prompt-guide-series={series}
      onClick={onClick}
      className={cn(
        "inline-flex h-6 items-center justify-center gap-1.5 rounded-md bg-background px-2 text-xs font-medium text-muted-foreground shadow-none transition-colors hover:bg-accent hover:text-foreground",
        INPUT_BORDER_CLASS
      )}
    >
      <BookOpen className="h-3.5 w-3.5" />
      <span>{t(guide.title)}</span>
    </button>
  );
}
