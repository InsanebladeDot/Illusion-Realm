import type { CartoonCustomFont } from "@/types/cartoonBubble";

export type CartoonFontCategory = "system" | "web" | "custom";

export type CartoonFontOption = {
  id: string;
  label: string;
  /** CSS font-family 值 */
  family: string;
  category: CartoonFontCategory;
};

/** 常用 Windows / 微软字体（本机已安装时直接可用） */
export const CARTOON_SYSTEM_FONTS: CartoonFontOption[] = [
  { id: "yahei", label: "微软雅黑", family: '"Microsoft YaHei", "微软雅黑", sans-serif', category: "system" },
  { id: "songti", label: "宋体", family: '"SimSun", "宋体", "NSimSun", serif', category: "system" },
  { id: "heiti", label: "黑体", family: '"SimHei", "黑体", sans-serif', category: "system" },
  { id: "kaiti", label: "楷体", family: '"KaiTi", "楷体", "STKaiti", serif', category: "system" },
  { id: "fangsong", label: "仿宋", family: '"FangSong", "仿宋", "STFangsong", serif', category: "system" },
  { id: "dengxian", label: "等线", family: '"DengXian", "等线", sans-serif', category: "system" },
  { id: "jhenghei", label: "微软正黑体", family: '"Microsoft JhengHei", "微软正黑体", sans-serif', category: "system" },
  { id: "youyuan", label: "幼圆", family: '"YouYuan", "幼圆", sans-serif', category: "system" },
  { id: "lisu", label: "隶书", family: '"LiSu", "隶书", cursive', category: "system" },
  { id: "arial", label: "Arial", family: "Arial, Helvetica, sans-serif", category: "system" },
  { id: "times", label: "Times New Roman", family: '"Times New Roman", Times, serif', category: "system" },
  { id: "georgia", label: "Georgia", family: "Georgia, serif", category: "system" },
  { id: "verdana", label: "Verdana", family: "Verdana, Geneva, sans-serif", category: "system" },
  { id: "tahoma", label: "Tahoma", family: "Tahoma, Geneva, sans-serif", category: "system" },
  { id: "courier", label: "Courier New", family: '"Courier New", Courier, monospace', category: "system" },
];

/** 通过 Google Fonts 加载的备用字体（本机无系统字体时使用） */
export const CARTOON_WEB_FONTS: CartoonFontOption[] = [
  { id: "noto-sans", label: "思源黑体 (Noto Sans SC)", family: '"Noto Sans SC", sans-serif', category: "web" },
  { id: "noto-serif", label: "思源宋体 (Noto Serif SC)", family: '"Noto Serif SC", serif', category: "web" },
  { id: "zcool-kuaile", label: "站酷快乐体", family: '"ZCOOL KuaiLe", cursive', category: "web" },
  { id: "ma-shan-zheng", label: "马善政毛笔", family: '"Ma Shan Zheng", cursive', category: "web" },
];

export const CARTOON_FONT_OPTIONS: CartoonFontOption[] = [
  ...CARTOON_SYSTEM_FONTS,
  ...CARTOON_WEB_FONTS,
];

export const DEFAULT_CARTOON_FONT =
  CARTOON_FONT_OPTIONS.find((item) => item.id === "yahei") ?? CARTOON_FONT_OPTIONS[0];

export const DEFAULT_TEXT_COLOR = "#111111";

export const DEFAULT_COMPOSE_FONT_SIZE = 20;

export const CARTOON_TEXT_COLOR_PRESETS = [
  "#000000",
  "#111111",
  "#333333",
  "#666666",
  "#FFFFFF",
  "#FF0000",
  "#FF6B00",
  "#FFD700",
  "#00AA44",
  "#0066FF",
  "#9933FF",
  "#FF69B4",
  "#8B4513",
  "#00CED1",
] as const;

export function getCartoonFontById(id: string): CartoonFontOption {
  return CARTOON_FONT_OPTIONS.find((item) => item.id === id) ?? DEFAULT_CARTOON_FONT;
}

export function resolveCartoonFont(
  id: string,
  customFonts: CartoonCustomFont[] = []
): CartoonFontOption {
  const custom = customFonts.find((item) => item.id === id);
  if (custom) {
    return {
      id: custom.id,
      label: custom.name,
      family: `"${custom.family}", sans-serif`,
      category: "custom",
    };
  }
  return getCartoonFontById(id);
}
