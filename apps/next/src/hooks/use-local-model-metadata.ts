"use client";

/** 来源详情和触发词共用的按需读取：只查指定文件，切换时丢弃过期响应，不缓存用户可能修改的 JSON。 */
import { useEffect, useState } from "react";
import type { LocalModelMetadataEntry } from "@illusion-realm/shared";
import { readLocalModelMetadata } from "@/utils/electronBridge";

export function useLocalModelMetadata(filePaths: string[], revision = 0) {
  const key = JSON.stringify([...new Set(filePaths)]);
  const requestKey = `${revision}:${key}`;
  const [result, setResult] = useState<{ key: string; entries: LocalModelMetadataEntry[]; failed: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const paths: string[] = JSON.parse(key);
        const entries: LocalModelMetadataEntry[] = [];
        for (let offset = 0; offset < paths.length && !cancelled; offset += 200) entries.push(...await readLocalModelMetadata(paths.slice(offset, offset + 200)));
        if (!cancelled) setResult({ key: requestKey, entries, failed: false });
      } catch { if (!cancelled) setResult({ key: requestKey, entries: [], failed: true }); }
    }
    void load();
    return () => { cancelled = true; };
  }, [key, requestKey]);
  return { entries: result?.key === requestKey ? result.entries : [], loading: result?.key !== requestKey && filePaths.length > 0, failed: result?.key === requestKey && result.failed };
}
