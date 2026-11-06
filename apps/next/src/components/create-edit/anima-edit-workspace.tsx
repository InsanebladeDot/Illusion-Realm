"use client";

/**
 * stage：结果优先的文字改图工作区，左侧为表单，右侧为独立预览。
 * 两列根据实际容器宽度切换为纵向，沿用页面外层 head/nav，不复制模板外壳。
 * 原图和结果分别选中，导入图片不会填入结果空态。
 */
import { useState } from "react";
import { Download, Sparkles } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useAnimaEdit, type AnimaEditState } from "@/hooks/use-anima-edit";
import { ImagePreviewTrigger } from "@/components/ImagePreviewOverlay";
import { downloadMaskImage } from "@/utils/mask-image";
import { cn } from "@/utils/cn";
import { AnimaEditForm } from "./anima-edit-form";

/**
 * 原图切换只影响展示，不改变上传对象或工作流参数。
 * 首次进入和更换原图后默认回到结果页，明确呈现尚未生成。
 * 原图不存在时禁用对照入口，避免空按钮产生误导。
 * 结果不存在时显示说明，禁止用示例图片或原图冒充模型产出。
 * 预览复用统一 ImagePreviewTrigger，点图仍能放大并缩放查看。
 * 结果和原图保持 contain，任何宽高比都不裁切内容。
 * 星形图标是装饰 SVG，离线与语言切换后仍然存在。
 * 实际结果尺寸显示在画布外，不覆盖图像中的文字或细节。
 */
function EditResult({ editor }: { editor: AnimaEditState }) {
  // 本组件只保存用户查看原图还是结果，不保存第二份图片或编辑参数。
  // editor.result 只有生成和落盘完成后才赋值，因此可下载状态具有明确含义。
  // 新运行先清结果，对照仍可看原图，空态提示则显示当前等待说明。
  // 原图按钮使用 disabled 而非隐藏，用户始终知道对照入口的位置。
  // aria-pressed 同时表达当前视图，不能只靠背景色区分选中状态。
  // 动态 dimensions 随当前视图变化，避免原图和结果不同时仍展示同一尺寸。
  // 原图尺寸来自源文件解码，结果尺寸来自服务器回包解码。
  // 下载始终针对结果，查看原图不会悄悄改变下载对象。
  // 结果未生成时即使原图可见也禁用下载，避免把输入冒充生成输出。
  // ImagePreviewTrigger 复用现有预览门户、缩放与关闭交互。
  // 图片 key 随 URL 更新，预览组件不会继续缓存上一轮已回收的 Blob。
  // 点阵用 border token 组合半透明背景，主题更换后不会留下硬编码灰块。
  // 画布 min-w-0 防止高分辨率图片的固有宽度撑大 CSS 网格。
  // 画布使用 contain，长图和横图都完整保留，不裁剪模型修改结果。
  // 页脚和视图切换处于正常 flex 流，放大图片不会覆盖按钮。
  // 成功提示只跟随 result，不以 busy=false 作为成功判断。
  // 失败后的错误说明由表单显示，结果区继续保持明确的未生成状态。
  const { t } = useTranslation(), [view, setView] = useState<"result" | "original">("result");
  const original = view === "original", image = original ? editor.source?.url : editor.result?.image.objectUrl;
  const dimensions = original ? editor.source : editor.result;
  return <section data-anima-stage className="flex min-h-80 min-w-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-background @min-[880px]:min-h-0"><header className="flex h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/70 px-3 sm:px-4"><div className="flex min-w-0 items-center gap-2"><h2 className="text-sm font-semibold">{t("create.animaEdit.resultTitle")}</h2><span className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground">{t(original ? "create.animaEdit.original" : editor.result ? "create.animaEdit.generated" : "create.animaEdit.pending")}</span></div><div className="flex rounded-lg border border-border p-1">{(["result", "original"] as const).map((kind) => <button key={kind} data-anima-view={kind} type="button" aria-pressed={view === kind} disabled={kind === "original" && !editor.source} onClick={() => setView(kind)} className={cn("rounded-md px-2 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40", view === kind ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted")}>{t(kind === "result" ? "create.animaEdit.result" : "create.animaEdit.viewOriginal")}</button>)}</div></header>
    {/* stage：点阵背景和空态均由真实数据决定，只有生成结果可以占用结果图页。 */}
    <div data-anima-canvas className="relative flex min-h-64 min-w-0 flex-1 items-center justify-center overflow-hidden bg-muted/20 bg-[radial-gradient(var(--border)_0.7px,transparent_0.7px)] bg-size-[16px_16px] p-5">
      {image ? <ImagePreviewTrigger key={image} className="flex h-full w-full min-w-0 items-center justify-center" items={[{ key: image, src: image, alt: t(original ? "create.animaEdit.original" : "create.animaEdit.result") }]} index={0} /> : <div data-anima-empty className="flex max-w-sm flex-col items-center gap-4 px-3 py-10 text-center"><Sparkles className="mb-3 h-14 w-14 text-primary/55" strokeWidth={1} aria-hidden /><h3 className="text-base font-medium">{t(editor.busy ? "create.animaEdit.waitTitle" : "create.animaEdit.emptyTitle")}</h3><p className="text-xs leading-6 text-muted-foreground">{t(editor.busy ? "create.animaEdit.waitHint" : "create.animaEdit.emptyHint")}</p></div>}
    </div>
    {/* 界面：真实尺寸、保存状态和结果下载；下载不会切换成原图。 */}
    <footer className="space-y-3 border-t border-border/70 px-4 py-3 text-xs text-muted-foreground"><div className="flex flex-wrap items-center justify-between gap-2"><span data-anima-dimensions>{dimensions ? `${dimensions.width} × ${dimensions.height}` : t("create.animaEdit.pending")}</span><button type="button" data-anima-download disabled={!editor.result} className="inline-flex items-center gap-2 rounded-md py-1 hover:text-foreground disabled:opacity-35" onClick={() => { if (editor.result) downloadMaskImage(editor.result.image.blob, editor.result.image.filename); }}><Download className="h-4 w-4" />{t("create.animaEdit.download")}</button></div><p className="leading-5">{t(editor.result ? "create.animaEdit.savedHint" : "create.animaEdit.resultHint")}</p></footer>
  </section>;
}

/**
 * 容器断点读取实际可用宽度，因此 nav 开合与系统缩放会自然参与排版。
 * 桌面表单宽 344px，结果使用剩余空间；不引入重复的第三列素材列表。
 * 小于 880px 改为纵向，父区统一滚动，表单和结果不再争抢有限高度。
 * 桌面仅表单内部滚动，底部运行按钮固定在正常 flex 布局中。
 * 根节点 min-w-0 与 min-h-0 防止长文件名、textarea 或图片固有尺寸撑开主区。
 * 工作区只使用 Tailwind 与现有主题 token，不内嵌模板 CSS 或执行其浏览器脚本。
 * editor hook 只创建一份，响应式布局不会复制上传、运行或取消状态。
 * 暗色、浅色和自定义配色继续由全局主题系统控制。
 */
export function AnimaEditWorkspace() {
  // 一份 editor 同时传给表单与结果区，模型选择和回包只存在一个权威状态。
  // 外层 @container 的宽度受 nav 与应用缩放影响，断点不假定整个窗口宽度。
  // 两列切换阈值包含表单固定宽与画布最低可用空间，窄屏不隐藏结果。
  // p-3 仅属于此编辑功能内部布局，不恢复创建页外层已移除的重复 padding。
  // 只有结果视图通过 key 重置，源图、文本及异步会话不会被重复初始化。
  // 图片替换时无需 effect 同步 setState，避免产生无意义的级联渲染。
  // 整个工具由 EditWorkspace 保持挂载，局部标签切换不触发卸载清理。
  // 组件没有 resize 监听，布局响应由 CSS 容器查询独立完成。
  // 明确绑定文字草稿，旧版本留下的蒙版模式不能在隐藏切换器后继续生效。
  // 专用蒙版与边缘面板分别绑定自己的模式，不清除它们的参数或笔迹。
  const editor = useAnimaEdit("text");
  // 只重建对照预览的局部状态，表单与运行会话保持同一实例。
  // 原图或结果 URL 改变时通过 key 回到结果页，避免 effect 再触发一轮渲染。
  return <div data-anima-edit className="@container min-h-0 flex-1 overflow-y-auto"><div data-anima-grid className="grid min-h-full grid-cols-1 gap-3 p-3 @min-[880px]:h-full @min-[880px]:grid-cols-[344px_minmax(0,1fr)] @min-[880px]:overflow-hidden"><AnimaEditForm editor={editor} /><EditResult key={`${editor.source?.url ?? ""}:${editor.result?.image.objectUrl ?? ""}`} editor={editor} /></div></div>;
}

// 下载只使用解码后的真实生成 Blob，不重新从拼接图裁切或复制原图。
// 对照视图仍允许下载结果，因此按钮名称明确使用“下载结果图”。
// 保存成功的提示只在实际落盘完成后出现，预览存在并不自动等同保存成功。
// 进入蒙版子工具后本组件保持挂载，正在运行的会话和已输入指令不会被重建。
// 页面整体离开时 hook 才会释放素材、结果以及未完成的生成会话。
// 外层网格只定义功能展示区，不改变应用窗口标题栏、导航或 main 边距。
// 图片预览弹层复用项目现有的主区替换与居中弹窗逻辑。
// 不增加自定义 resize 事件，容器查询不会依赖被遮挡时可能丢失的媒体事件。
