"use client";

import { useState } from "react";
import Link from "next/link";
import { PROFILE_TABS } from "@/data/profile";
import type { ProfileTabId } from "@/types/profile";
import { useTranslation } from "@/i18n";
import { THIN_DIVIDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";
import { useAccountStore } from "@/stores/useAccountStore";
import { CloudImagesPanel } from "./cloud-images-panel";
import { CloudCollectionsPanel } from "./cloud-collections-panel";
import { ResourceViewToggle } from "./resource-view-toggle";

type ContentTab = ProfileTabId | "cloudImages" | "cloudCollections";

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
  const [activeTab, setActiveTab] = useState<ContentTab>("posts");
  const [visited, setVisited] = useState<ContentTab[]>([]);
  const accountId = useAccountStore(state => state.profile?.id ?? null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const activeLabel =
    PROFILE_TABS.find((tab) => tab.id === activeTab)?.label ??
    t("profile.tabs.fallbackLabel");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="profile-content shrink-0">
        <div
          role="tablist"
          aria-label={t("profile.tabs.ariaLabel")}
          className={cn(
            "no-scrollbar flex h-12 w-full items-center justify-start gap-1 overflow-x-auto overflow-y-hidden border-b bg-transparent p-0",
            THIN_DIVIDER_CLASS
          )}
        >
          {[...PROFILE_TABS, { id: "cloudImages" as const, label: t("profile.cloud.images") }, { id: "cloudCollections" as const, label: t("profile.cloud.collections") }].map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                data-profile-content-tab={tab.id}
                aria-selected={active}
                onClick={() => { setActiveTab(tab.id); setVisited(current => current.includes(tab.id) ? current : [...current, tab.id]); }}
                className={cn(
                  "relative inline-flex h-12 shrink-0 items-center justify-center whitespace-nowrap rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                  active && "border-accent-stroke text-accent-text"
                )}
              >
                <span className="flex items-center gap-1 md:gap-2">
                  {tab.label}
                  {"privateOnly" in tab && tab.privateOnly ? (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground md:px-2 md:text-xs">
                      {t("profile.tabs.privateOnly")}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {/* 界面：标签下方共用一个滚动区；切换标签不卸载已有云端表单。 */}
      <div data-profile-scroll className="profile-content min-h-0 flex-1 overflow-y-auto overscroll-contain pb-8">
        <div className="pt-5" role="tabpanel" hidden={activeTab === "cloudImages" || activeTab === "cloudCollections"}>
          {activeTab === "posts" ? (
            <div>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold">{t("profile.tabs.allPosts")}</h3>
                <ResourceViewToggle value={viewMode} onChange={setViewMode} />
              </div>
              <EmptyPostsPanel />
            </div>
          ) : (
            <EmptyTabPanel label={activeLabel} />
          )}
        </div>
        {/* 界面：云端图片与收藏夹；保持挂载以保留重试 UUID，账户变化则清空私有会话结果 */}
        <div className="pt-5" role="tabpanel" hidden={activeTab !== "cloudImages"}>
          {visited.includes("cloudImages") && <CloudImagesPanel key={accountId ?? "guest"} ownerId={accountId} active={activeTab === "cloudImages"} />}
        </div>
        <div className="pt-5" role="tabpanel" hidden={activeTab !== "cloudCollections"}>
          {visited.includes("cloudCollections") && <CloudCollectionsPanel key={accountId ?? "guest"} ownerId={accountId} active={activeTab === "cloudCollections"} />}
        </div>
      </div>
    </div>
  );
}
