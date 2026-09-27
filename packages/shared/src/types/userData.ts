import { DEFAULT_ASPECT_RATIO } from "./createForm";
import type { AspectRatioLabel, ImageSizeMode } from "./createForm";
import type { QuickPhrase } from "./quickPhrase";
import type { UserProfile } from "./profile";
import {
  DEFAULT_COMFY_SERVER_URL,
  EMPTY_SETTINGS_PATHS,
  type SettingsPaths,
} from "./settings";
import { DEFAULT_FOLDER_ID } from "../data/historyFolders";
import { DEFAULT_PROFILE } from "../data/profile";

export const USER_DATA_VERSION = 1 as const;

export type UserDataSettings = {
  paths: SettingsPaths;
  outputPath: string;
  comfyServerUrl: string;
  userDataPath: string;
  /**
   * 界面语言（`"zh-CN"` / `"en"`）。
   *
   * 可选：老文档没有这个字段，读取侧必须能兜住 —— 决议由渲染层的 `resolveLocale()` 做，
   * 缺失 / 空串 / 非法值一律回退 `DEFAULT_LOCALE`（zh-CN），所以这里**不必**给默认值。
   * 类型故意放宽成 `string` 而不是 `Locale`：文档是外部输入，脏值（手改、迁移写入）
   * 必须能在类型上表达出来、再由决议函数判非法，而不是靠类型假装它一定合法。
   */
  locale?: string;
  /**
   * 主题偏好（`"system"` / `"light"` / `"dark"`）。
   *
   * 与 `locale` 同样的口径：可选、类型放宽成 `string`，脏值由渲染层的
   * `resolveThemePreference()` 判非法并回退 `system`，而不是靠类型假装它一定合法。
   */
  theme?: string;
};

export type UserDataSidebar = {
  expanded: boolean;
};

export type UserDataHistoryFolders = {
  selectedFolderId: string;
  openedFolderId: string;
};

export type UserDataQuickPhrases = {
  phrases: QuickPhrase[];
};

export type UserDataUpdates = {
  lastSeenChangelogSectionId: string | null;
};

export type UserDataCreateForm = {
  aspectRatio: AspectRatioLabel;
  /** 图片尺寸模式：preset=按比例训练友好分辨率，custom=自定义宽高 */
  sizeMode?: ImageSizeMode;
  customWidth?: number;
  customHeight?: number;
  /** 模型/扩展 Dialog 字体：sm=小，md=中，lg=大 */
  resourceDialogFontSize?: "sm" | "md" | "lg";
  /** 模型/扩展分类筛选 UI：tabs=标签栏，dropdown=下拉框 */
  resourceCategoryUiMode?: "tabs" | "dropdown";
  /** 高级提示词组装（任务规范 v2.1）：全局开关 */
  advancedPrompt?: boolean;
  /** 分类 Tab（默认 8 大分类 + 用户自定义分类）与各自内容 */
  promptTabs?: import("./promptTabs").PromptTab[];
  /** 提示词模板（保存各分类的填写状态） */
  promptTemplates?: import("./promptTabs").PromptTemplate[];
};

export type UserDataCartoonBubble = import("./cartoonBubble").UserDataCartoonBubble;

/** 用户自定义模型分类（任务规范：用户分类 > 文件名默认分类） */
export type CustomModelCategory = {
  id: string;
  name: string;
  /** 分配给该分类的模型文件完整路径列表 */
  modelFilePaths: string[];
};

export type UserDataCustomCategories = {
  categories: CustomModelCategory[];
};

/** EXIF 工具持久化：输入/输出文件夹路径 */
export type UserDataExifTool = {
  inputFolder: string | null;
  outputFolder: string | null;
};

/** 视频工具箱持久化：用户手动指定的 ffmpeg 路径、默认输出目录 */
export type UserDataVideoTool = {
  ffmpegPath: string | null;
  outputFolder: string | null;
};

/** 反向提示词预设持久化（内置预设写在代码里，这里只存用户自定义） */
export type UserDataNegativePresets = {
  customPresets: import("./presetPrompt").NegativePromptPreset[];
  lastPresetId: string | null;
};

/** 3D 视角弹框持久化：用户替换的角色模型、朝向修正与增强权重 */
export type UserDataView3D = {
  /** 上次使用的 .glb/.gltf 绝对路径（为空则使用内置程序化模特） */
  modelPath: string | null;
  /** 朝向修正角度：0/90/180/270（决定哪一面算「正面」） */
  facingOffset: number;
  /** 导入过的模型历史（按时间倒序、按路径去重） */
  modelHistory: View3DModelHistoryItem[];
  /** 增强权重（x / y / z / 总系数，最低 1，最高按系列 3 或 2） */
  enhanceWeights?: View3DEnhanceWeights;
};

/** 3D 增强权重（三轴 + 总系数） */
export type View3DEnhanceWeights = {
  x: number;
  y: number;
  z: number;
  total: number;
};

/** 3D 模型导入历史条目 */
export type View3DModelHistoryItem = {
  path: string;
  name: string;
  /** 最近一次导入时间戳（毫秒） */
  at: number;
};

export type UserDataDocument = {
  version: typeof USER_DATA_VERSION;
  userDataPath: string;
  sidebar: UserDataSidebar;
  settings: UserDataSettings;
  profile: UserProfile;
  historyFolders: UserDataHistoryFolders;
  quickPhrases: UserDataQuickPhrases;
  updates: UserDataUpdates;
  createForm: UserDataCreateForm;
  cartoonBubble: UserDataCartoonBubble;
  customCategories: UserDataCustomCategories;
  exifTool: UserDataExifTool;
  videoTool: UserDataVideoTool;
  negativePresets: UserDataNegativePresets;
  view3d: UserDataView3D;
  characterFavorites: UserDataCharacterFavorites;
};

/** 角色库收藏（animadex 角色 slug） */
export type UserDataCharacterFavorites = {
  slugs: string[];
};

export type UserDataSectionKey = Exclude<keyof UserDataDocument, "version">;

export type UserDataLoadResult = {
  filePath: string;
  data: UserDataDocument;
  isNew: boolean;
};

export const DEFAULT_USER_DATA_DOCUMENT: UserDataDocument = {
  version: USER_DATA_VERSION,
  userDataPath: "",
  sidebar: { expanded: true },
  settings: {
    paths: { ...EMPTY_SETTINGS_PATHS },
    outputPath: "",
    comfyServerUrl: DEFAULT_COMFY_SERVER_URL,
    userDataPath: "",
  },
  profile: { ...DEFAULT_PROFILE },
  historyFolders: {
    selectedFolderId: DEFAULT_FOLDER_ID,
    openedFolderId: DEFAULT_FOLDER_ID,
  },
  quickPhrases: { phrases: [] },
  updates: { lastSeenChangelogSectionId: null },
  createForm: {
    aspectRatio: DEFAULT_ASPECT_RATIO,
    resourceDialogFontSize: "sm",
    resourceCategoryUiMode: "dropdown",
  },
  cartoonBubble: { customAssets: [], customFonts: [] },
  customCategories: { categories: [] },
  exifTool: { inputFolder: null, outputFolder: null },
  videoTool: { ffmpegPath: null, outputFolder: null },
  negativePresets: { customPresets: [], lastPresetId: null },
  view3d: { modelPath: null, facingOffset: 0, modelHistory: [] },
  characterFavorites: { slugs: [] },
};

export const USER_DATA_SETTING = {
  label: "用户数据文件",
  description:
    "所有设置、个人资料、快捷短语等用户数据保存在一个 JSON 文件中。留空则使用默认路径：与软件目录同级的 user/illusion-realm.json。",
} as const;
