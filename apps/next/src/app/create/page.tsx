import { AppShell } from "@/components/AppShell";
import { CreatePage } from "@/view/CreatePage";
// 创建页路由在 AppShell 内提供唯一的主区宿主。
// 宿主负责创建工作区与工具页的可见性，不承担资源选择或生成状态。
// 包装只用于 /create，其他路由的共享资源外壳继续使用原 body 弹窗。
// CreatePage 保持挂载，使提示词 DOM、队列和图库状态在工具返回后继续存在。
// AppShell 继续管理 nav、窗口标题栏与状态栏，不把工具页移到全窗口覆盖层。
// 工具内容经 portal 进入正常流宿主，父容器边距始终由 AppShell 一处定义。
// 此处不改路由或 URL，打开工具不会触发创建页卸载或浏览历史跳转。
import { CreateMainArea } from "@/components/create-main-area";

export default function Page() {
  return (
    <AppShell fillViewport>
      {/* main：父组件在创建工作区与工具子页之间切换，返回时保留原表单。 */}
      <CreateMainArea><CreatePage /></CreateMainArea>
    </AppShell>
  );
}
