/** 复用现有视频落盘器；原视频生成与超分都保存真实视频字节。 */
import type { ComfyGeneratedVideo } from "@/types/comfy";
import { isElectronEnvironment } from "@/utils/electronBridge";
import { unwrapIpcOr } from "@/utils/ipcResult";

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

export async function saveVideosToDisk(
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

