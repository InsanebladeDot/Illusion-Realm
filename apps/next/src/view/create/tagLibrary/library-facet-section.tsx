"use client";

/**
 * 界面：角色与背景共用的可折叠分类区和计数选项。
 * 只管理开合，真正的单选、多选规则仍由调用方决定。
 * 颜色、选中表面和边框使用主题变量，适配明暗主题。
 * 不复制两套箭头、数量徽标和可访问性状态。
 */
import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/utils/cn";

/**
 * prefix 与 field 组合成稳定测试入口，不依赖翻译后的中文标题。
 * icon 由使用处传入，角色外观与背景场景可使用各自图标。
 * defaultOpen 只决定首次展开状态，不在每次筛选时重置开合。
 * children 保持挂载，搜索框文字不会因收起区段丢失。
 * 收起时 hidden 同时阻止内容参与布局和键盘焦点。
 * section 的父组件负责纵向滚动，本组件不设置固定高度。
 */
interface FacetSectionProps { prefix: string; field: string; title: string; icon: ReactNode; children: ReactNode; defaultOpen?: boolean }

/**
 * 图标、标题与箭头固定对齐，长标题不会挤走箭头。
 * aria-expanded 与内容可见状态使用同一布尔值。
 * 原生 button 支持 Enter 和空格，不模拟鼠标事件。
 * 各区段状态独立，展开场景不会强制收起特征。
 * 默认值可由调用方选择，复用组件不固化业务顺序。
 * 无异步任务，不需要订阅全局窗口或挂载额外监听器。
 */
export function LibraryFacetSection({ prefix, field, title, icon, children, defaultOpen = false }: FacetSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return <section {...{ [`data-${prefix}-section`]: field }}>
    {/* 界面：分类标题整行可点击，箭头只表达当前开合。 */}
    <button type="button" {...{ [`data-${prefix}-toggle`]: field }} aria-expanded={open} onClick={() => setOpen(previous => !previous)} className="flex h-9 w-full items-center gap-2 px-2 text-left text-xs font-semibold text-muted-foreground">{icon}<span className="min-w-0 flex-1 truncate">{title}</span><ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-90")} /></button>
    {/* 收起整个区段，内部输入与选中状态仍由各自父组件保留。 */}
    <div hidden={!open} className="pb-2">{children}</div>
  </section>;
}

/**
 * value 始终是数据原值；label 可翻译，不能反过来作为过滤键。
 * selected 由业务父组件提供，不在行内保存第二份选择状态。
 * count 缺失显示破折号，零条则正确显示零，不混淆两者。
 * field 区分发色与瞳色等同名值，避免数据钩子冲突。
 * onClick 既可执行单选切换，也可执行多选增删。
 */
interface FacetOptionProps { prefix: string; field: string; value: string; label: string; count?: number; selected: boolean; onClick: () => void }

/**
 * 数量徽标始终右对齐，不被长作品名称推到下一行。
 * title 保存完整原值，截断文字仍可核对来源。
 * aria-pressed 让键盘及辅助设备获知筛选是否生效。
 * 选中态仅使用淡色背景，不额外增加粗边框挤占空间。
 * 原生 button 的点击区域覆盖整行，徽标不是第二个入口。
 * 统计值只读，不会触发网络请求或修改本地数据。
 */
// 使用处传回完整原值，展示名同为“蓝”的两个字段仍保持不同身份。
// 不在组件内截取value，含空格和括号的作品名需要完整传递。
// count采用nullish回退，避免把合法的0条错误显示成未知数量。
// 数字使用tabular-nums，切换计数不会使右侧徽标横向抖动。
// 不额外绑定onKeyDown，避免原生button一次按键触发两次选择。
// 场景多选的撤销由父级处理，组件不会擅自清空同组其他值。
// 角色单选同样由父级处理，复用行不会把它变为多选。
// 同一行不增加input或嵌套button，保持一个可聚焦控件。
// 数据属性只用于界面定位，不把外部值插入HTML或执行脚本。
export function LibraryFacetOption({ prefix, field, value, label, count, selected, onClick }: FacetOptionProps) {
  return <button type="button" {...{ [`data-${prefix}-value`]: value, [`data-${prefix}-field`]: field }} aria-pressed={selected} title={value} onClick={onClick} className={cn("flex h-10 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted", selected && "bg-muted text-foreground")}><span className="min-w-0 truncate">{label}</span><span {...{ [`data-${prefix}-count`]: true }} className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-normal tabular-nums text-muted-foreground">{count ?? "—"}</span></button>;
}
