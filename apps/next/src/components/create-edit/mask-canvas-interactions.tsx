"use client";
/**
 * 画布局部快捷键与选区右键菜单；焦点不在编辑器内时不拦截按键。
 * 复用项目菜单的视口避让、Portal 与外部点击关闭机制。
 * 不向 window 安装全局 Delete，避免提示词正在输入时误删图片。
 */
import { useState, type KeyboardEvent, type MouseEvent, type RefObject } from 'react';
// 蒙版菜单宽度现在与创建图片右键绑定，画布几何和指针坐标不参与菜单尺寸。
// 宽度常量只用于Portal浮层，不会影响蒙版图像的真实导出像素。
// 此前已有的Escape、Delete与选区处理仍由本文件持有，不移到公共行里。
// 外壳负责滚动和越界定位，画布交互只报告client坐标和关闭意图。
// 菜单项结束后调用close，避免一个旧选区动作继续留在下一次选区上方。
// 这次没有扩展任何preload接口，右键菜单仅复用渲染组件。
import { CONTEXT_MENU_SIZE_CLASS } from '@/components/context-menu-item';
import { ContextMenuShell } from '@/components/context-menu-shell';
import { useMaskWorkspaceStore } from '@/stores/use-mask-workspace-store';
import { useTranslation } from '@/i18n';
import { MaskSelectionActions } from './mask-selection-actions';

// contenteditable 的子节点也要识别，不能只查 event.target 自身属性。
// 对话框/菜单里的键盘由其宿主管理，不把文本删除传进画布。
// 最小过滤覆盖普通输入、数字框、下拉与可编辑文字容器。
function isTextTarget(target:EventTarget|null):boolean { return target instanceof Element&&Boolean(target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="dialog"],[role="menu"]')); }

// Escape 可以中断未完成轮廓；Delete 只接受已完成的有效选区。
// Ctrl/Cmd+Shift+I 仅在画布焦点内反选，不抢应用其他页面快捷键。
// locked/只读/busy 均不允许写入，右键菜单也沿用同一条件。
// 菜单坐标是 client 像素，ContextMenuShell 自动处理窗口四边。
// 关闭后恢复 stage 焦点，用户可继续按 Delete 而不必重新点图像。
// 焦点移动不滚动画布，避免菜单关闭时图像突然跳动。
// 右键不开始画笔，主按钮守卫仍由原 pointer hook 执行。
// React Portal 事件仍可能冒泡到所属树，因此文本过滤包含菜单祖先。
// 打开菜单不更改当前选区，也不自动将点击点加入套索轨迹。
// 用户可在无选区时看到禁用项，执行层也以 null 为 no-op 再次守卫。
// 本地菜单坐标只存在组件内，换图片不需要序列化桌面坐标。
// Escape 不写入硬盘，不等价于恢复已保存图像或退出生成队列。
// key.toLowerCase 只用于字母快捷键，兼容 Shift 导致的大小写变化。
// Meta 与 Control 分支并列，macOS 与 Windows 使用相同反选动作。
// 快捷键命中才 preventDefault，不吞没有选择时的普通 Delete。
// 运行任务持有冻结 PNG，局部交互禁用保证用户不会误认为仍在修改本次输入。
// 不在菜单关闭时执行 onKeyDown，恢复焦点与像素动作严格分开。
// 关闭函数在事件发生时读 ref，避免手工 memo 依赖错误固定旧 DOM。
// stage 引用为空是正常卸载状态，关闭菜单时安全跳过 focus。
// 图片放大镜只改变展示矩阵，快捷键仍交给自然坐标选区执行。
// UI 中所有名称由 i18n 提供，不把底层 canvas 错误堆栈写入提示。
export function useMaskCanvasInteractions(stage:RefObject<HTMLDivElement|null>,locked:boolean) {
  const [menu,setMenu]=useState<{x:number;y:number}|null>(null), {t}=useTranslation();
  const close=()=>{setMenu(null);stage.current?.focus({preventScroll:true});};
  // 只读通道不能从快捷键绕过工具栏禁用规则。
  // 无选区 Delete 不 preventDefault，既不记历史也不吞无关输入。
  // Escape 中断后 drawing 标记阻止迟到 pointerup 重新建立选区。
  const onKeyDown=(event:KeyboardEvent<HTMLDivElement>)=>{ const state=useMaskWorkspaceStore.getState(); if(isTextTarget(event.target)||locked||state.busy||state.channel!=='painting') return; const action=event.key==='Escape'?'cancelSelection':event.key==='Delete'&&state.selection&&!state.selectionDrawing?'deleteSelection':(event.ctrlKey||event.metaKey)&&event.shiftKey&&event.key.toLowerCase()==='i'&&state.selection&&!state.selectionDrawing?'invertSelection':null; if(action){event.preventDefault();event.stopPropagation();state.action(action);} };
  // 菜单使用实际落点，顶部操作提供无右键的等价入口。
  // 无选区打开禁用项，不能回退到整图删除或浏览器默认菜单。
  // 菜单不改变当前工具，实际执行使用工作区最新选区状态。
  const onContextMenu=(event:MouseEvent<HTMLDivElement>)=>{event.preventDefault();setMenu({x:event.clientX,y:event.clientY});};
  return {onKeyDown,onContextMenu,menu:menu?<ContextMenuShell x={menu.x} y={menu.y} label={t('create.maskStudio.selectionMenu')} onClose={close} className={CONTEXT_MENU_SIZE_CLASS}><MaskSelectionActions locked={locked} menu after={close}/></ContextMenuShell>:null};
}
