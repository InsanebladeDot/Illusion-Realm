"use client";

import { useState } from "react";
import Link from "next/link";
import { Grid3x3, List } from "lucide-react";
import { PROFILE_TABS } from "@/data/profile";
import type { ProfileTabId } from "@/types/profile";
import { useTranslation } from "@/i18n";
import { INPUT_BORDER_CLASS, THIN_DIVIDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

function EmptyPostsPanel() {
  const { t } = useTranslation();

  return (
    <div className="py-12 text-center">
      <h3 className="mb-2 text-lg font-medium">{t("profile.tabs.emptyPostsTitle")}</h3>
      <p className="mb-4 text-muted-foreground">{t("profile.tabs.emptyPostsDescription")}</p>
      <Link
        href="/create"
        className="inline-flex h-9 items-center justify-center rounded-md bg-accent-fill px-4 text-sm font-medium text-accent-fill-foreground hover:bg-accent-fill/90"
      >
        {t("profile.tabs.goCreate")}
      </Link>
    </div>
  );
}

function EmptyTabPanel({ label }: { label: string }) {
  const { t } = useTranslation();

  return (
    <div className="py-12 text-center">
      <h3 className="mb-2 text-lg font-medium">{t("profile.tabs.emptyPrefix")}{label}</h3>
      <p className="text-muted-foreground">{t("profile.tabs.comingSoon")}</p>
    </div>
  );
}

export function ProfileTabs() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ProfileTabId>("posts");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const activeLabel =
    PROFILE_TABS.find((tab) => tab.id === activeTab)?.label ??
    t("profile.tabs.fallbackLabel");

  return (
    <div className="container mx-auto px-4 pb-20 md:pb-16">
      <div className={cn("relative", THIN_DIVIDER_CLASS)}>
        <div
          role="tablist"
          aria-label={t("profile.tabs.ariaLabel")}
          className={cn(
            "no-scrollbar flex h-12 w-full items-center justify-start gap-2 overflow-x-auto overflow-y-hidden rounded-none border-b bg-transparent p-0 md:h-16 md:gap-4",
            THIN_DIVIDER_CLASS
          )}
        >
          {PROFILE_TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "relative inline-flex h-12 shrink-0 items-center justify-center whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 pb-2 pt-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground md:h-16 md:px-4 md:text-base",
                  active && "border-foreground text-foreground"
                )}
              >
                <span className="flex items-center gap-1 md:gap-2">
                  {tab.label}
                  {tab.privateOnly ? (
                    <span className="rounded-full bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-normal text-purple-600 dark:text-purple-400 md:px-2 md:text-xs">
                      {t("profile.tabs.privateOnly")}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        <div className="pt-6" role="tabpanel">
          {activeTab === "posts" ? (
            <div>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold">{t("profile.tabs.allPosts")}</h3>
                <div className={cn("flex gap-1 rounded-lg border p-1", INPUT_BORDER_CLASS)}>
                  <button
                    type="button"
                    aria-label={t("profile.tabs.gridView")}
                    onClick={() => setViewMode("grid")}
                    className={cn(
                      "inline-flex h-8 items-center justify-center rounded-md px-3 text-xs transition-colors",
                      viewMode === "grid"
                        ? "bg-muted text-foreground"
                        : "hover:bg-muted/60"
                    )}
                  >
                    <Grid3x3 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("profile.tabs.listView")}
                    onClick={() => setViewMode("list")}
                    className={cn(
                      "inline-flex h-8 items-center justify-center rounded-md px-3 text-xs transition-colors",
                      viewMode === "list"
                        ? "bg-muted text-foreground"
                        : "hover:bg-muted/60"
                    )}
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <EmptyPostsPanel />
            </div>
          ) : (
            <EmptyTabPanel label={activeLabel} />
          )}
        </div>
      </div>
    </div>
  );
}
