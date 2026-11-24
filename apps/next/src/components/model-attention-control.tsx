"use client";

/** 所有本地工作流共用一份偏好和控件；任务入队时另存快照，改这里不会影响排队中的任务。 */
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useTranslation } from "@/i18n";
import { ToggleSwitch } from "./toggle-switch";
import { SimpleSelect } from "./SimpleSelect";

export function ModelAttentionControl({ disabled = false }: { disabled?: boolean }) {
  const { t } = useTranslation();
  const settings = useSettingsStore(state => state.modelAttention);
  const change = useSettingsStore(state => state.setModelAttention);
  return <div data-model-attention className="min-w-0 space-y-2">
    {/* 高级设置：开关与后端下拉共用于图片、视频和音频。 */}
    <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{t("create.attention.title")}</span><ToggleSwitch label={t("create.attention.title")} checked={settings.enabled} disabled={disabled} onChange={enabled => change({ ...settings, enabled })} /></div>
    <SimpleSelect portal ariaLabel={t("create.attention.backend")} disabled={disabled || !settings.enabled} value={settings.backend} options={[{ value: "comfy kitchen attention", label: "comfy kitchen attention" }, { value: "pytorch attention", label: "pytorch attention" }]} onChange={backend => { if (backend === "comfy kitchen attention" || backend === "pytorch attention") change({ ...settings, backend }); }} />
    <p className="text-xs leading-relaxed text-muted-foreground">{t("create.attention.hint")}</p>
  </div>;
}
