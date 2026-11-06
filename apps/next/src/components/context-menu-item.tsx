"use client";

/** 创建图片右键菜单的共用行：统一图标、文字、悬停、禁用与危险动作。 */
// 业务菜单只传标签和动作，不能各自拼一套看起来相似的按钮样式。
// 容器的定位和关闭仍归ContextMenuShell，本文件不管理全局浮层状态。
// 这像同一张空白操作单：印刷格式相同，填入的图片或片段业务各自负责。
import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

// 沿用创建图片菜单原来的188px宽度与纵向留白，特殊表单可单独增宽。
// 颜色、边框和阴影与公共定位外壳相同，子菜单也引用这一份表面样式。
// 调色板属于dialog表单而非操作列表，仍由它原有的尺寸参数控制。
export const CONTEXT_MENU_SIZE_CLASS = "w-[188px] py-1";
export const CONTEXT_MENU_SURFACE_CLASS = "rounded-lg border border-border bg-background text-foreground shadow-xl";

// 原生按钮属性透传给真实button，保留各调用方的数据标记、快捷键和ARIA。
// 禁止任意className覆盖菜单行，避免新的调用方再次逐步分叉视觉规范。
// icon是已有Lucide图标，不根据文字或业务类型在公共行里猜图标。
// children是尾部快捷键或子菜单箭头，不允许用它替换整行排版。
// 传入label是完整动作名，共享行只在显示空间不足时省略，不截断真实字符串。
// 没有提供title时回落为完整标签，鼠标悬停能补足被省略的操作名。
// 显式title优先级最高，例如旧视频菜单可以保留更具体的输出提示。
// disabledReason优先于默认标签作为title，让用户知道当前为何不能执行。
// 原生disabled属性与原因同时提供时采用或关系，不存在相互覆盖解锁。
// 使用children传快捷键时，不要再写一个onClick，否则会产生嵌套按钮语义。
// 子菜单箭头也通过children传入；展开动作仍绑定整行而非只绑定箭头。
// 继承的onKeyDown可处理ArrowRight，但不在公共组件内把所有箭头都当展开。
// aria-pressed可描述旧区间的静音开关，普通复制项无需伪造开关状态。
// aria-haspopup及aria-expanded由真正拥有子菜单状态的漫画调用方提供。
// 没有子菜单的时间线菜单不应仅为视觉箭头而填入这些属性。
// button的type强制为button，菜单放在表单内也不会意外提交整个表单。
// 图标类型采用LucideIcon，调用方传图标组件而不是提前渲染的固定尺寸SVG。
// 这样图标尺寸由共享行决定，避免某个入口又使用更大的工具栏图标。
// label文字保持可选择性由页面默认控制，本组件不注册系统剪贴板能力。
// 描述节点用sr-only隐藏，仅供读屏补充原因，不在每一行下扩出可见说明。
// 唯一id由useId产生，不依赖动作名，同一动作出现在不同菜单不会重复DOM身份。
// 解构移走disabledReason与destructive，不能把这些业务外观属性直接写到HTML上。
// 剩余原生属性向下透传，现有测试和无障碍标记无需了解内部span结构。
// className被契约排除，只能改容器布局，避免行高和危险色在调用方分叉。
// 菜单表面和菜单行分开，带数值表单的菜单可以增宽而保持操作行统一。
// 禁用的删除项仍保留危险色语义，只降低不透明度，不能变成另一种普通动作。
// 图标aria-hidden避免同一个动作被读两次，用户听到的名字来自label。
// 标签min-w-0允许flex真正收缩，否则长文件相关动作可能顶出188px菜单。
// 尾部shrink-0保证快捷键和子菜单箭头不被标签挤成零宽。
// 组件不缓存label，切换语言时随调用方重新渲染，不遗留上一次语言的悬停文本。
interface ContextMenuItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className"> {
  label: string; icon?: LucideIcon; destructive?: boolean; disabledReason?: string; children?: ReactNode;
}

// 不在这里自动关闭菜单：音量调整应留在原位置，删除等业务由调用方决定关闭。
// 禁用既反映在原生disabled上，也用关联说明告诉键盘与读屏用户具体原因。
// label同时用于可见文字和默认无障碍名称，图标为装饰，不重复念动作名称。
// 危险动作沿用原创建页红色与淡红悬停，不因入口不同变成普通蓝灰色。
// 普通图标使用辅助文字色，主标签保留前景色，保持截图中的层级。
// focus-visible复用悬停表面，键盘经过时可见，不依赖鼠标位置。
// 事件原样透传，旧菜单的ArrowRight子菜单或checked状态不会丢失。
// useId只关联当前禁用原因，多份菜单同时存在时不会互指说明。
// 没有onClick的项目不会假装执行成功，可用性仍由业务显式提供。
// title保留调用方已有提示；未指定时优先展示实际禁用原因。
// aria-describedby在没有新原因时保留传入值，避免破坏已有字段帮助说明。
// disabledReason与disabled都能禁用，不允许视觉禁用但回调仍被用户触发。
// 原生disabled保证Enter、Space和鼠标遵守同一门槛。
// 这里不吞异常，异步动作的错误与取消继续由请求拥有者处理。
// 删除源文件与删除工程引用虽然都呈红色，其具体确认逻辑仍归各业务。
// 菜单行不订阅任何store，因此一个实例的禁用不会影响其他入口。
// 尾部内容右对齐，在名称长时先让名称省略，快捷键不被压出窗口。
export function ContextMenuItem({ label, icon: Icon, destructive = false, disabledReason, children, disabled, ...props }: ContextMenuItemProps) {
  const id = useId();
  return <>
    <button {...props} type="button" role="menuitem" aria-label={props["aria-label"] ?? label} disabled={disabled || !!disabledReason} aria-describedby={disabledReason ? id : props["aria-describedby"]} title={props.title ?? disabledReason ?? label} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm outline-none disabled:cursor-not-allowed disabled:opacity-40 ${destructive ? "text-red-600 hover:bg-red-500/10 focus-visible:bg-red-500/10 dark:text-red-400" : "hover:bg-muted/60 focus-visible:bg-muted/60"}`}>
      {Icon && <Icon className={`h-4 w-4 shrink-0 ${destructive ? "" : "text-muted-foreground"}`} aria-hidden="true" />}<span className="min-w-0 truncate">{label}</span>{children && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{children}</span>}
    </button>
    {disabledReason && <span id={id} className="sr-only">{disabledReason}</span>}
  </>;
}

// 分隔线只表达分组，不能被Tab或读屏误认为一个可执行操作。
// 删除前的间隔与创建图片菜单保持一致，不由业务各写一个边框。
export function ContextMenuSeparator() { return <div role="separator" className="my-1 h-px bg-border" />; }
// 底部对象名称使用原创建菜单的小字号与省略规则，完整值可悬停查看。
// 名称是用户内容，保持原值，不拿它决定复制、删除或分离的业务目标。
export function ContextMenuCaption({ children }: { children: string }) { return <p title={children} className="truncate px-3 pb-1 pt-1 text-[11px] text-muted-foreground">{children}</p>; }
