/** H3 图片编辑按上传顺序登记图片；预览、助手和工作流共用同一编号表。 */
import type { PromptReferenceMedia } from "@/utils/prompt-media-references";

// 此处没有文件读取：名称只确定当前槽位，真实上传仍由原编辑队列执行。
// 像按座位发号码牌，文件改名不会使第一张变成第二张。
export function imagePromptMedia(names: readonly string[]): PromptReferenceMedia[] {
  return names.map((name, index) => ({ id: `image-${index + 1}`, kind: "image", number: index + 1, name, src: "" }));
}
