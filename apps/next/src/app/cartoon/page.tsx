// 保留旧书签入口，重定向到唯一正式工具页。
// 不恢复已移除的旧素材设置界面，也不复制AppShell。
// 跳转复用已有ToolRouteRedirect，与其他历史工具入口保持一致。
// 重定向后的状态只由漫画工具维护，此处没有独立草稿。
// 不改变漫画分镜/comic的兼容入口，两种业务仍分开。
// 桌面app协议与普通浏览器均使用同一条Next客户端跳转。
import { ToolRouteRedirect } from "@/components/tool-route-redirect";

export default function Page() {
  return <ToolRouteRedirect href="/tools/image/cartoon" />;
}
