/** 外观配置的允许值；只保存预设标识，旧文档缺失或未知值由渲染层回退。 */
export const COLOR_PRESETS = ["default", "sand", "rose", "teal", "sunset", "forest", "ocean", "graphite"] as const;
export type ColorPreset = (typeof COLOR_PRESETS)[number];
export const UI_FONTS = ["auto", "sans", "serif"] as const;
export type UiFont = (typeof UI_FONTS)[number];
