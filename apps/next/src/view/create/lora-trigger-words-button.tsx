"use client";

import { WandSparkles } from "lucide-react";
import { useLocalModelMetadata } from "@/hooks/use-local-model-metadata";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import { parseLocalLoraId } from "@/utils/localModelResources";
import { appendPromptText, readPromptText } from "@/utils/promptTarget";
import { missingLoraTriggerWords } from "@/utils/lora-trigger-words";

/** 普通 / 高级提示词共用按钮；只读取当前选中且被扫描为 LoRA 的模型文件。 */
export function LoraTriggerWordsButton({ ids, onApplied }: { ids: string[]; onApplied: () => void }) {
  const { t } = useTranslation();
  const models = useSettingsStore(state => state.models);
  const revision = useSettingsStore(state => state.lastScannedAt) || 0;
  const loras = new Set(models.filter(model => model.type === "lora").flatMap(model => model.versions.map(version => version.filePath)));
  const paths = ids.map(parseLocalLoraId).filter((value): value is string => !!value && loras.has(value));
  const { entries } = useLocalModelMetadata(paths, revision);
  const words = entries.flatMap(entry => entry.metadata?.trainedWords || []);
  if (!words.length) return null;
  function apply() {
    const missing = missingLoraTriggerWords(words, readPromptText());
    if (missing.length) { appendPromptText(missing.join(", ")); onApplied(); }
    useToastStore.getState().show(t(missing.length ? "create.loraTriggers.applied" : "create.loraTriggers.unchanged", { count: missing.length }), missing.length ? "success" : "info");
  }
  return <button type="button" data-apply-lora-triggers onClick={apply} title={t("create.loraTriggers.hint")} className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10"><WandSparkles size={13} />{t("create.loraTriggers.apply")}</button>;
}
