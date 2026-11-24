"use client";

/** 按系列恢复加载配置，根据当前扫描结果决定是否可生成。 */
import { useEffect, useMemo, useState } from 'react';
import type { LocalModel } from '@/types/localModel';
import type { SettingsPaths } from '@/types/settings';
import { useCreateFormStore } from '@/stores/useCreateFormStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { getImageWorkflowTemplate, type ImageWorkflowSeries } from '@/utils/comfy/imageWorkflow';
import { IMAGE_MODEL_SERIES, imageCoreReadiness } from '@/utils/comfy/image-core-models';
import { describeImageModelCheck, imageModelCheckKey, type ImageModelCheck } from '@/utils/comfy/image-model-verification';

const templates = {
  anima: getImageWorkflowTemplate('anima'), sdxl: getImageWorkflowTemplate('sdxl'), moss: getImageWorkflowTemplate('moss'),
};

function useModelCheckStatus(check: ImageModelCheck | undefined): import("@/types/userData").ImageModelVerification | "pending" {
  const [resolved, setResolved] = useState<{ identity: string; key: string }>();
  useEffect(() => {
    if (!check) return;
    let current = true;
    // 摘要较晚返回时，旧模型的状态不能盖到刚切换的模型上。
    void imageModelCheckKey(check).then(key => {
      if (current) setResolved({ identity: check.identity, key });
    }).catch(() => { /* 摘要不可用时仍可生成。 */ });
    return () => { current = false; };
  }, [check]);
  return useCreateFormStore(state => resolved?.identity === check?.identity && resolved
    ? state.imageModelChecks[resolved.key] ?? 'pending' : 'pending');
}

export function useImageModelSetup(series: ImageWorkflowSeries, models: LocalModel[], paths: SettingsPaths, scanning: boolean) {
  const overrides = useCreateFormStore(state => state.imageModelChoices);
  const change = useCreateFormStore(state => state.setImageModelChoices);
  const server = useSettingsStore(state => state.comfyServerUrl);
  const status = useMemo(() => IMAGE_MODEL_SERIES.map(id => ({
    id, ...imageCoreReadiness(templates[id], overrides[id] ?? {}, models, paths, scanning),
  })), [models, paths, scanning, overrides]);
  const check = useMemo(() => scanning ? undefined : describeImageModelCheck(
    templates[series], overrides[series] ?? {}, models, paths, server,
  ), [series, overrides, models, paths, scanning, server]);
  const verification = useModelCheckStatus(check);
  return { templates, overrides, status, change, check, verification };
}
