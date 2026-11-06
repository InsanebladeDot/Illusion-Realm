"use client";

/**
 * Agent 模型弹窗的布局与焦点管理：订阅 main 几何并在关闭时恢复焦点。
 * ResizeObserver、resize、visibilitychange 都只作通知，快照重新读取实际边界。
 * 不使用页面 rAF 等待，offscreen 或窗口遮挡不会导致生命周期无法完成。
 * 本 hook 不选择模型、不保存偏好，也不获取任何 API Key。
 */
import { useEffect, type RefObject } from 'react';
// 几何测量复用公共 hook，原有 Agent 焦点生命周期继续独立保留。
// 提取只改变代码位置，订阅事件、快照和清理规则与原实现一致。
import { useAppMainInset } from '@/hooks/use-app-main-inset';
/**
 * 焦点生命周期独立于目录更新：价格返回或搜索不应重新聚焦输入框。
 * 定时器只等待 portal 挂载，不使用不可见窗口会暂停的 rAF。
 * DOM 查询以弹窗为边界，不把应用导航按钮加入循环。
 * 原焦点被保存为元素引用，关闭时恢复到打开此窗口的那个按钮。
 */
function usePickerFocus(search: RefObject<HTMLInputElement | null>) {
  // 只有点击入口后的实例会调用此 hook，不在整个 Agent 页面常驻监听 Tab。
  // 保存的 previous 元素是实际触发入口，而不是通过选择器猜“第一个模型按钮”。
  // setTimeout 为 portal 创建节点留一次有限等待，不等待网络目录返回。
  // 搜索输入存在时优先聚焦，用户打开即可打字筛选当前站点。
  // 查询按钮排除 disabled，保存中不会把焦点移到不能操作的 card。
  // a[href] 包含价目外链，键盘用户也可核对公开来源。
  // 只在越过首尾边界时 preventDefault，中间控件保持浏览器正常 Tab 次序。
  // Shift+Tab 从首项跳到末项，正向 Tab 从末项回到首项。
  // 没有可聚焦项时可选链安全退出，不因空列表抛出错误。
  // 本监听不处理 Escape，关闭继续由共享 ResourceDialogShell 负责。
  // 文档级监听在 cleanup 移除，离开路由不会把键盘永远锁在旧弹窗。
  // 定时器也清理，快速打开后关闭不能在卸载后又把焦点拉回不存在的输入。
  // 恢复前检查 HTMLElement，服务端或非元素的 activeElement 不当作按钮调用。
  useEffect(() => {
    const previous = document.activeElement; const timer = setTimeout(() => search.current?.focus(), 0);
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = [...(search.current?.closest('[role=dialog]')?.querySelectorAll<HTMLElement>('button:not([disabled]),input,a[href]') || [])];
      const index = items.indexOf(document.activeElement as HTMLElement); const next = event.shiftKey ? index - 1 : index + 1;
      if (next < 0 || next >= items.length) { event.preventDefault(); items[event.shiftKey ? items.length - 1 : 0]?.focus(); }
    }; document.addEventListener('keydown', keydown);
    return () => { clearTimeout(timer); document.removeEventListener('keydown', keydown); if (previous instanceof HTMLElement) previous.focus(); };
  }, [search]);
}

/**
 * 同一组件实例的 ref 稳定，普通搜索与目录刷新不会重复安装焦点监听。
 * Portal 已由外壳确保 hydration 后渲染，服务端快照仍返回零以避免访问 DOM。
 * compactLeft 只供窄屏外壳使用，不影响宽屏居中弹窗的位置。
 */
export function useAgentModelDialog(search: RefObject<HTMLInputElement | null>) {
  // 焦点和边界是两种生命周期：搜索草稿更新不重置焦点，几何事件仍可同步对齐。
  // 服务端快照不读 document，避免静态导出阶段出现浏览器全局对象错误。
  // 客户端 snapshot 在提交前复核，使首个紧凑布局不沿用旧 220px 导航宽度。
  // 返回值不含 DOM 元素，调用者只需把数值传给共享外壳的 compactLeft。
  // 无需在每个模型 card 注册 observer，几何只取 main 一个来源。
  // 窄屏转宽屏时仍保留订阅，外壳分支决定是否使用该数值。
  // 返回 null 不在此契约内，外壳不会把桌面读值误当成创建页宿主对象。
  // 关闭弹窗会卸载 hook，全部观察器、事件和待执行焦点定时器一起释放。
  usePickerFocus(search);
  return useAppMainInset();
}
