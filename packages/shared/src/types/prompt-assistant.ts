/** Prompt assistant contracts: provider-specific credentials stay in the main process. */
export type PromptProvider = "glm" | "custom";
export interface PromptConnection { provider: PromptProvider; baseUrl: string }
export interface PromptTransformRequest extends PromptConnection { model: string; text: string; instruction: string }
export interface PromptSecretStatus { configured: boolean; protection: string; tail: string }
export interface PromptInstructionPreset { id: string; name: string; instruction: string }
export interface PromptAssistantPreferences {
  provider: PromptProvider;
  baseUrl: string;
  model: string;
  customModel: string;
  presetId: string;
  presets: PromptInstructionPreset[];
}
