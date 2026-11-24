"use client";

/**
 * 本地图片的取用与缓存（缩略图 / 预览共用，避免同一路径重复读盘）。
 *
 * 怎么做：Map 缓存 + 并发去重（同一路径只发一次请求）+ `useSyncExternalStore` 订阅，
 * 配合 `hooks/useLocalImageSrc` 使用。
 */

import { isElectronEnvironment, readLocalImage } from "@/utils/electronBridge";
import { buildLocalFileUrl } from "@/utils/localFileUrl";

const localImageSrcCache = new Map<string, string>();
const pendingLoads = new Map<string, Promise<string | null>>();

/** 缓存变化时的订阅者（供 useSyncExternalStore 使用） */
// 订阅按路径分组，封面完成时不再唤醒整个图片墙。
// 同一张图片可以被列表和预览同时订阅，取消其中一个不影响另一个。
// 浏览器兼容读取保留原桥接；桌面显示改用已有只读媒体协议。
// 像把书的地址交给读者，而不是把整本书复印后塞进每个窗口。
// URL 只负责显示，EXIF 与 PNG Meta 仍走原来读取真实字节的独立接口。
// 不改变协议授权、文件路径编码、Range 或 MIME 的处理。
const listeners = new Map<string, Set<() => void>>();
const CACHE_LIMIT = 256;
/**
 * 每个路径的「快照缓存」：useSyncExternalStore 要求同一状态下 getSnapshot 返回同一引用，
 * 直接读 Map 也能满足（字符串/null 是原始值），这里额外缓存是为了路径切走再回来时行为稳定。
 */
const snapshotCache = new Map<string, string | null>();

function notify(filePath: string): void {
  for (const listener of listeners.get(filePath) ?? []) listener();
}

// 只淘汰无人使用的地址，不能为了限额让正在看的图片突然消失。
// 快照表与地址表同时清理，不留第二份永远增长的路径索引。
// 正在加载的请求仍由 pendingLoads 合并，不因清缓存重复发起。
// trim 不广播淘汰，未挂载的图片没有需要更新的界面。
function trimCache(): void {
  // 删除地址引用不会修改文件，也不会 revoke 另一实例正在使用的媒体。
  // Map 遍历时允许删除当前项，不会跳过后面的待淘汰地址。
  // 达到预算便停止，不在每次插入后继续扫描全部历史地址。
  // 前面全是活跃项时继续找闲置项，不能只看首项就放弃清理。
  // snapshotCache 不保留 null，空路径查询不会累积负缓存。
  // 快照读取不启动请求、不更新 React 状态，符合外部 store 约定。
  // 返回原始字符串或 null，而非每次产生新对象导致重复渲染。
  // 新封面先删除再插入，不会继承旧地址在淘汰队列里的位置。
  // 这是有界先入先出策略，不冒称按字节衡量的精确 LRU。
  for (const key of localImageSrcCache.keys()) {
    if (localImageSrcCache.size <= CACHE_LIMIT) break;
    if (listeners.get(key)?.size) continue;
    localImageSrcCache.delete(key);
    snapshotCache.delete(key);
  }
}

/** Re-read a replaced logo even when its path is unchanged. Await any older load first. */
export async function invalidateLocalImageSrc(filePath: string): Promise<void> {
  await pendingLoads.get(filePath);
  localImageSrcCache.delete(filePath);
  snapshotCache.delete(filePath);
  notify(filePath);
  await loadLocalImageSrc(filePath);
}

/**
 * 订阅缓存变化
 * @returns 取消订阅函数
 */
export function subscribeLocalImageSrc(filePath: string | null | undefined, listener: () => void): () => void {
  // 空态卡片不登记路径，不能为不存在的媒体产生订阅条目。
  // Set 仅去重同一回调，两个实例依然拥有各自的取消函数。
  // 退订只删除自己，不用遍历全部图片查找这个监听。
  // 回调只通知重新取快照，不以通知次数作为解码或补全成功次数。
  // 同路径覆盖必须走 invalidate，不能依赖卡片碰巧重新挂载。
  // 关闭预览后列表还在时，列表订阅继续保护同一地址不被驱逐。
  // 最后一个观察者退出才移除 Set，避免空集合无限占用路径表。
  // 页面卸载清理监听后，不再向旧组件发送任何图片完成通知。
  if (!filePath) return () => {};
  const group = listeners.get(filePath) ?? new Set<() => void>();
  listeners.set(filePath, group);
  group.add(listener);
  return () => {
    group.delete(listener);
    if (!group.size) listeners.delete(filePath);
    trimCache();
  };
}

export function getCachedLocalImageSrc(
  filePath: string | null | undefined
): string | null {
  if (!filePath) return null;
  return snapshotCache.get(filePath) ?? localImageSrcCache.get(filePath) ?? null;
}

export function loadLocalImageSrc(
  filePath: string | null | undefined
): Promise<string | null> {
  if (!filePath) return Promise.resolve(null);

  const cached = localImageSrcCache.get(filePath);
  if (cached) return Promise.resolve(cached);

  const pending = pendingLoads.get(filePath);
  if (pending) return pending;

  // 缓存失效后使用新地址，保证原路径覆盖封面时浏览器重新读取。
  // path 参数仍由公共 URL 工具整体编码，文件名的百分号不会被二次解码。
  // 附加参数只更新媒体身份，不成为新的文件系统路径或读取能力。
  // Date.now 加随机值避免同一毫秒连续换封面拿到相同缓存键。
  // 生成地址不说明文件存在；真实解码错误由图片控件显示原有缺图态。
  // 不把读取链接的完成当成“图片已解码”的成功提示。
  const source = isElectronEnvironment()
    ? Promise.resolve(`${buildLocalFileUrl(filePath)}&revision=${Date.now()}-${Math.random()}`)
    : readLocalImage(filePath);
  const loadPromise = source
    // 随机后缀不进入素材 ID、保存文档或模型身份比较。
    // 兼容读取失败返回 null，不将拒绝留成未处理的后台异常。
    // null 不永久缓存，权限恢复或文件重新出现后仍可再次请求。
    // finally 无论成败都释放 pending，不能阻断下一次显式重试。
    // invalidate 等旧请求结束，避免旧结果晚到覆盖新封面地址。
    // 每个路径的快照独立，A 的封面变化不让 B 的快照临时变 null。
    // 图片刷新不触发模型哈希、网络补全或全库资料读取。
    // 相邻预取继续保留，切换历史图片不必先复制整个文件到 renderer。
    // 当前显示与预览可以共享地址，但 alt、错误和选择仍是各实例状态。
    .then((url) => {
      if (url) {
        localImageSrcCache.set(filePath, url);
        snapshotCache.set(filePath, url);
        notify(filePath);
        trimCache();
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
