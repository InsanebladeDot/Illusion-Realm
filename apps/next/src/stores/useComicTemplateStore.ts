"use client";

// 自定义模板写入统一用户数据文档；成功落盘后才更新模板库和提示保存成功。
import { create } from "zustand";
import type { ComicTemplateLibrary, SavedComicTemplate } from "@/types/comic-template";
import { createUserDataSectionPersistStorage, flushUserDataSave } from "@/utils/userDataStorage";
import { readComicTemplateLibrary } from "@/utils/comic/custom-templates";
import { t } from "@/i18n";

interface ComicTemplateState { templates: SavedComicTemplate[]; ready: boolean; load: () => Promise<void>; save: (template: SavedComicTemplate) => Promise<void> }
const storage = createUserDataSectionPersistStorage<ComicTemplateLibrary>("comicTemplates");
export const useComicTemplateStore = create<ComicTemplateState>((set, get) => ({
  templates: [], ready: false,
  load: async () => {
    const stored = await storage.getItem("comicTemplates");
    set({ templates: readComicTemplateLibrary(stored?.state).templates, ready: true });
  },
  save: async template => {
    if (!get().ready) await get().load();
    const library = readComicTemplateLibrary({ version: 1, templates: [...get().templates, template] });
    if (!library.templates.some(item => item.id === template.id)) throw new Error(t("toolBox.comic.invalidExportLayout"));
    const previous: ComicTemplateLibrary = { version: 1, templates: get().templates };
    try { await storage.setItem("comicTemplates", { state: library }); await flushUserDataSave(); }
    catch (error) { await storage.setItem("comicTemplates", { state: previous }); throw error; }
    set({ templates: library.templates });
  },
}));
