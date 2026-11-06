// 快捷词沿用模型触发词的拆分规则；只管理字符串，不写提示词正文或用户文档。
// 旧条目可能是一整段，展示时拆成词卡，存储仍沿用原 string[] 契约。
import { missingLoraTriggerWords } from "./lora-trigger-words";

// 不在此重复写逗号、中文逗号和换行正则，两处始终使用同一套分词和去重规则。
// 同一段里的空格属于短语，像 full-face blush 仍是一张词卡。
// 原数组顺序决定显示顺序；重复大小写写法保留第一次，不按字母重新排列。
// 不截成24颗：旧存储的一个长条目可以包含更多标签，显示不应丢掉后面的内容。
export const splitQuickWords = (words: string[]) => missingLoraTriggerWords(words, "");

// 按显示词移除时，要在所有旧条目中找同一归一化词，否则隐藏的重复项会重新出现。
// 先逐条拆再接回原槽位，像从每个信封中拿走指定词卡，不把信封全部摊成新名单。
// 保持槽位数量不增加，避免现有24条存储上限把一整段拆开的第25颗以后误删掉。
// 非目标标签保留原顺序和拼写；空信封丢弃，正文和其他分类不受影响。
// 标签比较与模型匹配一致：忽略两端/重复空白和大小写，不做子串删除。
// 因此移除 blush 不会误删 full-face-blush，带括号的训练词也保持完整。
// 重排的是快捷词的排版分隔，不替换原分类 textarea 中已写好的提示词。
// 比较采用整词，不使用includes，避免删除hair同时误删long hair。
// 目标在多个旧条目重复出现时全部移除，否则去重隐藏的副本会立即重新显示。
// 重复项的第一次拼写由共享分词器决定，展示与移除的归一化口径一致。
// CRLF中的回车经trim消除，Windows旧文档换行不会留下一颗空白标签。
// 逗号是标签分隔，英文短语里的普通空格继续保留，不按空格切词。
// 大小写只用于比对，最终保留标签仍沿用用户的原始拼写。
// 这里不修改传入数组，调用方持有的草稿快照不会被原地splice污染。
// 返回新的数组交给原store保存，现有用户文档节流写入机制不变。
// 单条移除不会触碰分类content，已插入的提示词需要用户自己编辑正文。
// 空条目被清掉是因为它已没有快捷词，不是用默认预设补回被删除内容。
// 旧存储限制计算的是条目数量，因此必须在每个旧槽内部完成删词再合回。
// 只有显示层展平，存储层不扩张，这是保留大段历史数据后半部分的关键。
export function removeQuickWord(words: string[], target: string): string[] {
  const key = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();
  return words.map(word => splitQuickWords([word]).filter(tag => key(tag) !== key(target)).join(", ")).filter(Boolean);
}
