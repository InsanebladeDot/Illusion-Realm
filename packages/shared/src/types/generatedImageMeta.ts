import type { ComfyApiPrompt } from "./comfy";

export const GENERATED_IMAGE_META_VERSION = 1 as const;

export type GenerationKind = "text2img" | "img2img";

export type GeneratedImageLoraMeta = {
  name: string;
  strength: number;
};

export type GeneratedImageParamsMeta = {
  positivePrompt: string;
  negativePrompt: string;
  seed: number;
  steps: number;
  cfg: number;
  samplerName: string;
  scheduler: string;
  width: number;
  height: number;
  batchSize: number;
  checkpointName: string;
  loras: GeneratedImageLoraMeta[];
};

export type GeneratedImageMetaDocument = {
  version: typeof GENERATED_IMAGE_META_VERSION;
  promptId: string;
  createdAt: string;
  imageIndex: number;
  generationKind?: GenerationKind;
  sourceImagePath?: string | null;
  params: GeneratedImageParamsMeta;
  workflow: ComfyApiPrompt;
};
