export type ComfyRemoteImage = {
  nodeId: string;
  filename: string;
  subfolder: string;
  folderType: string;
  dataUrl: string;
};

export type ComfyRemoteVideo = {
  nodeId: string;
  filename: string;
  subfolder: string;
  folderType: string;
  kind: string;
  dataUrl: string;
};

export type ComfyRemoteGenerateResult = {
  promptId: string;
  images: ComfyRemoteImage[];
  videos: ComfyRemoteVideo[];
};

export type { ComfyModelLists } from "@/types/comfy";
