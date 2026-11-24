"use client";
/** 离线队列逐个提交；停止只拦住后续文件，当前文件安全完成后保存。 */
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { hashLocalModel } from "@/utils/electronBridge";
import { useSettingsStore } from "@/stores/useSettingsStore";
import type { LocalModelHashResult } from "@illusion-realm/shared";

interface HashItem { filePath: string; label: string; status: "waiting" | "running" | LocalModelHashResult["status"] }
interface BatchState { items: HashItem[]; running: boolean; failed: boolean }
interface BatchControl { running: boolean; stopped: boolean; mounted: boolean }
type SetBatch = Dispatch<SetStateAction<BatchState>>;

/** 单项失败不会截断全队列，传输异常与磁盘失败一样留在结果中。 */
async function processFile(filePath: string): Promise<HashItem["status"]> {
  try { return (await hashLocalModel(filePath)).status; }
  catch { return "io"; }
}

/** 用快照固定本轮范围；重复点击由同步开关挡住，不等待 React 下一次刷新。 */
async function runBatch(control: BatchControl, setState: SetBatch) {
  if (control.running) return;
  control.running = true; control.stopped = false;
  const paths = [...new Set(useSettingsStore.getState().models.flatMap(model => model.versions.map(version => version.filePath)))];
  const items: HashItem[] = paths.map(filePath => ({ filePath, label: filePath.split(/[/\\]/).pop() || filePath, status: "waiting" }));
  const publish = () => { if (control.mounted) setState({ items: [...items], running: control.running, failed: false }); };
  publish();
  try {
    for (let index = 0; index < items.length && !control.stopped; index++) {
      items[index] = { ...items[index], status: "running" }; publish();
      const status = await processFile(items[index].filePath);
      items[index] = { ...items[index], status }; publish();
    }
    // 仅刷新小型来源记录，不重扫封面或重新读取模型字节。
    useSettingsStore.setState({ lastScannedAt: Date.now() });
  } catch { if (control.mounted) setState(previous => ({ ...previous, failed: true })); }
  finally {
    control.running = false;
    if (control.mounted) setState(previous => ({ ...previous, running: false }));
  }
}

/** 页面离开或弹窗关闭都停止后续项，不把卸载后的结果写回组件。 */
export function useLocalModelHashBatch() {
  const [state, setState] = useState<BatchState>({ items: [], running: false, failed: false });
  const control = useRef<BatchControl>({ running: false, stopped: false, mounted: true });
  useEffect(() => {
    control.current.mounted = true;
    const current = control.current;
    return () => { current.stopped = true; current.mounted = false; };
  }, []);
  return { ...state, run: () => runBatch(control.current, setState), stop: () => { control.current.stopped = true; } };
}
