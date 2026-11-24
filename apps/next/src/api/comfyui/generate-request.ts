/** 图片、视频和音频共用提交与计时登记；每次实际请求都归到原任务。 */
import type { ComfyApiPrompt } from "@/types/comfy";
import { t } from "@/i18n";
import { unwrapIpc } from "@/utils/ipcResult";
import { useGenerationTaskStore } from "@/stores/useGenerationTaskStore";

export async function requestComfyGeneration(prompt: ComfyApiPrompt, server: string, requestId?: string) {
  if (!window.electronAPI?.comfyGenerate) throw new Error(t("errors.comfy.featureImageGenerate"));
  const execution = { id: crypto.randomUUID(), server };
  const record = useGenerationTaskStore.getState().recordExecution;
  // 请求前先留空位：后续失败或旧服务没有计时，都不会误报一份不完整的合计。
  if (requestId) record(requestId, execution);
  const result = unwrapIpc(await window.electronAPI.comfyGenerate(prompt, server, requestId));
  if (requestId) record(requestId, { ...execution, promptId: result.promptId, executionMs: result.executionMs });
  return result;
}
