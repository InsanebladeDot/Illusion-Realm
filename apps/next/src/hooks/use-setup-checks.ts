"use client";

/** 清单打开时探查目标路径，按下校验才读文件内容；下载与校验共用主进程的检查记录。 */
import { useEffect, useRef, useState } from "react";
import type { SetupCheckItem, SetupDownloadId, SetupDownloadResult } from "@illusion-realm/shared";
import { checkSetupModels } from "@/utils/setup-downloads";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { downloadErrorMessage } from "@/utils/model-downloads";

interface Snapshot { root: string; files: Record<string, SetupCheckItem>; error: string }
const EMPTY: Snapshot = { root: "", files: {}, error: "" };

/** 换目录后丢掉上一个目录的证据，同一目录只替换本次实际检查的条目。 */
function mergeChecks(previous: Snapshot, root: string, items: SetupCheckItem[]): Snapshot {
  const files = previous.root === root ? previous.files : {};
  return { root, files: { ...files, ...Object.fromEntries(items.map(item => [item.id, item])) }, error: "" };
}

export function useSetupChecks(root: string, ids: SetupDownloadId[], downloadResult: SetupDownloadResult | null) {
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [verifying, setVerifying] = useState(false);
  const busy = useRef(false);
  const generation = useRef(0);
  const scanned = useSettingsStore(state => state.lastScannedAt);
  useEffect(() => {
    if (!root) return;
    let disposed = false;
    const inspect = async () => {
      if (busy.current) return;
      const request = ++generation.current;
      try {
        const { items } = await checkSetupModels(ids, "inspect");
        if (!disposed && request === generation.current) setSnapshot(previous => mergeChecks(previous, root, items));
      } catch (error) {
        if (!disposed && request === generation.current) setSnapshot({ root, files: {}, error: downloadErrorMessage(error) });
      }
    };
    void inspect();
    window.addEventListener("focus", inspect);
    return () => { disposed = true; window.removeEventListener("focus", inspect); };
  }, [root, ids, scanned, downloadResult, verifying]);

  async function verify(selection: SetupDownloadId[]) {
    if (!root || busy.current) return;
    busy.current = true;
    generation.current++;
    setVerifying(true);
    setSnapshot(previous => ({ ...previous, error: "" }));
    try {
      const { items } = await checkSetupModels(selection, "verify");
      if (useSettingsStore.getState().paths.searchPath === root) setSnapshot(previous => mergeChecks(previous, root, items));
    } catch (error) {
      if (useSettingsStore.getState().paths.searchPath === root) setSnapshot(previous => ({ root, files: previous.root === root ? previous.files : {}, error: downloadErrorMessage(error) }));
    } finally {
      busy.current = false;
      setVerifying(false);
    }
  }

  return { ...(snapshot.root === root ? snapshot : EMPTY), verifying, verify };
}
