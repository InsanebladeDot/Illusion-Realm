/** 将内置 Markdown 的二级标题当作任务步骤；正文继续交给已有 Markdown 阅读组件。 */
import { setupGuidePaths } from "@/data/setup-checklist";

export interface SetupGuideStep { id: string; title: string; markdown: string }
export interface SetupGuideDocument { id: string; title: string; introduction: string; steps: SetupGuideStep[] }

// 像表单上的填空，三个约定占位符填入工作流路径，其他文字和 Markdown 原样保留。
export function parseSetupGuide(id: string, source: string): SetupGuideDocument {
  const markdown = Object.entries(setupGuidePaths(id)).reduce((text, [kind, value]) => text.replaceAll(`{{${kind}Path}}`, value), source.replaceAll("\r\n", "\n"));
  const [header, ...sections] = markdown.split(/^## +/m);
  const title = /^# +(.+)$/m.exec(header)?.[1]?.trim();
  if (!title || !sections.length) throw new Error("invalid-setup-guide");
  const steps = sections.map((section, index) => {
    const [heading, ...body] = section.split("\n");
    return { id: `${id}-${index + 1}`, title: heading.trim(), markdown: body.join("\n").trim() };
  });
  return { id, title, introduction: header.replace(/^# +.+$/m, "").trim(), steps };
}
