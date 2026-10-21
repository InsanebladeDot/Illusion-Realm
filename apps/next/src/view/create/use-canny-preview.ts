"use client";

// Canny 业务状态：校验本地原图，防止旧上传覆盖新上传，检测计算交给独立 Worker。
import { useEffect, useRef, useState } from "react";
import type { RangeInterval } from "@/components/range-interval-slider";
import { useTranslation } from "@/i18n";
import { loadMaskImage, type MaskSource } from "@/utils/mask-image";
import { CANNY_MAX_PIXELS, CANNY_MAX_SIDE } from "@/utils/canny-types";
import { useCannyConversion } from "./use-canny-conversion";

export interface CannySource extends MaskSource { file: File }

function useCannySource() {
  const { t } = useTranslation(), revision = useRef(0);
  const [source, setSource] = useState<CannySource | null>(null);
  const [error, setError] = useState(""), [loading, setLoading] = useState(false);
  useEffect(() => () => { if (source) URL.revokeObjectURL(source.url); }, [source]);
  useEffect(() => () => { revision.current++; }, []);
  const select = async (file: File) => {
    const current = ++revision.current;
    setError(""); setLoading(false);
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setError(t("create.canny.invalidImage")); return; }
    const url = URL.createObjectURL(file); setLoading(true);
    try {
      const image = await loadMaskImage(url);
      if (current !== revision.current) { URL.revokeObjectURL(url); return; }
      if (image.naturalWidth * image.naturalHeight > CANNY_MAX_PIXELS || Math.max(image.naturalWidth, image.naturalHeight) > CANNY_MAX_SIDE) throw new Error(t("create.canny.tooLarge"));
      setSource({ file, url, name: file.name, width: image.naturalWidth, height: image.naturalHeight });
    } catch (reason) {
      URL.revokeObjectURL(url);
      if (current === revision.current) setError(reason instanceof Error ? reason.message : t("create.canny.loadFailed"));
    } finally { if (current === revision.current) setLoading(false); }
  };
  const remove = () => { revision.current++; setSource(null); setError(""); setLoading(false); };
  return { source, error, loading, select, remove };
}

export function useCannyPreview() {
  const [enabled, setEnabled] = useState(false), [inverted, setInverted] = useState(false);
  const [thresholds, setThresholds] = useState<RangeInterval>({ lower: 0.1, upper: 0.3 });
  const media = useCannySource();
  const conversion = useCannyConversion(media.source, enabled, { ...thresholds, inverted });
  return { ...media, ...conversion, error: media.error || conversion.processingError, enabled, setEnabled, inverted, setInverted, thresholds, setThresholds };
}

export type CannyPreviewState = ReturnType<typeof useCannyPreview>;
