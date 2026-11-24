"use client";

/** 直接订阅原模型索引；下载完成后的原扫描会自动解锁，不保存另一份“已安装”标记。 */
import { useMemo } from 'react';
import type { ComfyApiPrompt } from '@/types/comfy';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { missingWorkflowModels } from '@/utils/workflow-model-readiness';

export function useWorkflowReadiness(prompt: ComfyApiPrompt | null) {
  const models = useSettingsStore(state => state.models), paths = useSettingsStore(state => state.paths);
  const scanning = useSettingsStore(state => state.scanning);
  const missing = useMemo(() => prompt ? missingWorkflowModels(prompt, models, paths) : [], [prompt, models, paths]);
  return { missing, checking: Boolean(prompt) && (scanning), blocked: Boolean(prompt) && (scanning || missing.length > 0) };
}
