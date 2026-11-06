"use client";

// 下拉选项沿用原业务值，菜单外观、滚动与键盘操作统一复用采样器组件。
import { SimpleSelect } from "@/components/SimpleSelect";

/** 提示词助手历史查看页；共享资源外壳负责布局，记录仍属于原偏好仓库。 */
// 原文与译文只是显示内容，不把历史当作待执行的系统指令。
// 不接收编辑器 write 回调，展开、排序和复制都不会改动当前提示词。
// 宽屏、窄屏和主题跟随 ResourceDialogShell，不复制浮层定位或遮罩体系。
// 每次打开建立自己的时间方向，另一工具栏打开历史不会串联本地展开状态。
// 全部输入共享成功收据，列表不按当前分类过滤掉其他地方的译文。
// 两栏正文在窄屏自动上下排，长文本在自己的最大高度内滚动。
// 原文保留换行，连续英文标签也允许换行，不能把弹窗撑出水平滚动条。
// summary 用浏览器原生 details 行为，鼠标和键盘都能展开完整结果。
// 用户主动展开的记录以操作 id 为身份，切换时间方向不交换两条正文。
// 默认只展开最新一条，避免一打开就把一百条长译文同时摊满。
// 记录时间以数字排序，展示标签才按用户语言格式化，不能按月份文字比较。
// 日期包括年份和秒数，跨年或同一分钟内的转换仍可辨认。
// copyText 沿用角色库等已有剪贴板能力，失败有明确反馈而非假复制成功。
// 关闭以后只卸载本视图，没有播放器、临时 URL 或网络监听需要保留。
// 不提供删除或应用历史的额外业务，本轮只实现查看、时间排序与复制。
import { useCallback, useEffect, useState } from "react";
import type { PromptTranslationRecord } from "@illusion-realm/shared";
import { ResourceDialogShell } from "@/components/ResourceDialogShell";
import { usePromptAssistantStore } from "@/stores/usePromptAssistantStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import { copyText } from "@/utils/charactersFormat";

/** 加载失败保留重试入口；成功和空历史都来自真正的用户文档。 */
// 父工具栏会预加载偏好，但从此处独立重试可以恢复首次读取失败。
// store 的 load 自带去重，两个实例同时打开不会各读一遍磁盘。
// effect 只负责请求结果的错误展示，卸载后不再写本地错误状态。
// 不用假加载计时器，ready 由偏好真实读取结果决定。
// 一次失败不会显示“暂无记录”，避免把读取错误误认成空数据。
// 重试不清空 store 原记录，成功后由原归一化恢复最新历史。
// 最早/最新只是查看方向，切换不再写盘或重排存储数组。
// render 前复制数组，防止 reverse 修改共享引用污染其他输入框。
// 正在完成的新请求通过 Zustand 订阅自动出现，无需刷新页面。
// 列表没有发往云端的查询，查看历史不需要再次校验密钥。
// 稳定 close 回调沿用来源工具栏，外壳可处理 Escape 和 main 返回。
// 第一个排序控件自动聚焦，键盘用户进入后能立即改变查看方向。
export function AssistantHistory({ onClose }: { onClose: () => void }) {
  // 本地页面状态与用户内容分工：oldestFirst 决定阅读方向，preferences 提供持久内容。
  // failed 只描述读取错误，不会把译文请求失败当成本页面无法打开。
  // attempt 仅由重试按钮递增，用 effect 的 cleanup 撤销上一次错误回调的发布权。
  // 关闭后较晚的 load 拒绝只被消费，不再改变已卸载组件状态。
  // 点击重试先清除旧错误，随后显示真实 ready 状态，不保留遮住成功列表的旧警告。
  // load 成功后 ready 由 store 发布，而非在本视图中人为设成 true。
  // 已有数据时无需再次访问模型站点，本页面不会发出 chat/completions。
  // 没有历史的旧文档和真正零次成功的用户使用相同空态，兼容而不造假。
  // 说明中的一百条是实际归一化上限，页面没有暗藏更多不可见的永久记录。
  // 选择最早在前时仅 reverse 本地副本，不改变下一次打开的默认最新方向。
  // 新结果完成会出现在符合当前方向的位置，不强制把用户选择改回最新。
  // 使用 record.id 作为 key，使同名模型、同样译文的不同请求仍能单独展开。
  // 一行折叠摘要已经包含时间和结果片段，不必点击才能辨认是哪次翻译。
  // 不把 contextId 用作筛选条件，用户从姿势页也能找回普通提示词里的翻译。
  // 外壳负责限制可用高度，内容不能另加固定 viewport 高度覆盖应用导航。
  // header、工具条和主体使用同一语义主题色，浅深模式无需不同业务组件。
  // 原生 select 支持方向键、首字母和焦点，不用重新实现自定义排序弹出菜单。
  // 空态也保留排序控件，让界面结构在第一条成功返回时保持稳定。
  // 没有清空按钮，避免用户只是想查看过去的内容却意外删掉全部记录。
  // 视图不自己持久化正文副本，用户文档是这些历史记录的唯一来源。
  // 未展开的结果仍是正常文本摘要，辅助阅读器可通过 details 得知展开状态。
  // 错误区 role=alert 只在实际失败时出现，不用它播报每次排序操作。
  // 加载区 role=status 不阻塞其他应用区域，失败重试仍可由键盘完成。
  // 长文件路径等其他创作数据没有传入 props，历史不能借此访问文件系统。
  // 这页仅处理纯文本，因此没有视频解码或图片缩略图缓存的生命周期。
  // 回到来源后仍保留原 prompt hook 的撤销对象，不因打开记录页丢掉撤销能力。
  // 错误回调中的 active 是本次 effect 的局部变量，不与另一个工具栏共享取消状态。
  // 多个历史实例即使同时订阅同一段偏好，查看方向和展开状态仍各自独立。
  // 组件卸载不会删除成功结果，因为记录的保存发生在请求完成边界而非视图关闭时。
  // 记录来自过去真实成功的请求，但本页面不承诺这些模型今天仍然可用。
  const { t } = useTranslation();
  const { preferences, ready } = usePromptAssistantStore();
  const [oldestFirst, setOldestFirst] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void usePromptAssistantStore.getState().load().catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [attempt]);
  const records = [...(preferences.history ?? [])];
  if (oldestFirst) records.reverse();
  const close = useCallback((open: boolean) => { if (!open) onClose(); }, [onClose]);
  return <ResourceDialogShell open title={t("create.promptAssistant.history.title")} titleId="prompt-assistant-history" onOpenChange={close}
    description={t("create.promptAssistant.history.description")}
    toolbar={<label className="flex items-center gap-2 text-sm">{t("create.promptAssistant.history.order")}<SimpleSelect
 autoFocus
 data-translation-history-order
 value={String(oldestFirst ? "oldest" : "newest")}
 onChange={(value) => setOldestFirst(value === "oldest")}
 className="min-w-0" portal
 options={[{ value: String("newest"), label: t("create.promptAssistant.history.newest") }, { value: String("oldest"), label: t("create.promptAssistant.history.oldest") }]}
 /></label>}>
    {/* 历史内容区：错误、加载与空库互斥，不用空列表掩盖读取失败。 */}
    {failed ? <div role="alert" className="p-6 text-sm"><p>{t("create.promptAssistant.history.loadFailed")}</p><button type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1); }} className="mt-3 rounded border border-border px-3 py-2 focus-visible:ring-2 focus-visible:ring-accent-stroke">{t("create.promptAssistant.history.retry")}</button></div>
      : !ready ? <p role="status" className="p-6 text-sm text-muted-foreground">{t("common.loading")}</p>
      : records.length === 0 ? <p data-translation-history-empty className="p-6 text-center text-sm text-muted-foreground">{t("create.promptAssistant.history.empty")}</p>
      : <div data-translation-history-list className="mx-auto w-full max-w-5xl space-y-3">{records.map((record, index) => <TranslationRecord key={record.id} record={record} initiallyOpen={index === 0} />)}</div>}
  </ResourceDialogShell>;
}

/** 一条收据包含实际时间、发送标签与原文/译文，全部按纯文本展示。 */
// 预设名称可包含用户自定义长文本，摘要只省略外观，title 保留完整名称。
// provider 标签复用原供应商文案，不新建第二套品牌翻译。
// GLM 为既有品牌常量；其他中转和 Euzhi 使用已有菜单标签。
// 只复制译文，时间、模型和原文不会混入剪贴板。
// 复制成功才提示成功，浏览器拒绝剪贴板时明确告知失败。
// details 的 open 仅是本实例状态；新结果加入不会强制关闭用户正在看的旧项。
// 时间和模型都属于记录快照，删除预设或切站也不从当前设置反查旧值。
// datetime 使用标准时间，屏幕文字使用本地时间，两者描述同一个时刻。
// 展开区域用两张文字面板，差别只有标题与内容，通过数据循环复用结构。
// 原文/结果的 i18n key 固定在配置元组中，双语检查可以识别真实使用处。
// 不使用 dangerouslySetInnerHTML，即使返回内容含标签也只显示文字。
// 图库预览等业务不参与此视图，不额外解析任何模型文件或图片。
// 摘要 snippet 是译文预览，用户按 Enter 或 Space 可展开查看完整内容。
// 复制按钮位于展开内容中，不嵌套在 summary 里，避免点击复制同时切换展开。
// 正文最大高度限制局部阅读滚动，弹窗主体仍负责在记录之间滚动。
function TranslationRecord({ record, initiallyOpen }: { record: PromptTranslationRecord; initiallyOpen: boolean }) {
  // 阅读顺序的例子：先完成 A、后完成 B，首次打开 B 展开、A 折叠。
  // 用户展开 A 后切成最早在前，A 移到第一位，但仍是同一张展开的收据。
  // 这要求 key 使用 id，不能使用 map 下标，否则展开状态会跟着位置走。
  // 同一天的两个模型结果也分别有时间标签，摘要不是仅按日期分组的合并条目。
  // 日期采用 locale 的格式，例如中文与英文显示不同顺序，不写死“年/月/日”。
  // toISOString 只给语义属性使用，不作为用户看到的 UTC 时间文本。
  // 因为校验已排除超出 Date 范围的值，这里的日期转换不接收任意未知输入。
  // 若电脑时区改变，展示会按当前设备时区重算，保存的毫秒时刻不变。
  // 不用 setInterval 每秒刷新历史时间，记录不是计时器或播放进度。
  // 自定义预设名字可以是中文，语言切换不翻译用户自己起的名字。
  // 服务商显示名可以翻译，模型 ID 仍原样保留，便于核对实际使用了哪一个模型。
  // 标题栏模型过长只做省略，完整值放在 title，不把模型 ID 截短后持久化。
  // 摘要译文也只做视觉省略，展开后仍可逐字复制完整结果。
  // 文本中的反引号、标签和 Markdown 都保持字面含义，不套用 Agent 富文本渲染器。
  // 这样权重符号不会被当成 Markdown 标记吞掉，适合直接复制到提示词。
  // 正文使用普通 p 而非 textarea，查看时不会误编辑历史或弹出输入法。
  // before/after 是两块独立滚动区，特别长的原文不会把译文推到弹窗最下面。
  // 在窄列里 sm:grid-cols-2 失效后上下排列，两份内容都保留，不隐藏原文。
  // overflow-wrap:anywhere 兜底无空格长标签，避免 break-words 的固有宽度撑开网格。
  // 段落的 min-width 边界由外层 section 与 grid 共同约束，不能只在最内层截断。
  // 复制不会 trim，用户需要的逗号、权重和末尾换行都以真实响应为准。
  // 剪贴板函数内部负责捕捉浏览器拒绝，因此这里只按布尔结果选择提示。
  // 一次复制没有持久化副作用，也不会把被查看记录重新变成“最新完成”。
  // 不提供“再次翻译”按钮，历史查看与产生新请求的收费行为分开。
  // 点击 summary 的空白处也可以展开，抓取文本不需要精准命中小箭头。
  // 焦点环使用项目强调色，操作系统高对比设置下仍能识别当前键盘目标。
  // 折叠时正文仍由浏览器 details 管理隐藏，不能靠透明度留下可点的复制按钮。
  // 用户只打开历史看一眼再返回，当前翻译输入和原 undo before 都不会被此组件访问。
  // 返回的 JSX 没有新增全局样式选择器，不影响图库卡片或 GIF 工具标题布局。
  // 记录组件不订阅偏好，父列表把明确的 record 参数传入，数据边界容易核对。
  // 原生 toggle 通知只同步本条 open 状态，不向其他记录广播收起事件。
  // 多条记录允许同时打开，用户能够对照两次模型响应，而非强制单项手风琴。
  const { t, locale } = useTranslation();
  const [open, setOpen] = useState(initiallyOpen);
  const provider = record.provider === "glm" ? "GLM" : t(record.provider === "euzhi" ? "agent.providers.euzhi" : "create.promptAssistant.customProvider");
  const copy = async () => useToastStore.getState().show(t(await copyText(record.after) ? "create.promptAssistant.copied" : "create.promptAssistant.history.copyFailed"));
  return <details data-translation-record={record.id} data-translation-time={record.createdAt} open={open} onToggle={event => setOpen(event.currentTarget.open)} className="min-w-0 rounded-xl border border-border bg-background">
    <summary className="cursor-pointer rounded-xl p-3 text-sm outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-accent-stroke">
      <time dateTime={new Date(record.createdAt).toISOString()}>{new Date(record.createdAt).toLocaleString(locale)}</time>
      <span title={`${provider} · ${record.model}`} className="mt-1 block truncate text-xs text-muted-foreground">{provider} · {record.model}</span>
      <span title={record.presetName} className="mt-1 block truncate text-xs text-muted-foreground">{record.presetName}</span>
      <span className="mt-1 block truncate">{record.after}</span>
    </summary>
    {/* 对照区：原文和译文共用标题、滚动和换行规则，不创建第二套文本卡片。 */}
    <div className="grid min-w-0 gap-3 border-t border-border p-3 sm:grid-cols-2">{([["create.promptAssistant.history.original", record.before], ["create.promptAssistant.history.translated", record.after]] as const).map(([label, content]) => <section key={label} className="min-w-0"><h3 className="mb-2 text-xs font-medium text-muted-foreground">{t(label)}</h3><p className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 text-sm [overflow-wrap:anywhere]">{content}</p></section>)}</div>
    <div className="flex justify-end px-3 pb-3"><button data-translation-copy type="button" onClick={() => void copy()} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-accent-stroke">{t("create.promptAssistant.history.copy")}</button></div>
  </details>;
}
