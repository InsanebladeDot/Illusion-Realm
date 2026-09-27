"use client";

/**
 * 设置页 + 全局路径 / 主题 / 本地模型索引。
 *
 * 怎么用：读 `useSettingsStore((s) => s.paths)`；写 `setPath("checkpointsPath", value)`。
 * 拿到什么 / 传什么：
 * - `paths: SettingsPaths`（检索路径 / checkpoints / loras / diffusionModels…，
 *   键名见 `SettingsPathKey`）、`outputPath`（生成图输出目录）、`userDataPath`、`comfyServerUrl`
 * - `theme: "system" | "light" | "dark"`（真值表见 `utils/themeResolution`）
 * - `models: LocalModel[]`（扫描结果，带分类与版本）、`scanning`（扫描中）、`lastScannedAt`
 * - `scanAllModels(): Promise<void>` —— 扫描 + 按路径分类 + 合并去重
 *   （没有 Electron 桥时安全返回，不会抛）
 * 持久化：用户数据文档 `settings` 段。
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LocalModel } from "@/types/localModel";
import {
  DEFAULT_COMFY_SERVER_URL,
  EMPTY_SETTINGS_PATHS,
  type SettingsPathKey,
  type SettingsPaths,
} from "@/types/settings";
import {
  applySearchPathClassification,
  mergeLocalModels,
  normalizeLocalModels,
} from "@/utils/localModelScanner";
import {
  UNCATEGORIZED_LOCAL_CATEGORY,
  getFirstLevelCategory,
  isNonDiffusionModelPath,
} from "@/utils/localModelCategory";
import {
  isElectronEnvironment,
  scanLocalModels,
} from "@/utils/electronBridge";
import type { UserDataSettings } from "@/types/userData";
import { createUserDataSectionPersistStorage } from "@/utils/userDataStorage";
import {
  DEFAULT_THEME_PREFERENCE,
  resolveThemePreference,
  type ThemePreference,
} from "@/utils/themeResolution";

type SettingsState = {
  paths: SettingsPaths;
  outputPath: string;
  comfyServerUrl: string;
  userDataPath: string;
  /** 主题偏好：system / light / dark（见 utils/themeResolution 的真值表） */
  theme: ThemePreference;
  models: LocalModel[];
  scanning: boolean;
  lastScannedAt: number | null;
  setPath: (key: SettingsPathKey, value: string) => void;
  setOutputPath: (value: string) => void;
  setComfyServerUrl: (url: string) => void;
  setUserDataPath: (value: string) => void;
  setTheme: (preference: ThemePreference) => void;
  scanAllModels: () => Promise<void>;
};

/** 取路径末尾的文件夹名（如 checkpoints） */
function folderName(pathValue: string): string {
  const trimmed = pathValue.replace(/\\/g, "/").replace(/\/+$/, "");
  const index = trimmed.lastIndexOf("/");
  return index >= 0 ? trimmed.slice(index + 1) : trimmed;
}

/**
 * 为扫描结果标注分类名（抽屉名 = 根目录下的主要文件夹名）。
 * 例如根目录 F:\AI\...\models 下的第一级文件夹 checkpoints/loras/vae...
 * 即为其 type 名；模型直接位于扫描根目录时回退为根目录名。
 */
function annotateCategory(
  models: LocalModel[],
  scanRoot: string
): LocalModel[] {
  if (!scanRoot) return models;

  const rootCategory = folderName(scanRoot);
  
  const res = models.map((model) => {
    const firstLevel = getFirstLevelCategory(scanRoot, model.filePath);
    return {
      ...model,
      category:
        firstLevel === UNCATEGORIZED_LOCAL_CATEGORY
          ? rootCategory
          : firstLevel,
    };
  });
return res

}

async function collectModelsFromPaths(paths: SettingsPaths) {
  const batches: LocalModel[] = [];

  /**
   * 放大模型 / VAE / CLIP 等不能作为扩散模型使用：
   * 检索路径常常直接指向整个 ComfyUI models 目录，这里先剔除，
   * 避免它们出现在模型选择弹窗并被误提交为 unet_name / ckpt_name。
   * 注意只对 checkpoint 类型生效——LoRA 目录里的文件本身是合法扩展。
   */
  const isUsableModel = (model: LocalModel) =>
    model.type !== "checkpoint" || !isNonDiffusionModelPath(model.filePath);

  // 检索路径优先：只要填写了检索路径，就只在检索路径下搜索，忽略其他参数
  if (paths.searchPath) {
    const fromSearch = await scanLocalModels(paths.searchPath, "checkpoint");
    // 先按路径判定类型（loras → lora），再剔除不可用作扩散模型的文件
    const classified = applySearchPathClassification(fromSearch);
    batches.push(
      ...annotateCategory(classified.filter(isUsableModel), paths.searchPath)
    );
    return mergeLocalModels(batches);
  }

  // 未填写检索路径时，扫描已填写的具体路径
  if (paths.checkpointPath) {
    const scanned = await scanLocalModels(paths.checkpointPath, "checkpoint");
    batches.push(
      ...annotateCategory(scanned.filter(isUsableModel), paths.checkpointPath)
    );
  }

  if (paths.lorasPath) {
    const scanned = await scanLocalModels(paths.lorasPath, "lora");
    batches.push(...annotateCategory(scanned.filter(isUsableModel), paths.lorasPath));
  }

  // diffusion_models 分类（Anima 系列模型，支持 .safetensors/.gguf）
  if (paths.diffusionModelsPath) {
    const scanned = await scanLocalModels(
      paths.diffusionModelsPath,
      "checkpoint"
    );
    batches.push(
      ...annotateCategory(
        scanned.filter(isUsableModel),
        paths.diffusionModelsPath
      )
    );
  }

  return mergeLocalModels(batches);
}

export const useSettingsStore = create<SettingsState>()(
  persist<SettingsState, [], [], UserDataSettings>(
    (set, get) => ({
      paths: EMPTY_SETTINGS_PATHS,
      outputPath: "",
      comfyServerUrl: DEFAULT_COMFY_SERVER_URL,
      userDataPath: "",
      theme: DEFAULT_THEME_PREFERENCE,
      models: [],
      scanning: false,
      lastScannedAt: null,
      setPath: (key, value) =>
        set((state) => {
          const trimmed = value.trim();
          const paths = { ...state.paths, [key]: trimmed };

          // 填写检索路径时，自动填充下方三个具体路径（仅当对应路径为空时）
          if (key === "searchPath" && trimmed) {
            const root = trimmed.replace(/[\\/]+$/, "");
            if (!paths.checkpointPath) {
              paths.checkpointPath = `${root}/checkpoints`;
            }
            if (!paths.lorasPath) {
              paths.lorasPath = `${root}/loras`;
            }
            if (!paths.diffusionModelsPath) {
              paths.diffusionModelsPath = `${root}/diffusion_models`;
            }
          }

          return { paths };
        }),
      setOutputPath: (value) => set({ outputPath: value.trim() }),
      setComfyServerUrl: (url) => set({ comfyServerUrl: url.trim() }),
      setUserDataPath: (value) => set({ userDataPath: value.trim() }),
      /**
       * 只改 store。落到界面那一步由 AppShell 的订阅统一做（`applyThemeSignals` 是唯一写点），
       * 这里再写一次就会多出第二个写点 —— 正是 locale 那边栽过的坑。
       */
      setTheme: (preference) => set({ theme: preference }),
      scanAllModels: async () => {
        if (!isElectronEnvironment()) return;

        const { paths } = get();
        const hasPath = Object.values(paths).some(Boolean);
        if (!hasPath) {
          set({ models: [], lastScannedAt: null });
          return;
        }

        set({ scanning: true });
        try {
          const models = await collectModelsFromPaths(paths);
          set({
            models: normalizeLocalModels(models),
            lastScannedAt: Date.now(),
          });
        } finally {
          set({ scanning: false });
        }
      },
    }),
    {
      name: "illusion-realm-settings",
      storage: createUserDataSectionPersistStorage<UserDataSettings>("settings"),
      partialize: (state): UserDataSettings => ({
        paths: state.paths,
        outputPath: state.outputPath,
        comfyServerUrl: state.comfyServerUrl,
        userDataPath: state.userDataPath,
        theme: state.theme,
      }),
      // 旧版持久化数据缺少新增路径字段（如 diffusionModelsPath），合并时回填默认值
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<UserDataSettings>;
        return {
          ...current,
          ...saved,
          /** 文档是外部输入：脏值（手改、旧版本写的）在这里就会被决议回 system */
          theme: resolveThemePreference(saved.theme).preference,
          paths: {
            ...EMPTY_SETTINGS_PATHS,
            ...(saved.paths ?? {}),
          },
        };
      },
      skipHydration: true,
    }
  )
);
