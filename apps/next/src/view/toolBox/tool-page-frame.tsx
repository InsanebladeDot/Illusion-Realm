"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@/i18n";
import { ThemeToggle } from "@/components/theme-toggle";

// 普通工具沿用返回栏和整页滚动，不能因视频工作区迁移改变 GIF 的导出布局。
// workspace 像把同一房间交给工作台：只提供可用尺寸，内部各区自己分配滚动。
// 该模式省去重复返回栏，返回入口由项目工作栏承载，应用导航仍归 AppShell。
// 不读取路由猜测模式，其他调用方保持默认就能获得原有行为。
// 两种模式都复用当前 tools/layout 中唯一的 AppShell，不再嵌套标题栏。
// workspace 不拥有项目数据、导入动作或文件权限，只负责宿主几何。
// h-full 从实际父容器继承，不通过窗口宽度减导航常量计算。
// min-h-0 允许子区收缩；溢出策略由工作区内部明确承担。
// 新参数可选，已有调用不必修改，普通模式的 padding 与 ThemeToggle 保持原样。
export function ToolPageFrame({ children, mode = "page" }: { children: React.ReactNode; mode?: "page" | "workspace" }) {
  // 只有明确选择 workspace 才切换布局，不能把所有视频/GIF 页一起改成无滚动。
  // 标记供几何回归区分两种宿主，避免仅靠组件名判断展示模式。
  // overscroll 的隔离交给编辑器，外壳只阻止再生成一个纵向滚动条。
  // 子区卸载无需持久化布局，本轮没有为演示工程创建用户文档字段。
  return mode === "workspace" ? <div data-tool-workspace className="h-full min-h-0 min-w-0 overflow-hidden text-foreground">{children}</div> : <ToolPageContent>{children}</ToolPageContent>;
}

// 原普通页的 DOM 和 class 原样保留，让 GIF 的表单、进度与结果继续在内容区滚动。
// 返回工具箱的链接仍是 Next Link，不改成手动关闭工作区或清空工具状态。
// 拆出的组件只承载原布局，不把业务 hook 搬入公共工具页框架。
// workspace 分支不挂载它，避免产生看不见却可以 Tab 到的返回按钮。
// 独立订阅语言保证普通页切换语言后返回文字及时更新。
// ThemeToggle 继续使用现有系统主题链路，不给视频新建主题状态。
function ToolPageContent({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return <div className="flex h-full min-h-0 min-w-0 flex-col p-3 text-foreground sm:p-5 lg:p-6">
    {/* 界面：返回工具箱；每个工具独立展示 */}
    <div className="mb-3 flex shrink-0 items-center justify-between gap-2"><Link href="/tools" className="inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"><ArrowLeft size={14} />{t("toolBox.main.back")}</Link><ThemeToggle /></div>
    <div className="min-h-0 flex-1 overflow-auto">{children}</div>
  </div>;
}
