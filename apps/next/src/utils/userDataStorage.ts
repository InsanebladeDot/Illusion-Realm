/**
 * 把用户数据文档接到 Zustand persist（按 section 持久化 + 落盘）。
 *
 * 怎么做：为每个 section 建一个 `PersistStorage`，文档读进内存缓存，
 * 写入先合并进同一份文档、再由 `flushUserDataSave` 统一落盘。
 */
import type { PersistStorage } from "zustand/middleware";
import type { UserDataDocument, UserDataSectionKey } from "@/types/userData";
import {
  loadUserDataDocument,
  saveUserDataDocument,
} from "@/utils/userDataDocument";

let documentCache: UserDataDocument | null = null;
let loadPromise: Promise<UserDataDocument> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave = false;

async function ensureDocumentLoaded(): Promise<UserDataDocument> {
  if (documentCache) return documentCache;
  if (!loadPromise) {
    loadPromise = loadUserDataDocument().then((result) => {
      documentCache = result.data;
      return result.data;
    });
  }
  return loadPromise;
}

function scheduleSave(): void {
  pendingSave = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void flushUserDataSave().catch(() => {
      // 定时写盘失败不能变成未处理的 Promise，也不能输出用户文档或私人路径。
      console.warn("[user-data] Could not persist local changes.");
    });
  }, 300);
}

/**
 * 主动刷盘的时序约定：
 * 各业务 store 共享 documentCache，不能在这里用一个段覆盖整份文档。
 * createUserDataSectionPersistStorage.setItem 先 await 文档，再合并业务段。
 * 即使文档已经缓存，async 函数也会在 await 后的微任务里继续。
 * 调用方在 setState 后马上 flush 时，原实现可能看到尚未设置的 pendingSave。
 * 本函数也等待同一个文档，前一个分段写入的微任务就能先完成合并。
 * 这不是固定延时，不依赖机器速度或一个猜测的三百毫秒等待。
 * 首次加载失败时异常继续交给调用方，不拿空默认值覆盖未知旧文档。
 * 没有待保存修改时不写文件，避免查看统计本身造成无意义磁盘写入。
 * 真正写入前清掉 pendingSave，让保存期间的新变更能够重新标记。
 * 传给文档层的是当前缓存，其他业务已经合并的分段也一起保留。
 * 生成记录自己触发 flush，普通设置仍可以继续采用既有节流机制。
 * 主动 flush 不取消节流计时器，计时器之后会因无待保存修改而空返回。
 * 文件写入失败时恢复 pendingSave，下一次调用还可以尝试保存同一份缓存。
 * 失败不清空 documentCache，用户还可以在当前进程看到新完成的统计。
 * 失败不清空旧磁盘文件，底层写入策略仍沿用现有用户文档实现。
 * 这里不实现无限重试，错误恢复策略交给显式下一次操作或保存调用。
 * 异常原样向上传递，生成记录调用者可以单独显示统计保存失败。
 * 节流调用者仍在自己的 catch 中记录脱敏警告，避免未处理拒绝。
 * 本函数不把统计写盘失败映射为 ComfyUI 错误，因为两个副作用已经分开。
 * 没有增加第二个保存队列或数据库事务，仍然沿用整个应用的一份用户文档。
 */
export async function flushUserDataSave(): Promise<void> {
  // 分段 setItem 会先等待同一个文档；flush 也等待它，让前面的合并先完成。
  // 像先等收银员把小票放进账本，再把账本装箱，不能拿走尚未写入的旧页。
  // 对已加载文档也保留这个异步边界，使同轮提交的持久化顺序保持一致。
  await ensureDocumentLoaded();
  if (!pendingSave || !documentCache) return;
  pendingSave = false;
  try { await saveUserDataDocument(documentCache); }
  catch (error) {
    // 失败后保留待保存标记，下一次修改或主动 flush 可以重试同一份缓存。
    // 原异常交给调用方显示，不清空用户数据，也不输出文档内容。
    // 保存错误不代表生成文件失败，两种结果必须分别报告。
    pendingSave = true;
    throw error;
  }
}

export async function preloadUserDataDocument(): Promise<UserDataDocument> {
  return ensureDocumentLoaded();
}

export function primeUserDataDocument(data: UserDataDocument): void {
  documentCache = data;
  loadPromise = Promise.resolve(data);
}

export function createUserDataSectionPersistStorage<P>(
  section: UserDataSectionKey
): PersistStorage<P> {
  return {
    getItem: async () => {
      const doc = await ensureDocumentLoaded();
      const slice = doc[section];
      return { state: slice as unknown as P };
    },
    setItem: async (_name, value) => {
      const doc = await ensureDocumentLoaded();
      documentCache = {
        ...doc,
        [section]: value.state,
      } as UserDataDocument;

      if (
        section === "settings" &&
        value.state &&
        typeof value.state === "object" &&
        "userDataPath" in value.state
      ) {
        const path = (value.state as { userDataPath?: string }).userDataPath;
        documentCache.userDataPath = typeof path === "string" ? path : "";
      }

      scheduleSave();
    },
    removeItem: async () => {
      // no-op: user data is managed as a single document
    },
  };
}
