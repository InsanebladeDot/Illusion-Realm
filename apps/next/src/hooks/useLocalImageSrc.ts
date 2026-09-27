"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  getCachedLocalImageSrc,
  loadLocalImageSrc,
  subscribeLocalImageSrc,
} from "@/utils/localImageSrcCache";

export {
  getCachedLocalImageSrc,
  prefetchLocalImage,
  prefetchLocalImages,
} from "@/utils/localImageSrcCache";

/** 路径为空时的稳定快照 */
function getNullSnapshot(): null {
  return null;
}

/**
 * 把本地图片路径解析为可用的 data URL。
 *
 * 缓存本身就是组件外部的「store」（模块级 Map + 订阅），因此用
 * useSyncExternalStore 订阅它，而不是「useEffect 里读缓存 → setState」：
 * 后者会在 effect 内同步 setState（级联渲染，react-hooks/set-state-in-effect）。
 * 这里 effect 只负责触发加载，结果通过缓存通知回流。
 */
export function useLocalImageSrc(filePath: string | null | undefined): string | null {
  const src = useSyncExternalStore(
    subscribeLocalImageSrc,
    () => getCachedLocalImageSrc(filePath),
    getNullSnapshot
  );

  useEffect(() => {
    if (!filePath) return;
    if (getCachedLocalImageSrc(filePath)) return;
    void loadLocalImageSrc(filePath);
  }, [filePath]);

  return src;
}
