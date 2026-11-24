"use client";

/** 来源详情和触发词共用的按需读取：只查指定文件，切换时丢弃过期响应，不缓存用户可能修改的 JSON。 */
import { useEffect, useState } from "react";
import type { LocalModelMetadataEntry } from "@illusion-realm/shared";
import { readLocalModelMetadata } from "@/utils/electronBridge";

// 尚未请求或等待期间使用同一个空集合，避免只因空数组新引用触发反复排序。
// 这个空集合只读使用，消费者必须创建新数组再排序，不能 push 写进它。
// 实际读取完成仍返回当前 requestKey 的 entries，旧请求不会占用新范围。
// 不缓存磁盘资料本身，手动扫描与补全 revision 变化依然会重新读取。
// 这里只稳定空态身份，不把失败标成成功，也不改变 loading/failed 的判断。
// 默认名称排序无需旁车时，空集合稳定尤其能避免每次点击都重排全列表。
// Map/排序缓存以实际结果引用为依据，不能用数组长度替代资料内容变化。
const EMPTY_ENTRIES: LocalModelMetadataEntry[] = [];
// 对象内容相同但请求版本不同仍视为新读取，不能让稳定空集合掩盖数据更新。
// entries 的空引用只用于展示派生，不作为“磁盘没有来源 JSON”的持久证据。
// failed、loading 和 entries 分别消费，空数组不能代替错误提示。
// 一份来源文件被外部覆盖但保留路径时，原 revision 依旧承担主动失效职责。

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
  return { entries: result?.key === requestKey ? result.entries : EMPTY_ENTRIES, loading: result?.key !== requestKey && filePaths.length > 0, failed: result?.key === requestKey && result.failed };
}
