"use client";

/** 创作页与画布使用同一视频执行器；此处只持有创作页的结果预览。 */
import { useCallback, useRef, useState } from "react";
import { revokeComfyVideos } from "@/api/comfyui";
import type { ComfyGeneratedVideo } from "@/types/comfy";
import { enqueueVideoGeneration, type VideoGenerationInput } from "@/utils/video-generation-queue";

export function useComfyVideoGenerate() {
  const [generating, setGenerating] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const lastVideosRef = useRef<ComfyGeneratedVideo[]>([]);
  const generate = useCallback(async (input: VideoGenerationInput) => {
    setGenerating(true);
    try {
      const result = await enqueueVideoGeneration(input).promise;
      revokeComfyVideos(lastVideosRef.current);
      lastVideosRef.current = result.videos;
      setVideoUrl(result.videos[0]?.objectUrl ?? null);
      return result;
    } finally { setGenerating(false); }
  }, []);
  return { generating, videoUrl, generate };
}
