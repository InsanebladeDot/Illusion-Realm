"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
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
 * 把本地图片路径解析为显示地址，桌面端使用流式媒体协议。
 *
 * 缓存本身就是组件外部的「store」（模块级 Map + 订阅），因此用
 * useSyncExternalStore 订阅它，而不是「useEffect 里读缓存 → setState」：
 * 后者会在 effect 内同步 setState（级联渲染，react-hooks/set-state-in-effect）。
 * 这里 effect 只负责触发加载，结果通过缓存通知回流。
 */
export function useLocalImageSrc(filePath: string | null | undefined): string | null {
  // 绑定当前路径，别的封面完成时无需重新检查这张图。
  // 路径没变就保留同一订阅函数，普通重渲染不会反复退订和驱逐缓存。
  // 切图清理交给 React，最后一个观察者离开后才允许淘汰地址。
  // 服务端仍返回空快照，不在静态导出期间访问 Electron。
  // 通知只更新地址，媒体是否可解码仍由实际 img 事件决定。
  // 两个实例使用同一路径时共享加载，但分别拥有自己的取消订阅。
  const subscribe = useCallback((listener: () => void) => subscribeLocalImageSrc(filePath, listener), [filePath]);
  const src = useSyncExternalStore(
    subscribe,
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
