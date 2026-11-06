"use client";

// 本地库排序仅组织已有文件索引，菜单复用公共外部关闭与视口避让。
// 日期和大小来自扫描 stat，标记来自本地来源中已经保存的触发词。
// 类比书架排序：先比较书签上的属性，属性相同时用书名和编号定位置。
// 没有书签的书放末尾，不把“未知”当零以制造看似准确的排序。
// 读取标记只访问小型旁车 JSON，绝不启动模型哈希和 Civitai 网络匹配。
// 共享菜单外壳处理 Portal、Escape 和外部点击，本模块只负责两组选择。
import { useRef, useState, type KeyboardEvent } from "react";
import { ArrowDownUp, Check, ChevronDown } from "lucide-react";
import { ContextMenuShell } from "@/components/context-menu-shell";
import { useLocalModelMetadata } from "@/hooks/use-local-model-metadata";
import { useTranslation } from "@/i18n";
import type { LocalLibraryFile } from "@/utils/local-model-tree";

// 字段和方向独立保存，切换大小不能悄悄重置用户刚选择的递减方向。
// 枚举限制了实际支持的属性，不接受任意字符串作为对象动态属性访问。
export type ModelSortField = "name" | "date" | "size" | "mark";
export interface ModelSortOrder { field: ModelSortField; direction: "asc" | "desc" }

// 同一版本既可以从详情读取也可以从排序读取，但数据契约保持一致。
// 排序不维护第二个全局缓存，补全或手动扫描后由 revision 重新读磁盘。
// 当前不选“标记”时传空路径，不为默认名称排序批量打开所有来源文件。
// 标记采用触发词的自然名称顺序，原始提示词内容不会被重排或写回。
// 多个触发词先按名称整理成排序键，避免来源 JSON 中数组顺序影响排序。
// 本地资料损坏或缺失意味着无标记，保留模型卡片而不是过滤该文件。
export function useSortedLocalModels(models: LocalLibraryFile[], order: ModelSortOrder, revision: number) {
  // models 是当前目录与关键词交集，不是 settings 中所有模型。
  // 因此深层目录下按标记排序，不需要打开其他官方分类的来源文件。
  // 原读取 hook 按 200 个路径拆请求，主进程还会限制并行打开数。
  // 扫描不读来源时，首次标记排序有等待期，交给调用方显示读取状态。
  // 这段等待不阻止切换目录；旧请求完成后不能覆盖新范围的标记。
  // 取消和过期响应处理由原 hook 统一负责，不另加全局任务控制器。
  // revision 使用实际扫描时间与补全计数，不使用数组长度当更新信号。
  // 同一数量的来源内容发生变化时，也必须重新读取，而非保留旧标记。
  // 没选标记时传空数组，原 hook 不向主进程发空路径的非法请求。
  // Date 和 Size 都使用内存中的 stat 字段，不需要此 JSON 读取链路。
  // 这保持普通浏览的工作量与文件数相关，避免每次按键读取权重。
  // 当前旁车接口已经做真实路径授权，不能为了排序绕过该边界。
  const metadata = useLocalModelMetadata(order.field === "mark" ? models.map(model => model.id) : [], revision);
  // 标记的键必须是完整版本路径，同名 LoRA 不应借用另一个文件的词。
  // 目录共享 logo 不意味着来源共享，所以不能用 model.filePath 作键。
  // metadata 为空时保持 undefined；空字符串同样没有可排序的标记。
  // trainedWords 已经过主进程规范化，本地损坏数据不会作为脚本执行。
  // slice 后排序只影响显示用的键，原有提示词数组不能被原地修改。
  // 模型生成仍按原顺序使用触发词，这里不会改写用户的提示词。
  // 多标记组成一个可比较字符串，比较的是内容而不是词条数量。
  // 这个字段不代表收藏、NSFW 标签或网上热度，入口提示写明真实来源。
  // 本次没有新增用户标记写入功能，也没有另一份落盘缓存需要迁移。
  // 网络不可用不会影响已保存词条读取；缺失资料不会自动联网补齐。
  const marks = new Map(metadata.entries.map(entry => [entry.filePath, entry.metadata?.trainedWords.slice().sort().join(", ") || undefined]));
  // 每张卡片已被适配成单个版本，数组第一项就是该文件的属性。
  // 不取目录分组大小，目录下可能同时放着几份不同体积的量化权重。
  // name 是含后缀的显示文件名，与详情和卡片上的名称一致。
  // date 对应磁盘修改时间，不借用模型网页发布日期或下载任务时间。
  // 老用户文档可能没有新 stat 字段，读取缺失时自然得到 undefined。
  // undefined 会由比较器统一处理，无需在此处创造一个默认日期。
  // 读取方法没有文件系统副作用，也不会把排序字段送入生成工作流。
  // 目录类型仍来自原扫描分类，排序不重判主模型和 LoRA 的身份。
  function value(model: LocalLibraryFile) {
    if (order.field === "name") return model.name;
    if (order.field === "mark") return marks.get(model.id);
    return order.field === "size" ? model.versions[0]?.bytes : model.versions[0]?.modifiedAt;
  }
  // 比较器只接收两个已有条目，不能在这里请求资料或更新 React 状态。
  // 排序算法会多次比较同一文件，夹带 I/O 会放大为大量重复磁盘读取。
  // 缺失项优先处理，再处理方向，因此递减也保持未知项在末尾。
  // 两边均缺失则按名字和完整路径回退，不能按上次扫描碰巧的顺序排列。
  // 相同名字但不同目录的版本还会比较 id，保证刷新后的稳定顺序。
  // 此回退次序不随递减翻转，避免相同属性项在切换方向时无谓跳位置。
  // 有数值的大小直接相减，不能把 900 MB 和 1 GB 当字符串比较。
  // 零字节是真实可能的文件属性，不用真假判断把它误认成未知。
  // 时间也按毫秒数字比较，避免年月日显示格式或时区影响排序结果。
  // 文本使用中文排序与数字自然比较，模型 2 应排在模型 10 前面。
  // 方向乘数只应用于确实不同的已知值，缺失位置不受它影响。
  // 不比较卡片图像是否已解码，图片加载速度不能改变模型位置。
  // 对未知属性单独比较是有意的，不能先给未知值一个最大数字再反转。
  // 后一种写法会在递减时把缺资料项挪到最前，违背这里的固定缺失规则。
  // 两个不同路径的同名文件都要保留，回退比较绝不是按名称进行去重。
  // 名称回退也不是替用户选择另一个模型，详情仍由文件身份单独控制。
  // comparator 返回零只表示此规则无法区分两项，不应顺便合并卡片。
  // Map 中本轮尚未返回的项暂时按未知处理，读取完后自然重新渲染排列。
  // loading 由调用方明确显示，用户不会将临时名称次序当作已完成的标记结果。
  // 路径和名称比较不执行 Unicode 转码修复，磁盘原文件身份不能被“纠正”。
  // 本层只处理展示排序，Windows 隐藏属性、NTFS 标签等不在当前模型契约中。
  function compare(a: LocalLibraryFile, b: LocalLibraryFile) {
    const av = value(a), bv = value(b);
    if (av === undefined || bv === undefined) return av === bv ? a.name.localeCompare(b.name, "zh-CN") || a.id.localeCompare(b.id) : av === undefined ? 1 : -1;
    const delta = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "zh-CN", { numeric: true });
    return delta ? delta * (order.direction === "asc" ? 1 : -1) : a.name.localeCompare(b.name, "zh-CN") || a.id.localeCompare(b.id);
  }
  // slice 后排序保证不改动上层 filtered 数组，其他消费处不跟着重排。
  // 选择状态使用文件 ID，因此顺序变化不等于退出多选或切换详情。
  // loading 和 failed 分开返回，读取失败不应伪装成仍在匹配模型。
  // 标记读取失败时空 Map 触发名称回退，已显示模型仍然可浏览。
  // 用户可以手动重扫后重新读取，不在后台自动重试大型模型任务。
  // 其他排序字段忽略旁车失败，文件名和 stat 仍是独立可用的数据。
  return { models: models.slice().sort(compare), loading: order.field === "mark" && metadata.loading, failed: order.field === "mark" && metadata.failed };
}

// 上下键在菜单内循环，Home/End 可以直接到第一项或最后一项。
// 键盘事件从 Portal 冒泡，必须从实际目标找到菜单而非查询触发器父盒。
// 只处理菜单导航键，不吞掉普通按键或其他页面的滚动与快捷键。
// 原生 button 继续负责 Enter/Space 激活，不复制一套按键点击模拟。
function navigateMenu(event: KeyboardEvent) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  // React 事件目标可能是图标 SVG 内部节点，所以必须先核对实际 DOM 类型。
  // 非 HTML 目标不做焦点导航，原生按钮点击本身仍然可以正常激活。
  // Portal 的 React 父节点不是菜单的实际 DOM 父节点，不能向上查搜索盒。
  // 最近的 role=menu 才是本次键盘循环的范围，不能跳到其他窗口菜单。
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  // 当前菜单只有六个可用按钮，分隔线和分组标签不参加键盘循环。
  // 选择器限制在当前菜单，不收集背景的移动、删除或应用导航按钮。
  // 原生焦点对象仍是按钮，辅助阅读软件能同步读出 aria-checked。
  // 没有可用按钮时退出，不尝试对空数组取模，避免无效索引。
  const buttons = [...(target.closest('[role="menu"]')?.querySelectorAll<HTMLButtonElement>("button") || [])];
  if (!buttons.length) return;
  event.preventDefault();
  // 环绕取模与书签翻页一样：最后一项向下回第一项，反向同理。
  // 加上总数后再取模，避免 JavaScript 的负余数成为负数组下标。
  // Home 和 End 不走环绕计算，直接定位两端，保持桌面菜单习惯。
  // preventDefault 只在确认菜单可导航后执行，不阻止背景正常滚动。
  // 不改变当前选择值，方向键只是移动焦点，Enter/Space 才确认。
  // 因此键盘浏览选项不会顺便启动排序或触发模型资料读取。
  const current = buttons.indexOf(target as HTMLButtonElement);
  const index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
  buttons[index]?.focus();
}

// 字段和方向是两组 radio，选择任一项都保留另一组的受控值。
// 焦点返回仅用于键盘关闭和确认；外部点击由共享外壳关闭而不抢回焦点。
// 菜单是瞬时局部状态，两个模型库实例不会共用打开位置或选择对象。
// 每次打开读取按钮当前位置，导航开合或窗口缩放不会沿用旧的屏幕坐标。
// 各项选中同时用勾号与 aria-checked 表达，不依赖深浅主题中的颜色差异。
// 菜单分隔符对应真实两组语义，递减不再伪装成另一个“名称”字段。
export function LocalModelSort({ order, onChange }: { order: ModelSortOrder; onChange: (order: ModelSortOrder) => void }) {
  // 触发器 ref 只用于坐标测量和有意恢复焦点，不承担业务状态。
  // 本模块没有持久化偏好，关闭页面后恢复默认名称顺序是现有行为。
  // 字段和方向由父组件控制，菜单卸载不能让已选择规则退回默认。
  // 翻译只在渲染时读取，切换语言不会改变字段的英文枚举身份。
  const { t } = useTranslation(), trigger = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  // close 默认不恢复焦点，鼠标点到别处时不应把输入焦点抢回排序按钮。
  // 点击菜单选项和 Escape 则主动返回触发器，让键盘用户知道现在位置。
  // Tab 先回触发器再交给浏览器默认行为，继续到工具栏下一个可用控件。
  // 共享外壳的外部关闭统一走默认分支，几何变化不强行聚焦旧位置。
  // 设置 null 会卸载菜单，公共外壳随之释放文档监听与窗口监听。
  // 父组件不保留隐藏菜单实例，避免关闭后的菜单仍响应 Escape。
  function close(restore = false) { setPosition(null); if (restore) trigger.current?.focus(); }
  // 坐标采用按钮实际边界，导航开合不需要再加减一个历史宽度常量。
  // 下移五像素给菜单与输入框留缝，最终越界修正由公共外壳实测处理。
  // 没有 ref 时忽略打开，不能用零坐标把菜单画到应用窗口左上角。
  // 这里只读一次布局，不建立另一个全局 resize 或滚动订阅。
  function open() { const rect = trigger.current?.getBoundingClientRect(); if (rect) setPosition({ x: rect.left, y: rect.bottom + 5 }); }
  // Escape 在 React 内先恢复焦点，公共文档监听只负责兜底关闭。
  // Tab 不被 preventDefault，因此不会把用户锁在排序菜单内部。
  // 触发器上的 ArrowDown 在菜单关闭时打开；打开后交给菜单循环。
  // 原生 Enter 和 Space 保留默认按钮行为，不能再人为点击一次。
  function keyDown(event: KeyboardEvent) {
    if (event.key === "Escape" || event.key === "Tab") { close(true); return; }
    navigateMenu(event);
  }
  // 字段顺序与确认图相同，不按翻译后的名称自动字母排序。
  // 排列方向是一组独立选项，所以不将“名称递减”重复列成第五字段。
  // 所有项使用同一受控回调，避免某一项忘记保留另一个组的选择。
  // 界面提示中的“标记”说明只涉及本地词条，不声称查询 Windows 文件标签。
  const fields = ["name", "date", "size", "mark"] as const;
  return <div onKeyDown={keyDown}>
    {/* 搜索工具栏：排序是有两组单选项的菜单，不是原生下拉框。 */}
    {/* 触发器显示当前规则的 title，紧凑文本不挤占搜索内容区域。 */}
    {/* 触发器打开时拦截自己的 pointerdown，防止外部关闭后 click 又重新打开。 */}
    {/* 拦截范围只限此按钮，不能阻止菜单外真实点击关闭。 */}
    {/* 图标随文字同行且保留完整命中区域，不要求点中很小的箭头。 */}
    {/* 标题反映两个真实状态，菜单收起后仍可悬停核对当前规则。 */}
    <button ref={trigger} type="button" data-local-sort-trigger aria-haspopup="menu" aria-expanded={!!position} title={t(`toolBox.civitai.localSort.${order.field}`) + " · " + t(`toolBox.civitai.localSort.${order.direction}`)} onPointerDown={event => { if (position) event.stopPropagation(); }} onKeyDown={event => { if (event.key === "ArrowDown" && !position) { event.preventDefault(); open(); } }} onClick={() => position ? close() : open()} className="flex h-8 items-center gap-1.5 border-l border-border px-3 text-xs text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary"><ArrowDownUp size={14} /><span>{t("toolBox.civitai.localSort.title")}</span><ChevronDown size={12} /></button>
    {/* 菜单外壳沿用共享主题、层级与视口避让，避免复制固定定位逻辑。 */}
    {/* 它挂到 body，搜索组的边框和裁切不会截断菜单。 */}
    {/* 没有声明 aria-modal，排序不是必须先关闭才能离开的业务对话框。 */}
    {/* 共享外壳挂载后聚焦第一按钮，方向键循环因此有确定起点。 */}
    {position && <ContextMenuShell {...position} label={t("toolBox.civitai.localSort.title")} onClose={() => close()} className="w-40 p-1.5">
      {/* 菜单浮层：每组共用参数映射，避免六个按钮各自维护不同点击规则。 */}
      {/* 标记来源写在提示中，不能让用户误以为这里是在线热门标签。 */}
      <div role="group" aria-label={t("toolBox.civitai.localSort.title")}>{fields.map(field => <button key={field} data-local-sort-field={field} type="button" role="menuitemradio" aria-checked={order.field === field} title={field === "mark" ? t("toolBox.civitai.localSort.markHint") : undefined} onClick={() => { onChange({ ...order, field }); close(true); }} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-muted focus:bg-muted focus:outline-none"><Check size={13} className={order.field === field ? "" : "invisible"} />{t(`toolBox.civitai.localSort.${field}`)}</button>)}</div>
      <hr role="separator" className="my-1 border-border" />
      <div role="group" aria-label={t("toolBox.civitai.localSort.direction")}>{(["asc", "desc"] as const).map(direction => <button key={direction} data-local-sort-direction={direction} type="button" role="menuitemradio" aria-checked={order.direction === direction} onClick={() => { onChange({ ...order, direction }); close(true); }} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-muted focus:bg-muted focus:outline-none"><Check size={13} className={order.direction === direction ? "" : "invisible"} />{t(`toolBox.civitai.localSort.${direction}`)}</button>)}</div>
    </ContextMenuShell>}
  </div>;
}
