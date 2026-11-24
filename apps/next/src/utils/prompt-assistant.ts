/** 转译默认值和 IPC 封装；只处理配置和错误，不向页面读取密钥。 */
import { PromptTransformSchema, PromptConnectionSchema, PromptSecretArgsSchema, type PromptAssistantPreferences, type PromptConnection, type PromptTransformRequest } from "@illusion-realm/shared";
import { t, type MessageKey } from "@/i18n";
import { ANIMA_INSTRUCTION } from "@/data/anima-instruction";
import { MOSS_CAPTION_INSTRUCTION } from "@/data/moss-caption-instruction";
import { MOSS_COMPOSITION_INSTRUCTION, MOSS_COMPOSITION_PRESET } from "@/data/moss-composition-instruction";
import { unwrapIpc } from "@/utils/ipcResult";
export const PROMPT_DEFAULTS: PromptAssistantPreferences = { provider: "glm", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4.7-flash", customModel: "", presetId: "translate", presets: [] };
const MOSS_CAPTION_PRESET = "moss-caption";
// 菜单、请求指令和历史名称共用这份目录，增加预设不用在三个地方分别判断。
export const PROMPT_PRESET_GROUPS = [
  { id: "general", label: "create.promptAssistant.presetGeneral" },
  { id: "minimax", label: "create.promptAssistant.presetMiniMax" },
  { id: "moss", label: "create.promptAssistant.presetMoss" },
] as const;

interface BuiltInPromptPreset {
  group: (typeof PROMPT_PRESET_GROUPS)[number]["id"];
  id: string;
  label: MessageKey;
  instruction: MessageKey | (() => string);
}

export const PROMPT_PRESETS: readonly BuiltInPromptPreset[] = [
  { group: "general", id: "translate", label: "create.promptAssistant.translation", instruction: "create.promptAssistant.translationInstruction" },
  { group: "general", id: "anima", label: "create.promptAssistant.anima", instruction: () => ANIMA_INSTRUCTION },
  { group: "general", id: "image-tags", label: "create.promptAssistant.imageTags", instruction: "create.promptAssistant.imageTagsInstruction" },
  { group: "general", id: "director-storyboard", label: "create.promptAssistant.directorStoryboard", instruction: "create.promptAssistant.directorStoryboardInstruction" },
  { group: "minimax", id: "minimax-h3-base", label: "create.promptAssistant.h3Base", instruction: "create.promptAssistant.h3BaseInstruction" },
  { group: "minimax", id: "minimax-h3-reference", label: "create.promptAssistant.h3Reference", instruction: "create.promptAssistant.h3ReferenceInstruction" },
  { group: "moss", id: MOSS_CAPTION_PRESET, label: "create.promptAssistant.mossCaption", instruction: () => MOSS_CAPTION_INSTRUCTION },
  { group: "moss", id: MOSS_COMPOSITION_PRESET, label: "create.promptAssistant.mossCompositionJson", instruction: () => MOSS_COMPOSITION_INSTRUCTION },
];

/** 查看、复制和发送请求用同一份完整正文。 */
export function builtInPresetInstruction(preset: BuiltInPromptPreset): string {
  return typeof preset.instruction === "function" ? preset.instruction() : t(preset.instruction);
}

/** 菜单勾选和请求读取同一预设。画布其他图片也提供尺寸，但只有 Moss 默认用自然语言。 */
export function preferencesForPrompt(preferences: PromptAssistantPreferences, supportsComposition: boolean, mossPresetScope: boolean): PromptAssistantPreferences {
  if (mossPresetScope) return { ...preferences, presetId: preferences.mossPresetId ?? MOSS_CAPTION_PRESET };
  if (!supportsComposition && preferences.presetId === MOSS_COMPOSITION_PRESET) {
    return { ...preferences, presetId: PROMPT_DEFAULTS.presetId };
  }
  return preferences;
}

/** 两处记忆各自的选择，Moss 用户也可以手动切到通用预设。 */
export function presetSelectionPatch(id: string, mossPresetScope: boolean): Partial<PromptAssistantPreferences> {
  return mossPresetScope ? { mossPresetId: id } : { presetId: id };
}

export function presetName(preferences: PromptAssistantPreferences) {
  return preferences.presets.find(item => item.id === preferences.presetId)?.name
    ?? t(PROMPT_PRESETS.find(item => item.id === preferences.presetId)?.label ?? "create.promptAssistant.translation");
}
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
    imageRequestRejected: t("create.promptAssistant.imageRequestRejected"),
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
  const builtIn = PROMPT_PRESETS.find(item => item.id === preferences.presetId);
  if (builtIn) return builtInPresetInstruction(builtIn);
  return preferences.presets.find(item => item.id === preferences.presetId)?.instruction ?? t("create.promptAssistant.translationInstruction");
}
