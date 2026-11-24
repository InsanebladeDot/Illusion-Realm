"use client";

/**
 * 弹窗首次打开前不挂载内容，打开过以后保留原组件自己的关闭与草稿规则。
 * children 可以是动态组件，未返回它之前不会启动该组件的模块加载。
 * 像还没借用的工具留在柜里，借过的工具再按原有流程收纳。
 * 不渲染新 DOM、不改变 Portal 宿主，不复制弹窗的焦点或关闭逻辑。
 * 首次加载期间仍由动态组件自己的加载边界负责，不制造假内容。
 * open 继续交给原弹窗，保留已有 Escape、焦点返回和 main 子页规则。
 * 组件身份由调用方稳定的 key 决定，各资料库不会共享选择草稿。
 * 上层卸载时正常释放全部内容，没有全局常驻的隐藏弹窗缓存。
 */
import { useState, type ReactNode } from "react";

// 渲染期只把“从未用过”推进为“已使用”，不会在 effect 里级联设置状态。
// React 在提交前重试当前组件，第一次 open 就能显示实际加载中的弹窗。
// 从 true 关闭不会退回 false，避免重开时丢失原来允许保留的展示偏好。
// 本组件只延后挂载，不决定业务是否重置；搜索与选择仍由原弹窗处理。
// children 没有额外克隆，原 props、回调和组件 key 均原样保留。
// 如果父工作区暂时隐藏，生命周期继续服从原工作区而不是这里另建策略。
// 服务端 open=false 时不访问浏览器或 Electron，仍满足静态导出约束。
// 对已经打开过的实例，不以 CSS 隐藏整套业务来替代原来的关闭协议。
// 父组件的 open 仍是唯一可见性来源，visited 不会擅自打开弹窗。
export function DeferredDialog({ open, children }: { open: boolean; children: ReactNode }) {
  const [visited, setVisited] = useState(open);
  if (open && !visited) setVisited(true);
  return visited || open ? children : null;
}
