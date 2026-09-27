"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import {
  generateWithComfy,
  revokeComfyImages,
} from "@/api/comfyui";
import {
  buildImagePrompt,
  type ImageWorkflowParams,
} from "@/utils/comfy/imageWorkflow";
import { resolveImageWorkflowParams } from "@/utils/comfy/resolveComfyModels";
import {
  getSelectedFolderDirPath,
  useHistoryFolderStore,
} from "@/stores/useHistoryFolderStore";
import { useGenerationNoticeStore } from "@/stores/useGenerationNoticeStore";
import { buildGeneratedImageMeta } from "@/utils/buildGeneratedImageMeta";
import { resolveSaveOutputPath } from "@/utils/generatedImages";
import { saveGeneratedImagesToDisk } from "@/utils/saveGeneratedImages";
import type { ComfyGeneratedImage } from "@/types/comfy";

export type ComfyGenerateHookResult = {
  promptId: string;
  images: ComfyGeneratedImage[];
  savedPaths: string[];
};

export function useComfyGenerate() {
  const comfyServerUrl = useSettingsStore((state) => state.comfyServerUrl);
  const paths = useSettingsStore((state) => state.paths);
  const outputPath = useSettingsStore((state) => state.outputPath);
  const selectedFolderId = useHistoryFolderStore(
    (state) => state.selectedFolderId
  );
  const refreshGeneratedImages = useHistoryFolderStore(
    (state) => state.refreshGeneratedImages
  );
  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const lastImagesRef = useRef<ComfyGeneratedImage[]>([]);
  const previewUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      revokeComfyImages(lastImagesRef.current);
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const generate = useCallback(
    async (params: ImageWorkflowParams): Promise<ComfyGenerateHookResult> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setGenerating(true);
      useGenerationNoticeStore.getState().start();

      try {
        const resolvedParams = await resolveImageWorkflowParams(
          params,
          comfyServerUrl,
          paths
        );
        const prompt = buildImagePrompt(
          resolvedParams.series ?? "anima",
          resolvedParams
        );

        const result = await generateWithComfy(prompt, {
          serverAddress: comfyServerUrl,
          signal: controller.signal,
        });

        const folderDirPath = getSelectedFolderDirPath(selectedFolderId);
        const saveTarget = resolveSaveOutputPath(
          outputPath,
          folderDirPath
        );

        const savedPaths = await saveGeneratedImagesToDisk(
          result.images,
          result.promptId,
          saveTarget,
          buildGeneratedImageMeta({
            promptId: result.promptId,
            params: resolvedParams,
            workflow: prompt,
            generationKind: "text2img",
            sourceImagePath: null,
          })
        );

        refreshGeneratedImages();
        useGenerationNoticeStore.getState().succeed({
          filePath: savedPaths[0] ?? null,
          folderId: selectedFolderId,
        });

        revokeComfyImages(lastImagesRef.current);
        lastImagesRef.current = result.images;

        const nextPreview = result.images[0]?.objectUrl ?? null;
        setPreviewUrl((prev) => {
          if (prev && prev !== nextPreview) URL.revokeObjectURL(prev);
          return nextPreview;
        });

        return {
          promptId: result.promptId,
          images: result.images,
          savedPaths,
        };
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          useGenerationNoticeStore.getState().dismiss();
        } else {
          useGenerationNoticeStore.getState().fail();
        }
        throw error;
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setGenerating(false);
        }
      }
    },
    [comfyServerUrl, outputPath, paths, refreshGeneratedImages, selectedFolderId]
  );

  return {
    generating,
    previewUrl,
    generate,
  };
}
