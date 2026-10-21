"use client";

import type { ReactNode } from "react";
import { Cloud, Globe2, Images, LockKeyhole } from "lucide-react";
import type { CloudImage } from "@illusion-realm/shared";
import { useTranslation } from "@/i18n";

interface OverviewProps { images: CloudImage[]; busy: boolean; failed: boolean; accessory: ReactNode }

export function CloudImagesOverview({ images, busy, failed, accessory }: OverviewProps) {
  const { t } = useTranslation();
  // 接口仅提供分页数组，没有账户总数；概览只统计已加载数据，不为数字额外遍历整个图库。
  const pending = !images.length && (busy || failed);
  const stats = [
    { key: "loaded", icon: Images, color: "text-sky-600 dark:text-sky-400", label: t("profile.cloud.statsLoaded"), count: images.length },
    { key: "public", icon: Globe2, color: "text-teal-600 dark:text-teal-400", label: t("profile.cloud.statsPublic"), count: images.filter(image => image.visibility === "public").length },
    { key: "private", icon: LockKeyhole, color: "text-emerald-600 dark:text-emerald-400", label: t("profile.cloud.statsPrivate"), count: images.filter(image => image.visibility === "private").length },
  ];
  return <header>
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/70 pb-6">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400"><Cloud size={27} strokeWidth={1.7} /></span><div><h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("profile.cloud.images")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("profile.cloud.imagesDescription")}</p></div></div>{accessory}
    </div>
    <div className="grid grid-cols-3 gap-3 py-6 sm:py-8" aria-live="polite">{stats.map(item => <div key={item.key} data-cloud-summary={item.key} className="min-w-0 sm:px-3"><item.icon size={22} strokeWidth={1.7} className={item.color} /><strong className="mb-2 mt-3 block text-2xl font-semibold leading-none tracking-tight sm:text-3xl">{pending ? "—" : item.count}</strong><span className="text-xs text-muted-foreground sm:text-sm">{item.label}</span></div>)}</div>
  </header>;
}
