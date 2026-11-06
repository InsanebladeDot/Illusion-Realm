"use client";
/** Markdown 围栏代码的公共阅读控件：语言、高亮和复制共用原始代码字符串。 */
// 现有 react-markdown 负责分块，本组件不重新用正则解析整篇回答。
// 高亮只产生文字和 span，不执行代码，不把模型的 HTML 插进 DOM。
// 像给同一份稿子加彩色批注：纸上的字不变，复制仍拿未经着色的稿子。
import { memo, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import type { ExtraProps } from 'react-markdown';
import { common, createLowlight } from 'lowlight';
import { Check, Copy } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { copyText } from '@/utils/charactersFormat';
import { useToastStore } from '@/stores/useToastStore';

// common 使用库维护的常见语言，不为每一种语法手写一套着色正则。
// 注册发生在模块加载时；旧消息重绘不会重复建立高亮器。
// 语言来自围栏声明，普通提示词不做激进猜测，避免误标为 CSS 或其他代码。
// 未标语言、text 以及未收录语法都回落普通文本，仍保留复制能力。
// 不读取外部主题文件或动态加载远端脚本，安装后离线也可使用。
const highlighter = createLowlight(common);
// 语法树类型直接取库的真实返回值，升级后不靠自造 any 掩盖接口变化。
// common 的语言范围由依赖版本固定，不把用户给的语言名当成模块路径导入。
// 别名是否有效也询问同一个实例，避免标签识别与实际着色使用两张名单。
// 标成 text 的未知语法仍完整展示，用户不会因为没安装语言包而丢失正文。
// 同一个模块实例可供多个 MarkdownResponse 使用，复制状态却不放在模块变量。
// 高亮结果是展示派生值，不写进会话持久化文件或再次发送给模型。
type HighlightNode = ReturnType<typeof highlighter.highlight>['children'][number];

// lowlight 返回语法树而非可执行 HTML，逐层只允许 text 和 span。
// 原文中的尖括号、script、事件属性只能成为 React 自动转义的文字。
// token 的 className 只来自高亮库，模型不能借正文设置任意 DOM 属性。
// 嵌套 span 是语法的分层，比如字符串里的插值，不把它摊平丢掉颜色。
// 没有使用 dangerouslySetInnerHTML，也没有重新开启 Markdown 的原始 HTML 插件。
// 其余节点忽略，不能把未知树节点当链接、图片或可交互元素渲染。
// key 是同一份不可变语法树内的位置，不承担消息或工具调用的业务身份。
// 返回文字本身，不将 AST 的元数据或语言置信度混入可复制内容。
// 文字叶子不套多余 DOM，浏览器选择连续代码时仍保留自然的文字边界。
// 元素属性不作整体展开，库将来新增属性也不会被意外传到真实页面。
// 只有 className 被选取用于染色，不接受样式、链接目标或点击处理器。
// 字符串数组先拼成标准 class 字符串；属性缺失时保留不带颜色的 span。
// React 在文字节点层面转义，复制的尖括号与显示的尖括号能同时保持原样。
// 递归只读取高亮器自己生成的树，外部 Markdown AST 不直接进入此函数。
function renderTokens(nodes: HighlightNode[]): ReactNode {
  return nodes.map((node, index) => node.type === 'text' ? node.value : node.type === 'element'
    ? <span key={index} className={Array.isArray(node.properties.className) ? node.properties.className.join(' ') : undefined}>{renderTokens(node.children)}</span> : null);
}

// 超长块保留完整文本和滚动，但不在每个流式分片都重新分析十万字以上内容。
// 这是同步显示的性能边界，不截断消息，也不改变模型历史或剪贴板原文。
// 已知语言仍显示标签；无法高亮时可读文本比一整条回复崩溃更重要。
// 高亮器异常被局部接住，不吞掉会话错误，不伪造任何工具成功。
// text 是明确的普通文本类型，即使正文包含括号也不应强行按代码染色。
// 未注册语言先判断再调用，插件缺失不会造成一连串界面异常。
// 函数无网络、文件和定时器副作用，可以安全用于静态预渲染。
// 正文中的可疑标签在成功与回落两种路径都会保持文字语义。
// 十万字符阈值按 JavaScript 字符串长度计算，不是网络传输字节限制。
// 阈值只控制同步着色成本，大块内容仍能搜索、选择、横向滚动和复制。
// 如果语法定义抛错，回落的是 source，不使用可能只生成一半的 token。
// 流式更新以当前整块文本为单位，memo 不会把上一帧着色误套在新原文上。
// 这里不探测机器是否在线，也不为了语法识别向第三方发送聊天内容。
// 渲染函数是同步纯转换，不创建 Worker、网络连接或卸载后仍运行的任务。
function highlightCode(source: string, language: string): ReactNode {
  if (language === 'text' || source.length > 100_000 || !highlighter.registered(language)) return source;
  try { return renderTokens(highlighter.highlight(language, source).children); }
  catch { return source; }
}

// pre 的 AST 包含一个 code 元素；行内 code 不走此组件，不出现大块工具栏。
// 原文取 AST 文本，不能读高亮后的 innerText，否则会混入工具栏或折叠内容。
// 解析器补的最后一个换行在代码复制时去掉，内部缩进、空行和符号全部保留。
// H3 的 <Picture 1> 等标签属于正文，不通过 HTML 解析或模板插值处理。
// 围栏语言取解析器生成的 language-* 类名，绝不从正文中的英文单词猜语言。
// memo 复用历史块；正在流式增长的块仍根据最新 source 更新着色和复制内容。
// 已复制状态记录当时文本，流式追加后不会继续把新内容显示成已经复制。
// 一个代码块一份状态，复制第二块不会让第一块绑定到第二块的原文。
// 这里不持久化 code，不产生第二份 Agent 会话或用户 JSON。
// 空代码禁用复制；按钮不会因为处于其他表单里触发提交。
// 点击复制使用项目原封装，浏览器拒绝权限时返回失败并给明确反馈。
// 没有延时恢复图标的计时器，离开页面不会留下需要清理的回调。
// 工具栏在滚动区外面，横向阅读长代码时语言和复制按钮仍在右上角可见。
// 语义 section 包住 pre，不能把带按钮的 div 非法嵌在 pre 里面。
// 块级 pre 的子元素来自 react-markdown，通常只有唯一的 code 元素。
// 缩进代码也会形成 pre，没有 language 类时和普通围栏走同一 text 分支。
// 解析器追加换行用于代码块语义，末尾只移除一个，用户主动留下的空行仍保留。
// 没有使用 trim；行首空格对 Python 等语言是语义的一部分，不能被吃掉。
// 复制成功状态不跨块传播，即使两个块文字相同，它们仍是独立 React 实例。
// aria-live 仅通知按钮的短状态，不让读屏器在每次着色时重复朗读整块代码。
// 按钮保留原生键盘操作，Tab 能进入，空格和 Enter 均由浏览器触发 click。
// 边框沿用应用语义变量；代码关键词颜色的 dark 变体仍由应用主题统一决定。
// 工具栏的 shrink-0 给复制动作留空间，语言名称再长也优先省略标签。
// 外层 min-w-0 允许消息列收缩，真正的长行滚动仍由里面的 pre 承担。
// 本组件没有改变用户输入区，用户自己的 Markdown 消息仍按原有方式展示。
// 代码块不带编辑光标或可执行按钮，阅读与执行工具的权限边界保持分离。
export const MarkdownCodeBlock = memo(function MarkdownCodeBlock({ node }: ComponentProps<'pre'> & ExtraProps) {
// 解析器传来的 node 是展示 AST，不是模型可指定的 React 组件名称。
// 只取元素子节点可跳过 pre 周围的格式化文字，避免把空白当作代码节点。
// code 的文字子节点按原顺序拼接，多个文本叶子之间不额外插入空格。
// 语言正则只匹配类名中的单个 language 标记，不对代码正文运行替换。
// 转成小写使 Python 与 python 使用同一语言注册项。
// 语法标签是纯文字 span，不让任意语言声明变成 HTML 或链接。
// 高亮记忆依赖同时包含 language 和 source，同文不同语言不会复用错误颜色。
// 复制状态初始为 null；空字符串代码不会在首次显示就误出现成功图标。
// 成功图标只是本块最近一次复制的反馈，不代表用户已经保存了文件。
// copyText 内部捕获浏览器异常，所以事件处理的 Promise 不会因权限拒绝向外逃逸。
// 同一按钮在异步等待期间仍可点击，每次调用都捕获当次 source。
// 没有在渲染过程中访问 navigator，静态导出阶段不会触发浏览器能力访问。
  const code = node?.children.find(child => child.type === 'element');
  const source = (code?.children.map(child => child.type === 'text' ? child.value : '').join('') ?? '').replace(/\n$/, '');
  const classes = Array.isArray(code?.properties.className) ? code.properties.className.join(' ') : '';
  const declared = classes.match(/language-([^\s]+)/)?.[1]?.toLowerCase() ?? 'text';
  const language = highlighter.registered(declared) ? declared : 'text';
  const tokens = useMemo(() => highlightCode(source, language), [source, language]);
  const [copiedSource, setCopiedSource] = useState<string | null>(null);
  const { t } = useTranslation();
  // 复制只带块内内容，不含围栏、语言标签、按钮文字或整条回复其他段落。
  // 状态基于本次操作传入的 source，异步完成时不会把后来的流式内容误标成已复制。
  // 失败复用已有提示，不抛出未处理 Promise，也不修改 Agent 运行状态。
  // 普通 text 和高亮代码使用同一动作，复制结果不受语法着色影响。
  async function copy() {
    const copied = await copyText(source);
    setCopiedSource(copied ? source : null);
    useToastStore.getState().show(t(copied ? 'create.promptAssistant.copied' : 'common.copyFailed'));
  }
  const copied = copiedSource === source;
  return <section data-markdown-code-block data-code-language={language} className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-muted/40">
    {/* 阅读区：语言标签与复制工具栏不跟随代码横向滚动，窄窗口仍可操作。 */}
    <div className="flex min-w-0 items-center justify-between gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
      <span className="min-w-0 truncate font-mono">{language}</span>
      <button data-code-copy type="button" disabled={!source} onClick={() => { void copy(); }} aria-label={t('common.copy')} title={t('common.copy')} className="inline-flex shrink-0 items-center gap-1.5 rounded px-1.5 py-1 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40">{copied ? <Check size={13} /> : <Copy size={13} />}<span aria-live="polite">{t(copied ? 'create.promptAssistant.copied' : 'common.copy')}</span></button>
    </div>
    {/* 代码区：主题色只作用于语法 token，普通文本保留当前主题默认前景色。 */}
    {/* 使用同一套语义颜色的浅深变体，不维护第二个主题开关或固定白色底板。 */}
    {/* keyword 包括控制语句；literal 包括 true/null，不能把字符串都画成关键字。 */}
    {/* 注释采用弱色，字符串、数字和类型分别着色，长行仍能整段选择复制。 */}
    <pre className="!m-0 !rounded-none !bg-transparent text-foreground"><code className={[
      '[&_.hljs-keyword]:text-violet-700 dark:[&_.hljs-keyword]:text-violet-300 [&_.hljs-literal]:text-violet-700 dark:[&_.hljs-literal]:text-violet-300',
      '[&_.hljs-string]:text-emerald-700 dark:[&_.hljs-string]:text-emerald-300 [&_.hljs-regexp]:text-emerald-700 dark:[&_.hljs-regexp]:text-emerald-300',
      '[&_.hljs-number]:text-orange-700 dark:[&_.hljs-number]:text-orange-300 [&_.hljs-attr]:text-sky-700 dark:[&_.hljs-attr]:text-sky-300',
      '[&_.hljs-title]:text-blue-700 dark:[&_.hljs-title]:text-blue-300 [&_.hljs-built_in]:text-cyan-700 dark:[&_.hljs-built_in]:text-cyan-300',
      '[&_.hljs-comment]:text-muted-foreground [&_.hljs-meta]:text-muted-foreground',
    ].join(' ')}>{tokens}</code></pre>
  </section>;
});
