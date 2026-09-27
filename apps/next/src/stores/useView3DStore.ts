"use client";

/**
 * 3D 视角弹窗要**跨会话记住**的东西（模型、朝向修正、历史、增强权重）。
 *
 * 怎么用：读 `useView3DStore((s) => s.modelPath)`；写 `setModelPath(null)`（回到内置模特）等。
 * 拿到什么 / 传什么：
 * - `modelPath`（绝对路径；null = 内置程序化模特）、`facingOffset`（0 / 90 / 180 / 270，
 *   取值见 `VIEW3D_FACING_OPTIONS`）
 * - `modelHistory: View3DModelHistoryItem[]`（最多 `VIEW3D_MODEL_HISTORY_LIMIT` = 12 条，
 *   去重倒序）+ `rememberModel(filePath, name)` / `clearModelHistory()` / `resetModel()`
 * - `enhanceWeights`（x / y / z / total）+ `setEnhanceWeight(axis, value, series)`
 *   （**按系列上限夹取**）、`clampEnhanceForSeries(series)`、`resetEnhanceWeights()`
 * 另外导出两个纯函数：`modelFileName(path)` / `modelDirectory(path)`（跨平台取末段 / 目录）。
 * 注意：**相机角度（方位角 / 俯仰角 / 半径）不在 store 里** —— 那是弹窗内的临时 state，
 * 关掉即重置；这里只存需要留下来的。
 * 持久化：用户数据文档 `view3d` 段。
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  UserDataView3D,
  View3DEnhanceWeights,
  View3DModelHistoryItem,
} from "@/types/userData";
import { createUserDataSectionPersistStorage } from "@/utils/userDataStorage";
import {
  clampEnhanceWeight,
  clampEnhanceWeights,
  DEFAULT_ENHANCE_WEIGHTS,
  type EnhanceAxis,
} from "@/utils/view3d/enhanceWeights";
import type { ViewSeries } from "@/utils/view3d/promptMapping";

/** 允许的朝向修正（哪种朝向算「正面」，对应 azimuth 0°） */
export const VIEW3D_FACING_OPTIONS = [0, 90, 180, 270] as const;

/** 历史最多保留条数（按路径去重、按时间倒序） */
export const VIEW3D_MODEL_HISTORY_LIMIT = 12;

type View3DState = {
  /** 用户替换的角色模型绝对路径；null = 使用内置程序化模特 */
  modelPath: string | null;
  /** 朝向修正角度 */
  facingOffset: number;
  /** 导入过的模型历史（新的在前，同一路径只保留最新一次） */
  modelHistory: View3DModelHistoryItem[];
  /** 增强权重（x / y / z / 总系数，最低 1） */
  enhanceWeights: View3DEnhanceWeights;
  setModelPath: (filePath: string | null) => void;
  setFacingOffset: (angle: number) => void;
  /** 记住一次导入：去重 + 置顶 + 截断 */
  rememberModel: (filePath: string, name: string) => void;
  clearModelHistory: () => void;
  resetModel: () => void;
  /** 设置某一个增强滑块（按系列夹取） */
  setEnhanceWeight: (axis: EnhanceAxis, value: number, series: ViewSeries) => void;
  /** 切换系列时按新上限收敛 */
  clampEnhanceForSeries: (series: ViewSeries) => void;
  resetEnhanceWeights: () => void;
};

/** 从路径取文件名（跨平台分隔符） */
export function modelFileName(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || filePath;
}

/** 取所在目录，用于下次打开文件对话框时的默认位置 */
export function modelDirectory(filePath: string | null | undefined): string | undefined {
  if (!filePath) return undefined;
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index > 0 ? filePath.slice(0, index) : undefined;
}

/** 把一次导入合并进历史：同路径去重并置顶，超长截断 */
export function mergeModelHistory(
  history: View3DModelHistoryItem[],
  entry: View3DModelHistoryItem
): View3DModelHistoryItem[] {
  const rest = history.filter((item) => item.path !== entry.path);
  return [entry, ...rest].slice(0, VIEW3D_MODEL_HISTORY_LIMIT);
}

/**
 * 3D 视角弹框持久化：与其它用户数据一同写入 illusion-realm.json 的 view3d 段。
 * 记录当前模型、朝向修正与导入历史（历史按时间倒序且按路径去重）。
 */
export const useView3DStore = create<View3DState>()(
  persist<View3DState, [], [], UserDataView3D>(
    (set) => ({
      modelPath: null,
      facingOffset: 0,
      modelHistory: [],
      enhanceWeights: DEFAULT_ENHANCE_WEIGHTS,
      setModelPath: (filePath) => set({ modelPath: filePath }),
      setFacingOffset: (angle) => set({ facingOffset: angle }),
      rememberModel: (filePath, name) =>
        set((state) => ({
          modelPath: filePath,
          modelHistory: mergeModelHistory(state.modelHistory, {
            path: filePath,
            name: name || modelFileName(filePath),
            at: Date.now(),
          }),
        })),
      clearModelHistory: () => set({ modelHistory: [] }),
      resetModel: () => set({ modelPath: null, facingOffset: 0 }),
      setEnhanceWeight: (axis, value, series) =>
        set((state) => ({
          enhanceWeights: {
            ...state.enhanceWeights,
            [axis]: clampEnhanceWeight(value, series),
          },
        })),
      clampEnhanceForSeries: (series) =>
        set((state) => ({
          enhanceWeights: clampEnhanceWeights(state.enhanceWeights, series),
        })),
      resetEnhanceWeights: () => set({ enhanceWeights: DEFAULT_ENHANCE_WEIGHTS }),
    }),
    {
      name: "illusion-realm-view3d",
      storage: createUserDataSectionPersistStorage<UserDataView3D>("view3d"),
      partialize: (state): UserDataView3D => ({
        modelPath: state.modelPath,
        facingOffset: state.facingOffset,
        modelHistory: state.modelHistory,
        enhanceWeights: state.enhanceWeights,
      }),
      skipHydration: true,
    }
  )
);
