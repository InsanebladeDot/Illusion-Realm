export type SdImageMetaField = {
  key: string;
  value: string;
  /** Comment / workflow 等 JSON 字段 */
  json?: unknown;
};

export type SdImageExifField = {
  key: string;
  description: string;
};

export type SdImageInspectResult = {
  fileName: string;
  fileSize: number;
  metaType: "SD-WEBUI" | "NOVELAI" | "NONE";
  fields: SdImageMetaField[];
  exif: SdImageExifField[];
  rawParameters?: string;
  /**
   * 内嵌 Meta 的版本号。来自独立的 `illusionRealmMeta` 块；
   * **没有该块时按 v1 推理**（标记机制落地前产出的图）。
   */
  metaVersion?: number;
};
