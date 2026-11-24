// 图片服务只通过 preload 调用；渲染层既不接触密钥原值，也不直接请求远端。
// 同一解包边界覆盖业务失败与桥接缺失，页面负责显示就近的翻译提示。
// 状态查询、保存与清除复用设置页原凭据表单，只替换底层动作。
import { unwrapIpc } from "@/utils/ipcResult";
import type { EuzhiImageRequest } from "@illusion-realm/shared";
function api() {
  if (!window.electronAPI?.euzhiImageGenerate) throw new Error("euzhi-desktop-required");
  return window.electronAPI;
}
export async function euzhiImageKeyStatus() { return unwrapIpc(await api().euzhiImageSecretStatus()); }
export async function saveEuzhiImageKey(key: string) { return unwrapIpc(await api().euzhiImageSecretSet(key)); }
export async function clearEuzhiImageKey() { return unwrapIpc(await api().euzhiImageSecretClear()); }
export async function generateEuzhiImage(request: EuzhiImageRequest) { return unwrapIpc(await api().euzhiImageGenerate(request)); }
export async function cancelEuzhiImage(id: string) { return unwrapIpc(await api().euzhiImageCancel(id)); }
