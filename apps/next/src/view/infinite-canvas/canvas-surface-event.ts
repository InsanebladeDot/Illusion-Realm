/** Portal 的事件会沿 React 树冒泡；只接受真正落在画布 DOM 内的操作。 */
export function isCanvasSurfaceEvent(target: EventTarget | null, host: HTMLElement | null) {
  return target instanceof Element && !!host?.contains(target)
    && !target.closest('[role="dialog"],[aria-modal="true"],[role="menu"],[role="listbox"],[data-canvas-popover]');
}
