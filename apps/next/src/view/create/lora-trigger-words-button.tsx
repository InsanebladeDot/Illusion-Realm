"use client";
import { HoverTip } from "@/components/hover-tip";


import { WandSparkles } from "lucide-react";
import { useLocalModelMetadata } from "@/hooks/use-local-model-metadata";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import { parseLocalLoraId } from "@/utils/localModelResources";
import { appendPromptText, readPromptText } from "@/utils/promptTarget";
import { missingLoraTriggerWords } from "@/utils/lora-trigger-words";

/** 普通 / 高级提示词共用按钮；只读取当前选中且被扫描为 LoRA 的模型文件。 */
// 元数据仍来自原旁车读取器，只替换触发词去重与追加所用的正文目标。
// 不把局部节点正文借全局 DOM 中转，否则隐藏的创建页会被一起修改。
// target.read 与 target.append 必须描述同一份正文，不能在全局去重后往局部追加。
// 读取发生在点击当时，避免资料库打开期间编辑过正文后仍用旧快照判断重复。
// 缺省 target 使用原 readPromptText 和 appendPromptText，创建页行为不变。
// missingLoraTriggerWords 仍是唯一去重算法，不复制大小写或分隔符处理。
// 局部高级模式的追加也通过原组装动作，不能直接改只读的拼接预览 DOM。
// onApplied 只在确实有缺失词时展开输入，不把无变化按钮点击写成文本更新。
// 没有可用 trainedWords 时按钮仍隐藏，不造一个空操作入口。
// 仅扫描索引确认的 LoRA 路径参与元数据查询，不把任意模型 id 当作文件路径。
// 旁车读取错误与缓存沿用原 hook，target 注入不增加另一次文件读取链。
// revision 仍来自本地扫描版本，换节点不会让陈旧旁车信息永久留在按钮里。
// 触发词来自用户模型元数据，不拿模板演示文本充当已补齐内容。
// 成功提示只表示文本已应用，不表示 LoRA 权重被加载或推理已经完成。
export function LoraTriggerWordsButton({ ids, onApplied, target }: { ids: string[]; onApplied: () => void; target?: { read: () => string; append: (text: string) => void } }) {
  const { t } = useTranslation();
  const models = useSettingsStore(state => state.models);
  const revision = useSettingsStore(state => state.lastScannedAt) || 0;
  const loras = new Set(models.filter(model => model.type === "lora").flatMap(model => model.versions.map(version => version.filePath)));
  const paths = ids.map(parseLocalLoraId).filter((value): value is string => !!value && loras.has(value));
  const { entries } = useLocalModelMetadata(paths, revision);
  const words = entries.flatMap(entry => entry.metadata?.trainedWords || []);
  if (!words.length) return null;
  function apply() {
    const missing = missingLoraTriggerWords(words, (target?.read ?? readPromptText)());
    if (missing.length) { (target?.append ?? appendPromptText)(missing.join(", ")); onApplied(); }
    useToastStore.getState().show(t(missing.length ? "create.loraTriggers.applied" : "create.loraTriggers.unchanged", { count: missing.length }), missing.length ? "success" : "info");
  }
  return <HoverTip asChild layer="window" label={(t("create.loraTriggers.hint")) ?? ""}><button type="button" data-apply-lora-triggers onClick={apply} className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10"><WandSparkles size={13} />{t("create.loraTriggers.apply")}</button></HoverTip>;
}
