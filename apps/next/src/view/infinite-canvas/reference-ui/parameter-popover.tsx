"use client";

// 比例、数量和画质使用同一套画布胶囊与悬浮壳，不各写一套开合/焦点处理。
// 像只拉开当前抽屉：Escape收回这一层，不能同时取消底层节点选择。
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CanvasChip, type IconName } from "./components";
import { useParameterBounds } from "./use-parameter-bounds";

// label 是当前确认值的摘要，marker 是测试与宿主识别的稳定参数身份。
// 这两个值不能互相替代，切语言不应更换质量、数量或比例的数据归属。
// icon 使用原图标枚举，视觉与画布胶囊保持同一个来源。
// disabled 是宿主真实能力决定的值，不根据某个文字是否为空猜测。
// onOpen 可以清理子视图，但关闭动作不要求它同步一份 open 到工程状态。
// children 接收 close，使选择确认与焦点恢复的先后关系明确可见。
// 内部未暴露 setOpen，调用方不能在 render 中读写浮层状态。
// 关闭动作没有参数值，参数实际更新由选项自己的业务回调承担。
// 同一个壳能服务不同参数，是因为开合、外部点击与焦点行为完全一致。
// 若某个未来功能需要确认对话框，不应因为外形相似强行套这个即时选项壳。
// 当前没有 aria-modal，应用导航仍可用，不能把非模态小菜单当全窗锁焦点弹窗。
// 外层 width 不在 Props 中自由传入，几何仍由原画布规范统一维护。
// 选项数量和正文通过 children 变化，不复制另一份相同菜单 DOM。
// useId 只生成应用会话内 DOM 身份，不要求保存后重开沿用同一个字符串。
// 菜单内没有 document 全局快捷键，不与原编辑器文字历史争 Ctrl+Z。
// 如果用户点另一个菜单，旧壳的 outside 处理只卸载旧内容，不阻止新按钮 click。
// 若用户在浮层内点数字字段，contains 命中内部，草稿不会被错误清除。
// 原壳的 z-index 与节点参数层级保持一致，不绕过应用全局资源对话框。
// 节点缩放通过原 ReactFlow 变换，不在浮层再计算一次缩放比例。
// 本壳不是通用门户基础库，只承载当前已经证明相同的三种参数交互。
interface Props {
  label: string; icon?: IconName; iconOnly?: boolean; disabled?: boolean; marker: string;
  onOpen?: () => void; children: (close: () => void) => ReactNode;
}
// 壳与内容分开，也让浮层卸载时丢弃自定义尺寸的未确认草稿。
// render prop 的参数只是一个关闭动作，不暴露 host 或 trigger 的可变引用。
// 独立子组件负责装配内容，避免 React 在父组件 render 阶段访问焦点 ref。
// id 只用于 aria-controls 关联，工程保存不需要保留这个临时 DOM 编号。
// 条件挂载意味着关闭后内部输入不参与 Tab 路径，也不响应隐藏快捷键。
// children 不在打开前预执行，因此未展开自定义不会提前建立草稿。
// 多张卡片使用 useId 分配独立关系，重名节点也不会共享弹层目标。
function ParameterContent({ id, close, children }: { id: string; close: () => void; children: Props["children"] }) {
  const popup = useRef<HTMLDivElement>(null);
  useParameterBounds(popup);
  return <div ref={popup} id={id} className="hy-ratio-popup">{children(close)}</div>;
}
// 触发器与 host 的生命周期跟随具体节点，不能在模块里保存最后点击的按钮。
// 关闭分两类：确认或 Escape 要返回入口，外部指针已经选了新位置则尊重新焦点。
// 如果外部点击也抢回焦点，用户点另一个输入框后第一次打字就会丢失。
// contains 同时包含浮层和触发器，点击菜单内的字段不会被误判成外部关闭。
// 监听 pointerdown 可在下一个 click 前收起旧层，避免菜单盖住新目标。
// 监听只在 open 时安装，effect 清理后卸载节点不会残留 document 回调。
// 默认焦点优先当前选项，其次第一项可用按钮，最后才是数值输入。
// 禁用选项从焦点候选中排除，远端不支持的档位不应成为键盘落点。
// preventScroll 只禁止聚焦引起页面跳动，不阻止用户在字段中滚动。
// Escape 消费事件，防止同一次按键又让画布取消当前节点选择。
// 其他按键继续冒泡给实际控件，外壳不自行重写按钮的 Enter 或 Space。
// 原 data-canvas-image-ratio 和 batch 标记保留，现有接线不必靠中文标签定位。
// 新的 marker 只标识参数种类，不参与选择值解析或请求拼装。
// aria-expanded 始终反映实际挂载状态，不能只在 hover 时显示已展开。
// aria-controls 关闭时移除，避免指向一个不存在的菜单节点。
// 原 CanvasChip 接收 ref，外壳无需另画一个相似按钮。
// disabled 作用于原生按钮，忙碌时不能靠快速连点打开新草稿。
// onOpen 只让调用方重置本地视图，不承担清空工程参数的副作用。
// 多个壳没有共享布尔值，一个选项确认不会修改另一张卡的已确认值。
// 本浮层继续位于节点参数面板内，不引入全窗口遮罩阻挡应用导航。
// 内部可交互区域的 data-canvas-popover 让画布快捷键知道当前是控件操作。
// 外部点击清理只改 open，因此不会间接执行 children 里的确认动作。
export function ParameterPopover({ label, icon, iconOnly, disabled, marker, onOpen, children }: Props) {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
// 焦点恢复像把书签放回刚才那一页，用户按完 Escape 可以接着按 Tab 操作相邻入口。
// trigger 当前不存在时安全跳过，不能因节点已经删除而抛异常。
// 这里不使用 querySelector 查所有同名按钮，多张卡同样叫画质也能返回准确入口。
// focus 的 preventScroll 保持当前画布镜头，不让浏览器为输入框滚动整个 AppShell。
// setOpen 只控制挂载，不调用参数 onChange，因此 Escape 不产生无内容撤销项。
// 确认回调先更新业务再 close，让最终值由受控数据在下一次渲染显示。
// 外部 pointerdown 不调用这个 close，因为用户已经选择了另一个焦点目标。
// 这两条关闭路径刻意分开，不能为了复用函数而把语义不同的动作强行合并。
// 节点参数区域自带画布键盘隔离标记，恢复焦点后 Delete 不应删除作品卡片。
// 此动作不取消任务，菜单退出与模型取消拥有不同业务意义。
// 焦点只是临时界面位置，保存工程不应该序列化 HTMLElement 或 useRef。
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  // 外部点击不把焦点抢回触发器；选项确认和Escape才返回原入口。
  // 监听仅在打开时存在，节点卸载或切换后不会遗留窗口订阅。
  useEffect(() => {
    if (!open) return;
    host.current?.querySelector<HTMLElement>(".hy-ratio-popup [aria-pressed=true],.hy-ratio-popup button:not(:disabled),.hy-ratio-popup input,.hy-ratio-popup [tabindex='0']")?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || host.current?.contains(event.target)) return;
      // 先让数字草稿收到失焦，再卸载菜单；否则外部点击可能跳过输入的确认事件。
      const active = document.activeElement;
      if (active instanceof HTMLElement && host.current?.contains(active)) active.blur();
      setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return <div data-canvas-image-ratio={marker === "ratio" ? "" : undefined} data-canvas-batch={marker === "batch" ? "" : undefined} data-canvas-parameter={marker} ref={host} data-canvas-popover={open ? "" : undefined} onKeyDown={event => {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault(); event.stopPropagation(); close();
  }}>
    <CanvasChip ref={trigger} icon={icon} className={iconOnly ? "hy-parameter-icon" : undefined} reason={iconOnly ? label : undefined} disabled={disabled} expanded={open} controls={open ? id : undefined} onClick={() => { onOpen?.(); setOpen(value => !value); }}>{iconOnly ? <span className="sr-only">{label}</span> : label}</CanvasChip>
    {open && <ParameterContent id={id} close={close}>{children}</ParameterContent>}
  </div>;
}
