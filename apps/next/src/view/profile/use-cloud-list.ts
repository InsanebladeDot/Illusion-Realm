"use client";

// 图库和收藏夹共用 offset 分页：先保留原始页长作为 offset，再按 ID 去重；不靠卡片数推断页码。
import { useCallback, useEffect, useRef, useState } from "react";
interface CloudPage<T> { items: T[]; offset: number; more: boolean; busy: boolean; error: unknown }
export function useCloudList<T extends { id: string }>(loader: (offset: number) => Promise<T[]>, revision = 0, enabled = true) {
  const [page, setPage] = useState<CloudPage<T>>({ items: [], offset: 0, more: false, busy: true, error: null });
  const request = useRef(0);
  const pending = useRef(false);
  const load = useCallback(async (offset: number) => {
    const ticket = ++request.current;
    pending.current = true;
    setPage(current => ({ ...current, busy: true, error: null }));
    try {
      const items = await loader(offset);
      if (ticket !== request.current) return;
      setPage(current => ({ items: offset ? [...current.items, ...items.filter(item => !current.items.some(old => old.id === item.id))] : items, offset: offset + items.length, more: items.length === 24, busy: false, error: null }));
    } catch (error) { if (ticket === request.current) setPage(current => ({ ...current, busy: false, error })); }
    finally { if (ticket === request.current) pending.current = false; }
  }, [loader]);
  useEffect(() => {
    if (!enabled) return;
    const activeRequest = request;
    void load(0);
    return () => { activeRequest.current++; pending.current = false; };
  }, [load, revision, enabled]);
  function more() { if (!pending.current && page.more) void load(page.offset); }
  return { ...page, more, hasMore: page.more, reload: () => { void load(0); } };
}
