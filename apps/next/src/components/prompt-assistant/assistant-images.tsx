"use client";

/** 转译附件区只编辑本次请求清单，开关沿用画布设置控件，提示沿用 HoverTip。 */
import { Plus, X } from "lucide-react";
import Image from "next/image";
import { HoverTip } from "@/components/hover-tip";
import { ToggleSwitch } from "@/components/toggle-switch";
import { useTranslation } from "@/i18n";
import type { PromptImage } from "./use-prompt-images";

export interface AssistantImageOptions {
  disabled?: boolean;
  disabledReason?: string;
  enabled: boolean;
  items: PromptImage[];
  toggle: () => void;
  upload: () => void;
  remove: (id: string) => void;
}

export function AssistantImages({ enabled, items, toggle, upload, remove, disabled, disabledReason }: AssistantImageOptions) {
  const { t } = useTranslation();
  return <section className="my-1 border-t border-border pt-1" aria-label={t("create.promptAssistant.useImages")}>
    <div className="flex items-center justify-between px-2.5 py-2">
      <span className="text-xs">{t("create.promptAssistant.useImages")}</span>
      <HoverTip asChild layer="window" label={disabled ? disabledReason ?? '' : t("create.promptAssistant.imagesHint")}><span className={disabled ? 'cursor-not-allowed opacity-40' : ''}><ToggleSwitch disabled={disabled} checked={enabled} onChange={toggle} label={t("create.promptAssistant.useImages")} data-assistant-item="use-images" /></span></HoverTip>
    </div>
    {enabled && <div data-assistant-images className="px-2.5 pb-2 pt-1">
      <p className="mb-2 text-[10px] text-muted-foreground">{t("create.promptAssistant.imageSources", { count: items.length })}</p>
      <div className="flex flex-wrap gap-2.5 py-1">
        {items.map((image, index) => <div key={image.id} data-assistant-image className="relative size-[51px] shrink-0">
          {/* 编号与真正发送的数组同序，移除后一起重排。 */}
          <HoverTip asChild layer="window" label={image.name}><Image src={image.src} alt={image.name} width={51} height={51} unoptimized className="size-full rounded-lg object-cover" /></HoverTip>
          <span aria-hidden className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[8px] text-white">{index + 1}</span>
          <HoverTip asChild layer="window" label={t("create.promptAssistant.removeImage", { name: image.name })}><button type="button" data-assistant-item={`remove-image-${index}`} aria-label={t("create.promptAssistant.removeImage", { name: image.name })} onClick={() => remove(image.id)} className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><X size={10} /></button></HoverTip>
        </div>)}
        <HoverTip asChild layer="window" label={t("create.promptAssistant.uploadImages")}><button type="button" disabled={disabled} data-assistant-item="upload-images" aria-label={t("create.promptAssistant.uploadImages")} onClick={upload} className="grid size-[51px] shrink-0 place-items-center rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40"><Plus size={17} /></button></HoverTip>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{t("create.promptAssistant.imageScope")}</p>
    </div>}
  </section>;
}
