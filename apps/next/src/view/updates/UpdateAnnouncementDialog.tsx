"use client";

import Link from "next/link";
import { X } from "lucide-react";
import type { ChangelogSection } from "@/types/changelog";
import { useTranslation } from "@/i18n";
import {
  PRIMARY_BUTTON_CLASS,
  THIN_BORDER_CLASS,
} from "@/utils/layout";
import { cn } from "@/utils/cn";
import { ChangelogSectionBody } from "@/view/updates/ChangelogSectionBody";

type UpdateAnnouncementDialogProps = {
  open: boolean;
  section: ChangelogSection | null;
  onDismiss: () => void;
};

export function UpdateAnnouncementDialog({
  open,
  section,
  onDismiss,
}: UpdateAnnouncementDialogProps) {
  const { t } = useTranslation();

  if (!open || !section) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[88] bg-black/50"
        aria-hidden
        onClick={onDismiss}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-announcement-title"
        className={cn(
          "fixed left-1/2 top-1/2 z-[89] flex max-h-[min(85dvh,calc(100vh-2rem))] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-background shadow-lg outline-none dark:bg-muted",
          THIN_BORDER_CLASS
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("updates.title")}
            </p>
            <h2
              id="update-announcement-title"
              className="mt-1 text-base font-semibold leading-snug"
            >
              {section.title}
            </h2>
          </div>
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={onDismiss}
            className="shrink-0 rounded-sm opacity-70 transition-opacity hover:opacity-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-gutter:stable]">
          <ChangelogSectionBody lines={section.bodyLines} />
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border/60 px-5 py-4 sm:flex-row sm:justify-end">
          <Link
            href="/updates"
            onClick={onDismiss}
            className="inline-flex h-9 items-center justify-center rounded-xl px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {t("updates.announcement.viewAll")}
          </Link>
          <button
            type="button"
            onClick={onDismiss}
            className={cn(
              "inline-flex h-9 items-center justify-center rounded-xl px-4 text-sm font-medium shadow transition-colors",
              PRIMARY_BUTTON_CLASS
            )}
          >
            {t("updates.announcement.dismiss")}
          </button>
        </div>
      </div>
    </>
  );
}
