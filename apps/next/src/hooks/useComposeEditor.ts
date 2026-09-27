"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CartoonBackground,
  CartoonBubblePlacement,
  CartoonComposeTextItem,
  CartoonPlacedBubble,
  CartoonTextArea,
} from "@/types/cartoonBubble";
import { normalizeBubblePlacement } from "@/types/cartoonBubble";
import { createPlacedBubble } from "@/utils/cartoon/composeBubbles";
import {
  cloneSnapshot,
  createInitialSnapshot,
  loadComposeDraft,
  saveComposeDraft,
  type ComposeEditorSnapshot,
} from "@/utils/cartoon/composeDraft";
import { createTextItemAt } from "@/utils/cartoon/composeTextLayout";
import { normalizeTextItem } from "@/utils/cartoon/normalizeTextItem";

const MAX_HISTORY = 50;

type UseComposeEditorOptions = {
  initialAssetId: string;
  defaultPlacement?: Partial<CartoonBubblePlacement>;
};

export function useComposeEditor({
  initialAssetId,
  defaultPlacement,
}: UseComposeEditorOptions) {
  const skipHistoryRef = useRef(false);
  const pastRef = useRef<ComposeEditorSnapshot[]>([]);
  const futureRef = useRef<ComposeEditorSnapshot[]>([]);

  /**
   * 初始草稿在 state 初始化阶段一次性读取（React 推荐的 lazy initializer）。
   * 原实现放在 useEffect 里 hydrate，但那会在 effect 内同步 setState（级联渲染）。
   * loadComposeDraft 内部已做 `typeof localStorage === "undefined"` 守卫，
   * 服务端 / 无 localStorage 环境返回 null，两端首帧一致。
   */
  const [initialSnapshot] = useState<ComposeEditorSnapshot | null>(() => {
    const draft = loadComposeDraft();
    return draft && draft.bubbles.length > 0 ? draft : null;
  });

  const [bubbles, setBubbles] = useState<CartoonPlacedBubble[]>(() =>
    (initialSnapshot ?? createInitialSnapshot(initialAssetId, defaultPlacement)).bubbles
  );
  /** 是否加载到了已存在的草稿：用于「改了才写回」，避免首次渲染就把草稿覆盖掉 */
  const didLoadDraft = initialSnapshot !== null;
  const [background, setBackground] = useState<CartoonBackground | null>(
    () => initialSnapshot?.background ?? null
  );
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  const getSnapshot = useCallback(
    (): ComposeEditorSnapshot => ({
      bubbles,
      background,
    }),
    [background, bubbles]
  );

  const pushHistory = useCallback(() => {
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      return;
    }
    pastRef.current.push(cloneSnapshot(getSnapshot()));
    if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift();
    futureRef.current = [];
    syncHistoryFlags();
  }, [getSnapshot, syncHistoryFlags]);

  const applySnapshot = useCallback((snapshot: ComposeEditorSnapshot) => {
    skipHistoryRef.current = true;
    setBubbles(snapshot.bubbles.map((bubble) => ({ ...bubble, textItems: [...bubble.textItems] })));
    setBackground(snapshot.background);
  }, []);

  useEffect(() => {
    if (!didLoadDraft) return;
    const timer = window.setTimeout(() => {
      saveComposeDraft({ bubbles, background });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [background, bubbles, didLoadDraft]);

  const placementEditingRef = useRef(false);
  const textBoxEditingRef = useRef(false);

  const updateBubble = useCallback(
    (bubbleId: string, updater: (bubble: CartoonPlacedBubble) => CartoonPlacedBubble) => {
      setBubbles((items) =>
        items.map((bubble) => (bubble.id === bubbleId ? updater(bubble) : bubble))
      );
    },
    []
  );

  const beginPlacementEdit = useCallback(() => {
    if (!placementEditingRef.current) {
      pushHistory();
      placementEditingRef.current = true;
    }
  }, [pushHistory]);

  const endPlacementEdit = useCallback(() => {
    placementEditingRef.current = false;
  }, []);

  const setBubblePlacement = useCallback(
    (bubbleId: string, patch: Partial<CartoonBubblePlacement>) => {
      setBubbles((items) => {
        let changed = false;
        const next = items.map((bubble) => {
          if (bubble.id !== bubbleId) return bubble;
          const placement = normalizeBubblePlacement({ ...bubble.placement, ...patch });
          if (
            placement.x === bubble.placement.x &&
            placement.y === bubble.placement.y &&
            placement.scaleX === bubble.placement.scaleX &&
            placement.scaleY === bubble.placement.scaleY &&
            placement.rotation === bubble.placement.rotation &&
            placement.flipX === bubble.placement.flipX &&
            placement.flipY === bubble.placement.flipY &&
            placement.opacity === bubble.placement.opacity
          ) {
            return bubble;
          }
          changed = true;
          return { ...bubble, placement };
        });
        return changed ? next : items;
      });
    },
    []
  );

  const setBubbleAsset = useCallback(
    (bubbleId: string, assetId: string) => {
      pushHistory();
      updateBubble(bubbleId, (bubble) => ({ ...bubble, assetId }));
    },
    [pushHistory, updateBubble]
  );

  const addBubble = useCallback(
    (assetId: string, canvasX: number, canvasY: number) => {
      const bubble = createPlacedBubble(assetId, canvasX, canvasY, defaultPlacement);
      pushHistory();
      setBubbles((items) => [...items, bubble]);
      return bubble;
    },
    [defaultPlacement, pushHistory]
  );

  const deleteBubble = useCallback(
    (bubbleId: string) => {
      pushHistory();
      setBubbles((items) => items.filter((bubble) => bubble.id !== bubbleId));
    },
    [pushHistory]
  );

  const beginTextBoxEdit = useCallback(() => {
    if (!textBoxEditingRef.current) {
      pushHistory();
      textBoxEditingRef.current = true;
    }
  }, [pushHistory]);

  const endTextBoxEdit = useCallback(() => {
    textBoxEditingRef.current = false;
  }, []);

  const setTextBox = useCallback(
    (bubbleId: string, textId: string, box: CartoonTextArea) => {
      updateBubble(bubbleId, (bubble) => ({
        ...bubble,
        textItems: bubble.textItems.map((item) =>
          item.id === textId ? normalizeTextItem({ ...item, box }) : item
        ),
      }));
    },
    [updateBubble]
  );

  const setBackgroundWithHistory = useCallback(
    (next: CartoonBackground) => {
      pushHistory();
      setBackground(next);
    },
    [pushHistory]
  );

  const addTextItem = useCallback(
    (bubbleId: string, relX: number, relY: number) => {
      const item = createTextItemAt(relX, relY);
      pushHistory();
      updateBubble(bubbleId, (bubble) => ({
        ...bubble,
        textItems: [...bubble.textItems, item],
      }));
      return item;
    },
    [pushHistory, updateBubble]
  );

  const updateTextItem = useCallback(
    (
      bubbleId: string,
      textId: string,
      patch: Partial<CartoonComposeTextItem>,
      recordHistory = true
    ) => {
      if (recordHistory) pushHistory();
      else skipHistoryRef.current = true;
      updateBubble(bubbleId, (bubble) => ({
        ...bubble,
        textItems: bubble.textItems.map((item) =>
          item.id === textId ? normalizeTextItem({ ...item, ...patch }) : item
        ),
      }));
    },
    [pushHistory, updateBubble]
  );

  const deleteTextItem = useCallback(
    (bubbleId: string, textId: string) => {
      pushHistory();
      updateBubble(bubbleId, (bubble) => ({
        ...bubble,
        textItems: bubble.textItems.filter((item) => item.id !== textId),
      }));
    },
    [pushHistory, updateBubble]
  );

  const nudgeTextItem = useCallback(
    (bubbleId: string, textId: string, dx: number, dy: number) => {
      pushHistory();
      updateBubble(bubbleId, (bubble) => ({
        ...bubble,
        textItems: bubble.textItems.map((item) => {
          if (item.id !== textId) return item;
          return normalizeTextItem({
            ...item,
            box: {
              ...item.box,
              x: Math.min(1 - item.box.width, Math.max(0, item.box.x + dx)),
              y: Math.min(1 - item.box.height, Math.max(0, item.box.y + dy)),
            },
          });
        }),
      }));
    },
    [pushHistory, updateBubble]
  );

  const loadDraftSnapshot = useCallback(
    (snapshot: ComposeEditorSnapshot) => {
      pushHistory();
      applySnapshot(snapshot);
    },
    [applySnapshot, pushHistory]
  );

  const undo = useCallback(() => {
    const previous = pastRef.current.pop();
    if (!previous) return;
    futureRef.current.push(cloneSnapshot(getSnapshot()));
    applySnapshot(previous);
    syncHistoryFlags();
  }, [applySnapshot, getSnapshot, syncHistoryFlags]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(cloneSnapshot(getSnapshot()));
    applySnapshot(next);
    syncHistoryFlags();
  }, [applySnapshot, getSnapshot, syncHistoryFlags]);

  const getSnapshotForExport = useCallback(
    (): ComposeEditorSnapshot => cloneSnapshot(getSnapshot()),
    [getSnapshot]
  );

  return {
    bubbles,
    background,
    canUndo,
    canRedo,
    addBubble,
    deleteBubble,
    setBubblePlacement,
    setBubbleAsset,
    beginPlacementEdit,
    endPlacementEdit,
    beginTextBoxEdit,
    endTextBoxEdit,
    setTextBox,
    setBackground: setBackgroundWithHistory,
    addTextItem,
    updateTextItem,
    deleteTextItem,
    nudgeTextItem,
    loadDraftSnapshot,
    undo,
    redo,
    getSnapshotForExport,
  };
}

export type { ComposeEditorSnapshot };
