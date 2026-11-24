/** Agent 和转译共用型号解析与识图判断；未知能力不放行图片，也不影响文字请求。 */
import type { AgentCatalog, AgentProvider, PromptAssistantPreferences } from '@illusion-realm/shared';
import { t } from '@/i18n';

export function modelImageInput(catalog: AgentCatalog | undefined, model: string): boolean | null {
  return catalog?.models.find(item => item.id === model)?.imageInput ?? null;
}

/** 模型名必须与实际转译请求一致，不能拿 Agent 的另一个选择控制上传开关。 */
export function promptModelId(preferences: PromptAssistantPreferences, fallback = ''): string {
  if (preferences.provider === 'custom') return preferences.customModel;
  return preferences.models?.[preferences.provider] || (preferences.provider === 'glm' ? preferences.model : '') || fallback;
}

export function imageCapabilityHint(capability: boolean | null): string {
  return t(capability === true ? 'agent.providers.imageSupported' : capability === false ? 'agent.providers.imageUnsupported' : 'agent.providers.imageUnknown');
}

/** 发送前再核对快照，避免先选图、后换成文本模型时，附件绕过置灰按钮。 */
export function assertModelImages(provider: AgentProvider | 'custom', model: string, catalogs: Partial<Record<AgentProvider, AgentCatalog>>): void {
  const capability = provider === 'custom' ? null : modelImageInput(catalogs[provider], model);
  if (capability !== true) throw new Error(imageCapabilityHint(capability));
}
