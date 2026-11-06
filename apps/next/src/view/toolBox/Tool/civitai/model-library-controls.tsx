"use client";

// 模型库统一搜索输入和密度入口，通过插槽保留在线提交、本地即时过滤差异。
// 这里只表达界面操作，不内置请求、防抖或文件扫描。
import { useId, useState, type ReactNode } from "react";
import { ChevronDown, Folder, Grid2X2, LayoutGrid, List, Search } from "lucide-react";
import { CollapsiblePanel } from "@/components/CollapsiblePanel";
import { useTranslation } from "@/i18n";
import styles from "./local-model-library.module.css";

/**
 * 搜索和分类控件的使用边界：
 * query 是输入框当前显示的文本，不保证已经成为一次远端请求的查询条件。
 * 本地调用方把 onChange 接到索引过滤状态，因此输入后立即缩小结果。
 * 在线调用方把 onChange 接到工具栏草稿，只有 onSubmit 才更新请求参数。
 * 两者共享输入外观，但不能为了复用而强迫本地也等待一次网络式提交。
 * trailing 只放搜索框右端的排序控件，不应该传入另一个完整搜索 form。
 * 本地排序能读取磁盘属性，在线排序只能使用远端 API 接受的字段。
 * 传入相似的排列菜单并不意味着它们的排序比较函数也能共用。
 * action 位于组合框外侧，本地是批量补全，在线是明确的提交按钮。
 * 批量补全按钮自行维护禁用状态，搜索组件没有能力判断哈希队列是否运行。
 * 在线提交按钮必须声明 type=submit，才能与输入框里的 Enter 使用同一回调。
 * 本地批量动作必须是普通 button，防止点击补全被误当作搜索提交。
 * form 会阻止浏览器导航刷新，避免静态导出应用丢失当前 UI 状态。
 * 没有提供 onSubmit 不代表输入框禁用，本地过滤仍从 onChange 正常工作。
 * label 与 placeholder 分别承担辅助名称和可视提示，不能只靠占位文字标识输入框。
 * 右端排序放在 label 外面，鼠标选排序不会又把光标送回搜索文字。
 * online 属性只保留在线测试入口，不是访问网络的开关。
 * 共享控件本身不认识 CivitaiFilters，也不会在这里创建来源默认值。
 * 请求失败后的错误文案仍由业务目录区呈现，不把失败吞成搜索框空值。
 * 组件没有自己的副本 query，父级清空文本后不会被内部旧值覆盖。
 * 状态变化通过回调返回原始输入，URL 识别等转换仍由在线边界负责。
 * 视图密度的三个值与 modelGrid 的 data-view 一致，接入时需传给同一网格。
 * 切成列表只是改变排布，不会把模型数组转成另一套数据或重新请求远端。
 * 按钮的 aria-pressed 表达密度是否选中，与卡片是否选中是两个独立维度。
 * 密度图标的名称从既有翻译获取，不能把视觉上的九宫格当成唯一标签。
 * 分类 items 的 value 是真实条件，label 是展示文字，翻译后不能拿 label 当路径。
 * 例如 label 显示 Diffusion Models，value 仍可保持扫描器返回的 diffusion_models。
 * count 为零时仍显示零，只有未提供数字才省略，不能混淆空类别和未知总数。
 * 在线没有全站分类统计，不能用当前页数量充当每个类别的 count。
 * 本地计数随原索引变化；这个组件不会通过点击类别临时再扫描目录。
 * items 的 key 使用 value，排序或翻译更新后同一个类别仍有稳定身份。
 * current 不在 items 中时不自作主张选第一项，条件恢复由数据拥有者决定。
 * 按钮采用原生 Tab、Enter 和空格，分类导航不声明尚未实现的 tree 键盘协议。
 * 选择后不自动滚回页面顶部，模型目录自己的滚动策略仍由调用方控制。
 * 分类名称省略只影响画面，完整 title 与实际 value 都保留。
 * 图标和数字禁止缩小，文字承担省略宽度，避免长名让行高和图标位置变化。
 * dataKey 只由内部调用方提供，用来兼容两种入口的回归定位。
 * 折叠区的 open 属于每个组件实例，绝不放进全局 store 共享一个总开关。
 * 两个分组虽然共用动画容器，但标题按钮分别拥有 useId 关联的内容区。
 * 收起后内容仍存在，所以目录下的分支手动开合状态不会被清空。
 * 动画使用创建页既有实测高度容器，新增分类或切换字体后无需写死最大高度。
 * 隐藏内容的 inert 由动画组件统一管理，不靠 opacity=0 假装不可交互。
 * 标题按钮始终在动画容器外，收起后仍可用键盘找到恢复入口。
 * 箭头只跟随 open 旋转，不根据内容是否暂时测得零高度反向修改状态。
 * 减少动态效果由本模型库的局部样式处理，不改变创建页其他调用方的动画。
 * 展开与收起都不调用 onChange，用户只是整理侧栏，不是在重新选择模型类别。
 * 新增分组应直接使用 ModelLibrarySection，不再复制另一段高度动画。
 */
interface SearchProps {
  query: string; onChange: (query: string) => void; label: string; placeholder: string;
  trailing: ReactNode; action?: ReactNode; onSubmit?: () => void; online?: boolean;
}
// label 只包住图标和输入，右端排序不放入 label，避免点击时抢回输入焦点。
// form 统一保留 Enter 提交语义；本地不提供 onSubmit，所以 Enter 只阻止刷新。
// 在线请求由调用方在提交回调中决定，打字本身不会逐字发起外部搜索。
export function ModelLibrarySearch({ query, onChange, label, placeholder, trailing, action, onSubmit, online }: SearchProps) {
  return <form className={styles.filters} data-model-library-search onSubmit={event => { event.preventDefault(); onSubmit?.(); }}>
    {/* 模型搜索：共同边框、图标、输入和右端排列入口。 */}
    {/* 两个调用方共享同一命中高度和焦点反馈，不复制一套默认输入框。 */}
    <div className={styles.searchGroup}><label><Search size={15} /><input data-civitai-query={online || undefined} value={query} onChange={event => onChange(event.target.value)} aria-label={label} placeholder={placeholder} /></label>{trailing}</div>{action}
  </form>;
}

// 密度只改变现有网格的 CSS，两个库各自拥有 view，不共享选中状态。
// 按钮都是真正的原生 button，Tab、空格和 Enter 使用浏览器默认行为。
// 图标不作为唯一含义，翻译后的 aria-label 为三种密度提供可读名称。
export function ModelLibraryViewModes({ view, onChange }: { view: string; onChange: (view: string) => void }) {
  const { t } = useTranslation();
  return <div className={styles.viewModes} data-model-library-views>{[{ value: "large", Icon: LayoutGrid }, { value: "grid", Icon: Grid2X2 }, { value: "list", Icon: List }].map(({ value, Icon }) => <button key={value} type="button" aria-pressed={view === value} aria-label={t(`toolBox.civitai.view${value === "large" ? "Large" : value === "grid" ? "Grid" : "List"}`)} onClick={() => onChange(value)}><Icon size={15} /></button>)}</div>;
}

// 类别导航只共享展示和选中语义，点击后的本地过滤或远端请求由回调注入。
// count 可选：本地索引有准确数量，远端未请求的分类不能伪造数量。
// dataKey 保留各入口稳定定位，不通过展示译文推断类别身份。
interface ChoiceProps {
  label: string; items: { value: string; label: string; count?: number }[];
  current: string; onChange: (value: string) => void; dataKey: string;
}
// 复用创建页提示词的实测高度动画，像抽屉收回内容，不卸载目录树的展开记录。
// 每个分组自管开合，官方分类收起不影响“我的分类”，也不清除当前过滤条件。
// CollapsiblePanel 在闭合时提供 inert，动画中的隐藏按钮不会继续接受键盘焦点。
export function ModelLibrarySection({ label, marker, children }: { label: string; marker: string; children: ReactNode }) {
  const [open, setOpen] = useState(true), id = useId();
  return <section className={styles.navigationSection} data-model-library-section={marker}>
    {/* 侧栏分组：整个标题都是展开入口，箭头和内容使用相同的开合状态。 */}
    <h2><button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)} className="mb-2 flex w-full items-center justify-between gap-2 rounded text-left text-xs font-semibold"><span className="truncate">{label}</span><ChevronDown size={13} className={`shrink-0 transition-transform duration-300 motion-reduce:transition-none ${open ? "" : "-rotate-90"}`} /></button></h2>
    <CollapsiblePanel open={open} stateAttribute="data-model-library-section-panel"><div id={id}>{children}</div></CollapsiblePanel>
  </section>;
}
export function ModelLibraryChoices({ label, items, current, onChange, dataKey }: ChoiceProps) {
  return <ModelLibrarySection label={label} marker={dataKey}><nav aria-label={label} className="space-y-1">{items.map(item => <button key={item.value} {...{[`data-${dataKey}`]: item.value}} type="button" aria-pressed={current === item.value} onClick={() => onChange(item.value)} className={`flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary ${current === item.value ? "bg-primary/10 text-primary" : ""}`}><Folder size={14} className="shrink-0" /><span className="min-w-0 flex-1 truncate" title={item.label}>{item.label}</span>{item.count !== undefined && <small className="shrink-0 text-muted-foreground">{item.count}</small>}</button>)}</nav></ModelLibrarySection>;
}
