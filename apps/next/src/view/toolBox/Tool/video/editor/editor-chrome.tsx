"use client";

// 项目栏、只读信息条与暂未接通的动作共享展示入口，边界不延伸至媒体业务。
// 同一个禁用按钮服务项目、预览、属性和时间轴，不在各区复制禁用样式。
// 现有 SimpleSelect 没有 disabled 契约，此阶段不改公共选择器冒充可用下拉。
// 原应用导航和窗口控制继续由 AppShell 管理，内部只有项目层级的操作。
import Link from "next/link";
// Lucide 图标继续沿用应用现有依赖，不为骨架新增工具栏图标包。
// Icon 的类型限制为 LucideIcon，调用方无法传任意字符串拼接成不安全标签。
// 同尺寸图标共享 class，预览按钮不需要单独写另一套禁用状态。
import { ArrowLeft, ArrowUpRight, FileVideo, Undo2, Redo2, Upload } from "lucide-react";
// 所有可见标签和禁用原因通过当前双语词条读取，切换语言不会保留旧提示。
// DEMO_PROJECT 仅提供帧率、宽高等只读值，不触发真实项目存取。
// CSS Module 约束本页几何，避免污染 GIF 的相同 button/header 标签。
import { useTranslation } from "@/i18n";
import { DEMO_PROJECT } from "./editor-demo";
import type { TimelineInteraction } from "./use-live-timeline";
import styles from "./editor.module.css";
import { formatEditorTimecode } from "./editor-timecode";

// 重新导出既有名称以保留项目栏和时间轴调用方，唯一实现位于 editor-controls。
// 新 UI 回调只注入纯界面动作，没有回调的旧业务入口继续禁用。
// 相同参数契约同时服务正式工作区和独立状态样板。
export { EditorAction } from "./editor-controls";
// re-export 保留旧调用路径，避免为了提取控件批量改写四个区域的 import。
// 单一实现保证修复焦点圈后项目栏、预览和时间轴同时生效。
// ProjectToolbar 自己也从新实现导入，不留一份同名旧函数造成假复用。
// 状态样板链接与业务动作不同，它是真实可用导航，不归默认禁用集合。
// 不把导航传入 EditorAction 的空回调，保留链接可复制和键盘打开语义。
// 样板页仍使用上级 AppShell，不通过新窗口或透明覆盖层显示。
// 原 legacy 链接保留，用户仍可回到真实旧版工具能力。
// 导出按钮的 accent 只表达视觉层级，未接回调就继续禁用。
import { EditorAction } from "./editor-controls";

// R01 项目工作栏：文件/编辑/视图只做禁用入口，不伪造下拉内容。
// 项目名旁用本地项目图标，避免云朵暗示当前工程已同步到服务器。
// 项目名允许截断但保留 title，宿主变窄时导航和导出仍在同一工作栏。
// 保存状态为“未保存”，不能照抄原图“已保存”误导用户文件已写入。
// 旧版链接保留真实单片段编辑能力，UI-01 不挂载旧播放器在后台消费资源。
// 工具箱返回链接复用现有路由，不调用 history.back 导致窗口离开应用。
// 标题栏不含品牌或关闭按钮，避免与 Electron 的自定义 head 重复。
// 所有菜单按钮复用 EditorAction，修改共同样式会同步到其他区域。
// 撤销与重做分别命名，不把一个禁用按钮绑定成共享的假历史记录。
// 工程名称来自词条而非硬编码中文，英语截图保持同一数据和几何。
// 状态说明靠近项目名，未接通原因还可在禁用动作悬停时查看。
// 项目栏固定高度，长标题不能挤压节目预览和时间轴的高度预算。
export function ProjectToolbar({ editing, onImport, busy = false, onCancelImport }: { editing?: TimelineInteraction["editing"]; onImport?: () => void; busy?: boolean; onCancelImport?: () => void }) {
  // 当前的“文件/编辑/视图”只是布局槽位，不设置 aria-haspopup 承诺不存在的菜单。
  // Undo/Redo 没有快捷键声明，用户不会看到本轮尚未实现的 Ctrl+Z 提示。
  // 返回工具箱不会关闭 Electron 窗口，窗口关闭能力只在原 head 中出现。
  // 旧版工具链接是显式选择，不按文件是否存在自动跳转切换编辑器实现。
  // 长项目名的 title 只补全文字，不包含用户本地路径或账号敏感信息。
  // 当前保存状态没有旋转 loading 图标，不能以动画冒充真实保存进度。
  // 导出入口固定保留，但禁用时不会打开一个已经填满假成功结果的弹窗。
  // “项目操作”的 nav 名称与应用主导航不同，读屏可区分这两个导航区域。
  // 品牌原图中的 Illusion Studio 不被复制，真实 AppShell 继续呈现 Illusion Realm。
  // 链接使用应用内相对路由，静态导出和 app:// 下都由 Next 负责导航。
  const { t } = useTranslation();
  return <header data-editor-region="R01" className={styles.projectBar}>
    <Link href="/tools" className={styles.navigation} title={t("toolBox.main.back")}><ArrowLeft size={16} /><span className={styles.optionalText}>{t("toolBox.main.back")}</span></Link>
    <div className={styles.projectName} title={t(onImport ? "toolBox.editorUi.liveProjectName" : "toolBox.editorUi.projectName")}><FileVideo size={17} /><strong>{t(onImport ? "toolBox.editorUi.liveProjectName" : "toolBox.editorUi.projectName")}</strong><span>{t("toolBox.editorUi.unsaved")}</span></div>
    <nav className={styles.projectMenus} aria-label={t("toolBox.editorUi.projectActions")}><EditorAction label={t("toolBox.editorUi.file")} /><EditorAction label={t("toolBox.editorUi.edit")} /><EditorAction label={t("toolBox.editorUi.view")} /><EditorAction icon={Undo2} label={t("toolBox.editorUi.undo")} compact onClick={editing?.undo} disabledReason={editing && !editing.canUndo ? t("toolBox.editorUi.noUndo") : undefined} /><EditorAction icon={Redo2} label={t("toolBox.editorUi.redo")} compact onClick={editing?.redo} disabledReason={editing && !editing.canRedo ? t("toolBox.editorUi.noRedo") : undefined} /></nav>
    <Link href="/tools/video/editor/legacy" className={`${styles.navigation} ${styles.legacyLink}`}>{t("toolBox.editorUi.legacy")}<ArrowUpRight size={14} /></Link>
    <Link href="/tools/video/editor/samples" className={styles.navigation}>{t("toolBox.editorUi.samples")}</Link>
    {onImport && <EditorAction icon={Upload} label={t("toolBox.editorUi.import")} onClick={onImport} busy={busy} accent />}
    {/* 窄屏素材栏隐藏时，项目栏仍能取消当前批次；静态样板不获得这个能力。 */}
    {busy && onCancelImport && <EditorAction label={t("toolBox.editorUi.cancelImport")} onClick={onCancelImport} />}
    <EditorAction icon={Upload} label={t("toolBox.editorUi.export")} accent />
    <span id="video-editor-unavailable" className="sr-only">{t("toolBox.editorUi.unavailable")}</span>
  </header>;
}

// R10 只读信息条：项目参数与播放总时长来自同一 DEMO_PROJECT。
// 它不是全局任务栏，不重复下载、ComfyUI 状态或保存按钮。
// 项目时长明确为 30 秒，不能用当前选中 scene_02 的 8 秒替换。
// 保留完整 title，紧凑宽度下视觉截断不丢失项目信息。
// 时间码固定在 30fps 的零帧边界，暂不声称有任意帧精度计算。
// 未来格式化函数接入时应在此替换，不散落在素材或属性区各算一份。
// 信息条保持固定高度，时间轴内容较多时仍在滚动区域外可见。
export function ProjectInfoStrip({ project = DEMO_PROJECT }: { project?: { width: number; height: number; fps: number; duration: number } }) {
  // 不在这里读系统时间或 Date.now，确保预渲染与客户端首帧参数一致。
  // 30fps 仅是样例工程帧率，不根据本机显示器刷新率推断项目帧率。
  // 项目宽高与节目图 object-contain 分开，画面显示大小不改变输出参数。
  // 信息文本无点击事件，状态栏不成为第二个可编辑工程设置入口。
  // 不显示文件大小、码率或导出路径，因为这些没有真实媒体或输出证据。
  const { width, height, fps } = project;
  const text = `${width} × ${height} · ${fps}fps · ${formatEditorTimecode(project.duration, fps)}`;
  return <footer data-editor-region="R10" className={styles.infoStrip} title={text}>{text}</footer>;
}
