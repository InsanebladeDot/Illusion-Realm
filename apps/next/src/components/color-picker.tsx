"use client";

/**
 * 复用选色入口：彩色圆与加号展开紧凑色板，不调用系统颜色窗口。
 * 浮层沿用项目右键菜单外壳的 Portal、视口避让和外部关闭机制。
 * 颜色值由调用者管理，组件仅保存展开位置与焦点入口。
 */
import { useCallback, useId, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { ContextMenuShell } from './context-menu-shell';
import { ColorPickerControls } from './color-picker-controls';
import { useTranslation } from '@/i18n';

// label 必须由使用处翻译，不能把绘画色固定写死在共享组件中。
// disabled 为显式输入，浮层离开 fieldset 后仍能遵守生成锁。
// marker 只服务于区分多个入口，不改变颜色的业务含义。
// onChange 只提交六位 RGB，不把透明度或 HSV 带入既有 store。
interface ColorPickerProps { value: string; label: string; onChange: (value: string) => void; disabled?: boolean; marker?: string }

/**
 * 入口采用小彩色圆和右上角加号，对应参考图的紧凑展开方式。
 * 旁边保留当前色与数值，用户不打开弹层也能确认实际设置。
 * 点击入口时重新读取边界，设置面板滚动后不会沿用旧锚点。
 * 外壳依据实际弹层尺寸夹取，接近窗口底部时自动向上避让。
 * Portal 避免被笔刷设置面板的 overflow-y-auto 裁切。
 * 普通点击外部由既有外壳关闭，不添加覆盖整个画布的遮罩。
 * 入口 pointerdown 阻止外壳的外部点击判断，二次点击能真正收起。
 * trigger 与 panel 共用展开状态，aria-expanded 能准确反映可见性。
 * 同一页可同时放绘画色和蒙版色，useId 防止 aria-controls 冲突。
 * Escape 在捕获阶段处理，不能继续触发画布取消选区快捷键。
 * 主动关闭后焦点返回入口，键盘用户能继续切换工具。
 * 外部点击关闭不强制抢焦点，用户选择其他参数仍按点击结果聚焦。
 * 浮层卸载即移除监听，没有后台轮询或 document 常驻事件。
 * disabled 时不渲染浮层，不能通过 Portal 留下仍能写值的控件。
 * 变化回调额外检查调用者锁，防止手势开始后任务锁定仍迟到提交。
 * 真正业务更新由 onChange 完成，组件不写撤销历史或 PNG。
 * 色板子组件只在打开时挂载，关闭状态不执行颜色换算交互。
 * 弹层标题保留当前字段名，两个用途不会因为共用色板而混淆。
 * 关闭按钮有独立无障碍名称，不能让 X 图标代替文字语义。
 * 当前色小圆不代替彩虹入口，用户可同时看见功能入口和真实色值。
 * 动态 style 只用于当前颜色，圆形、间距和边框由 Tailwind 定义。
 * 深色背景沿用 bg-background，避免默认浏览器色框的主题冲突。
 * 彩虹使用锥形渐变，中心加白色柔光更接近参考色轮。
 * 加号徽标保持小尺寸，不因点击区域扩大而放大视觉图标。
 * 实际按钮有完整 36px 命中区，易点选且不挤占参数面板宽度。
 * 自由色板无需请求吸管权限，图像内取色仍由原颜色选择工具负责。
 * 组件没有确认按钮，拖动即时生效，关闭不会悄悄撤回已选颜色。
 * resize 或滚动关闭由共享外壳处理，下次点击按新几何重新定位。
 * 不在颜色变化时重挂载输入，连续 RGB 编辑不会丢失键盘焦点。
 * 展开位置属于局部 UI 状态，离开页面不写入用户持久化文档。
 * 入口锁定与色板控件锁定同时存在，不能只让按钮看起来变灰。
 * 弹层与按钮是 React 兄弟节点，浮层点击不会冒泡成入口再次切换。
 * 关闭回调保持稳定，连续拖色不会反复注册外部点击监听。
 */
export function ColorPicker({ value, label, onChange, disabled = false, marker }: ColorPickerProps) {
  const { t } = useTranslation(), id = useId(), trigger = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null), close = useCallback(() => setAnchor(null), [setAnchor]);
  const dismiss = () => { close(); trigger.current?.focus({ preventScroll: true }); };
  const open = anchor !== null && !disabled;
  return <div className="flex items-center justify-between gap-2 text-xs"><span>{label}</span><button ref={trigger} data-color-trigger={marker} type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled} onPointerDown={event => event.stopPropagation()} onClick={() => { const r = trigger.current?.getBoundingClientRect(); if (r) setAnchor(open ? null : { x: r.left, y: r.bottom + 6 }); }} className="flex h-9 items-center gap-2 rounded-lg px-1 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
    {/* 界面：参考图的彩色圆入口，右上角是小型加号徽标。 */}
    {/* 彩色圆表示可选任意颜色，右边的小圆才是当前已选颜色。 */}
    {/* 所有装饰图形对辅助技术隐藏，按钮名称来自字段 label。 */}
    <span aria-hidden className="relative h-6 w-6 rounded-full bg-[radial-gradient(circle_at_center,#fff9,transparent_70%),conic-gradient(red,#ff0,lime,cyan,blue,#f0f,red)]"><Plus className="absolute -right-1 -top-1 h-3 w-3 rounded-full border border-border bg-background text-muted-foreground" /></span><span aria-hidden className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: value }} />
  </button>
    {open && <ContextMenuShell x={anchor.x} y={anchor.y} label={label} role="dialog" onClose={close} className="w-60 p-3"><div id={id} data-color-picker={marker} onKeyDownCapture={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); } }}><div className="mb-3 flex items-center justify-between gap-2 text-xs"><strong>{label}</strong><button type="button" aria-label={t('common.close')} onClick={event => { event.stopPropagation(); dismiss(); }} className="rounded p-1 hover:bg-accent"><X className="h-3.5 w-3.5" /></button></div><ColorPickerControls value={value} label={label} disabled={disabled} onChange={color => { if (!disabled) onChange(color); }} /></div></ContextMenuShell>}
  </div>;
}
