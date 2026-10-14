"use client";

// 首尾帧只管理布局和模式，上传/替换/删除仍使用原有上传组件。
import { useTranslation } from "@/i18n";
import { VideoImageUpload } from "./VideoImageUpload";
import { cn } from "@/utils/cn";

interface FrameInput { url: string | null; setFromFile: (file: File) => void; clear: () => void }
interface Props { first: FrameInput; last: FrameInput; both: boolean; disabled: boolean; supportsLast: boolean; onModeChange: (both: boolean) => void }
export function VideoFrameInputs({ first, last, both, disabled, supportsLast, onModeChange }: Props) {
  const { t } = useTranslation();
  return <fieldset disabled={disabled} data-video-frame-inputs className="min-w-0 space-y-2">
    {supportsLast && <div className="inline-flex rounded-lg bg-muted p-0.5">{[false, true].map((mode) => <button key={String(mode)} type="button" data-video-frame-mode={mode ? "both" : "first"} aria-pressed={both === mode} onClick={() => onModeChange(mode)} className={cn("rounded-md px-3 py-1 text-xs transition-colors", both === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}>{t(mode ? "create.videoSettings.bothFrames" : "create.videoSettings.firstOnly")}</button>)}</div>}
    <div className={cn("grid min-w-0 gap-2", both && supportsLast ? "grid-cols-2" : "grid-cols-1")}>
      <div data-video-first-frame><VideoImageUpload label={t("create.videoSettings.firstFrame")} required imageUrl={first.url} onSelect={first.setFromFile} onRemove={first.clear} /></div>
      {both && supportsLast && <div data-video-last-frame><VideoImageUpload label={t("create.videoSettings.lastFrame")} imageUrl={last.url} onSelect={last.setFromFile} onRemove={last.clear} /></div>}
    </div>
  </fieldset>;
}
