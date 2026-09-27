"use client";

/**
 * 漫画对话框的自定义素材（气泡图）与自定义字体。
 *
 * 怎么用：读 `useCartoonBubbleStore((s) => s.customAssets)`；
 * 写 `addCustomAsset({ name, src, width, height, textArea? })`（返回新建项，空名回落默认名）、
 * `removeCustomAsset(id)` / `addCustomFont(file)` / `removeCustomFont(id)`。
 * 拿到什么：`customAssets: CartoonBubbleAsset[]`、`customFonts: CartoonCustomFont[]`；
 * `addCustomFont(file: File): Promise<CartoonCustomFont | null>` —— 只接受
 * ttf / otf / woff / woff2，**类型不符或解析失败返回 null**（调用方据此提示），
 * 成功时已把字体注册进 `document.fonts`。
 * 持久化：用户数据文档 `cartoonBubble` 段（字体以 data URL 落盘，注意体积）。
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  CartoonBubbleAsset,
  CartoonCustomAssetInput,
  CartoonCustomFont,
  UserDataCartoonBubble,
} from "@/types/cartoonBubble";
import { t } from "@/i18n";
import {
  createCustomCartoonAssetId,
  createCustomCartoonFontId,
} from "@/utils/cartoon/cartoonIds";
import { loadCustomCartoonFont } from "@/utils/cartoon/customFontLoad";
import { createUserDataSectionPersistStorage } from "@/utils/userDataStorage";

type CartoonBubbleState = {
  customAssets: CartoonBubbleAsset[];
  customFonts: CartoonCustomFont[];
  addCustomAsset: (input: CartoonCustomAssetInput) => CartoonBubbleAsset;
  removeCustomAsset: (id: string) => void;
  addCustomFont: (file: File) => Promise<CartoonCustomFont | null>;
  removeCustomFont: (id: string) => void;
};

export const useCartoonBubbleStore = create<CartoonBubbleState>()(
  persist<CartoonBubbleState, [], [], UserDataCartoonBubble>(
    (set, get) => ({
      customAssets: [],
      customFonts: [],
      addCustomAsset: (input) => {
        const asset: CartoonBubbleAsset = {
          id: createCustomCartoonAssetId(),
          name: input.name.trim() || t("cartoon.customAsset.defaultName"),
          src: input.src,
          width: input.width,
          height: input.height,
          isBuiltIn: false,
          textArea: input.textArea,
        };
        set({ customAssets: [...get().customAssets, asset] });
        return asset;
      },
      removeCustomAsset: (id) => {
        set({
          customAssets: get().customAssets.filter((item) => item.id !== id),
        });
      },
      addCustomFont: (file) =>
        new Promise((resolve) => {
          const valid =
            file.name.endsWith(".ttf") ||
            file.name.endsWith(".otf") ||
            file.name.endsWith(".woff") ||
            file.name.endsWith(".woff2");
          if (!valid) {
            resolve(null);
            return;
          }

          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const id = createCustomCartoonFontId();
            const family = `CartoonCustom_${id.replace(/-/g, "")}`;
            const font: CartoonCustomFont = {
              id,
              name: file.name.replace(/\.(ttf|otf|woff2?)$/i, ""),
              family,
              dataUrl,
            };
            void loadCustomCartoonFont(font).finally(() => {
              set({ customFonts: [...get().customFonts, font] });
              resolve(font);
            });
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        }),
      removeCustomFont: (id) => {
        set({
          customFonts: get().customFonts.filter((item) => item.id !== id),
        });
      },
    }),
    {
      name: "illusion-realm-cartoon-bubble",
      storage: createUserDataSectionPersistStorage<UserDataCartoonBubble>(
        "cartoonBubble"
      ),
      partialize: (state): UserDataCartoonBubble => ({
        customAssets: state.customAssets,
        customFonts: state.customFonts,
      }),
      skipHydration: true,
    }
  )
);
