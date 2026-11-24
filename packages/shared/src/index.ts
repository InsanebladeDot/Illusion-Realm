/// <reference path="./types/png-chunks.d.ts" />
/// <reference path="./modules.d.ts" />

export * from './types';
export * from './types/prompt-assistant';
export * from './data';
export * from './ipc-channels';
export * from './ipc-result';
export * from './schemas';

export type { DirectorDocument, AnimationDocument, AnimationClip, DirectorObject as DirectorRuntimeObject } from "./types/director";
export type { LegacyDirectorScene, LegacyDirectorAnimation } from "./schemas/director-v1-input.schema";
export type { CanvasReferenceVoice, GptSovitsWeights } from "./types/canvas-voice";
