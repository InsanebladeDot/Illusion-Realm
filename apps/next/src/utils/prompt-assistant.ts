/** Prompt assistant defaults and IPC facade: validate requests, translate stable errors, never read credentials. */
import { PromptTransformSchema, PromptConnectionSchema, PromptSecretArgsSchema, type PromptAssistantPreferences, type PromptConnection, type PromptTransformRequest } from "@illusion-realm/shared";
import { t } from "@/i18n";
import { unwrapIpc } from "@/utils/ipcResult";
export const GLM_MODELS = ["glm-4.7-flash", "glm-4.5-flash", "glm-4-flash-250414"] as const;
export const PROMPT_DEFAULTS: PromptAssistantPreferences = { provider: "glm", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: GLM_MODELS[0], customModel: "", presetId: "translate", presets: [] };
function api() {
  if (!window.electronAPI?.transformPrompt) throw new Error(t("create.promptAssistant.desktopOnly"));
  return window.electronAPI;
}
export function assistantError(error: unknown): string {
  const code = error instanceof Error ? error.message : "failed";
  const errors: Record<string, string> = {
    invalid: t("create.promptAssistant.invalid"), invalidEndpoint: t("create.promptAssistant.invalid"),
    missingKey: t("create.promptAssistant.missingKey"), unauthorized: t("create.promptAssistant.unauthorized"),
    forbidden: t("create.promptAssistant.forbidden"), secretSaveFailed: t("create.promptAssistant.secretSaveFailed"),
    rateLimited: t("create.promptAssistant.rateLimited"), timeout: t("create.promptAssistant.timeout"),
    networkFailed: t("create.promptAssistant.networkFailed"), emptyResponse: t("create.promptAssistant.emptyResponse"),
    truncatedResponse: t("create.promptAssistant.truncatedResponse"),
    [t("create.promptAssistant.desktopOnly")]: t("create.promptAssistant.desktopOnly"),
  };
  return errors[code] ?? t("create.promptAssistant.failed");
}
export async function transformPrompt(request: PromptTransformRequest) {
  const parsed = PromptTransformSchema.safeParse(request);
  if (!parsed.success) throw new Error(t("create.promptAssistant.invalid"));
  try { return unwrapIpc(await api().transformPrompt(parsed.data)); }
  catch (error) { throw new Error(assistantError(error)); }
}
export async function promptSecretStatus(connection: PromptConnection) {
  return unwrapIpc(await api().promptSecretStatus(PromptConnectionSchema.parse(connection)));
}
export async function savePromptSecret(connection: PromptConnection, key: string) {
  const args = PromptSecretArgsSchema.safeParse([connection, key]);
  if (!args.success) throw new Error("invalid");
  return unwrapIpc(await api().promptSetSecret(...args.data));
}
export async function clearPromptSecret(connection: PromptConnection) {
  return unwrapIpc(await api().promptClearSecret(PromptConnectionSchema.parse(connection)));
}
export function presetInstruction(preferences: PromptAssistantPreferences) {
  if (preferences.presetId === "anima") return t("create.promptAssistant.animaInstruction");
  return preferences.presets.find(item => item.id === preferences.presetId)?.instruction ?? t("create.promptAssistant.translationInstruction");
}
