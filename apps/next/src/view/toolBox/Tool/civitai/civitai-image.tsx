"use client";

/* eslint-disable @next/next/no-img-element -- Remote model previews are already resized by Civitai; static export has no image optimizer. */
import { useState } from "react";
import { ImageIcon } from "lucide-react";
import { useTranslation } from "@/i18n";

export function CivitaiImage({ src, alt, className = "", loading = "lazy" }: { src: string; alt: string; className?: string; loading?: "lazy" | "eager" }) {
  const [failed, setFailed] = useState(false);
  const { t } = useTranslation();
  return <><div className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground" aria-label={t("toolBox.civitai.noPreview")}><ImageIcon size={28} /></div>{src && !failed && <img src={src} alt={alt} loading={loading} referrerPolicy="no-referrer" onError={() => setFailed(true)} className={className} />}</>;
}
