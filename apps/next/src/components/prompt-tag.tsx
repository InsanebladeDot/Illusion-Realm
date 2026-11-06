"use client";

// 提示词标签共用本地模型的表面：每个词是独立按钮，长词只在自身内部换行。
// 创建页只注入追加/移除回调，模型详情只注入复制，公共标签不读任何业务 store。
import type { ButtonHTMLAttributes } from "react";
import { X } from "lucide-react";

// label 保留训练标签原文，不能把带空格的短语按单词拆成多个按钮。
// 原生按钮属性保留 disabled、aria 和既有 data 标记，旧调用方的键盘/测试入口不丢失。
// 外观由组件统一持有，不开放 className 让两个使用处重新长出不同样式。
// onRemove 与主体动作分离，点击删除不能冒泡成追加或复制。
// removeLabel 由业务处翻译；没有删除回调时不渲染空占位按钮。
// 标签的背景、字号、圆角来自原模型触发词，两个入口不再维护相同class字符串。
// 模型详情仍以复制为主动作，创建页仍以追加为主动作，共享外观不合并副作用。
// 只有创建页编辑模式提供移除，模型详情不会出现能改训练触发词的假按钮。
// 主体按钮固定type为button，放进表单也不会意外触发提交。
// 删除按钮作为兄弟节点，避免嵌套button带来的焦点和事件冒泡歧义。
// wrapper保留内容的最大宽度，长词与删除键一起占用父行可用空间。
// 文字允许折行，删除键保持自己的宽度，不能被超长文本挤成不可点的细线。
// 没有移除动作时wrapper不额外预留空槽，复制标签仍维持原有紧凑密度。
// 单词中的空格不由此组件解释，词边界在共享分词工具内确定。
// title采用未截断label，鼠标悬停可核对包含下划线或括号的完整训练词。
// 调用方显式传入title时保留它，不覆盖业务已有的操作说明。
// 任意data属性仍到真实主按钮，既有复制测试和快捷插入测试无需换定位入口。
// onClick由调用方绑定，组件不会读取当前分类或猜测该复制到哪里。
// aria-label允许覆盖可访问名称，可见原文不随描述性名称变化。
// disabled传到两颗真实按钮，编辑禁用不能只关闭追加而留下删除入口。
// 组件没有缓存label或自己的选中词，更新参数后立即展示当前对象。
// 这样相同词可以存在于不同分类，而不会因为共享组件互相删掉对方。
// 整个标签不注册全局键盘事件，不影响弹窗Escape或创建页快捷键。
// 主按钮沿用原生键盘Enter和Space触发，未实现另一份手工按键模拟点击。
// 本地模型的分组仍留在外层，新组件只负责一颗词而非合并两行训练词组。
// 深浅主题读取语义色变量，不因原截图来自浅色就在组件内写死白底。
// 聚焦行为沿用原生按钮和项目公共规则，不以移除outline制造隐形键盘焦点。
// 宽度约束只属于标签，不给整个提示词面板设置一个掩盖溢出的横向裁切。
// 多行标签的高度由内容决定，下一行flex项目会从真实底部继续排布。
interface PromptTagProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> {
  label: string;
  onRemove?: () => void;
  removeLabel?: string;
}

// flex 子项默认不肯缩到自身内容以下，长串标签就像硬纸条，会把窄侧栏撑开。
// min-w-0 和 max-w-full 给纸条一个栏宽上限，break-all 再允许无空格长词在栏内折行。
// 用 min-height 而非固定 h-6：多行内容会撑高自身，下一行标签不再重叠盖住。
// 删除键固定在右侧且不收缩；文字按钮吃剩余空间，两者是兄弟而非嵌套按钮。
// 行高保持正常，英文下划线和中文长词都能在浅深主题下看清。
// title 保留原文，标签的可见排版变化不改传回业务的完整字符串。
// 包装层不接收点击和焦点，Tab 只经过真实追加/复制按钮与可选删除按钮。
// 共享组件没有本地选中状态，多组或多个弹窗不会因复用同步高亮。
// aria-label 可由调用方覆盖，但默认按钮文字本身已提供可访问名称。
// 原生 disabled 同时关闭主动作和删除动作，不靠变灰假装禁止修改。
// onRemove不透传到主按钮，React不会把业务回调当未知DOM属性输出。
// removeLabel不写死在组件内，模型页不需要引入创建页的“移除快捷词”文案。
// 主按钮type在展开属性之后明确固定，外部submit值不能改变共享标签的表单行为。
// 外部onKeyDown仍能透传，调用方需要时可以接入自己的局部键盘规则。
// 包装span不设置tabIndex，键盘不会先停到一个没有操作的装饰层。
// 图标按钮已有明确aria-label，图形X只作为视觉提示而不承担唯一名称。
// 移除键不调用主按钮回调，复制或追加不会与删词在同一次点击中同时发生。
// 折行只影响排版，label本身仍作为完整参数传给外层回调闭包。
export function PromptTag({ label, onRemove, removeLabel, ...button }: PromptTagProps) {
  return <span className="inline-flex min-w-0 max-w-full items-start gap-0.5 align-top">
    <button {...button} type="button" title={button.title ?? label} className="min-h-6 min-w-0 max-w-full whitespace-normal break-all rounded bg-primary/10 px-2 py-1 text-left text-[11px] leading-relaxed text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50">{label}</button>
    {onRemove && <button type="button" disabled={button.disabled} aria-label={removeLabel} onClick={onRemove} className="inline-flex h-6 shrink-0 items-center rounded px-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"><X size={12} /></button>}
  </span>;
}
