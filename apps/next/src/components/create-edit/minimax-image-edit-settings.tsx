"use client";

/** H3 设置区复用现有种子、及模型加载组件，只显示原图真正消费的字段。 */
import type { ReactNode } from "react";
import type { AnimaEditSettings } from "@/utils/comfy/anima-edit-workflow";
import { getMinimaxImageEditTemplate } from "@/utils/comfy/minimax-image-edit-workflow";
import { WorkflowModelSettings } from "@/view/create/video-model-settings";
import { VideoModelSelect } from "@/view/create/video-model-select";
import { VideoLoraSelect } from "@/view/create/video-lora-select";
import { SeedFields } from "@/view/create/generation-sampling-fields";
import { useTranslation } from "@/i18n";
import { AdvancedSettingsSection } from "@/view/create/advanced-settings-section";

interface Props {
  settings: AnimaEditSettings;
  onChange: (value: AnimaEditSettings) => void;
  disabled?: boolean;
  seedMode: "random" | "custom";
  onSeedMode: (mode: "random" | "custom") => void;
  advancedFields?: ReactNode;
  onPickerOpenChange?: (open: boolean) => void;
}
const TEMPLATE = getMinimaxImageEditTemplate();

export function MinimaxImageEditSettings({ settings, onChange, disabled = false, seedMode, onSeedMode, onPickerOpenChange, advancedFields }: Props) {
  const { t } = useTranslation();
  const updateModels = (modelOverrides: NonNullable<AnimaEditSettings["modelOverrides"]>) => onChange({ ...settings, modelOverrides });
  const loras = settings.loras.map((item, index) => ({ ...item, id: String(index) }));
  return <fieldset disabled={disabled} className="min-w-0 space-y-4" data-minimax-image-settings>
    {/* 模型区：现有 MiniMax 选择卡和辅助加载设置读取这份图片模板。 */}
    <VideoModelSelect workflowId="minimax" templateOverride={TEMPLATE} overrides={settings.modelOverrides ?? {}} onChange={updateModels} disabled={disabled} />
    {/* 扩展区：复用 MiniMax 选择器，选择与权重直接写入本次编辑参数。 */}
    <VideoLoraSelect workflowId="minimax" templateOverride={TEMPLATE} value={loras} disabled={disabled} onPickerOpenChange={onPickerOpenChange} onChange={value => onChange({ ...settings, loras: (typeof value === "function" ? value(loras) : value).map(({ name, strength }) => ({ name, strength })) })} />
    <WorkflowModelSettings workflowId="minimax" mediaKind="image" templateOverride={TEMPLATE} overrides={settings.modelOverrides ?? {}} onChange={updateModels} onReset={() => updateModels({})} disabled={disabled} />
    <SeedFields editSeed seed={settings.seed} seedMode={seedMode} onSeed={seed => { onSeedMode("custom"); onChange({ ...settings, seed }); }} onSeedMode={onSeedMode} />
    <AdvancedSettingsSection disabled={disabled}>{advancedFields}</AdvancedSettingsSection>
    <p className="text-xs leading-5 text-muted-foreground">{t("create.animaEdit.h3Hint")}</p>
  </fieldset>;
}
