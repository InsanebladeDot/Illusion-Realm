"use client";

/**
 * 快捷短语（提示词下方那些一键插入的「质量词」等）。
 *
 * 怎么用：读 `useQuickPhraseStore((s) => s.phrases)`；
 * 写 `addPhrase({ keyword, promptText, imagePath })` —— 返回**新建的那条**（含生成的 id），
 * `updatePhrase(id, input)` / `removePhrase(id)`。
 * 拿到什么：`phrases: QuickPhrase[]`（`{ id, keyword, promptText, imagePath? }`）。
 * 持久化：用户数据文档 `quickPhrases` 段。
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { QuickPhrase } from "@/types/quickPhrase";
import { createQuickPhraseId } from "@/utils/quickPhrases";
import type { UserDataQuickPhrases } from "@/types/userData";
import { createUserDataSectionPersistStorage } from "@/utils/userDataStorage";

type QuickPhraseState = {
  phrases: QuickPhrase[];
  addPhrase: (input: Omit<QuickPhrase, "id">) => QuickPhrase;
  updatePhrase: (id: string, input: Omit<QuickPhrase, "id">) => void;
  removePhrase: (id: string) => void;
};

export const useQuickPhraseStore = create<QuickPhraseState>()(
  persist<QuickPhraseState, [], [], UserDataQuickPhrases>(
    (set, get) => ({
      phrases: [],
      addPhrase: (input) => {
        const phrase: QuickPhrase = { id: createQuickPhraseId(), ...input };
        set({ phrases: [...get().phrases, phrase] });
        return phrase;
      },
      updatePhrase: (id, input) => {
        set({
          phrases: get().phrases.map((phrase) =>
            phrase.id === id ? { ...phrase, ...input } : phrase
          ),
        });
      },
      removePhrase: (id) => {
        set({ phrases: get().phrases.filter((phrase) => phrase.id !== id) });
      },
    }),
    {
      name: "illusion-realm-quick-phrases",
      storage: createUserDataSectionPersistStorage<UserDataQuickPhrases>("quickPhrases"),
      partialize: (state): UserDataQuickPhrases => ({ phrases: state.phrases }),
      skipHydration: true,
    }
  )
);
