/** 本地生成共用注意力偏好；旧设置缺字段时默认启用 Kitchen，不保存模型或服务凭据。 */
export interface ModelAttentionSettings {
  enabled: boolean;
  backend: "comfy kitchen attention" | "pytorch attention";
}

export const DEFAULT_MODEL_ATTENTION: ModelAttentionSettings = { enabled: true, backend: "comfy kitchen attention" };

/** 外部文档可能被手改；只保留合法偏好，其余恢复默认。 */
export function resolveModelAttention(value: unknown): ModelAttentionSettings {
  if (!value || typeof value !== "object" || !("enabled" in value) || !("backend" in value)) return { ...DEFAULT_MODEL_ATTENTION };
  if (typeof value.enabled !== "boolean" || value.backend !== "comfy kitchen attention" && value.backend !== "pytorch attention") return { ...DEFAULT_MODEL_ATTENTION };
  return { enabled: value.enabled, backend: value.backend };
}
