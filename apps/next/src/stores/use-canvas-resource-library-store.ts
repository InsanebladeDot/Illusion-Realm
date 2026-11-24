"use client";

/** 全局素材清单共享一份缓存；真实引用仍存节点附件，选择清单本身不构成依赖。 */
import { create } from "zustand";
import type { CanvasResourceItem } from "@illusion-realm/shared/schemas/canvas-library.schema";
import { canvasLibrary } from "@/view/infinite-canvas/canvas-library-api";

interface State {
  items: CanvasResourceItem[];
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
}

// 同时打开菜单和素材窗时共用一次读取，像多人看同一张清单，不重复扫描磁盘。
let pending: Promise<void> | null = null;
export const useCanvasResourceLibraryStore = create<State>((set) => ({
  items: [], loading: false, error: false,
  refresh: () => {
    if (pending) return pending;
    set({ loading: true, error: false });
    pending = canvasLibrary({ operation: "libraryResources" }).then(result => {
      if (!result || !("resourceItems" in result)) throw Error("canvas-resource-invalid-result");
      set({ items: result.resourceItems, loading: false });
    }).catch(() => { set({ items: [], loading: false, error: true }); }).finally(() => { pending = null; });
    return pending;
  },
}));
