// 宿主只翻译入口与保存提示；原页面内部文案保持用户提供的版本。
export const director = {
  open: "Open Director",
  preview: "Camera preview",
  picture: "Camera image",
  loading: "Opening director…",
  hostError: "The director could not load or save. The scene remains open. Retry before leaving this page.",
} as const;
