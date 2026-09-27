"use client";

import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import type { ChangelogSection } from "@/types/changelog";
import {
  fetchChangelogMarkdown,
  parseChangelogMarkdown,
} from "@/utils/changelog";
import { useUpdatesStore } from "@/stores/useUpdatesStore";
import { useTranslation } from "@/i18n";
import { THIN_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";
import { ChangelogSectionBody } from "@/view/updates/ChangelogSectionBody";

export function UpdatesPage() {
  const { t } = useTranslation();
  const markChangelogSeen = useUpdatesStore((state) => state.markChangelogSeen);
  const [sections, setSections] = useState<ChangelogSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const markdown = await fetchChangelogMarkdown();
        if (cancelled) return;
        const parsed = parseChangelogMarkdown(markdown);
        setSections(parsed);
        if (parsed[0]) {
          markChangelogSeen(parsed[0].id);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : t("updates.page.loadFailed")
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [markChangelogSeen, t]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-8 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
          <Megaphone className="h-5 w-5 text-foreground" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("updates.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("updates.page.syncedPrefix")}
            <code className="text-xs">logs.md</code>
            {t("updates.page.syncedSuffix")}
          </p>
        </div>
      </header>

      {loading ? (
        /** 骨架屏：日志是一堆卡片，先摆出卡片形状，加载完不用重排 */
        <div
          data-page-skeleton="updates"
          className="space-y-6"
          aria-label={t("common.loading")}
        >
          {Array.from({ length: 3 }, (_item, index) => (
            <div key={index} className="rounded-xl border p-5">
              <div className="motion-skeleton h-4 w-40 rounded" />
              <div className="mt-4 space-y-2">
                <div className="motion-skeleton h-3 w-full rounded" />
                <div className="motion-skeleton h-3 w-11/12 rounded" />
                <div className="motion-skeleton h-3 w-9/12 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : sections.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("updates.page.empty")}</p>
      ) : (
        <div className="space-y-6">
          {sections.map((section, index) => (
            <article
              key={section.id}
              className={cn(
                "rounded-xl border bg-background/80 p-5 dark:bg-muted/30",
                THIN_BORDER_CLASS
              )}
            >
              <h2 className="text-base font-semibold leading-snug">
                {section.title}
              </h2>
              {index === 0 && (
                <span className="mt-2 inline-block rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-green-700 dark:text-green-400">
                  {t("updates.page.latest")}
                </span>
              )}
              <div className="mt-4">
                <ChangelogSectionBody lines={section.bodyLines} />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
