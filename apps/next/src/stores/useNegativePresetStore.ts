"use client";

/**
 * 反向提示词预设：内置那几条是常量，用户自己加的在这里。
 *
 * 怎么用：读 `useNegativePresetStore((s) => s.customPresets)`；
 * 写 `addCustomPreset(name, negative)`（返回新建项）、`updateCustomPreset(id, patch)`、
 * `removeCustomPreset(id)`；记住「上次用的那条」用 `rememberPreset(id | null)`。
 * 拿到什么：`customPresets: NegativePromptPreset[]`、`lastPresetId: string | null`；
 * 要「内置 + 自定义」的完整列表用 `getAllNegativePresets(customPresets)`（自定义在后、重名不覆盖）。
 * 持久化：用户数据文档 `negativePresets` 段（**内置预设不落盘**）。
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  BUILTIN_NEGATIVE_PRESETS,
  createCustomNegativePresetId,
} from "@/data/negativePresetPrompts";
import { t } from "@/i18n";
import type { NegativePromptPreset } from "@/types/presetPrompt";
import type { UserDataNegativePresets } from "@/types/userData";
import { createUserDataSectionPersistStorage } from "@/utils/userDataStorage";

type NegativePresetState = {
  /** 用户自定义的反向提示词预设（内置预设不落盘） */
  customPresets: NegativePromptPreset[];
  /** 最近一次使用的预设 id，便于下次打开弹窗定位 */
  lastPresetId: string | null;
  addCustomPreset: (name: string, negative: string) => NegativePromptPreset;
  removeCustomPreset: (id: string) => void;
  updateCustomPreset: (id: string, patch: { name?: string; negative?: string }) => void;
  rememberPreset: (id: string | null) => void;
};

/** 内置 + 自定义（自定义在后，重名不覆盖） */
export function getAllNegativePresets(
  customPresets: NegativePromptPreset[]
): NegativePromptPreset[] {
  return [...BUILTIN_NEGATIVE_PRESETS, ...customPresets];
}

/**
 * 反向提示词预设持久化：与其它用户数据一同写入 illusion-realm.json 的 negativePresets 段。
 */
export const useNegativePresetStore = create<NegativePresetState>()(
  persist<NegativePresetState, [], [], UserDataNegativePresets>(
    (set) => ({
      customPresets: [],
      lastPresetId: null,
      addCustomPreset: (name, negative) => {
        const preset: NegativePromptPreset = {
          id: createCustomNegativePresetId(),
          name: name.trim() || t("errors.negativePreset.defaultName"),
          negative,
          isCustom: true,
        };
        set((state) => ({ customPresets: [...state.customPresets, preset] }));
        return preset;
      },
      removeCustomPreset: (id) =>
        set((state) => ({
          customPresets: state.customPresets.filter((preset) => preset.id !== id),
        })),
      updateCustomPreset: (id, patch) =>
        set((state) => ({
          customPresets: state.customPresets.map((preset) =>
            preset.id === id
              ? {
                  ...preset,
                  name: patch.name ?? preset.name,
                  negative: patch.negative ?? preset.negative,
                }
              : preset
          ),
        })),
      rememberPreset: (id) => set({ lastPresetId: id }),
    }),
    {
      name: "illusion-realm-negative-presets",
      storage:
        createUserDataSectionPersistStorage<UserDataNegativePresets>(
          "negativePresets"
        ),
      partialize: (state): UserDataNegativePresets => ({
        customPresets: state.customPresets,
        lastPresetId: state.lastPresetId,
      }),
      skipHydration: true,
    }
  )
);
