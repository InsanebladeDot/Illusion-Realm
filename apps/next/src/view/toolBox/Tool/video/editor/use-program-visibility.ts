"use client";

// 隐藏页面像关掉放映室：不只暂停胶片，还拆下当前节目解码器。
// 再次显示时按保留的工程书签重装，播放意图不自动恢复。
// useSyncExternalStore用浏览器当前可见事实作为快照，不把事件参数当事实缓存。
// 服务端默认可见只用于静态壳，真实媒体仍只能在客户端effect装载。
import { useSyncExternalStore } from "react";

// visibilitychange是快速通知，focus与pageshow补足返回页面的重新读取机会。
// 事件都只触发读快照，重复通知不会建立多份可见性状态。
// 监听归当前订阅所有，卸载时配对移除，不残留全局回调。
// 此处没有修改工程游标或片段选择，资源暂停与编辑状态保持独立。
// 不使用window尺寸推断可见性，窗口窄和页面隐藏是不同状态。
// 真正遮挡但document仍visible时不卸载，这是浏览器可见性契约的边界。
function subscribeVisibility(notify: () => void) {
  document.addEventListener("visibilitychange", notify);
  window.addEventListener("focus", notify);
  window.addEventListener("pageshow", notify);
  return () => {
    document.removeEventListener("visibilitychange", notify);
    window.removeEventListener("focus", notify);
    window.removeEventListener("pageshow", notify);
  };
}

// false时调用方卸载所有CompositeMedia，复用原attachSource释放src与事件。
// 操作层同时移除，隐藏内容不留可聚焦按钮抢键盘路径。
// 可见后重新挂载只重新定位当前帧，不代表用户授权重新播放。
// 跨实例订阅可以共用这份机制，但每个实例持有自己的媒体表与工程书签。
export function useProgramVisibility() {
  return useSyncExternalStore(subscribeVisibility, () => !document.hidden, () => true);
}
