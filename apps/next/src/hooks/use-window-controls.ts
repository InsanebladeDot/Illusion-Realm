"use client";

// 同步自定义 head 与系统窗口状态，通过受限 preload API 执行窗口动作。
// 初始查询与事件订阅兼顾「加载前已最大化」和后续系统快捷键变化。
// 页面不导入 Electron，不根据点击次数或视口尺寸推断最大化状态。
// 所有订阅均在effect内创建并清理，模块导入本身不注册全局监听。
import { useCallback, useEffect, useState } from "react";
import { unwrapIpc } from "@/utils/ipcResult";
// 仅类型依赖shared的schema推导结果，客户端无需加载Electron模块。
// 排除state得到用户动作，防止界面误将无副作用查询当作可点击按钮。
// 该允许集与主进程白名单相同，新增动作必须先修改共享契约。
import type { WindowControlAction } from "@illusion-realm/shared";

// 错误只记录操作类别，避免把来自原生异常的路径或堆栈写进页面日志。
// 返回布尔状态的 IPC 不携带业务数据，不会触发用户文档持久化。
// 请求失败时保留最近一次已确认状态，防止图标因失败反向切换。
// 普通浏览器不挂载控件，hook 仍兼容 electronAPI 缺失的开发预览。
export function useWindowControls() {
  // false是首帧占位而不是系统状态结论，挂载后立刻触发state查询。
  // 静态导出不能在模块求值时访问window，因此初始值保持浏览器安全。
  // 首次查询之前仍可点击按钮，真正操作根据主进程实时状态执行。
  const [maximized, setMaximized] = useState(false);
  // 订阅先于初始查询安装，避免两者之间漏掉一次系统最大化事件。
  // effect 清理会禁用未完成的查询结果，并释放 preload 事件监听。
  // StrictMode 重挂载可能产生两次 state 读取；它们没有窗口副作用。
  // 查询返回只更新当前实例，关闭窗口或 DOM 全屏不会留下旧 setState。
  // 事件版本号用于识别过期查询，晚返回的旧值不能覆盖较新的系统通知。
  useEffect(() => {
    // 不在普通浏览器尝试创建Electron兼容垫片，避免隐藏集成缺失。
    // API存在性检查位于effect，服务端预渲染不触碰全局window。
    // 这里返回undefined符合React清理约定，未注册监听时不需要disposer。
    const api = window.electronAPI; if (!api) return;
    // alive只代表本次effect生命周期，不跨组件共享，避免多个head互相取消。
    // revision只跟踪已收到的事件，不用时间戳比较不同进程时钟。
    // 两个值保留在effect闭包中，异步初始查询与清理共享同一份有效性判断。
    let alive = true, revision = 0;
    // 通知值已由 preload 校验；这里仍以真实系统事件为准。
    // 订阅回调先增加版本号再更新状态，不包含异步等待。
    // 每次事件都会使在途初始查询失效，即使值与旧值相同。
    const unsubscribe = api.onWindowMaximized(value => { revision++; if (alive) setMaximized(value); });
    // unwrapIpc让结构化失败进入catch，不把success:false当作最大化false。
    // 查询失败后仍保留事件监听，后续真实系统操作可恢复状态同步。
    // 日志不输出失败结果或error对象，避免主进程异常细节流入控制台。
    api.controlWindow("state").then(result => { if (alive && revision === 0) setMaximized(unwrapIpc(result)); }).catch(() => console.warn("[window-controls] state unavailable"));
    // 先置失效标记再取消订阅，防止清理同时到达的查询结果更新卸载组件。
    // disposer只移除当前callback，不改变其他页面的窗口状态订阅。
    // 没有在途操作需要中断，state查询是只读请求且不持有系统资源。
    return () => { alive = false; unsubscribe(); };
  }, []);
  // 动作交给主进程，不在 renderer 模拟最小化或关闭应用内容。
  // 图标由事件同步，不依赖 action Promise 的返回顺序。
  // 快速连点和系统快捷键不会让旧请求覆盖较新的状态通知。
  // close 可能销毁页面；catch 防止拒绝成为未处理 Promise。
  // 不把失败伪装为成功，不回退到未授权的原生 API。
  const control = useCallback((action: Exclude<WindowControlAction, "state">) => {
    const api = window.electronAPI; if (!api) return;
    // 这里不在请求返回时setState，避免慢请求覆盖先到达的最大化事件。
    // 异步失败有明确catch；操作成功不显示通知，以免系统按钮引入额外弹层。
    // useCallback无依赖，因为每次读取当前preload对象，不缓存窗口句柄。
    void api.controlWindow(action).then(unwrapIpc).catch(() => console.warn("[window-controls] action unavailable"));
  }, []);
  // 组件只获得布尔状态和固定动作入口，不能访问原生事件对象。
  // 最大化是 BrowserWindow 的瞬时状态，不写入用户设置。
  // head 从全屏恢复时会重新查询，不沿用卸载前的缓存。
  return { maximized, control };
}
