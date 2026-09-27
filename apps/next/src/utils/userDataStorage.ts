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
    void flushUserDataSave();
  }, 300);
}

export async function flushUserDataSave(): Promise<void> {
  if (!pendingSave || !documentCache) return;
  pendingSave = false;
  await saveUserDataDocument(documentCache);
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
