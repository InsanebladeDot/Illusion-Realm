"use client";

/**
 * 本地图片的取用与缓存（缩略图 / 预览共用，避免同一路径重复读盘）。
 *
 * 怎么做：Map 缓存 + 并发去重（同一路径只发一次请求）+ `useSyncExternalStore` 订阅，
 * 配合 `hooks/useLocalImageSrc` 使用。
 */

import { readLocalImage } from "@/utils/electronBridge";

const localImageSrcCache = new Map<string, string>();
const pendingLoads = new Map<string, Promise<string | null>>();

/** 缓存变化时的订阅者（供 useSyncExternalStore 使用） */
const listeners = new Set<() => void>();
/**
 * 每个路径的「快照缓存」：useSyncExternalStore 要求同一状态下 getSnapshot 返回同一引用，
 * 直接读 Map 也能满足（字符串/null 是原始值），这里额外缓存是为了路径切走再回来时行为稳定。
 */
const snapshotCache = new Map<string, string | null>();

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * 订阅缓存变化
 * @returns 取消订阅函数
 */
export function subscribeLocalImageSrc(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCachedLocalImageSrc(
  filePath: string | null | undefined
): string | null {
  if (!filePath) return null;
  if (snapshotCache.has(filePath)) return snapshotCache.get(filePath) ?? null;
  const cached = localImageSrcCache.get(filePath) ?? null;
  snapshotCache.set(filePath, cached);
  return cached;
}

export function loadLocalImageSrc(
  filePath: string | null | undefined
): Promise<string | null> {
  if (!filePath) return Promise.resolve(null);

  const cached = localImageSrcCache.get(filePath);
  if (cached) return Promise.resolve(cached);

  const pending = pendingLoads.get(filePath);
  if (pending) return pending;

  const loadPromise = readLocalImage(filePath)
    .then((url) => {
      if (url) {
        localImageSrcCache.set(filePath, url);
        snapshotCache.set(filePath, url);
        notify();
      }
      return url;
    })
    .catch(() => null)
    .finally(() => {
      pendingLoads.delete(filePath);
    });

  pendingLoads.set(filePath, loadPromise);
  return loadPromise;
}

export function prefetchLocalImage(filePath: string | null | undefined): void {
  if (!filePath || localImageSrcCache.has(filePath)) return;
  void loadLocalImageSrc(filePath);
}

export function prefetchLocalImages(
  filePaths: Array<string | null | undefined>
): void {
  for (const filePath of filePaths) {
    prefetchLocalImage(filePath);
  }
}
