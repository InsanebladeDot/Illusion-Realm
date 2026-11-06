"use client";

// 界面：创建页 main 的父容器；表单与工具子页在这里交替填满同一个区域。
// 原表单只隐藏，不卸载：contenteditable 节点、生成队列和图库组件保持各自生命周期。
// portal 宿主是正常 flex 子项，不使用 fixed/absolute，不需要猜测标题栏和 nav 的尺寸。
// 宿主节点独立于隐藏的表单子树，因此来自表单内部的工具仍可以正常显示和返回。
// children 始终保留原来的 React key 和位置；宿主只接收工具 portal，不接收表单副本。
// 这里不使用条件表达式卸载 children，否则 contenteditable 的浏览器内部编辑现场会丢失。
// hidden 与卸载不同：生成订阅继续接收结果，返回时无需重新读取或重放生成任务。
// 长列表的滚动元素也继续存在，工具关闭后保留进入前的分页和选择现场。
// 该组件不创建新的 AppShell，故原窗口拖拽区和应用导航只有一个实例。
// 父层必须提供确定高度；h-full 将该高度传给工作区及工具页的内部滚动容器。
// overflow-hidden 限定内容边界；工具主体应自行滚动，不得撑开桌面窗口。
// 页栈不为空但工具数据仍在加载时，加载态也应填入宿主，不能临时展示后台表单。
// 调用方负责保留资源组件挂载，本层只保留工作区，不能替资源组件恢复已取消的草稿。
// portal 的 React 父链仍来自 children，业务回调无需跨进程或写入全局事件总线。
// 宿主引用不持久化，刷新和重新进入路由都会使用新 DOM，不缓存失效节点。
// 工具页返回不是路由后退，因此不会撤销用户在窗口外的浏览历史或其他导航。
import type { ReactNode } from "react";
import { useCreateMainPageStore } from "@/stores/use-create-main-page-store";

export function CreateMainArea({ children }: { children: ReactNode }) {
  // 页面栈只负责可见性，资源列表、确认草稿和关闭方式仍由原组件负责。
  // 页面从栈顶移除后，工作区在下一次提交中立即显示，不另存一份表单快照。
  const hasPage = useCreateMainPageStore((state) => state.pages.length > 0);
  // callback ref 让宿主在真实 DOM 进入文档后才写入 Zustand，避免挂载前创建 portal。
  // DOM 卸载时 React 传入 null，store 会同时清空页面栈，避免下一路由继承旧页面。
  const setHost = useCreateMainPageStore((state) => state.setHost);
  // 界面：返回后继续展示同一个创建工作区；隐藏状态也阻止键盘访问后台表单。
  // host 的 ref 使用 store 稳定 action；若每次渲染都创建新函数，React 会先 detach 再 attach。
  // detach 会清除页面栈并重建资源页，导致选择中的筛选和未确认草稿丢失。
  // 页面边界由 AppShell 的 main 决定；窗口缩放与 nav 展开直接交给父级 flex 布局。
  // 不在此复制导航宽度、标题栏高度或底栏高度，避免边距规则和实际布局发生漂移。
  // 子页为空时宿主 hidden，不占创建工作区的位置；栈非空时它是唯一显示的主区内容。
  // hidden 属性同时将后台编辑器移出可访问性树，但保留 React 子树和 DOM 输入节点。
  // 工具页面依旧由来源组件渲染，主区组件不读取模型、图库或用户数据。
  // 返回动作由来源组件原有的 onOpenChange 处理，状态栈只驱动父级切换。
  // 嵌套选择由栈顶决定显示层，底层选择器保留挂载状态以恢复搜索和选择草稿。
  // 两个子项都设置 min-h-0/min-w-0，确保内部独立滚动区可以收缩而不会撑破 main。
  return <div data-create-main-area className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
    {/* 界面：原创建工作区；隐藏时保留编辑器与图库状态。 */}
    <div data-create-workspace-content hidden={hasPage} className="h-full min-h-0 min-w-0">{children}</div>
    {/* 界面：资源选择与工具子页的正常文档流宿主。 */}
    <div ref={setHost} data-create-page-host hidden={!hasPage} className="h-full min-h-0 min-w-0 flex-1 overflow-hidden" />
  </div>;
}
