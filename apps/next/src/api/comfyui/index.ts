export {
  cancelComfyGeneration,
  // 与已有生成 API 共用出口，顶栏无需绕过统一 IPC 解包层。
  // 只转出业务方法，不把 Node 请求器暴露给渲染组件。
  // 目录缓存仍由原 transport 持有，卸载模型不会重建另一套列表缓存。
  freeComfyMemory,
  fetchComfyModelLists,
  generateVideoWithComfy,
  generateWithComfy,
  revokeComfyImages,
  revokeComfyVideos,
  uploadImageToComfy,
} from "@/api/comfyui/transport";

export type {
  ComfyModelLists,
  ComfyRemoteGenerateResult,
  ComfyRemoteImage,
  ComfyRemoteVideo,
} from "@/api/comfyui/types";
