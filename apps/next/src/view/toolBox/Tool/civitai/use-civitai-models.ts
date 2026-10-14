"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCivitai, type CivitaiFilters, type CivitaiModel } from "@/utils/civitai";

export function useCivitaiModels(filters: CivitaiFilters) {
  const [models, setModels] = useState<CivitaiModel[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async (page: string | null = null) => {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    const timer = setTimeout(() => request.abort(), 25000);
    setStatus("loading");
    if (!page) { setModels([]); setNext(null); }
    try {
      const data = await fetchCivitai(filters, page, request.signal);
      if (controller.current !== request) return;
      setModels((previous) => { const existing = page ? previous : []; const ids = new Set(existing.map((model) => model.id)); return [...existing, ...data.models.filter((model) => !ids.has(model.id))]; });
      setNext(data.next); setStatus("ready");
    } catch { if (controller.current === request) setStatus("error"); }
    finally { clearTimeout(timer); }
  }, [filters]);
  useEffect(() => {
    const start = setTimeout(() => { void load(); }, 0);
    return () => { clearTimeout(start); controller.current?.abort(); controller.current = null; };
  }, [load]);
  return { models, next, status, load };
}
