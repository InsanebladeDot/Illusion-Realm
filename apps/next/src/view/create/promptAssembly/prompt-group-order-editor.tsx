"use client";

/** 分组排序编辑态：沿用公共拖拽容器，只把确认后的身份队列交回业务 store。 */
// 像先在便签上安排座位，点“完成”才交给店员；取消直接扔掉便签。
// 草稿只保存 id，原文与快捷词继续属于外层 store，不复制第二套提示词。
// 图片页和蒙版页传入各自的 tabs 与确认回调，组件不识别生成模式。
// 复用 SortableList 的四像素启动阈值、键盘传感器和归位动画。
// 这里只换成纵向列表，让顺序编号从上到下与最终合并顺序一致。
// 操作栏位于列表滚动区之外，长列表也不把取消和完成卷走。
// 每行使用同一个数据结构，不为角色、画师、背景或自定义分组分别写 JSX。
// 关闭组件会丢弃尚未确认的队列，不在 cleanup 中自动保存。
// 保留最新 tabs 引用，排序期间后台翻译成功后显示最新数量，完成不回写旧正文。
// disabled 同时传给拖拽容器、行手柄与完成按钮，生成过程中不允许提交旧事件。
// 取消没有写入副作用；本组件本身未发起异步请求，因此没有假加载或成功提示。
// 选中色跟随当前活动分组，只表达原编辑目标，不因拖动另一组就切换输入。
// 草稿更新只发生在有效拖动结束时，按 Escape 撤销本次拖动不改已有草稿。
// “取消”丢弃整个排序会话，和拖动时的 Escape 取消单次动作是两个层次。
// 计数来自非空逗号或换行片段，不按英文单词切分，避免多词标签被拆散。
import { useMemo, useState } from "react";
import { ArrowDownUp, GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SortableList } from "@/components/sortable-list";
import { useTranslation } from "@/i18n";
import { orderPromptTabs, reorderPromptTab } from "@/utils/promptTabs";
import { cn } from "@/utils/cn";
import type { PromptTab } from "@/types/promptTabs";

interface PromptGroupOrderEditorProps {
  // 传入最新业务数组，组件不把进入时的正文作为之后提交的数据。
  // 完成只处理结构排列，文本本身允许由原翻译或其他来源更新。
  tabs: PromptTab[];
  // 原编辑目标仅用于浅色强调，不会被一次抓取动作改写。
  // 相同名称的两组仍以这个稳定身份区别，不能按 label 查找。
  activeId: string;
  // 锁约束组件交互，真正数据写入由调用方的业务动作再次控制。
  // 取消属于放弃便签，不需要解除任务锁才能在组件内部丢弃临时状态。
  disabled: boolean;
  // 取消不携带一个“原 tabs 快照”回滚，避免覆盖期间收到的内容更新。
  // 父层结束模式即可，已确认的原顺序没有发生过变化。
  onCancel: () => void;
  // 只提供号码牌数组，存储范围由父层决定，不对图片或蒙版做类型猜测。
  // 未知或重复 id 在公共纯函数中处理，回调不接收可修改正文的对象引用。
  onConfirm: (ids: string[]) => void;
}

/** 只维护临时号码牌，完整分组始终从最新 props 按号码牌重新对应。 */
// 首次打开从已确认的实际顺序初始化，不偷偷按默认分组顺序重置。
// 同名分组也有不同 id，拖动、编号和确认都不使用显示名作身份。
// useMemo 只避免反复排序，不承担持久化，取消后不会留下新队列。
// 先按最新成员合并再移动，所以外部删除的分组不会被旧草稿重新插回。
// 外部新增分组自动接到队尾，它同样能在本轮继续拖动和确认。
// onConfirm 接收新数组，调用方只提交顺序，不获取当前正文的陈旧副本。
// 模式栏操作使用原生 button，键盘 Tab 可以到达且有可见焦点。
// 不把确认区做成第二个弹窗，保持参考图中的原面板原位切换。
// 长说明允许折行，右侧按钮保持固定命中宽度，不被文字挤成图标。
// 业务任务突然锁定时仍显示草稿，避免用户以为系统已经确认并返回。
// 列表只有一个滚动所有者，不在每一行里另设纵向滚动条。
// 整个组件没有全局事件，离开面板就由 React 与 dnd-kit 释放当前传感器。
export function PromptGroupOrderEditor({ tabs, activeId, disabled, onCancel, onConfirm }: PromptGroupOrderEditorProps) {
  // 两个数组的关系：ids 是本轮便签，ordered 是用便签安排最新到场的分组。
  // 新增组不在便签上时接到末尾，外层不必为了同步一次新增而重置全部拖拽草稿。
  // 已删除组从 ordered 消失，不能只因 ids 里还有旧名字就显示幽灵行。
  // setIds 只发生在放手之后；正在拖动时的视觉 transform 由库维护。
  // 如果在同一项上放手，SortableList 会拦截无效移动，不建立无变化的新顺序。
  // 原 UI 提交模式是即时排序，本模式刻意把真实 store 更新推迟到 Done。
  // 因而外部的合并预览在草稿期间不变，用户能可靠取消而无须逆向重排。
  // 这里不调用 assemblePrompt 算第二份生成参数，顺序含义由原业务合并函数维护。
  // 活动行强调不影响计数，无内容但正在编辑的分组仍可成为强调行。
  // 填写项数只用于帮助识别分组，不能作为不准移动空分组的理由。
  // 用户可以先排好空结构，再回到普通态填写内容，这是合法操作流程。
  // 最多分组数量由原业务添加规则限制，组件不额外创建或合并分组。
  // 进入时的焦点放在取消，用户按 Enter 不会意外立即提交尚未查看的排序。
  // 完成和取消都是原生按钮，屏幕阅读器无需猜测图标到底是保存还是展开。
  // 右侧按钮保持 shrink-0，说明文字必要时换行而不是缩小交互区域。
  // 深色主题中的模式栏背景使用 accent 的透明叠加，不额外套白底卡片。
  // 列表主体 flex-1 且 min-h-0，是为了让内容过多时滚动而不是挤掉模式栏。
  // 同一外壳在 side 和 inline 都继承父高度，不用固定屏幕高度模拟填满。
  // 列表卡片间距统一，拖动时各行高度稳定，编号与名字不会因折行上下跳动。
  // 数据层没有保存“当前正在拖哪个”，组件卸载不会留下全局拖拽锁。
  // 一个蒙版实例的临时便签不能被另一个图片实例读到，useState 属于各自挂载实例。
  // 编辑期间点击页头返回图库会卸载本组件，等价于放弃尚未提交的排列。
  // 组件没有清理函数自动调用 onConfirm，避免卸载被错误解释成完成。
  // 同样，切换语言只改变文字，不会触发 setIds 或改变任何分组位置。
  // 数量在每次最新 tab.content 变化时重新计算，不能用进入排序时的旧数字。
  // 面板没有成功 toast，是否回到按新队列排列的浏览态本身就是确认操作结果。
  // 若任务开始令 disabled 生效，抓取点立即禁用，Done 也不能接受旧手势的结果。
  // SortableList 的 onMove 还会再次检查锁，不能只依赖按钮的灰色外观。
  // 取消保留可见入口，但父 fieldset 仍可能按业务锁统一约束整个参数区。
  // 这里不绕过外层锁给蒙版增加生成中的写入特权。
  const { t } = useTranslation();
  const [ids, setIds] = useState(() => tabs.map(tab => tab.id));
  const ordered = useMemo(() => orderPromptTabs(tabs, ids), [tabs, ids]);
  const move = (source: string, target: string) => {
    if (!disabled) setIds(reorderPromptTab(ordered, source, target).map(tab => tab.id));
  };
  // section 继承原提示词面板剩余高度，不能按窗口总高压住 AppShell 状态栏。
  // 标题图标只作视觉提示，读屏名称由 h3 和两个文字按钮提供。
  // 排序列表不是选项菜单，没有把每一行误标为会切换当前分类的 menuitem。
  // 描述区 min-w-0 允许缩到按钮左侧，长语言文案优先换行。
  // 行项目数不与顶部“已填组数”混用：一个统计片段，一个统计非空分组。
  // 不在每次拖动后强制滚动到顶部，键盘位置由公共拖拽库的坐标策略管理。
  // 完成事件生成新的 id 数组，不让父层意外修改当前 useState 的草稿引用。
  // 数组为空时保留取消入口，让异常空数据仍有退出路径。
  // 列表边框与外壳分隔线分工不同，外壳不随着被拖行的 transform 一起移动。
  // 数量没有挂点击事件，避免用户误以为能从排序模式进入正文编辑。
  // 切换模式保留同一外层页头，所以返回图库仍是原宿主的关闭语义。
  // 没有复制模板、标签库或翻译工具，它们继续留在普通编辑区域维护。
  return <section data-prompt-order-editor className="flex min-h-0 flex-1 flex-col">
    {/* side：排序模式栏固定，内容列表独立滚动；完成和取消不随卡片滚走。 */}
    <div className="flex shrink-0 items-center gap-2 border-b border-border bg-accent/50 px-3 py-3">
      <ArrowDownUp className="h-4 w-4 shrink-0 text-accent-text" aria-hidden="true" />
      <div className="min-w-0 flex-1"><h3 className="text-xs font-semibold">{t("promptAssembly.sort.title")}</h3><p className="mt-0.5 text-[10px] text-muted-foreground">{t("promptAssembly.sort.hint")}</p></div>
      <button autoFocus type="button" data-prompt-sort-cancel onClick={onCancel} className="h-7 shrink-0 rounded-md border border-border bg-background px-2 text-[11px] hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-stroke">{t("common.cancel")}</button>
      <button type="button" data-prompt-sort-done disabled={disabled || ordered.length === 0} onClick={() => onConfirm(ordered.map(tab => tab.id))} className="h-7 shrink-0 rounded-md bg-accent-fill px-2 text-[11px] text-accent-fill-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-stroke disabled:opacity-40">{t("promptAssembly.sort.done")}</button>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-width:thin]">
      <SortableList ids={ordered.map(tab => tab.id)} layout="vertical" disabled={disabled} onMove={move}>
        <div data-prompt-sort-list className="space-y-2">{ordered.map((tab, index) => <PromptOrderRow key={tab.id} tab={tab} index={index} active={tab.id === activeId} disabled={disabled} />)}</div>
      </SortableList>
    </div>
  </section>;
}

/** 一行完整分组只展示手柄、序号、名称和内容数，点击名称不切换编辑目标。 */
// 编号随草稿顺序即时变化，前导零只为视觉对齐，不作为身份或保存格式。
// 计数允许中文逗号和换行，两种都作为用户输入的分隔，空行不计一项。
// 含空格的英文短语视作一个标签片段，不按词数放大统计。
// 权重括号内若有逗号也会产生片段，所以这里展示的是输入项数，不宣称是模型 token 数。
// 未填写使用明确文案，不显示零个标签却仍画成有内容的紫点。
// useSortable 的 id 与父容器 ids 相同，不使用显示的两位编号参与碰撞。
// setNodeRef 包住整行，目标矩形包含文字和数量，手柄只决定何时开始抓取。
// 手柄和名称不是嵌套按钮，保留浏览器语义与库的键盘激活规则。
// touch-none 仅限制手柄区域，用户可在行文字或行间正常滚动长列表。
// disabled 同时禁止传感器注册与原生按钮，属性变化不依赖下一次拖动才生效。
// focus-visible 与 focus-within 分别标记抓取点和所在行，适合键盘移动时定位。
// isDragging 的阴影与层级是暂态，不代表本轮已经保存成功。
// CSS.Transform 和 transition 继续使用原库提供的归位行为，没有第二套动画计时器。
// 选中边框使用现有主题 token 的浅色，不新增固定紫色色板影响深色模式。
// 长分组名在行内省略，title 和手柄读屏标签仍保留完整名字。
// 数量区域 shrink-0，长名称不能把“未填写”挤出卡片边界。
function PromptOrderRow({ tab, index, active, disabled }: { tab: PromptTab; index: number; active: boolean; disabled: boolean }) {
  // 名称和序号同属一行，数量靠右，避免多行分组名导致手柄纵向对不齐。
  // 原始名称仍用于 title 和 aria-label，truncate 只控制屏幕上的可用宽度。
  // 统计示例：“best quality, high detail”是两项，“long blonde hair”是一项。
  // 只有空格和连续换行的正文返回零项，不会画一个虚假的已填标记。
  // 计数不是内容解析器，不能借这个数字修改用户权重或从正文删去空格。
  // Row 只接收输入参数，没有对 store 的 import，拖拽不能绕开父级确认边界。
  // 手柄 listeners 来自同一个 useSortable 实例，键盘提起和指针提起使用同一身份。
  // 不给整行加 onClick，用户选择文本或点数量不会意外切换原编辑目标。
  // 视觉占位由整行 ref 计算，不能只把很窄的手柄作为排序矩形。
  // 动画样式不落盘，只是让相邻行给拖动项腾出位置的暂时呈现。
  // 目标不存在时公共容器不会回调 move，不能把松手到空白默认当作移到队尾。
  // Escape 由公共传感器撤销本次拖动，之前已经排过的草稿仍会留在本轮列表中。
  // 颜色只表达活动分组与键盘焦点，没有用强光圈模拟“已永久选中”。
  const { t } = useTranslation();
  const count = tab.content.split(/[,，\n]+/).filter(part => part.trim()).length;
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: tab.id, disabled });
  return <div ref={setNodeRef} data-prompt-sort-row={tab.id} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("relative flex min-w-0 items-center gap-2 rounded-md border border-border bg-background px-2 py-2 focus-within:border-accent-stroke/50", active && "border-accent-stroke/40 bg-accent/30", isDragging && "z-10 shadow-md")}>
    <button ref={setActivatorNodeRef} type="button" {...attributes} {...listeners} disabled={disabled} data-prompt-drag-handle={tab.id} aria-label={t("promptAssembly.sort.drag", { label: tab.label })} title={t("promptAssembly.sort.drag", { label: tab.label })} className="flex h-7 w-5 shrink-0 touch-none cursor-grab items-center justify-center rounded text-muted-foreground active:cursor-grabbing focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-stroke disabled:opacity-40"><GripVertical className="h-3 w-3" aria-hidden="true" /></button>
    <span className="text-[10px] tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
    <span title={tab.label} className="min-w-0 flex-1 truncate text-xs font-medium">{tab.label}{count > 0 && <span aria-hidden="true" className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-accent-fill/70" />}</span>
    <span className="shrink-0 text-[10px] text-muted-foreground">{count ? t("promptAssembly.sort.items", { count }) : t("promptAssembly.sort.empty")}</span>
  </div>;
}
