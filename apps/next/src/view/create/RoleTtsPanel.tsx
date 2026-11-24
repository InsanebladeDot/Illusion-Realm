"use client";

/** 创作页保留原常驻草稿和结果，只把展示交给与画布共用的音频表单。 */
import { useAudioCreateStore } from '@/stores/use-audio-create-store';
import { useGenerationTaskStore, isGenerationTaskActive } from '@/stores/useGenerationTaskStore';
import { AudioGenerationForm } from './audio-generation-form';
import { AudioResults } from './audio-results';

export function RoleTtsPanel({ showResults = true }: { showResults?: boolean }) {
  const state = useAudioCreateStore();
  const active = useGenerationTaskStore(store => store.tasks.some(task => task.id === state.taskId && isGenerationTaskActive(task)));
  return <AudioGenerationForm state={state} active={active}>{showResults && <AudioResults />}</AudioGenerationForm>;
}
