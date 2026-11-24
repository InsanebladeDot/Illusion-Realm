"use client";

/** 清单正文复用 Markdown 阅读组件，只注入应用内跳转和可放大的截图。 */
import Link from "next/link";
import NextImage from "next/image";
import type { Components } from "react-markdown";
import { useTranslation } from "@/i18n";
import { useSetupGuides } from "@/hooks/use-setup-guides";
import { SetupDownloadPanel } from "./setup-download-panel";

interface PanelProps {
  onClose: () => void;
  onPreview: (src: string) => void;
  onOpenDownloads: () => void;
}

function guideComponents(onClose: () => void, onPreview: (src: string) => void, previewLabel: string): Components {
  return {
    a: ({ href, children }) => href === "/settings" || href === "/tools/models/civitai"
      ? <Link href={href} onClick={onClose}>{children}</Link>
      : <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
    // 截图仅取随包目录，正文中的外部图片不自动请求，防止读教程时意外联网。
    img: ({ src, alt }) => typeof src === "string" && /^\/guides\/(?:anima|model-setup)\/[a-z0-9-]+\.webp$/.test(src)
      ? <button type="button" onClick={() => onPreview(src)} aria-label={previewLabel} className="block w-full"><NextImage src={src} alt={alt || ""} width={1240} height={820} unoptimized className="h-auto w-full rounded-md" /></button>
      : <span>{alt}</span>,
  };
}

export default function SetupChecklistPanel({ onClose, onPreview, onOpenDownloads }: PanelProps) {
  const { t, locale } = useTranslation();
  const { guides, loading, failed, retry } = useSetupGuides(locale);
  const components = guideComponents(onClose, onPreview, t("components.imagePreviewOverlay.triggerLabel"));
  return <SetupDownloadPanel guides={guides} components={components} guideLoading={loading}
    guideFailed={failed} retryGuide={retry} onOpenDownloads={onOpenDownloads} />;
}
