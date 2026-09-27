/**
 * 用户数据文档（`illusion-realm.json`）的加载 / 保存 / 旧数据迁移。
 *
 * 怎么做：Electron 走 `userData:read` / `userData:write`，浏览器语义下回落 localStorage；
 * 读到旧格式先迁移（`migrateLegacyLocalStorage`），默认值来自 shared 的类型定义。
 */
import {
  BROWSER_USER_DATA_KEY,
  LEGACY_STORAGE_KEYS,
} from "@/data/userData";
import type { UserDataDocument, UserDataLoadResult } from "@/types/userData";
import { DEFAULT_USER_DATA_DOCUMENT } from "@/types/userData";
import { isElectronEnvironment } from "@/utils/electronBridge";
import { unwrapIpc } from "@/utils/ipcResult";

function mergeDocument(partial: Partial<UserDataDocument> | null): UserDataDocument {
  if (!partial) return structuredClone(DEFAULT_USER_DATA_DOCUMENT);

  return {
    ...DEFAULT_USER_DATA_DOCUMENT,
    ...partial,
    sidebar: {
      ...DEFAULT_USER_DATA_DOCUMENT.sidebar,
      ...(partial.sidebar ?? {}),
    },
    settings: {
      ...DEFAULT_USER_DATA_DOCUMENT.settings,
      ...(partial.settings ?? {}),
    },
    profile: {
      ...DEFAULT_USER_DATA_DOCUMENT.profile,
      ...(partial.profile ?? {}),
    },
    historyFolders: {
      ...DEFAULT_USER_DATA_DOCUMENT.historyFolders,
      ...(partial.historyFolders ?? {}),
    },
    quickPhrases: {
      ...DEFAULT_USER_DATA_DOCUMENT.quickPhrases,
      ...(partial.quickPhrases ?? {}),
    },
    updates: {
      ...DEFAULT_USER_DATA_DOCUMENT.updates,
      ...(partial.updates ?? {}),
    },
    createForm: {
      ...DEFAULT_USER_DATA_DOCUMENT.createForm,
      ...(partial.createForm ?? {}),
    },
    cartoonBubble: {
      ...DEFAULT_USER_DATA_DOCUMENT.cartoonBubble,
      ...(partial.cartoonBubble ?? {}),
    },
    customCategories: {
      ...DEFAULT_USER_DATA_DOCUMENT.customCategories,
      ...(partial.customCategories ?? {}),
    },
    exifTool: {
      ...DEFAULT_USER_DATA_DOCUMENT.exifTool,
      ...(partial.exifTool ?? {}),
    },
    videoTool: {
      ...DEFAULT_USER_DATA_DOCUMENT.videoTool,
      ...(partial.videoTool ?? {}),
    },
    negativePresets: {
      ...DEFAULT_USER_DATA_DOCUMENT.negativePresets,
      ...(partial.negativePresets ?? {}),
    },
    view3d: {
      ...DEFAULT_USER_DATA_DOCUMENT.view3d,
      ...(partial.view3d ?? {}),
    },
    characterFavorites: {
      ...DEFAULT_USER_DATA_DOCUMENT.characterFavorites,
      ...(partial.characterFavorites ?? {}),
    },
  };
}

function readLegacySection<T>(storageKey: string): T | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { state?: T };
    return parsed.state ?? (parsed as T);
  } catch {
    return null;
  }
}

export function migrateLegacyLocalStorage(
  document: UserDataDocument
): UserDataDocument {
  const next = mergeDocument(document);

  const legacySettings = readLegacySection<Partial<UserDataDocument["settings"]>>(
    LEGACY_STORAGE_KEYS.settings
  );
  if (legacySettings) {
    next.settings = { ...next.settings, ...legacySettings };
  }

  const legacyProfile = readLegacySection<UserDataDocument["profile"]>(
    LEGACY_STORAGE_KEYS.profile
  );
  if (legacyProfile) {
    next.profile = { ...next.profile, ...legacyProfile };
  }

  const legacySidebar = readLegacySection<UserDataDocument["sidebar"]>(
    LEGACY_STORAGE_KEYS.sidebar
  );
  if (legacySidebar) {
    next.sidebar = { ...next.sidebar, ...legacySidebar };
  }

  const legacyHistory = readLegacySection<UserDataDocument["historyFolders"]>(
    LEGACY_STORAGE_KEYS.historyFolders
  );
  if (legacyHistory) {
    next.historyFolders = { ...next.historyFolders, ...legacyHistory };
  }

  const legacyPhrases = readLegacySection<UserDataDocument["quickPhrases"]>(
    LEGACY_STORAGE_KEYS.quickPhrases
  );
  if (legacyPhrases) {
    next.quickPhrases = { ...next.quickPhrases, ...legacyPhrases };
  }

  return next;
}

function readBrowserDocument(): UserDataLoadResult {
  const fallback: UserDataLoadResult = {
    filePath: BROWSER_USER_DATA_KEY,
    data: structuredClone(DEFAULT_USER_DATA_DOCUMENT),
    isNew: true,
  };

  if (typeof window === "undefined") return fallback;

  const raw = localStorage.getItem(BROWSER_USER_DATA_KEY);
  if (!raw) {
    return {
      ...fallback,
      data: migrateLegacyLocalStorage(fallback.data),
      isNew: true,
    };
  }

  try {
    return {
      filePath: BROWSER_USER_DATA_KEY,
      data: mergeDocument(JSON.parse(raw) as UserDataDocument),
      isNew: false,
    };
  } catch {
    return fallback;
  }
}

function writeBrowserDocument(data: UserDataDocument): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(BROWSER_USER_DATA_KEY, JSON.stringify(data, null, 2));
}

export async function loadUserDataDocument(): Promise<UserDataLoadResult> {
  if (isElectronEnvironment() && window.electronAPI?.readUserData) {
    const result = unwrapIpc(await window.electronAPI.readUserData());
    const data = mergeDocument(result.data as Partial<UserDataDocument>);
    const migrated = result.isNew ? migrateLegacyLocalStorage(data) : data;
    return {
      filePath: result.filePath,
      data: migrated,
      isNew: result.isNew,
    };
  }

  return readBrowserDocument();
}

export async function saveUserDataDocument(data: UserDataDocument): Promise<void> {
  const merged = mergeDocument(data);

  if (isElectronEnvironment() && window.electronAPI?.writeUserData) {
    unwrapIpc(await window.electronAPI.writeUserData(merged));
    return;
  }

  writeBrowserDocument(merged);
}

export function clearLegacyLocalStorage(): void {
  if (typeof window === "undefined") return;
  Object.values(LEGACY_STORAGE_KEYS).forEach((key) => {
    localStorage.removeItem(key);
  });
}
