"use client";

// 首页只挂载原版，导航与窗口边界继续由外层 AppShell 管理。
// 不再保留模板选择状态，刷新页面也不会重新进入已移除的预览页。
// 直接复用 HomeHero，避免再复制背景、创作入口或页面跳转逻辑。
import { HomeHero } from "@/view/home/HomeHero";

export function HomePage() {
  // main：原版首页是唯一内容，入口不添加额外滚动层或浮动切换按钮。
  return <HomeHero />;
}
