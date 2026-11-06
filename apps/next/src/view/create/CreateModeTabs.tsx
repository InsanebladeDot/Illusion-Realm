"use client";

// 创建模式条沿用原有 CreateMode 状态，只把可见标签对齐用户给定的离线原型。
// 图标来自现有 lucide-react，不依赖原型的运行时 SVG 替换脚本。
// 标签文案继续走 i18n，切换语言时仍由同一份业务模式 id 确定选中项。
// 公共 IconTabButton 仍供素材分类使用，创建页外观覆盖限定在自己的 data 标记下。
// 本组件不提交生成任务，也不在标签切换时重置表单、队列或输出目录。
// 参考来源是 docs/待办/资源/anime-create/index.html 的 mode-tabs。
// 55px容器与32px按钮高度由 workspace-shell.css 统一约束。
// 创建页使用 data-create-mode-tabs 限定覆盖范围，公共按钮仍可被其他页面复用。
// 选中底色和底部细线都读取 aria-selected，切换语言不会影响判断。
// tablist 的可访问名称使用导航中的创建词条，避免新增硬编码中文。
// 图片、视频与编辑保留原有图标，Role TTS 使用麦克风图标。
// 角色入口按需求移除，其他使用旧类型的模块仍可兼容编译。
// 编辑仍映射 edit，现有蒙版编辑器继续接收同一回调。
// Role TTS 保持原业务入口，水平不足时通过模式条滚动访问。
// 去掉 NEW 数据后不再显示徽标，避免它占用参考图没有预留的宽度。
// 模式条 shrink-0 保证长表单滚动时不会把顶部55px压成更小高度。

import {
  Image,
  Mic,
  Video,
  SquarePen,
} from "lucide-react";
import type { CreateMode } from "@/types/createMode";
import { useTranslation, type MessageKey } from "@/i18n";
import { THIN_DIVIDER_CLASS } from "@/utils/layout";
import { IconTabButton } from "@/components/icon-tab-button";
import { cn } from "@/utils/cn";

type CreateModeTabsProps = {
  value: CreateMode;
  onChange: (mode: CreateMode) => void;
};

/** 模块作用域拿不到 hook：标签存**词条 key**，渲染时再 `t()` 取文案 */
const TABS: Array<{
  id: CreateMode;
  label: MessageKey;
  icon: typeof Image;
  badge?: string;
}> = [
  { id: "image", label: "create.createModeTabs.image", icon: Image },
  { id: "video", label: "create.createModeTabs.video", icon: Video },
  // 编辑继续使用原有模式 id，Role TTS 接入真实的 MiniMax 音频能力。
  // 编辑继续进入现有蒙版面板，不再显示翻唱占位入口。
  // NEW 角标在参考图中不存在，移除它避免窄标签被额外徽标撑宽。
  { id: "edit", label: "create.workspace.edit", icon: SquarePen },
  // 创建页移除「角色」入口，保留 Role TTS 承载 MiniMax 音频工作流。
  // 历史 roleCover 类型暂不删除，避免影响其他仍引用旧类型的代码。
  // 模式条不暴露翻唱占位页，也不把 Role TTS 重命名为另一个模式 id。
  { id: "roleTts", label: "create.createModeTabs.roleTts", icon: Mic },
];

export function CreateModeTabs({ value, onChange }: CreateModeTabsProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "sticky top-0 z-10 shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        THIN_DIVIDER_CLASS
      )}
    >
      {/* 界面：固定高度的创建模式条，选中底色与下划线按原型呈现。 */}
      {/* role 和 aria-selected 提供实际选中状态，样式不再猜测共用按钮的类名。 */}
      {/* 溢出只在水平方向滚动，不增加模式条高度；缩放下仍保留所有业务入口。 */}
      <div data-create-mode-tabs role="tablist" aria-label={t("nav.create")} className="flex shrink-0 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* 界面：创建模式标签，与参考素材分类共用图标标签按钮。 */}
        {TABS.map((tab) => (
            <IconTabButton
              key={tab.id}
              // 真正的选中值提供给样式与辅助技术，不依赖显示文字判断模式。
              // role 与 tablist 对应，图片、视频、编辑和 TTS 共用同一约定。
              // 标签保持原 onChange 回调，业务面板不使用原型的假数据实现。
              role="tab" aria-selected={value === tab.id}
              active={value === tab.id}
              icon={tab.icon}
              label={t(tab.label)}
              onClick={() => onChange(tab.id)}
              trailing={tab.badge && (
                <span className="rounded bg-red-500/10 px-1 text-[8px] font-bold leading-normal text-red-600 dark:text-red-400">
                  {tab.badge}
                </span>
              )}
            />
        ))}
      </div>
    </div>
  );
}
