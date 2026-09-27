/**
 * 合成台草稿的本地暂存（关掉再打开能接着编辑）。
 *
 * 怎么做：序列化快照写 localStorage，带版本字段；读取时按版本做归一化，
 * 坏数据一律当「没有草稿」处理而不是崩溃。
 */
import type {
  CartoonBackground,
  CartoonComposeDraft,
  CartoonComposeDraftV1,
  CartoonPlacedBubble,
} from "@/types/cartoonBubble";
import {
  clonePlacedBubbles,
  createPlacedBubble,
  normalizePlacedBubbles,
} from "@/utils/cartoon/composeBubbles";
import { createPlacedBubbleId } from "@/utils/cartoon/cartoonIds";
import { normalizeBubblePlacement } from "@/types/cartoonBubble";
import { normalizeTextItems } from "@/utils/cartoon/normalizeTextItem";
import { t } from "@/i18n";

const COMPOSE_DRAFT_KEY = "illusion-realm-cartoon-compose-draft";
/** @deprecated 按素材分槽的旧 key 前缀 */
const LEGACY_ASSET_DRAFT_PREFIX = `${COMPOSE_DRAFT_KEY}:`;
const LEGACY_SINGLE_DRAFT_KEY = COMPOSE_DRAFT_KEY;

export type ComposeEditorSnapshot = {
  bubbles: CartoonPlacedBubble[];
  background: CartoonBackground | null;
};

function snapshotFromDraftV2(parsed: CartoonComposeDraft): ComposeEditorSnapshot {
  return {
    bubbles: normalizePlacedBubbles(parsed.bubbles ?? []),
    background: parsed.background,
  };
}

function migrateDraftV1(parsed: CartoonComposeDraftV1): ComposeEditorSnapshot {
  return {
    bubbles: [
      {
        id: createPlacedBubbleId(),
        assetId: parsed.assetId,
        placement: normalizeBubblePlacement(parsed.placement),
        textItems: normalizeTextItems(parsed.textItems),
      },
    ],
    background: parsed.background,
  };
}

function tryParseDraft(raw: string): ComposeEditorSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as CartoonComposeDraft | CartoonComposeDraftV1;
    if (parsed.version === 2) {
      return snapshotFromDraftV2(parsed);
    }
    if (parsed.version === 1 && "assetId" in parsed) {
      return migrateDraftV1(parsed as CartoonComposeDraftV1);
    }
    return null;
  } catch {
    return null;
  }
}

function migrateLegacyDrafts(): ComposeEditorSnapshot | null {
  if (typeof localStorage === "undefined") return null;

  const main = localStorage.getItem(COMPOSE_DRAFT_KEY);
  if (main) {
    const snapshot = tryParseDraft(main);
    if (snapshot) return snapshot;
  }

  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key?.startsWith(LEGACY_ASSET_DRAFT_PREFIX)) continue;
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    const snapshot = tryParseDraft(raw);
    if (snapshot) return snapshot;
  }

  return null;
}

export function cloneSnapshot(snapshot: ComposeEditorSnapshot): ComposeEditorSnapshot {
  return {
    bubbles: clonePlacedBubbles(snapshot.bubbles),
    background: snapshot.background ? { ...snapshot.background } : null,
  };
}

export function loadComposeDraft(): ComposeEditorSnapshot | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(COMPOSE_DRAFT_KEY);
  if (raw) {
    const snapshot = tryParseDraft(raw);
    if (snapshot) return snapshot;
  }
  return migrateLegacyDrafts();
}

export function saveComposeDraft(snapshot: ComposeEditorSnapshot): void {
  if (typeof localStorage === "undefined") return;
  const draft: CartoonComposeDraft = {
    version: 2,
    bubbles: snapshot.bubbles,
    background: snapshot.background,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(COMPOSE_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* quota exceeded */
  }
}

export function clearComposeDraft(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(COMPOSE_DRAFT_KEY);
}

export function downloadComposeDraftFile(
  snapshot: ComposeEditorSnapshot,
  /** 默认文件名：参数默认值在**调用时**求值，因此这里可以安全地用模块级 t */
  fileName = t("cartoon.export.draftFileName")
): void {
  const draft: CartoonComposeDraft = {
    version: 2,
    bubbles: snapshot.bubbles,
    background: snapshot.background,
    savedAt: Date.now(),
  };
  const blob = new Blob([JSON.stringify(draft, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${fileName}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function parseComposeDraftFile(content: string): ComposeEditorSnapshot | null {
  const snapshot = tryParseDraft(content);
  return snapshot ? cloneSnapshot(snapshot) : null;
}

export function createInitialSnapshot(
  initialAssetId: string,
  defaultPlacement?: Partial<CartoonPlacedBubble["placement"]>
): ComposeEditorSnapshot {
  return {
    bubbles: [createPlacedBubble(initialAssetId, 0.5, 0.45, defaultPlacement)],
    background: null,
  };
}
