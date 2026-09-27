export type ResourceDialogFontSize = "sm" | "md" | "lg";

export type ResourceCategoryUiMode = "tabs" | "dropdown";

export const DEFAULT_RESOURCE_CATEGORY_UI_MODE: ResourceCategoryUiMode = "dropdown";

export const RESOURCE_DIALOG_FONT_SIZE_OPTIONS: {
  value: ResourceDialogFontSize;
  label: string;
}[] = [
  { value: "sm", label: "小" },
  { value: "md", label: "中" },
  { value: "lg", label: "大" },
];

export const DEFAULT_RESOURCE_DIALOG_FONT_SIZE: ResourceDialogFontSize = "sm";
