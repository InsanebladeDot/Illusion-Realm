"use client";

import { Download, MessageCircle, ThumbsUp } from "lucide-react";
import { useTranslation } from "@/i18n";
import type { CivitaiModel } from "@/utils/civitai";
import { CivitaiImage } from "./civitai-image";

export function CivitaiCard({ model, selected, local = false, onSelect }: { model: CivitaiModel; selected: boolean; local?: boolean; onSelect: () => void }) {
  const { t, locale } = useTranslation();
  const image = model.versions.flatMap((version) => version.images)[0] || "";
  const count = (value: number) => new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
  return (
    <button type="button" data-civitai-card={model.id} aria-pressed={selected} aria-label={model.name} onClick={onSelect} className={`relative aspect-[7/9] min-w-0 overflow-hidden rounded-xl border text-left transition-colors focus-visible:outline-2 focus-visible:outline-sky-500 ${selected ? "border-sky-500 ring-1 ring-sky-500/30" : "border-border hover:border-sky-500/60"}`}>
      <CivitaiImage key={image} src={image} alt={model.name} className="absolute inset-0 h-full w-full object-cover" />
      {/* 界面：单个胶囊展示模型类型和前三项基础模型 */}
      <div data-civitai-bases title={[model.type, ...model.baseModels].join(" · ")} className="absolute left-2 top-2 inline-flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-full bg-slate-900/65 px-2 py-1 text-[9px] font-semibold text-white backdrop-blur-md"><span className="border-r border-white/40 pr-1.5">{model.type}</span>{model.baseModels.slice(0, 3).map((base, index) => <span key={`${base}-${index}`}>{base.trim().slice(0, 3).toUpperCase()}</span>)}{model.baseModels.length > 3 && <span>+{model.baseModels.length - 3}</span>}</div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent px-3 pb-3 pt-12 text-white">
        {local && <p title={t("toolBox.civitai.localMatchHint")} className="mb-2 w-fit rounded bg-sky-600 px-2 py-1 text-[10px]">{t("toolBox.civitai.localFound")}</p>}
        <p className="mb-1 truncate text-[10px] font-medium">{model.creator}</p><h3 className="mb-2 line-clamp-3 text-sm font-bold leading-tight">{model.name}</h3>
        <div className="flex flex-wrap gap-2 text-[10px]">{[{ key: "downloadCount", label: t("toolBox.civitai.downloads"), Icon: Download }, { key: "thumbsUpCount", label: t("toolBox.civitai.likes"), Icon: ThumbsUp }, { key: "commentCount", label: t("toolBox.civitai.comments"), Icon: MessageCircle }].map(({ key, label, Icon }) => typeof model.stats[key] === "number" && <span key={key} title={`${label}: ${model.stats[key]}`} className="flex items-center gap-1"><Icon size={11} />{count(model.stats[key])}</span>)}</div>
      </div>
    </button>
  );
}
