"use client";
// 应用主区的水平边界：给挂到 body 的紧凑资源弹窗提供实际 left。
// 复用 Agent 已有的 observer 与快照读取机制，不让模型库复制导航宽度常量。
// 像给不同展台共用一把尺子：只量主区外边缘，不拥有展台内容和焦点。
// 返回 CSS 像素，与 ResourceDialogShell 的 compactLeft 保持同一单位。
import { useSyncExternalStore } from "react";
/**
 * 窄导航宽度由 CSS 决定，不能继续使用旧的 220px 常量定位 Agent 弹窗。
 * ResizeObserver 只是通知；每次 snapshot 重新读 main 边界，符合项目视口约定。
 * nav 展开、窗口 resize 和恢复可见都能触发读取，事件不携带可信几何数据。
 * Portal 挂到 body 后仍对齐 main，避免左侧露出一条可交互的聊天内容。
 * 订阅释放 observer 和 DOM 事件；关闭弹窗后不保留布局监听。
 */
function subscribeMainInset(notify: () => void) {
  // main 是应用长期存在的右下区域，不能测量弹窗自身再反推边界。
  // 左侧 nav 的 CSS 宽度更新会改变 main 几何，observer 负责触发重新读取。
  // visibilitychange 也当通知，弥补窗口遮挡期间可能延迟的布局事件。
  // resize 回调不读取 event.width，快照读取始终使用当前 DOM。
  // observer 只观察一个主容器，不扫描所有卡片，长目录不会扩大监听数量。
  // 缺少主容器的开发网页仍可挂载，不把 null 传给 ResizeObserver.observe。
  // 注册完成后 useSyncExternalStore 会检查 snapshot，不依赖下一次 resize 才对齐。
  // 清理捕获的是本次 observer 和 notify，不移除其他弹窗的监听。
  // 不绑定 scroll，因为 main 的水平固定边界不随消息内容滚动。
  // 当前布局变化只有宽度和显示状态，不需要轮询 DOM 或常驻 setInterval。
  const main = document.querySelector('[data-app-main]'); const observer = new ResizeObserver(notify);
  if (main) observer.observe(main); window.addEventListener('resize', notify); document.addEventListener('visibilitychange', notify);
  return () => { observer.disconnect(); window.removeEventListener('resize', notify); document.removeEventListener('visibilitychange', notify); };
}
// snapshot 返回基础数值，不能每次构造新对象导致 useSyncExternalStore 不断重绘。
// 读取失败回到零只服务没有桌面 nav 的浏览器场景，正常桌面使用实际 main。
// 页面级 SSR 不触碰 document；此函数仅由 hydration 后的订阅调用。
function readMainInset() { return document.querySelector('[data-app-main]')?.getBoundingClientRect().left || 0; }
// left 的单位是 CSS 像素，与共享外壳的 inline left 数值语义相同。
// 显示缩放由浏览器几何处理，不再乘 devicePixelRatio。
// 用 main 的外框边缘而不是内部内容 padding，避免多留一条聊天缝隙。
// 0 是移动端无 nav 时的合法值，不当作读取失败必须加上历史导航常量。
// 返回基础 number 使外部存储快照能稳定比较，不每次创建新对象。
// 即使主题改变颜色，该几何读值未变化时也不会触发无谓重绘。
// 该读取不写入样式，不会制造 ResizeObserver 的循环反馈。

// 服务端阶段不读取 document，静态导出先返回零；Portal 仍由原外壳水合后挂载。
// 挂载时读取当前边界，不等待下一次 resize 才得到正确位置。
// 搜索输入与模型更新都不会重新安装订阅，几何变化才使快照数值改变。
// 关闭调用方后释放 observer 和事件，不建立页面常驻轮询。
// 浏览器缩放已经体现在 rect.left 中，不能再次乘 DPR。
export function useAppMainInset() { return useSyncExternalStore(subscribeMainInset, readMainInset, () => 0); }
