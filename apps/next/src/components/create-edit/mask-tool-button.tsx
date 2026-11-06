"use client";
/**
 * 编辑器图标按钮：共享命中区、选中态和侧向工具提示。
 * 提示使用 Portal，左工具栏滚动时不会被栏边界截断。
 * 位置取真实按钮矩形并限制视口，动效不参与图片布局。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/utils/cn';

// name 与 accessible label 相同，未悬停时仍能读到工具用途。
// mode 只用于稳定标识真实工具，当前态由 aria-pressed 表达。
// disabled 保留图标，空素材时不制造工具能力凭空消失的观感。
// children 沿用项目 SVG 图标，不异步加载外部图片资源。
interface Props { name: string; mode: string; selected: boolean; disabled: boolean; onClick: () => void; children: ReactNode }

// 计时器在重入/离开/卸载时清理，快速扫过工具不会弹出过时名称。
// 悬停先等待 230ms，触屏点击立即选工具并短暂显示名称。
// focus 使用同一入口，键盘用户无需鼠标也能知道按钮名称。
// 提示 pointer-events-none，不挡住随后落到图片上的拖动起点。
// 减少动态偏好取消位移和过渡，保留必要文字反馈。
// 动态 style 仅承载实测视口坐标，其他外观继续用 Tailwind。
// 不使用 title，避免浏览器原生 tooltip 与自定义提示重叠。
// 计时器 ref 不保存到全局 store，其他按钮不会取消当前实例的显示。
// 已选态背景持续保留，名称淡出不会让用户误以为工具被取消。
// 提示固定在视口，按钮放在可滚动栏内也不会被 overflow 裁掉。
// Portal 只承载说明文字，点击逻辑仍位于原有按钮而非复制一个入口。
// 禁用时保留 aria-label，辅助技术仍能读到工具名称与不可用状态。
// 触屏首次点击执行 onClick 后再提示，不要求确认名称的第二次点击。
// 不让说明接管焦点，用户随后按键仍在实际按钮或图片工作区。
// 位置读取发生在交互事件内，静态预渲染不访问 window 或 document。
// 组件卸载清计时器，切页后不会继续更新一个已离开的提示实例。
// class 动效只影响说明的 transform，不影响工具栏或图片几何。
// 不使用帧回调等待，窗口被遮挡也不会永远停在名称显示前。
export function MaskToolButton({ name, mode, selected, disabled, onClick, children }: Props) {
  const ref=useRef<HTMLButtonElement>(null), timer=useRef<ReturnType<typeof setTimeout> | null>(null), [tip,setTip]=useState<{x:number;y:number}|null>(null), [visible,setVisible]=useState(false);
  const clear=()=>{ if(timer.current) clearTimeout(timer.current); };
  useEffect(()=>()=>{ if(timer.current) clearTimeout(timer.current); },[]);
  // 固定宽度提示在右侧显示，靠近视口右边时回退到允许位置。
  // 窄屏高度也夹取，工具栏滚到最后一项不会把名称放在窗口之外。
  // 先隐藏再延迟显示，位置更新不会播放从旧按钮飞来的动画。
  const show=(immediate=false)=>{ clear(); const r=ref.current?.getBoundingClientRect(); if(!r) return; setTip({x:Math.max(8,Math.min(r.right+8,innerWidth-160)),y:Math.max(20,Math.min(r.top+r.height/2,innerHeight-24))}); setVisible(immediate); timer.current=setTimeout(()=>setVisible(!immediate),immediate?1300:230); };
  // 离开立即转入淡出，保留 portal 让浏览器完成 120ms 透明度过渡。
  // 下次进入重测位置，不把滚动前的坐标缓存为新工具提示。
  // 失焦只关闭说明文字，不清掉用户刚选择的工具状态。
  const hide=()=>{ clear(); setVisible(false); };
  return <><button ref={ref} type="button" data-mask-mode={mode} aria-label={name} aria-pressed={selected} disabled={disabled} onPointerEnter={()=>show()} onPointerLeave={hide} onFocus={()=>show()} onBlur={hide} onClick={()=>{onClick();show(true);}} className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30 [&>svg]:h-[18px] [&>svg]:w-[18px]',selected&&'bg-accent text-accent-text')}>{children}</button>{tip&&createPortal(<span role="tooltip" aria-hidden={!visible} data-mask-tool-tip data-visible={visible} style={{left:tip.x,top:tip.y}} className={cn('pointer-events-none fixed z-[130] flex h-8 w-36 -translate-y-1/2 items-center rounded-md border border-border bg-popover px-2 text-xs text-popover-foreground shadow-md transition-[opacity,transform] duration-150 motion-reduce:translate-x-0 motion-reduce:transition-none',visible?'translate-x-0 opacity-100':'-translate-x-2 opacity-0')}>{name}</span>,document.body)}</>;
}
