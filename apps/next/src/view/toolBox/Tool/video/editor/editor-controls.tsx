"use client";

// 编辑器的最小控件契约：展示由参数决定，项目保存和媒体处理仍归业务侧。
// 样例与正式宿主引用相同实现，不为状态展示复制另一套按钮和输入框。
// 这些控件不依赖 Electron、FFmpeg 或全局工程 store。
// 拆分依据是重复使用和独立交互，不为每个图标再建无意义包装。
import { useNumberScrub } from "./use-number-scrub";
import { useId, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
// 沿用应用已有 Lucide 图标，类型约束防止任意 HTML 进入按钮内容。
// Spinner 仅表达调用方实际传入的 busy，不用定时器模拟任务完成。
import { ChevronDown, ImageOff, LoaderCircle, type LucideIcon } from "lucide-react";
// 抽屉已处理 ResizeObserver 清理与 inert，收起内容不能继续接受 Tab。
// 本模块只提供标题与开关，不复制公共抽屉的高度测量逻辑。
import { CollapsiblePanel } from "@/components/CollapsiblePanel";
import { useTranslation } from "@/i18n";
import styles from "./editor.module.css";

// 没有回调时默认禁用，遗漏参数不能得到能点击却什么都不做的按钮。
// disabledReason 针对实际操作注入，busy 同样阻止重复触发。
// pressed 为可选开关语义，普通动作不虚构按下状态。
// compact 仅影响可见标签，完整 label 始终用于无障碍名称。
// title 在外层提供禁用原因，原生 disabled 元素本身不承担提示交互。
// 数据标记供回归区分业务未接通和真实可用的纯 UI 动作。
// 回调只通知意图，不在公共控件中根据 label 猜测执行哪项业务。
// onClick 没有异步职责，业务调用者负责捕获错误及恢复 busy。
interface EditorActionProps {
  // 单字符符号用于轨道S这类约定，完整动作名仍由label提供给读屏与悬停提示。
  // 不把可见符号写成业务回调名，按钮权限仍仅取决于是否提供onClick。
  glyph?: string;
  icon?: LucideIcon; label: string; compact?: boolean; accent?: boolean;
  // plain用于密集工具条的裸图标；默认外观仍服务项目栏、弹窗与原样板。
  // 这是展示尺寸与边框差异，不改变点击权限、禁用说明或业务回调。
  appearance?: "outlined" | "plain";
  onClick?: () => void; disabledReason?: string; busy?: boolean; pressed?: boolean;
  // 临时面板把焦点还给真实入口按钮，不能靠查询第一个同名标签猜返回位置。
  // expanded/controls只表达展开关系，不改变普通动作的pressed或禁用规则。
  buttonRef?: Ref<HTMLButtonElement>; expanded?: boolean; controls?: string;
}
// 交互契约：调用方传 onClick 才开放操作，不能用 accent 推断是否可用。
// 不开放任意 HTML 的 class 槽，避免各面板再次复制尺寸和主题规范。
// label 必填，因此 compact 隐藏文字后仍有读屏名称。
// icon 缺省是合法文字按钮，busy 时仍可显示统一的等待图形。
// accent 表示主要操作层级，与按钮是否执行真实业务没有关系。
// pressed 不传时是一次性动作；传 false 才表示一个未开启的开关。
// 原生 disabled 会同时阻止鼠标和键盘激活，不能只依赖事件内判断。
// 外层提示包含动作名称，多个不可用图标不会只显示同一句无上下文说明。
// 每个不可用按钮关联自己的说明，专属原因不能被宿主的通用提示替代。
// 调用方若有专属禁用原因，以该原因替代默认的尚未接通说明。
// busy 不代表任务成功，也不会在本组件内自动清零。
// 业务接入时必须由请求拥有者控制 busy 和失败反馈。
// 公共按钮不读取全局权限，避免样板的可用动作改变真实工具权限。
// 没有使用 href 冒充按钮；导航继续交给 Next Link。
// 事件类型仅表达点击意图，不把 DOM 节点或原生事件泄露到业务状态。
// 项目栏、预览、属性和时间轴沿用同一按钮类与语义。
// 无回调的旧调用方自动保留原禁用边界，UI-02 不接通剪辑或导出。
// busy 时 spinner 替代图标，按钮尺寸不因标签或状态改变而抖动。
// useId 生成实例说明 ID，两个样板中的按钮不会引用对方的原因。
// busy 优先说明正在等待，无执行回调才说明业务尚未接通。
// 外层 title 与隐藏说明共用 reason，鼠标提示和读屏信息保持一致。
// 隐藏说明放在按钮之外，不改变图标按钮尺寸或禁用命中边界。
// 原生 disabled 仍负责阻止激活，说明节点不增加可点击的假操作。
// focus-visible 样式集中在 CSS Module，各区不再覆盖内部 DOM。
// 公共动作按钮仍由label/icon/compact/accent表达稳定展示差异，不引入video专属开关。
// 悬停视觉统一为细线淡底，但onClick仍由各自业务注入，不能合并生成、导入和删除逻辑。
// 没有onClick时默认给出未接通原因，样板按钮不能显示可执行却没有行为。
// busy既原生disabled也aria-busy，重复点击不会在加载中再次触发动作。
// reason放在title和隐藏说明，禁用时键盘辅助技术仍有原因可读。
// pressed使用aria-pressed而不修改点击回调，开关状态由真实调用方决定。
// expanded/controls服务折叠入口，不能把普通按钮伪装成另一个select体系。
// buttonRef供紧凑面板关闭后返回焦点，样式调整不能删掉这条可达性契约。
// 新hover/focus不改变padding或高度，防止工具栏按钮在鼠标经过时挤动相邻控件。
// 主色按钮依旧保留accent填充，细边框统一不等于取消主次操作层级。
// 危险操作保留自己的语义色，不能把删除或关闭伪装成普通无风险操作。
// 图标设置aria-hidden避免图标名与可访问label重复朗读。
// compact只隐藏可见文字，完整label仍用于aria-label与title。
// 禁用原因不会被当作成功反馈，点击没有执行的按钮不能弹“已完成”。
// 当前窗口多个EditorAction实例不共享点击、busy或pressed状态。
// 一个按钮加载不会让另一工具按钮跟着转圈，组件没有全局动作注册器。
// 样式来自同一editor.module.css，样板和正式工程修改一次即可同步。
// 全站globals补充公共焦点线条，局部按钮仍负责自己的语义背景与布局。
export function EditorAction({ icon: Icon, glyph, label, compact = false, accent = false, appearance = "outlined", onClick, disabledReason, busy = false, pressed, buttonRef, expanded, controls }: EditorActionProps) {
  const { t } = useTranslation(), descriptionId = useId();
  const reason = disabledReason || (busy ? t("toolBox.editorUi.loading") : !onClick ? t("toolBox.editorUi.unavailable") : "");
  return <span title={reason ? `${label} · ${reason}` : label} className={styles.actionHint}><button ref={buttonRef} type="button" disabled={!!reason || busy} data-editor-action aria-busy={busy || undefined} aria-expanded={expanded} aria-controls={controls} aria-pressed={pressed} aria-label={label} aria-describedby={reason ? descriptionId : undefined} onClick={onClick} className={`${styles.action} ${compact ? styles.iconAction : ""} ${accent ? styles.accentAction : ""} ${appearance === "plain" ? styles.plainAction : ""}`}>
    {busy ? <LoaderCircle size={16} className={styles.spinner} aria-hidden="true" /> : Icon && <Icon size={16} aria-hidden="true" />}{glyph}{!compact && label}
  </button>{reason && <span id={descriptionId} className="sr-only">{reason}</span>}</span>;
}

// 同一个反馈外壳服务素材行、预览与组件样板，不把加载误画成缺图。
// error 使用 alert，其他状态使用 status，辅助技术可辨识异步失败。
// 图标与文本一起表达状态，不只用红色或灰色区分。
// message 由调用方翻译，不在公共外壳读取具体文件或请求错误。
// 没有“重试成功”行为，重试应由未来业务注入明确的动作。
// 紧凑外观用于缩略图槽，整面板占位仍保留可读文字。
export function EditorPlaceholder({ state, message, compact = false }: { state: "empty" | "loading" | "error" | "missing"; message: string; compact?: boolean }) {
  return <span data-editor-placeholder={state} role={state === "error" ? "alert" : "status"} className={`${styles.placeholder} ${compact ? styles.compactPlaceholder : ""}`}>
    {state === "loading" ? <LoaderCircle size={18} className={styles.spinner} aria-hidden="true" /> : <ImageOff size={18} aria-hidden="true" />}<span>{message}</span>
  </span>;
}
// 状态划分：empty 表示没有内容，不能让用户误以为正在读取。
// loading 表示等待，保留文字后即使关闭动画也能辨认。
// missing 表示封面缺失，与模型文件或素材本身是否能用不是同一件事。
// error 表示当前内容不可用，alert 允许辅助阅读器及时报告。
// 图标隐藏于无障碍树，避免把 ImageOff 的英文名称重复念给用户。
// 此处没有文件路径参数，状态外壳不能自行访问本地文件。
// 紧凑状态不会另开弹窗，适合在素材行固定缩略图槽内显示。
// 页面级状态仍使用完整间距，不能因为复用缩略图而变成无法阅读的小字。
// 文案由真实调用者解释原因，不把后端堆栈或原始异常直接排进面板。
// 状态变化不产生成功提示，缺失恢复必须由后续真实内容替代占位。

// 分组实例自管展开，不共享一个布尔量使另一分组跟着折叠。
// useId 保证标题和内容关联唯一，两个检查器同时存在也不产生重复 ID。
// 标题与重置是兄弟按钮，不能把可点击动作嵌入另一个按钮。
// 默认展开沿用原稿，收起只隐藏内容，不卸载草稿或重置数值。
// 原生 button 已支持 Enter 和空格，不额外绑定全局快捷键。
// durationMs 为零仍复用既有抽屉的 inert 机制，避免测量动画干扰字段焦点。
// children 只插入分组内部内容，不把整个页面塞进空壳制造假复用。
// 重置由 action 槽传入，展示相同并不代表音频和视频共享写入逻辑。
export function EditorGroup({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  const [open, setOpen] = useState(true), id = useId();
  return <section data-editor-group className={styles.propertySection}><h3><button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className={styles.groupToggle}><ChevronDown size={14} className={open ? "" : styles.closedChevron} aria-hidden="true" />{title}</button>{action}</h3>
    <div id={id}><CollapsiblePanel open={open} durationMs={0} contentClassName={styles.groupContent}>{children}</CollapsiblePanel></div>
  </section>;
}
// 折叠采用保留内容的方式，字段中尚未提交的小数不会因开合丢失。
// 内容仍挂载不等于仍可操作：CollapsiblePanel 的 inert 排除隐藏焦点。
// 标题按钮放在裁切容器外，所以收起后仍可用键盘重新展开。
// aria-controls 指向当前分组的内容节点，而非整张检查器。
// useId 适配预渲染与水合，不用随机数制造服务端和客户端不同的 ID。
// action 可以是重置按钮，父级决定重置的是音频还是视频参数。
// 不传 action 的样板组不预留一颗空按钮，标题不会被推到右侧。
// 组件不实现“全部展开”全局状态，以免两个工作区被同一布尔值控制。
// flow-root 让首行外边距参与内容测量，避免展开高度少算数个像素。
// durationMs 为零保留折叠语义，未来恢复动画也无需改字段生命周期。
// 用户多次切换只更新本组状态，不创建监听器或计时器。
// 分组没有用户数据持久化，离开样板后恢复默认展开是预期行为。

// 数值字段区分已提交值与当前草稿，像先写便签再确认，不逐字强制纠正。
// onCommit 只在有效值且 Enter/失焦时触发；Escape 还原调用方最近的值。
// 字符串草稿允许空、负号和小数点，避免输入第一位就被限制卡住。
// 范围与精度均由调用方提供，音量和时长不会共用错误的单位规则。
// 无回调是未接通的只读业务字段，仍以 disabled 告知用户边界。
// 非法值保留并显示错误，不静默夹到范围内，也不发送 NaN。
// 外部 value 改变时通过 key/value 归属换新草稿，避免旧对象的值污染新对象。
// 不订阅全局键盘，输入数字不会触发时间轴删除或播放。
// 数值字段的横排与上下排只是展示差异，共用同一草稿、校验和提交生命周期。
// 属性区默认横排；播放器紧凑空间明确选择上下排，不能让固定84px标签把输入压成零宽。
// 不让调用方穿透内部span改样式，布局参数由公共控件自己实现。
// 字段标签仍可见且关联原input，缩紧不等于删除可访问名称。
interface FloatFieldProps {
  layout?: "inline" | "stacked";
  label: string; value: number; unit?: string; min?: number; max?: number;
  precision?: number; onCommit?: (value: number) => void;
  // mixed 表示选中的对象没有统一值，空白占位不能被当成零提交。
  // disabledReason 由业务说明效果尚未接通，公共字段不猜测 FFmpeg 能力。
  mixed?: boolean; disabledReason?: string;
  // 默认保留视频工具的原焦点样式，漫画属性可明确选择淡细边线。
  // 这是展示强度参数，不改变草稿、校验、提交或键盘行为。
  // 由公共控件持有样式，调用方不跨越DOM结构覆盖内部选择器。
  focusTone?: "subtle";
  // 未传时沿用直接输入；doubleClick要求显式解锁，适合防止误改的属性。
  // 提示由调用方按语言传入，公共控件不认识漫画、视频等业务名称。
  // readOnly允许聚焦和复制，与没有业务回调时的disabled不同。
  // 这一策略只管理进入输入的方式，不改变数值范围或提交回调契约。
  scrub?: boolean;
  editActivation?: "doubleClick"; activationHint?: string;
}
// value 是数值事实，text 是编辑过程；两者不能每个字符都强制同步。
// 用户暂时清空框、输入负号或小数点时，这些草稿并不等于提交 NaN。
// min/max 只参与确认校验，不能让输入 12 的第一位 1 被立即改成最小值。
// precision 控制提交后的显示精度，非整数秒不会被无意转成整数。
// Number 与 isFinite 配合拒绝 Infinity，避免无穷值进入布局或项目参数。
// 空白先单独拒绝，因为 JavaScript 的 Number 空字符串会得到零。
// 错误留在当前字段下，多个输入错误不能挤到一个不知来源的全局 toast。
// 错误文本与 input 使用同一个实例 id，读屏可以正确关联。
// Escape 不提交刚才的草稿，而是读调用方最近一次确认的 value。
// Enter 保持焦点，用户无需为了确认一个数值跳到下一处。
// blur 复用同一验证函数，鼠标离开不会走一套不同的取整逻辑。
// source 保存草稿对应的原值，外部值变化时不继续显示旧对象的文本。
// onCommit 未接入时禁用整个输入，不允许编辑后给人已经生效的错觉。
// 单位独立显示而不写入 text，Number 不需要处理 s 或百分号后缀。
// inputMode 提示数字键盘但不是校验，桌面粘贴内容仍经过同一确认逻辑。
// 混合值用独立标记表达；这里不处理工程撤销历史或目标集合写入。
// 错误状态归单个字段，不通过 Context 或全局变量污染其他实例。
// 新的 value 在父层确认后回流，字段只通过回调通知意图，不写工程文件。
// aria-invalid 与字段级错误关联，不能只画红边表达失败。
// label 内的单位单独展示，用户不需要在数值文本中删除百分号。
// 每个实例独立保存草稿，两个淡入淡出字段互不写入。
// 没有真实工程提交或保存结果，演示回调只更新所在样例实例。
// 拖值能力以scrub参数启用，已有调用方不传时继续使用原文字输入方式。
// focusTone默认改为subtle，原视频与漫画调用同一数值框，不需要复制样式。
// 内部input不再单独加焦点圈，外侧含单位的fieldInput负责唯一细边框。
// 单位仍作为small显示，不把px或百分号写进输入字符串导致Number解析失败。
// 候选显示覆盖当前text，但原字符串草稿仍由draft单独保存。
// 拖动中失焦不提交旧text，避免指针刚移出框就把之前的字符串抢先写回。
// 松手由拖动Hook通知原onCommit，非法值与锁权限仍由既有业务模型兜底。
// 普通Enter和blur继续执行原commit，不因新增指针事件改变文本提交约定。
// Escape对于活跃手势由Hook接住，普通文本草稿则由原reset恢复。
// 双击激活仍交给editActivation，漫画的只读数字框不会突然变成单击编辑。
// 没有onCommit的字段原生disabled，scrub不能为未接通的速度或淡入淡出造效果。
// 混合值默认没有单一起点，enabled排除mixed防止拖动从一个误导值开始。
// 父值更新后的清理让旧候选失效，切换片段不把A的鼠标终点写到B。
// 输入的aria-invalid仍反映原校验错误，拖动候选不隐藏真实就地错误。
// 多个字段各自调用Hook，拖X不应改变Y的输入草稿或错误标记。
// 候选显示使用toFixed统一精度，位置960仍显示960.00，单位由右侧独立槽呈现。
// 候选null表示没有拖动预览，不用0作空值，否则透明度零会被错误当作未输入。
// options.value由确认源传入，text可能是用户尚未完成的负号，不能拿text作为拖动起点。
// 开始拖动时使用确认值是为了避免Number('-')之类非法草稿污染工程。
// 若用户希望提交尚未完成文本，仍需按Enter或失焦完成原字段规则。
// 拖动期间blur跳过commit只保护当前手势，平时正常blur仍必须提交合法文字。
// 普通readOnly双击激活不等于disabled，键盘F2能力仍由原keyDown保留。
// scrub在本次正式检查器开启，漫画调用方没有因此强制变成拖值输入。
// 输入value始终由React控制，不能靠修改元素property伪装业务已更新。
// 错误提示id与aria-describedby继续由useId生成，每个实例的错误描述不会串用。
// 精度舍入后范围还要复核，是因为四舍五入可能把临界输入推到边界之外。
// 拖动Hook只负责可视候选，onCommit异常和业务结果仍归调用方处理。
export function EditorFloatField({ layout = "inline", label, value, unit = "", min = -Infinity, max = Infinity, precision = 1, onCommit, scrub = false, focusTone = "subtle", editActivation, activationHint, mixed = false, disabledReason }: FloatFieldProps) {
  const { t } = useTranslation(), id = useId();
  // 同一个数字和“多选混合”是不同的显示来源，不能仅比较代表值。
  // 例如第一个对象为100、另一个为50，代表值100不能让输入框假装已统一。
  // dirty 区分尚未输入与主动清空；离开未改动的混合框不会制造错误或零值。
  const source = mixed ? null : value, formatted = mixed ? "" : value.toFixed(precision);
  // draft.source使用null标识混合，不将NaN放进状态比较，因为NaN永远不等于自身。
  // 数值来源改成混合时，旧单选草稿不再显示，避免把原来100当成多选统一值。
  // 混合代表值改变而仍为混合时，目标集合key负责换新字段生命周期。
  // dirty必须来自真实onChange，而不是从text非空推导，主动清空也是一次输入。
  // 未输入的混合框失焦无动作，主动清空的混合框则应报告非法空白。
  // 这两种情况如果只看空串会无法区分，进而错误地统一成零或吞掉错误。
  // 单选仍沿用原数值来源比较，不改变漫画doubleClick输入许可策略。
  // focusTone只控制焦点外观，不决定可否提交混合值或绕过onCommit能力限制。
  // disabledReason不写入error，未接效果和用户输入非法是两个不同状态。
  // 输入草稿可以临时超范围，禁止在onChange中根据min把第一位数字改掉。
  // 最终确认还要核对舍入结果，边界小数不能在toFixed后越过max。
  // 多选确认即使等于首项value也回调，因为其他对象可能仍是不同数字。
  // 普通单选同值仍不重复回调，Enter后失焦不会制造两次业务写入。
  // 重置由检查器重建字段，不修改这个公共控件的旧调用契约。
  // 正式页不传onCommit时仍disabled，不能用mixed=true让只读效果获得编辑能力。
  // 错误描述与禁用说明共用实例id但互斥显示，辅助阅读器不会读到两个矛盾原因。
  // title挂在label上，鼠标停在disabled子元素也有说明来源。
  // 回调只传number，不带对象集合，让同一个字段也能继续用于漫画尺寸输入。
  // 片段目标变化的草稿隔离由调用方key表达，公共控件不猜资产或片段业务身份。
  // 因此参数扩展不会让现有漫画字号输入突然出现多选横线。
  const [draft, setDraft] = useState({ source, text: formatted, dirty: false }), [error, setError] = useState(false);
  // 像带锁的调节旋钮，单击可以查看和复制数值，双击才开始改动。
  // 锁只属于这一行，解锁字号不会同时解锁宽度或另一个工具实例。
  // 默认值false并不锁住旧视频页面，因为readOnly还要检查调用方的策略参数。
  // 不把editing写入作品历史，它是输入许可，不是图层的内容变化。
  // 外部值回流照常更新显示，锁定期间画布缩放也能实时回填宽度。
  // 选择其他图层由原有key卸载旧字段，新实例自然恢复锁定。
  const [editing, setEditing] = useState(false);
  const readOnly = editActivation === "doubleClick" && !editing;
  // readOnly由策略和局部许可共同派生，不根据是否获得焦点决定。
  // 否则单击聚焦就会解锁，与明确的双击要求冲突。
  // onDoubleClick不会创建内容历史，只有commit提交不同数字才通知业务回调。
  // 外部撤销、重做或画布手柄更新value时，不在effect中擅自把editing改成true。
  // 不传editActivation的旧调用方始终可以直接输入，即使editing状态仍是false。
  // 选择新图层后字段以原有key重新挂载，前一个对象的许可不会遗留到新对象。
  // 提示由调用方注入，不能因为这是公共控件就把漫画文案显示到视频参数里。
  // 只读输入仍使用原主题和细边框，不靠明显灰掉让用户误以为功能尚未接通。
  // 字号最小值等校验只在确认时执行，解锁输入1仍可继续输入2组成12。
  // 现有草稿source机制继续区分外部值与输入中间态，避免锁定引入第二套数值状态。
  const drag = useNumberScrub({ value, min, max, precision, enabled: scrub && !!onCommit && !mixed, onCommit });
  const text = draft.source === source ? draft.text : formatted;
  function reset() { setDraft({ source, text: formatted, dirty: false }); setError(false); }
  function commit() {
    // 混合值像几张不同的表格叠在一起，没写字就不应替所有表格填零。
    // 真正输入的草稿仍经过同一范围检查，不给多选开一个绕过校验的入口。
    if (mixed && !draft.dirty) return true;
    // min/max 针对最终 number 校验，不会在 onChange 里截断多位草稿。
    // 先判断空白再转值，避免 Number 空字符串为零造成误提交。
    // 精度处理在范围通过后发生，错误草稿仍可用 Escape 放弃。
    const number = Number(text);
    if (!text.trim() || !Number.isFinite(number) || number < min || number > max) { setError(true); return false; }
    // 舍入后的值也要落在范围内，否则 0.26 保留一位会越过 0.26 上限。
    // 先核对最终值，避免输入看似合法却向调用方提交不合法参数。
    // Enter 后再失焦会再次到达这里，同值不重复通知后续工程命令。
    // 草稿格式仍统一补足精度，数值没变也不能保留未格式化的文本。
    // 回调只提交变化；错误保留本地，不能以夹紧数值伪造成功。
    const rounded = Number(number.toFixed(precision));
    if (rounded < min || rounded > max) { setError(true); return false; }
    setError(false); setDraft({ source: rounded, text: rounded.toFixed(precision), dirty: false });
    // 混合状态即使等于首项代表值，也要通知调用方统一其他已选对象。
    if (mixed || rounded !== value) onCommit?.(rounded);
    // 显式返回是否通过，Enter只有校验成功才锁回，错误草稿仍可就地修改。
    // 原调用方可以忽略此返回值，失焦提交和精度处理本身没有改变。
    // 同值确认也算通过，但上面的比较仍防止创建重复内容历史。
    return true;
  }
  // 只读框失焦不能提交，特别是画布宽度刚变化时不应把旧草稿写回。
  // 已解锁失焦沿用原校验；无论通过与否都结束这次输入许可。
  // 非法草稿保留错误说明，下次双击可以继续修正，不悄悄夹值或清空作品。
  // 普通视频字段的readOnly始终false，仍在每次失焦执行原来的提交逻辑。
  // Enter后再失焦因已锁定而跳过，避免新规则下重复触发相同内容命令。
  // 完全没有回调的控件仍disabled，不允许通过双击绕开未接通业务的边界。
  function blur() { if (!readOnly && !drag.active()) commit(); setEditing(false); }
  // 锁定时仅F2开启键盘输入，普通数字、Enter或方向键不应暗中解锁。
  // F2是双击之外的无鼠标入口，提示中明确说明以保持可发现性。
  // Escape恢复最后确认值并锁回，不把取消草稿当作一次作品修改。
  // 已编辑Enter仍先校验；失败保留当前输入和就近错误，成功才锁回。
  // 这里不stopPropagation，已有输入目标保护会阻止Delete误删画布图层。
  // 普通视频字段不检查F2解锁策略，因此维持原Enter与Escape操作。
  // 数值输入采用局部事件，不创建全局双击监听或定时器猜测点击次数。
  // 回车preventDefault保留输入框焦点，锁定并不强迫跳到另一个字段。
  // 锁定只是readOnly，Tab仍能正常经过该字段，用户仍可复制已有数值。
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (readOnly) {
      if (event.key === "F2") { event.preventDefault(); setEditing(true); }
      return;
    }
    if (event.key === "Escape") { event.preventDefault(); reset(); setEditing(false); }
    else if (event.key === "Enter") { event.preventDefault(); if (commit()) setEditing(false); }
  }
  // 禁用字段与禁用按钮一样说明未接通，单位不会被误认为已可编辑的工程参数。
  // title 放在外层 label，鼠标停在原生 disabled 输入上仍有提示来源。
  // 可编辑样板不显示通用禁用原因，非法值仍使用字段专属错误关联。
  // 属性输入：提示和aria-readonly说明锁定状态，淡细焦点样式与编辑许可互不耦合。
  // onChange再次检查许可，避免脚本派发input绕过浏览器原生readOnly。
  // 双击直接激活当前输入，不新造一个浮层或复制第二个数值草稿控件。
  // disabled在事件边界仍由onCommit复核，锁定不代表获得业务执行权限。
  return <label className={`${styles.propertyRow} ${layout === "stacked" ? styles.stackedField : ""}`} data-focus-tone={focusTone} title={!onCommit ? disabledReason || t("toolBox.editorUi.unavailable") : editActivation ? activationHint : undefined}><span>{label}</span><span className={styles.fieldBody}><span className={styles.fieldInput}><input inputMode="decimal" disabled={!onCommit} data-editor-mixed={mixed || undefined} placeholder={mixed ? "—" : undefined} onPointerDown={drag.down} onPointerMove={drag.move} onPointerUp={drag.up} onPointerCancel={drag.cancel} onLostPointerCapture={drag.cancel} data-number-scrub={scrub || undefined} readOnly={readOnly} aria-readonly={readOnly || undefined} value={drag.candidate === null ? text : drag.candidate.toFixed(precision)} aria-invalid={error || undefined} aria-describedby={error || !onCommit ? id : undefined} onDoubleClick={() => { if (onCommit && editActivation) setEditing(true); }} onChange={event => { if (readOnly) return; setDraft({ source, text: event.target.value, dirty: true }); setError(false); }} onBlur={blur} onKeyDown={keyDown} /><small>{unit}</small></span>{error ? <span id={id} role="alert" className={styles.fieldError}>{t("toolBox.editorUi.invalidNumber")}</span> : !onCommit && <span id={id} className="sr-only">{disabledReason || t("toolBox.editorUi.unavailable")}</span>}</span></label>;
}
