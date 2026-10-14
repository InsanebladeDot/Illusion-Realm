"use client";

/** 顺序执行等时长切分：复用视频任务 IPC，汇总进度，取消后保留成品并停止后续任务。 */
import { useEffect, useRef, useState } from "react";
import type { ClipItem } from "@/components/videoEdit/types";
import { t } from "@/i18n";
import { useToastStore } from "@/stores/useToastStore";
import { cancelVideoEdit, onVideoProgress, pickOutputFolder, runVideoEdit } from "@/utils/video/ffmpeg";
import { buildEqualSplitRanges, buildSplitFileName } from "@/utils/video/equal-split";
import { joinOutputPath } from "@/utils/video/outputPath";

interface SplitSession { cancelled: boolean; jobId: string | null; index: number; total: number }
interface SplitOptions {
  clip: ClipItem | null;
  ffmpegPath: string | null;
  outputFolder: string | null;
  onFolder: (folder: string) => void;
}

export function useVideoEqualSplit({ clip, ffmpegPath, outputFolder, onFolder }: SplitOptions) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completed, setCompleted] = useState<string[]>([]);
  const [resultFolder, setResultFolder] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const sessionRef = useRef<SplitSession | null>(null);
  const showToast = useToastStore((state) => state.show);

  useEffect(() => {
    const unsubscribe = onVideoProgress((event) => {
      const session = sessionRef.current;
      if (!session) return;
      session.jobId = event.jobId;
      if (session.cancelled) { void cancelVideoEdit(event.jobId).catch(() => {}); return; }
      setProgress(Math.round((session.index * 100 + event.percent) / session.total));
    });
    return () => {
      unsubscribe();
      const session = sessionRef.current;
      if (session) { session.cancelled = true; if (session.jobId) void cancelVideoEdit(session.jobId).catch(() => {}); }
    };
  }, []);

  async function exportParts(source: ClipItem, folder: string, parts: number, session: SplitSession) {
    const ranges = buildEqualSplitRanges(source.duration, parts, source.fps);
    for (const [index, trim] of ranges.entries()) {
      if (session.cancelled) break;
      session.index = index;
      session.jobId = null;
      const outputPath = joinOutputPath(folder, buildSplitFileName(source.name, index, parts));
      const result = await runVideoEdit({ mode: "single", inputPath: source.path, outputPath,
        sourceDuration: source.duration, trim, accurateCut: true }, ffmpegPath);
      setCompleted((previous) => [...previous, result.outputPath]);
      setProgress(Math.round((index + 1) * 100 / parts));
    }
  }

  async function start(parts: number) {
    if (!clip || sessionRef.current || !buildEqualSplitRanges(clip.duration, parts, clip.fps).length) return;
    const session: SplitSession = { cancelled: false, jobId: null, index: 0, total: parts };
    sessionRef.current = session;
    setRunning(true); setProgress(0); setCompleted([]); setResultFolder(null); setTotal(parts);
    try {
      const folder = outputFolder || await pickOutputFolder(t("toolBox.video.quick.splitFolder"));
      if (!folder || session.cancelled) return;
      onFolder(folder); setResultFolder(folder);
      await exportParts(clip, folder, parts, session);
      if (!session.cancelled) showToast(t("toolBox.video.quick.done", { count: parts }), "success");
    } catch (error) {
      if (!session.cancelled) showToast(error instanceof Error ? error.message : t("toolBox.video.processFailed"), "error");
    } finally { sessionRef.current = null; setRunning(false); }
  }

  async function cancel() {
    const session = sessionRef.current;
    if (!session) return;
    session.cancelled = true;
    try { if (session.jobId) await cancelVideoEdit(session.jobId); }
    catch (error) { showToast(error instanceof Error ? error.message : t("toolBox.video.processFailed"), "error"); }
    showToast(t("toolBox.video.quick.cancelled"));
  }

  return { running, progress, completed, resultFolder, total, start, cancel };
}
