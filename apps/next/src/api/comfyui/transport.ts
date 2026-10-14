import type {
  ComfyModelLists,
  ComfyRemoteGenerateResult,
  ComfyRemoteVideo,
} from "@/api/comfyui/types";
import type {
  ComfyApiPrompt,
  ComfyGenerateOptions,
  ComfyGenerateResult,
  ComfyGeneratedImage,
  ComfyGeneratedVideo,
} from "@/types/comfy";
import type { ComfyUploadedImage } from "@/types/electron-api";
import { t } from "@/i18n";
import { isElectronEnvironment } from "@/utils/electronBridge";
import { unwrapIpc } from "@/utils/ipcResult";

//后端Comfyui 服务器地址
const DEFAULT_COMFY_SERVER = "127.0.0.1:8188";

const MODEL_LIST_CACHE_TTL_MS = 60_000;

let modelListCache: {
  at: number;
  serverAddress: string;
  data: ComfyModelLists;
} | null = null;

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mimeMatch = header.match(/data:(.*?);/);
  const mimeType = mimeMatch?.[1] ?? "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function convertRemoteGenerateResult(
  result: ComfyRemoteGenerateResult
): ComfyGenerateResult {
  const images: ComfyGeneratedImage[] = result.images.map((image) => {
    const blob = dataUrlToBlob(image.dataUrl);
    return {
      nodeId: image.nodeId,
      filename: image.filename,
      subfolder: image.subfolder,
      folderType: image.folderType,
      blob,
      objectUrl: URL.createObjectURL(blob),
    };
  });

  return {
    promptId: result.promptId,
    images,
  };
}

export function revokeComfyImages(images: ComfyGeneratedImage[]) {
  for (const image of images) {
    URL.revokeObjectURL(image.objectUrl);
  }
}

function requireElectronDesktop(feature: string): never {
  throw new Error(t("errors.comfy.desktopOnly", { feature }));
}

/** 复用 ComfyUI /upload/image 文件上传端点；官方同一端点也接受视频和音频并原样写入 input。 */
export async function uploadImageToComfy(
  image: File,
  serverAddress: string
): Promise<ComfyUploadedImage> {
  if (!isElectronEnvironment() || !window.electronAPI?.comfyUploadImage) {
    requireElectronDesktop(t("errors.comfy.featureImageUpload"));
  }

  const buffer = await image.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  const dataBase64 = btoa(binary);

  return unwrapIpc(
    await window.electronAPI!.comfyUploadImage!(
      serverAddress || DEFAULT_COMFY_SERVER,
      { filename: image.name || "input.png", dataBase64 }
    )
  );
}

function convertRemoteVideo(
  video: ComfyRemoteVideo
): ComfyGeneratedVideo {
  const blob = dataUrlToBlob(video.dataUrl);
  return {
    nodeId: video.nodeId,
    filename: video.filename,
    subfolder: video.subfolder,
    folderType: video.folderType,
    kind: video.kind,
    blob,
    objectUrl: URL.createObjectURL(blob),
  };
}

/** 视频生成：提交工作流并取回视频文件 */
export async function generateVideoWithComfy(
  prompt: ComfyApiPrompt,
  options: ComfyGenerateOptions = {}
): Promise<{ promptId: string; videos: ComfyGeneratedVideo[] }> {
  const serverAddress = options.serverAddress ?? DEFAULT_COMFY_SERVER;

  if (!isElectronEnvironment() || !window.electronAPI?.comfyGenerate) {
    requireElectronDesktop(t("errors.comfy.featureVideoGenerate"));
  }

  const result = unwrapIpc(
    await window.electronAPI!.comfyGenerate!(prompt, serverAddress)
  ) as ComfyRemoteGenerateResult;
  return {
    promptId: result.promptId,
    videos: (result.videos ?? []).map(convertRemoteVideo),
  };
}

export function revokeComfyVideos(videos: ComfyGeneratedVideo[]) {
  for (const video of videos) {
    URL.revokeObjectURL(video.objectUrl);
  }
}

/** 生成：通过 Electron 主进程代理到本地 ComfyUI 服务 */
export async function generateWithComfy(
  prompt: ComfyApiPrompt,
  options: ComfyGenerateOptions = {}
): Promise<ComfyGenerateResult> {
  const serverAddress = options.serverAddress ?? DEFAULT_COMFY_SERVER;

  if (!isElectronEnvironment() || !window.electronAPI?.comfyGenerate) {
    requireElectronDesktop(t("errors.comfy.featureImageGenerate"));
  }

  return convertRemoteGenerateResult(
    unwrapIpc(await window.electronAPI!.comfyGenerate!(prompt, serverAddress))
  );
}

/** 拉取模型列表：优先 IPC，60s TTL 缓存，避免每次生成都请求 */
export async function fetchComfyModelLists(
  serverAddress: string,
  refresh = false
): Promise<ComfyModelLists> {
  const address = serverAddress || DEFAULT_COMFY_SERVER;

  const now = Date.now();
  if (
    !refresh && modelListCache &&
    modelListCache.serverAddress === address &&
    now - modelListCache.at < MODEL_LIST_CACHE_TTL_MS
  ) {
    return modelListCache.data;
  }

  if (!isElectronEnvironment() || !window.electronAPI?.comfyListModels) {
    requireElectronDesktop(t("errors.comfy.featureModelLists"));
  }

  const data = unwrapIpc(await window.electronAPI!.comfyListModels!(address));
  modelListCache = { at: now, serverAddress: address, data };
  return data;
}
