"use client";
/** 清单关闭不取消已加入的下载；组件只管理选目录和提交期间的界面状态。 */
import { useEffect, useRef, useState } from "react";
import type { SetupDownloadId, SetupDownloadItem, SetupDownloadResult } from "@illusion-realm/shared";
import { getElectronAPI } from "@/utils/electronBridge";
import { unwrapIpc } from "@/utils/ipcResult";
import { downloadSetupModels } from "@/utils/setup-downloads";
import { flushUserDataSave } from "@/utils/userDataStorage";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { downloadErrorMessage } from "@/utils/model-downloads";

/** 复用原生目录选择器和设置保存链；取消选择不改变原路径。 */
async function selectModelsFolder() {
  const api = getElectronAPI();
  if (!api?.selectFolder) throw new Error("desktop");
  const selected = unwrapIpc(await api.selectFolder(useSettingsStore.getState().paths.searchPath || undefined));
  if (!selected) return;
  useSettingsStore.getState().setPath("searchPath", selected);
  await flushUserDataSave();
  // 选完立即检查已有文件，用户不用再点一次扫描。
  await useSettingsStore.getState().scanAllModels();
}

interface SetupState { busy: boolean; error: string; result: SetupDownloadResult | null; files: SetupDownloadItem[]; root: string }
export function useSetupDownloads() {
  const [state, setState] = useState<SetupState>({ busy: false, error: "", result: null, files: [], root: "" });
  const guard = useRef({ busy: false, mounted: true });
  useEffect(() => {
    const current = guard.current; current.mounted = true;
    return () => { current.mounted = false; };
  }, []);
  async function act(ids?: SetupDownloadId[]) {
    if (guard.current.busy) return;
    guard.current.busy = true;
    setState(previous => ({ ...previous, busy: true, error: "" }));
    try {
      const root = useSettingsStore.getState().paths.searchPath;
      let result: SetupDownloadResult | null = null;
      if (ids) result = await downloadSetupModels(ids);
      else await selectModelsFolder();
      // 分组结果像逐项打勾：保留同一目录其他组的核对结果，换目录后重新核对。
      const items = result?.items ?? [];
      if (guard.current.mounted) setState(previous => ({ busy: true, error: "", result, root,
        files: [...(previous.root === root ? previous.files.filter(file => !items.some(item => item.id === file.id)) : []), ...items],
      }));
    } catch (error) {
      if (guard.current.mounted) setState(previous => ({ ...previous, error: downloadErrorMessage(error) }));
    } finally {
      guard.current.busy = false;
      if (guard.current.mounted) setState(previous => ({ ...previous, busy: false }));
    }
  }
  return { ...state, act };
}
