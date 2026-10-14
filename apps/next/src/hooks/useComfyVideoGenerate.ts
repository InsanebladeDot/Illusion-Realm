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
import type { VideoModelOverrides } from "@/utils/comfy/video-workflow-models";
import type { VideoLora } from "@/utils/comfy/video-workflow-loras";
import type { VideoGenerationSettings } from "@/utils/comfy/video-generation-settings";
import { resolveVideoPromptModels } from "@/utils/comfy/resolve-video-models";
import type { VideoResolutionSettings } from "@/utils/comfy/video-resolution";
import { orderedReferences, type VideoReferenceFile, type UploadedVideoReference } from "@/utils/comfy/video-reference-media";

type VideoGenerateInput = {
  workflowId: string;
  prompt: string;
  durationSeconds?: number;
  imageFile?: File | null;
  referenceMedia?: VideoReferenceFile[];
  lastImageFile?: File | null;
  modelOverrides?: VideoModelOverrides;
  loras?: VideoLora[];
  generationSettings?: VideoGenerationSettings;
  resolution?: VideoResolutionSettings;
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
        const imageName = input.imageFile ? await uploadVideoFrame(input.imageFile, "first", comfyServerUrl) : undefined;
        const lastImageName = input.lastImageFile ? await uploadVideoFrame(input.lastImageFile, "last", comfyServerUrl) : undefined;
        const referenceMedia = await uploadReferences(input.referenceMedia ?? [], comfyServerUrl);

        const prompt = buildVideoPrompt({
          workflowId: input.workflowId,
          prompt: input.prompt,
          durationSeconds: input.durationSeconds,
          imageName,
          lastImageName,
          referenceMedia,
          modelOverrides: input.modelOverrides,
          loras: input.loras,
          generationSettings: input.generationSettings,
          resolution: input.resolution,
        });
        await resolveVideoPromptModels(prompt, comfyServerUrl);

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
function uploadedImageName(uploaded: { name: string; subfolder: string }, file: File) {
  return [uploaded.subfolder, uploaded.name || file.name].filter(Boolean).join("/");
}
async function uploadVideoFrame(file: File, role: string, server: string) {
  // ComfyUI uploads overwrite names: unique names keep identically named first/last files independent.
  const extension = /\.[a-z0-9]+$/i.exec(file.name)?.[0] || ".png";
  const named = new File([file], `${role}_${crypto.randomUUID()}${extension}`, { type: file.type });
  return uploadedImageName(await uploadImageToComfy(named, server), named);
}
async function uploadReferences(media: VideoReferenceFile[], server: string): Promise<UploadedVideoReference[]> {
  const uploaded: UploadedVideoReference[] = [];
  // 同一上传通道支持三种文件；顺序上传限制大视频同时转 base64 的内存占用。
  for (const item of orderedReferences(media)) {
    uploaded.push({ kind: item.kind, number: item.number, name: await uploadVideoFrame(item.file, item.kind, server) });
  }
  return uploaded;
}
