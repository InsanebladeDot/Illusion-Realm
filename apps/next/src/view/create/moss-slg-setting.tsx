"use client";

import { HoverTip } from "@/components/hover-tip";
import { ToggleSwitch } from "@/components/toggle-switch";
import { useTranslation } from "@/i18n";

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** 创作页和画布共用 SLG 开关与提示，开关值由各自表单保存。 */
export function MossSlgSetting({ checked, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-2">
      <HoverTip asChild layer="window" label={t("create.moss.slgHint")}>
        <span className="text-sm font-medium">SLG</span>
      </HoverTip>
      <ToggleSwitch label="SLG" checked={checked} onChange={onChange} />
    </div>
  );
}
