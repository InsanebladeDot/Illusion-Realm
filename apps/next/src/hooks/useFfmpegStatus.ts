"use client";

/**
 * ffmpeg 探测状态（视频剪辑 / GIF 制作共用）：
 * 手动指定 → 系统 PATH → 常见位置 → 内置；结果同时缓存到 videoTool 段落。
 */
import { useCallback, useEffect, useState } from "react";
import { t } from "@/i18n";
import { useToastStore } from "@/stores/useToastStore";
import { useVideoToolStore } from "@/stores/useVideoToolStore";
import { getFfmpegStatus, selectFfmpegExecutable } from "@/utils/video/ffmpeg";
import type { FfmpegStatus } from "@/types/electron-api";

export function useFfmpegStatus(isDesktop: boolean) {
  const showToast = useToastStore((state) => state.show);
  const ffmpegPath = useVideoToolStore((state) => state.ffmpegPath);
  const setFfmpegPath = useVideoToolStore((state) => state.setFfmpegPath);

  const [status, setStatus] = useState<FfmpegStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const apply = useCallback(
    (next: FfmpegStatus | null, notify: boolean) => {
      setStatus(next);
      if (notify && next && !next.ffmpegPath) {
        showToast(t("toolBox.videoEdit.ffmpeg.notFound"), "error");
      }
    },
    [showToast]
  );

  /** 初次进入自动检测（在 await 之后才写入状态，避免同步 setState 引发的级联渲染） */
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const next = isDesktop ? await getFfmpegStatus(ffmpegPath) : null;
      if (cancelled) return;
      apply(next, isDesktop);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [apply, ffmpegPath, isDesktop]);

  const redetect = useCallback(async () => {
    setChecking(true);
    try {
      apply(await getFfmpegStatus(ffmpegPath), true);
    } finally {
      setChecking(false);
    }
  }, [apply, ffmpegPath]);

  const pickManually = useCallback(async () => {
    const picked = await selectFfmpegExecutable();
    if (!picked) return;
    setFfmpegPath(picked);
    showToast(t("toolBox.videoEdit.ffmpeg.pathSaved"), "success");
  }, [setFfmpegPath, showToast]);

  return { status, checking, ffmpegPath, redetect, pickManually };
}
