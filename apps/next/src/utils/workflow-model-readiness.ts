/** 按当前工作流逐个核对本地加载文件；像检查配方，少一项就不能开工，手工勾选不能解锁。 */
import type { ComfyApiPrompt } from '@/types/comfy';
import type { LocalModel } from '@/types/localModel';
import type { SettingsPaths } from '@/types/settings';
import { getVideoModelNames, getVideoModelSlots } from '@/utils/comfy/video-workflow-models';
import { toComfyRelativeModelName } from '@/utils/comfy/comfyModelPath';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { t } from '@/i18n';

/** 只含可展示的缺项文件名，画布可识别此错误而不泄漏服务响应正文。 */
export class WorkflowModelsMissingError extends Error {}

const key = (value: string) => value.replaceAll('\\', '/').toLowerCase();

/** 完整路径优先；跨目录仅接受唯一同名文件，两个同名文件不能随便挑一个。 */
function matches(name: string, candidates: string[]) {
  if (candidates.some(value => key(value) === key(name) || key(name).endsWith('/' + key(value)))) return true;
  const base = key(name).split('/').pop();
  return new Set(candidates.filter(value => key(value).split('/').pop() === base).map(key)).size === 1;
}

export function missingWorkflowModels(prompt: ComfyApiPrompt, models: LocalModel[], paths: SettingsPaths): string[] {
  // 零字节占位文件不算权重；下载中的 .part 文件也不会进入原扫描索引。
  const installed = models.map(model => ({ ...model, versions: model.versions.filter(file => file.bytes !== 0) }));
  const missing = getVideoModelSlots(prompt).filter(slot => slot.defaultName !== 'pixel_space'
    && !matches(slot.defaultName, getVideoModelNames(slot, installed, paths, null))).map(slot => slot.defaultName);
  const roots = [paths.checkpointPath, paths.searchPath && `${paths.searchPath}/checkpoints`].filter(Boolean);
  const checkpoints = installed.filter(model => model.type === 'checkpoint').flatMap(model => model.versions.flatMap(file =>
    roots.flatMap(root => { const name = toComfyRelativeModelName(file.filePath, root); return name ? [name] : []; })));
  for (const node of Object.values(prompt)) {
    if (node.class_type === 'ModelPatchLoader' && typeof node.inputs.name === 'string') {
      const root = paths.searchPath && `${paths.searchPath}/model_patches`;
      const names = root ? installed.flatMap(model => model.versions.flatMap(file => { const name = toComfyRelativeModelName(file.filePath, root); return name ? [name] : []; })) : [];
      if (!matches(node.inputs.name, names)) missing.push(node.inputs.name);
    }
    if (node.class_type === 'CheckpointLoaderSimple' && typeof node.inputs.ckpt_name === 'string'
      && !matches(node.inputs.ckpt_name, checkpoints)) missing.push(node.inputs.ckpt_name);
  }
  return [...new Set(missing)];
}

/** 提交也走同一检查，不能用 Enter、旧回调或排队任务绕过禁用按钮。 */
export function assertWorkflowModelsInstalled(prompt: ComfyApiPrompt) {
  const { models, paths, scanning } = useSettingsStore.getState();
  if (scanning) throw new WorkflowModelsMissingError(t('components.setupChecklist.checkingModels'));
  const missing = missingWorkflowModels(prompt, models, paths);
  if (missing.length) throw new WorkflowModelsMissingError(t('components.setupChecklist.blockedModels', { names: missing.map(name => name.split(/[/\\]/).pop()).join(', ') }));
}
