"use client";

// 该 hook 把弹层组件接入创建页的主区域视图栈，不管理弹层自身的业务数据。
// 非创建路由没有宿主，调用组件继续把 portal 挂到 body，兼容原有页面级弹窗。
// 打开条件由调用者传入；资源页可等 hydration，常驻工具则跟随自身 open 状态。
// useLayoutEffect 在绘制前登记/清理，避免先看见创建表单又跳到工具页的一帧闪烁。
// 单栏时页面入栈并隐藏表单；至少两栏宽度时资源恢复原有弹窗。
// 嵌套资源页只显示栈顶；底层页面继续挂载，因此选择草稿、滚动和筛选不必重新初始化。
// 关闭页面按实例 id 移除，而不是无条件 pop，防止子页面先卸载时误删当前栈顶。
// 返回 host 是调用者选择 portal 目标的依据；没有 open 时强制返回 null。
// open 表示调用方允许展示，不表示资源已经加载成功；加载态同样属于工具页。
// host 的有无是能力判断，避免用 pathname 字符串把共享组件耦合到具体 URL。
// active 只表示本实例是否位于栈顶，不负责关闭被隐藏的父页。
// 调用方必须将 active 用于隐藏底层页面，否则两个 portal 会争用宿主高度。
// 底层页面还应暂停 Escape 监听，防止同一次按键关闭两个选择层级。
// id 在组件存活期间稳定；卸载后重新打开会登记新实例，不复用旧草稿身份。
// 此 hook 不提供 onConfirm，资源库仍拥有草稿与最终业务值之间的提交边界。
// useLayoutEffect 内的更新同步触发父层切换，不依赖可能被遮挡暂停的 rAF。
// 没有异步等待、网络请求或计时器，因此不需要为退栈额外维护取消标志。
// effect 清理捕获的是本次登记的 id，后续页面切换不会误删新实例。
// 宿主为空的共享弹窗仍可打开，但不会向创建页状态栈写入任何登记。
// host 重新提供后 effect 会重新登记；不能把首次读到 null 当作永久不支持主区。
// open 改为 false 时返回 null，调用方按自身关闭条件停止渲染内容。
// 栈顶变化只改变 active，不重新执行登记 effect，避免底层页面跳回栈顶。
// enter 与 leave 不依赖栈顶值，这也是将 top 排除出 effect 依赖的原因。
// store 订阅分别读取 host、top 和稳定 action，资源草稿变化不会影响这份登记。
// 调用方仍应遵守 hook 无条件调用规则，在 return null 之前调用本 hook。
// 非创建页面保持原弹窗语义；本 hook 不直接修改 body 滚动锁或焦点。
import { useCallback, useId, useLayoutEffect, useSyncExternalStore } from "react";
import { useCreateMainPageStore } from "@/stores/use-create-main-page-store";

// 创建区始终保留的父容器才是可用宽度来源，隐藏后的表单本身宽度会变成零。
// ResizeObserver 负责通知，snapshot 每次重新读取尺寸，不采信可能过期的事件载荷。
// resize 与恢复可见也触发读取，兼容窗口遮挡期间观察通知延迟的情况。
// useSyncExternalStore 在提交前检查快照，打开工具首帧就采用当前尺寸。
// SSR 没有宿主时返回零；资源组件仍按各自 hydration 条件决定何时绘制。
// 宿主变化时清理旧观察器和事件，不能把上一创建页的 DOM 留在监听闭包里。
// 两栏阈值沿用 useCreateLayout 的 760px，导航展开导致主区缩窄也会生效。
// 此处不保存资源草稿，不因宽度切换而重新创建业务组件。
function useCanShowCreateDialog(host: HTMLDivElement | null) {
  const subscribe = useCallback((notify: () => void) => {
    const element = host?.parentElement;
    if (!element) return () => {};
    const observer = new ResizeObserver(notify);
    observer.observe(element);
    window.addEventListener("resize", notify); document.addEventListener("visibilitychange", notify);
    return () => { observer.disconnect(); window.removeEventListener("resize", notify); document.removeEventListener("visibilitychange", notify); };
  }, [host]);
  // 读的是正常流父区域，不读被隐藏的工作区或浮在 body 上的对话框。
  // 返回布尔值作为稳定快照，尺寸变化但未跨断点时不重复提交 React。
  // 外部页面没有创建宿主，因此保留既有弹窗的视口判断方式。
  return useSyncExternalStore(subscribe, () => (host?.parentElement?.getBoundingClientRect().width ?? 0) >= 760, () => false);
}

// responsive 用于工具/资源选择；page 用于图片详情，始终替换创建展示区域。
// 两种策略只决定宿主，调用方原有确认、取消和数据读取均保持在原组件。
// 非创建路由没有宿主，两种策略都回到原有 body portal。
export function useCreateMainPage(open: boolean, presentation: "responsive" | "page" = "responsive") {
  // React 实例 id 不依赖标题文本，两个同名分类页也能独立进出栈。
  const id = useId();
  // 宿主由创建页父组件提供；页面切换或卸载时 callback ref 会更新这个值。
  const host = useCreateMainPageStore((state) => state.host);
  // 宽度从正常父区域读取，选择页面隐藏表单后仍能持续响应窗口及 nav 变化。
  // page 策略不受宽度影响，修复图片详情只遮盖表单一部分的情况。
  // 响应式分支返回 null 时不登记主区栈，宽屏表单保持可见。
  const canShowDialog = useCanShowCreateDialog(host);
  const pageHost = presentation === "page" || !canShowDialog ? host : null;
  // 只读取栈顶，底层页面仍挂载但不会显示，因而取消上层可回到原筛选位置。
  const top = useCreateMainPageStore((state) => state.pages.at(-1));
  // enter/leave 是稳定 store action；实例更新不会使 effect 清理并重复入栈。
  const enter = useCreateMainPageStore((state) => state.enter);
  const leave = useCreateMainPageStore((state) => state.leave);
  // 仅登记已打开且有宿主的实例；关闭的常驻组件不影响创建工作区可见性。
  // effect 返回清理函数是关闭和卸载的共同路径，避免只处理按钮点击而遗漏路由离开。
  // Strict Mode 会重放 effect；去重 action 与按 id 清理使重复 setup/cleanup 可逆。
  // host 变化触发旧实例清理，创建路由退出后不会在 document.body 留下工具节点。
  // 清理只移除本页 id，不清空其他嵌套页面；宿主卸载才由父组件整体清空页面栈。
  // 子页不复制资源数据，确认与取消仍调用来源组件既有的 onOpenChange/onConfirm。
  // 当页面不是栈顶时 active 为 false，外壳隐藏它并停用其 Escape/滚动锁副作用。
  // 此 hook 不捕获异常：所有副作用仅为同步 store 更新，页面加载错误由 React 边界处理。
  useLayoutEffect(() => {
    if (!open || !pageHost) return;
    enter(id);
    return () => leave(id);
  }, [enter, pageHost, id, leave, open]);
  // inCreate 区分“创建宽屏弹窗”和“其他路由”，避免视口规则又强行改回紧凑页。
  // active 只在主区页栈中生效；宽屏弹窗仍由其原先的层级与关闭流程管理。
  // open=false 时不提供宿主，保持常驻但已关闭组件不会绘制隐藏页面的契约。
  return { host: open ? pageHost : null, active: top === id, inCreate: Boolean(host) };
}
