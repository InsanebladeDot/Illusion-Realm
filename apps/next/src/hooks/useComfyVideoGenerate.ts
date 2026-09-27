"use client";

import { useCallback, useRef, useState } from "react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import {
  generateVideoWithComfy,
  revokeComfyVideos,
  uploadImageToComfy,
} from "@/api/comfyui";
import type { ComfyGeneratedVideo } from "@/types/comfy";
import { buildVideoPrompt } from "@/utils/comfy/videoWorkflow";
import { isElectronEnvironment } from "@/utils/electronBridge";
import { unwrapIpcOr } from "@/utils/ipcResult";

type VideoGenerateInput = {
  workflowId: string;
  prompt: string;
  durationSeconds?: number;
  imageFile: File;
};

const MIME_EXT: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/png": ".png",
};

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

async function saveVideosToDisk(
  videos: ComfyGeneratedVideo[],
  outputPath: string
): Promise<string[]> {
  if (
    !isElectronEnvironment() ||
    !window.electronAPI?.saveGeneratedImages ||
    videos.length === 0
  ) {
    return [];
  }

  const files = await Promise.all(
    videos.map(async (video, index) => {
      const ext = MIME_EXT[video.blob.type] ?? ".mp4";
      return {
        filename: `IR_video_${Date.now()}_${index + 1}${ext}`,
        dataBase64: await blobToBase64(video.blob),
      };
    })
  );

  return unwrapIpcOr(
    await window.electronAPI.saveGeneratedImages(outputPath, files),
    [],
    "saveGeneratedImages"
  );
}

export function useComfyVideoGenerate() {
  const comfyServerUrl = useSettingsStore((state) => state.comfyServerUrl);
  const outputPath = useSettingsStore((state) => state.outputPath);
  const [generating, setGenerating] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const lastVideosRef = useRef<ComfyGeneratedVideo[]>([]);

  const generate = useCallback(
    async (input: VideoGenerateInput) => {
      setGenerating(true);
      try {
        const uploaded = await uploadImageToComfy(
          input.imageFile,
          comfyServerUrl
        );
        const imageName = uploaded.name || input.imageFile.name;

        const prompt = buildVideoPrompt({
          workflowId: input.workflowId,
          prompt: input.prompt,
          durationSeconds: input.durationSeconds,
          imageName,
        });

        const result = await generateVideoWithComfy(prompt, {
          serverAddress: comfyServerUrl,
        });

        const savedPaths = await saveVideosToDisk(result.videos, outputPath);

        const nextUrl = result.videos[0]?.objectUrl ?? null;
        setVideoUrl((prev) => {
          if (prev && prev !== nextUrl) URL.revokeObjectURL(prev);
          return nextUrl;
        });

        revokeComfyVideos(lastVideosRef.current);
        lastVideosRef.current = result.videos;

        return { videos: result.videos, savedPaths };
      } finally {
        setGenerating(false);
      }
    },
    [comfyServerUrl, outputPath]
  );

  return { generating, videoUrl, generate };
}
