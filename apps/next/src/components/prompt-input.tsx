"use client";

/**
 * 公共提示词输入：图片正反向提示词与文字改图复用同一外观和助手工具。
 * 无 value 时保留原有按 id 读写 DOM 的契约，不接管已有提示词工具的内容。
 * 有 value 时同步外部预设，并把手动输入及助手写回通知同一受控状态。
 * 使用 Chromium 的 plaintext-only，粘贴不带入网页富文本或 HTML 元素。
 * 不从 React children 渲染正文，避免普通重绘重建编辑区导致光标跳动。
 * 工具条定位依赖相对容器，正文预留底部空间，长文本不会压住助手图标。
 */
import { useLayoutEffect, useRef, type HTMLAttributes } from "react";
import { PromptAssistantToolbar } from "@/components/prompt-assistant/prompt-assistant-toolbar";
import { ACCENT_FOCUS_RING_CLASS, INPUT_BORDER_CLASS, PROMPT_EDITOR_SCROLL_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

// HTML 属性透传 label、测试标记与 data-placeholder，不重复定义另一套可访问接口。
// id 同时是 label 目标与助手上下文标识，一页内必须唯一。
// value 缺省表示保留调用方已有的命令式 DOM 管理，不等同于空字符串。
// disabled 必须显式关闭 contentEditable，因为 fieldset 不会禁用可编辑 div。
// assistant=false 用于高级组装只读视图，防止显示可以修改冻结内容的操作。
// minHeight 控制正反向输入的原有高度，正文其余主题样式保持统一。
// onValueChange 回传原始文本，不 trim 用户正在输入的空格与换行。
// maxLength 同时限制手动输入和助手写回，后端提交校验仍独立存在。
interface PromptInputProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "children" | "contentEditable"> {
  // 标签关联指向真正可编辑元素，不把 id 挂在外围布局容器。
  // 助手的撤销历史按此上下文区分，正反向输入不会互相串写。
  id: string;
  // 显式传空字符串会清空编辑面；省略 value 则由原工具管理正文。
  // 这样可同时服务普通图片的 DOM 契约与编辑草稿的 Zustand 契约。
  value?: string;
  // 回调只负责通知文本变化，提交、翻译和队列并不在输入组件内触发。
  // 外部可以使用函数式更新保留其余参数，不另存一份隐藏 prompt。
  onValueChange?: (value: string) => void;
  // 禁用时助手一并隐藏，输入值仍保留供生成与返回页展示。
  // 不能使用原生 disabled 属性冒充对 div 的实际交互限制。
  disabled?: boolean;
  // 高级组装由各分类输入负责助手，主表面不重复提供另一个写入口。
  // 普通正反向与编辑指令默认具有相同的功能工具条。
  assistant?: boolean;
  // 未设置限长时不截断普通图片提示词，保留原有工具的文本容量。
  // 编辑明确传入三千字限制，手动和助手都使用同一截断点。
  maxLength?: number;
  // 使用项目已存在的高度类，响应式布局仍由父级表单决定。
  // 短负面输入与较高正向输入共用同一正文和滚动机制。
  minHeight?: string;
}

/**
 * ref 始终指向本输入，不能用全局“当前焦点”推测助手应该写到哪里。
 * 受控同步只在文本不同的时候写 DOM，用户每次输入不重新设置光标。
 * 外部快捷预设改变 value 时同步更新正文，不留下隐藏的旧指令。
 * 无 value 的原图片输入保持纯 DOM 所有权，折叠或重绘不会清空已有内容。
 * 助手异步返回时再次检查当前 isContentEditable，运行中不能回写已锁定表单。
 * 统一 write 让助手、预设与手动输入遵守同一个限长和状态通知规则。
 * disabled 不代表清空，切换生成阶段后仍保留用户提交的完整输入。
 * role 和 aria-multiline 提供文本框语义，不依赖默认 textarea 的平台样式。
 * spellCheck=false 延续原图片输入行为，提示词不出现系统拼写下划线。
 * suppressContentEditableWarning 只说明正文由 DOM 管理，不忽略输入异常。
 */
export function PromptInput({ id, value, onValueChange, disabled = false, assistant = true, maxLength, minHeight = "min-h-36", className, ...props }: PromptInputProps) {
  // layout effect 仅做同步文本校正，不等待 rAF；遮挡窗口也能恢复正确草稿。
  // 空字符串必须同步，用于用户主动清空或重置预设。
  // 不把 undefined 回退为空值，否则普通图片工具写入的 DOM 会被重绘抹掉。
  // effect 只依赖受控 value，工具条展开状态变化不能重写正文。
  // 不监听 DOM mutation 回写状态，避免命令式工具与 React 形成更新循环。
  // 浏览器原生输入触发 onInput，受控预设则由 value effect 进入 DOM。
  // 两条路径均比较文本后才修改，不用 key 重建整个编辑面。
  // 页面首次挂载时同步恢复草稿，避免先显示空输入再跳出旧指令。
  // 客户端布局 effect 不读取 Node 或 Electron，仅操作当前 DOM 引用。
  // read 返回 trim 与旧 readEditableText 保持一致，手动状态仍保留原始空格。
  const element = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (value !== undefined && element.current && element.current.textContent !== value) element.current.textContent = value; }, [value]);
  // 文本助手可能跨异步等待返回，因此读 DOM 的当前禁用状态而非旧闭包值。
  // 写入前截断，字数显示、导出与生成都读取同一受控文本。
  // 内容未变化时不重写 DOM，减少普通输入过程中的光标移动。
  // 空输入保留为空，不拿 placeholder 当成实际指令传给模型。
  // 手动输入事件也走 write，不能只有预设遵守三千字限制。
  // 不使用 innerHTML，用户文字不会被解释为标签或脚本。
  const write = (text: string) => {
    const node = element.current; if (!node?.isContentEditable) return;
    const next = maxLength === undefined ? text : text.slice(0, maxLength);
    if (node.textContent !== next) node.textContent = next;
    onValueChange?.(next);
  };
  // bg-background 和 border-input 与原图片模式一致，深浅主题均从 token 取色。
  // min-w-0 和换行约束避免长提示词把 rail 撑出主展示区域。
  // max 高度与隐藏滚动条沿用现有图片样式，扩展文本不挤掉生成按钮。
  // aria-disabled 表达锁定语义，实际防编辑由 contentEditable=false 执行。
  // 工具条在锁定时卸载，fieldset 之外的浮层也不会继续接收交互。
  // 它的 write 仍检查 DOM 当前状态，先前已开始的异步响应也不能改写正文。
  // className 仅扩展输入表面，容器定位保持稳定供工具条复用。
  // 透传标记落在正文元素，既有读文本和测试选择器仍指向实际输入。
  return <div className="relative min-w-0"><div {...props} id={id} ref={element} role="textbox" aria-multiline="true" aria-disabled={disabled} contentEditable={disabled ? false : "plaintext-only"} suppressContentEditableWarning spellCheck={false} onInput={(event) => write(event.currentTarget.textContent ?? "")} className={cn("whitespace-pre-wrap break-words rounded-lg bg-background px-3 pb-10 pt-2 text-base outline-none focus-visible:ring-1 md:text-sm", minHeight, PROMPT_EDITOR_SCROLL_CLASS, ACCENT_FOCUS_RING_CLASS, INPUT_BORDER_CLASS, className)} />
    {/* 界面：复用提示词助手的复制、翻译、撤销与设置，不绘制无功能的占位图标。 */}
    {assistant && !disabled && <PromptAssistantToolbar contextId={id} read={() => element.current?.textContent?.trim() ?? ""} write={write} />}
  </div>;
}
