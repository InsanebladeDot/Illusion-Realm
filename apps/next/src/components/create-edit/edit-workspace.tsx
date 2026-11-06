"use client";

/**
 * 编辑功能分组：文字改图与既有蒙版工具平级切换，状态相互隔离。
 * 两个子树首次使用才挂载，访问后用 hidden 保留，避免切换丢失画布或指令。
 * 该组件只管理局部工具选择，不替换创建页的图片、视频或角色模式状态。
 */
import { useState } from "react";
import { Brush, FolderOpen, Sparkles, ScanLine } from "lucide-react";
import { useTranslation } from "@/i18n";
import { IconTabButton } from "@/components/icon-tab-button";
import { MaskEditorPanel } from "@/view/create/mask-editor-panel";
// 蒙版只交接透明 PNG，文字表单、模型菜单、队列和结果区全部复用。
// 导入函数拥有校验和错误处理，不在父组件手动写源 URL 或自然尺寸。
// 切到参数页后能继续编辑；导入失败时也能看到共享草稿保存的错误提示。
import { EdgeEditWorkspace } from "./edge-edit-workspace";

import { AnimaEditWorkspace } from "./anima-edit-workspace";

/**
 * 默认进入文字改图，让新编辑能力在“编辑”标签内有明确入口。
 * 蒙版首次打开前不导入素材，也不创建另一份画布实例。
 * 访问过的蒙版保持原 React 节点，返回后画笔、撤销记录与导出结果继续可用。
 * 同样保留文字改图实例，切到蒙版不会取消正在执行的文字任务。
 * 顶部标签复用 IconTabButton，与创建模式和素材分类保持相同交互习惯。
 * 文件管理回调由父组件提供，图库仍复用真实目录、多选与右键操作。
 * 不在此组件维护另一份图库列表或输出目录状态。
 * 选中状态同时通过可访问属性与视觉样式表达，不只依赖文字颜色。
 * tabpanel 使用 hidden 属性退出布局，隐藏工具不能占据展示区域宽度。
 * 两个工具都使用相同的可用高度，不叠加浮动覆盖层。
 * 顶部工具条允许换行，窄屏不会把文件管理入口挤到窗口之外。
 * 文件管理按钮不提交表单，也不改变当前工具选中值。
 * 编辑页离开后由各自的 hook 清理资源，局部切换仅改变可见性。
 */
export function EditWorkspace({ onOpenHistory }: { onOpenHistory: () => void }) {
  // 局部 tool 不写全局 createMode，普通图片/视频/角色入口仍由原父组件控制。
  // maskVisited 只从 false 变 true，已经创建的蒙版组件不会因反复点击卸载。
  // 文字编辑默认创建，保证第一次进入即有完整原图/指令/结果功能区。
  // 两个独立 panel 使用不同 id，aria-controls 可准确关联各自标签。
  // hidden 同时移除布局占位和键盘焦点，未选工具不能盖住当前内容。
  // 可见 panel 才启用 flex，避免 flex 类覆盖浏览器 hidden 的显示规则。
  // 所有 panel 沿用父展示区高度，不引入相对窗口绝对定位的覆盖层。
  // 原 MaskEditorPanel 不包装新的输入状态，其撤销、擦除和导出实现继续保留。
  // 标签切换不提交生成，也不清空已选模型或用户输入。
  // 文件管理按钮通过 onOpenHistory 通知创建页，由其替换完整 main 内容。
  // 返回编辑时父树仍挂载，两个编辑子工具均保持原 React 实例。
  // 图库的选择、九宫格与右键操作继续由原文件管理组件负责。
  // 顶部 header 只有功能级标签，不复制参考模板里的应用 nav 或标题栏。
  // flex-wrap 为窄屏留出换行空间，图库入口不与标签强抢固定宽度。
  // 共享 IconTabButton 保持图标尺寸和文字密度，不使用系统默认 tab 外观。
  const { t } = useTranslation(), [tool, setTool] = useState<"text" | "mask" | "edge">("text"), [maskVisited, setMaskVisited] = useState(false), [edgeVisited, setEdgeVisited] = useState(false);
  // 蒙版和边缘页直接显示共享参数侧栏，无需导出后切回文字编辑。
  // 已访问面板保留实例，工具切换不清空文档或当前转换。
  // 公共生成会话仍跨工具共享，任何入口都能看到真实任务状态。
  return <div data-edit-workspace className="flex min-h-0 min-w-0 flex-1 flex-col"><header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/70 px-2"><div role="tablist" aria-label={t("create.workspace.edit")} className="flex min-w-0 flex-1"><IconTabButton id="anima-edit-tab" role="tab" aria-controls="anima-edit-panel" aria-selected={tool === "text"} active={tool === "text"} icon={Sparkles} label={t("create.animaEdit.textTab")} onClick={() => setTool("text")} /><IconTabButton id="mask-edit-tab" role="tab" aria-controls="mask-edit-panel" aria-selected={tool === "mask"} active={tool === "mask"} icon={Brush} label={t("create.animaEdit.maskTab")} onClick={() => { setMaskVisited(true); setTool("mask"); }} /><IconTabButton id="edge-edit-tab" role="tab" aria-controls="edge-edit-panel" aria-selected={tool === "edge"} active={tool === "edge"} icon={ScanLine} label={t("create.maskStudio.edgeTab")} onClick={() => { setEdgeVisited(true); setTool("edge"); }} /></div><button data-edit-history type="button" onClick={onOpenHistory} className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><FolderOpen className="h-4 w-4" />{t("create.workspace.files")}</button></header>
    {/* 界面：文字改图与蒙版都由父展示区承载，仅当前工具参与正常布局。 */}
    <div id="anima-edit-panel" role="tabpanel" aria-labelledby="anima-edit-tab" hidden={tool !== "text"} className="min-h-0 flex-1 [&:not([hidden])]:flex"><AnimaEditWorkspace /></div>
    {/* 界面：保留原始蒙版导入、涂抹、擦除、撤销、导出与上传验证功能。 */}
    {/* 界面：导出后可交接到共享生成表单，原画布与历史仍保持挂载。 */}
    {maskVisited && <div id="mask-edit-panel" role="tabpanel" aria-labelledby="mask-edit-tab" hidden={tool !== "mask"} className="min-h-0 flex-1 [&:not([hidden])]:flex"><MaskEditorPanel /></div>}
    {/* 界面：边缘绘画先完成 Canny 转换，再提交转换结果。 */}
    {edgeVisited && <div id="edge-edit-panel" role="tabpanel" aria-labelledby="edge-edit-tab" hidden={tool !== "edge"} className="min-h-0 flex-1 [&:not([hidden])]:flex"><EdgeEditWorkspace /></div>}
  </div>;
}
