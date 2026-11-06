"use client";

/**
 * AI 回复的公共阅读表面：CommonMark 解析交给 react-markdown，GFM 补充表格等语法。
 * 与编辑器分离，只把字符串投影成 React 元素，不修改会话里保存的 Markdown。
 * 不启用 HTML 执行插件；模型生成的标签只能显示为文字，不能进入真实 DOM。
 * 内置教程仍由 MarkdownDocument 展示，本组件服务不可预测的模型输出。
 * 流式正文可以尚未闭合围栏或强调标记，由成熟解析器处理不完整语法。
 * 样式全部使用现有主题 token，切换深浅主题无需重新解析或请求服务。
 */
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { memo } from "react";
import { cn } from "@/utils/cn";
// 块级代码交给共用控件提供语言、高亮和复制，普通行内 code 保持轻量样式。
// 只复用展示层，不改写会话字符串、工具输出或用户自己的消息。
import { MarkdownCodeBlock } from './markdown-code-block';

// 输入仅为正文和展示样式，不接管网络、消息状态或编辑动作。
// 相同文本由 memo 复用，其他消息更新不会重复解析已经完成的长回答。
// className 只影响外层字号或布局，不允许调用方注入 HTML 内容。
interface MarkdownResponseProps { markdown: string; className?: string }

/**
 * 表格使用独立横向滚动容器，长列不会撑宽聊天区或整个 main。
 * 原生 table 保留表头和单元格语义，不把表格画成无法选择的图片。
 * GFM 的单元格对齐样式由解析器保留，容器只负责宽度边界。
 * 链接不交给 Next 路由预取，模型输出不应自动发起页面访问。
 * 使用库默认的 URL 过滤，javascript/data 等危险链接不会成为可执行目标。
 * 新窗口保留 noreferrer/noopener，目标页面不能取得客户端窗口引用。
 * 图片只显示为带替代文本的链接，回复展示本身不自动请求外部图片。
 * 真正的生成结果仍由 AgentGeneratedImages 负责本地缩略图与大图预览。
 * 不把 node、行列位置等解析器内部属性透传到原生元素。
 * HTTP 链接和相对链接遵循同一 URL 过滤，不额外开放本地文件协议。
 * HTML 默认转义而不是跳过，H3 的 <d> 等字面标记因此仍能被看到。
 * 不使用 dangerouslySetInnerHTML，事件属性和 script 标签都没有执行入口。
 * 图片链接保留原地址但不生成 img，导入恶意像素跟踪也不会在阅读时自动加载。
 * 缺少 alt 的图片使用地址作为可选中的说明，避免空白占位让用户误以为内容丢失。
 * 不支持的协议仍由默认 URL 转换过滤，组件覆盖不会绕过库的 URL 处理阶段。
 * 表格外壳不设置固定宽度，因此宽屏自然填满，窄屏只在必要时出现内部滚动。
 * 单元格内容继续交给 ReactMarkdown 生成，行内粗体和代码不会因包裹表格而退化。
 * 链接文字使用原 children，嵌套强调不需要再次按字符串手动解析。
 * 没有接入 Markdown 编辑器工具栏，阅读回答不会额外占用输入框高度。
 */
const components: Components = {
  // 使用解析器的 pre 节点，不能靠正文正则把普通段落错误包装成代码。
  // 公共组件内按语言处理，历史消息与流式新增块自动获得相同能力。
  pre: MarkdownCodeBlock,
  table: ({ children }) => <div className="max-w-full overflow-x-auto rounded-lg border border-border [scrollbar-width:thin]"><table className="w-full border-collapse text-left text-[13px]">{children}</table></div>,
  a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>,
  img: ({ src, alt }) => <a href={typeof src === "string" ? src : undefined} target="_blank" rel="noreferrer noopener">{alt || (typeof src === "string" ? src : "")}</a>,
};

/**
 * 标题、段落、列表与分隔线使用阅读间距，避免原先 pre-wrap 把所有符号原样展示。
 * 不给正文整体设置 white-space，列表和表格需要浏览器正常计算布局。
 * 段落内保留模型的软换行，中文分行和分镜描述无需先拼接成一个长行。
 * 一级到六级标题均保持层级语义，嵌套强调由解析器递归处理。
 * 有序列表沿用 Markdown 的起始编号，Tailwind preflight 后显式恢复数字标记。
 * 无序列表显式恢复圆点；子列表保留缩进，不能与上层段落挤在一行。
 * 代码块保留空格和换行并独立横向滚动，复制时仍读取原始会话文本。
 * 行内代码使用轻量底色，pre 内移除重复底色与 padding，避免双重方框。
 * 围栏代码由公共代码块高亮，输出仅文字和 span，不评估或执行代码。
 * 引用只改变边线和颜色，不把 > 后的内容混入工具执行过程。
 * 表头的弱底色与单元格边线使用当前主题，暗色下不会出现白色表格。
 * 段落和表格单元格允许长词断行，长网址不会迫使 main 超出可用宽度。
 * 仅代码块允许保留宽行，横向滚动限定在该块内部。
 * GFM 删除线与任务列表复用原生语义，任务复选框由库设为只读。
 * 首尾块不添加额外外边距，消息气泡自身负责与角色标签、复制按钮的距离。
 * 选择器局限在本容器，不影响导航、表单、教程或用户的普通文字消息。
 * memo 比较的 markdown 字符串来自 store，不另建一份可变正文缓存。
 * 每次完整传入当前累计文本，支持流式过程中表格分隔行逐步到达。
 * 这里只使用同步解析，不增加计时器或依赖窗口可见性的 rAF 等待。
 */
export const MarkdownResponse = memo(function MarkdownResponse({ markdown, className }: MarkdownResponseProps) {
  return <div data-markdown-response className={cn(
    "min-w-0 max-w-full space-y-3 text-sm leading-7 [overflow-wrap:anywhere] [&>:first-child]:mt-0 [&>:last-child]:mb-0",
    "[&_h1]:mt-5 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold [&_h4]:font-semibold [&_h5]:font-semibold [&_h6]:font-semibold [&_strong]:font-semibold [&_p]:whitespace-pre-line",
    "[&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_li>p]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_hr]:my-4 [&_hr]:border-border",
    "[&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted/60 [&_pre]:p-3 [&_pre]:text-xs [&_pre]:[scrollbar-width:thin] [&_code]:rounded [&_code]:bg-muted/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_pre_code]:whitespace-pre [&_pre_code]:bg-transparent [&_pre_code]:p-0",
    "[&_th]:border-b [&_th]:border-border [&_th]:bg-muted/40 [&_th]:px-3 [&_th]:py-2 [&_th]:font-medium [&_td]:border-b [&_td]:border-border/50 [&_td]:px-3 [&_td]:py-2 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_input]:mr-2", className,
  )}><ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{markdown}</ReactMarkdown></div>;
});
