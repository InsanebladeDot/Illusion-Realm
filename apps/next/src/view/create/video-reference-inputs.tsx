"use client";

// 参考素材只展示当前分类；复用创建页标签按钮和首尾帧上传控件，素材状态由父组件保留。
import { useState } from "react";
import { Image, Film, Music } from "lucide-react";
import { useTranslation } from "@/i18n";
import { IconTabButton } from "@/components/icon-tab-button";
import { REFERENCE_MEDIA_KINDS, REFERENCE_MEDIA_LIMITS, orderedReferences } from "@/utils/comfy/video-reference-media";
import type { PromptMediaKind } from "@/utils/prompt-media-references";
import { THIN_DIVIDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";
import { VideoImageUpload } from "./VideoImageUpload";
import type { useVideoReferenceMedia } from "./use-video-reference-media";

interface Props { references: ReturnType<typeof useVideoReferenceMedia>; disabled: boolean }
interface GroupProps { references: Props["references"]; kind: PromptMediaKind }
const ICONS = { image: Image, video: Film, audio: Music };

function ReferenceGroup({ references, kind }: GroupProps) {
  const { t } = useTranslation();
  const items = orderedReferences(references.media).filter((item) => item.kind === kind);
  const next = references.nextNumber(kind);
  const slots = [...items.map((item) => item.number), ...(next ? [next] : [])];
  return <section role="tabpanel" id={`reference-panel-${kind}`} aria-labelledby={`reference-tab-${kind}`} data-reference-kind={kind}>
    {/* 界面：当前类型的素材卡片；空卡片批量添加，已有卡片逐个替换、删除。 */}
    <div className={cn("grid max-h-80 min-w-0 gap-2 overflow-y-auto overscroll-contain pr-1", items.length ? "grid-cols-2" : "grid-cols-1")}>
      {slots.map((number) => {
        const item = items.find((entry) => entry.number === number);
        return <div key={number} data-reference-number={number}>
          <VideoImageUpload kind={kind} filename={item?.name}
            label={item ? `@${kind}${number}` : t("create.videoReferences.addFiles", { kind: t(`create.mediaReferences.${kind}`) })}
            imageUrl={item?.src ?? null} onSelect={(file) => references.select(kind, number, file)}
            onSelectFiles={item ? undefined : (files) => references.add(kind, files)}
            onRemove={() => references.remove(`${kind}-${number}`)} />
        </div>;
      })}
    </div>
  </section>;
}

export function VideoReferenceInputs({ references, disabled }: Props) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<PromptMediaKind>("image");
  return <fieldset disabled={disabled} data-video-reference-inputs className="min-w-0 space-y-3">
    {/* 界面：图片 / 视频 / 音频切换，与上方创建模式采用同一套图标标签。 */}
    <div role="tablist" aria-label={t("create.videoReferences.tabs")} className={cn("flex min-w-0 border-b", THIN_DIVIDER_CLASS)}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const index = REFERENCE_MEDIA_KINDS.indexOf(kind);
        const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
        setKind(REFERENCE_MEDIA_KINDS[next]);
        event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
      }}>
      {REFERENCE_MEDIA_KINDS.map((value) => <IconTabButton key={value} id={`reference-tab-${value}`} role="tab"
        aria-selected={kind === value} aria-controls={`reference-panel-${value}`} tabIndex={kind === value ? 0 : -1}
        data-reference-tab={value} active={kind === value} icon={ICONS[value]} label={t(`create.mediaReferences.${value}`)}
        trailing={<span className="ml-1 text-[10px] tabular-nums text-muted-foreground">{references.media.filter((item) => item.kind === value).length}/{REFERENCE_MEDIA_LIMITS[value]}</span>}
        onClick={() => setKind(value)} className="min-w-0 flex-1 px-2 sm:px-3" />)}
    </div>
    <ReferenceGroup key={kind} references={references} kind={kind} />
    <p className="text-xs leading-relaxed text-muted-foreground">{t("create.videoReferences.hint")}</p>
  </fieldset>;
}
