"use client";

/**
 * rail：文字改图输入面板，顺序为原图、修改指令、可选参数与固定操作区。
 * 上传、参数行和折叠区复用项目组件，状态全部由同一 editor hook 提供。
 */
// 编辑与图片生成使用同一输入组件，不再复制 textarea 皮肤。
// 受控值负责预设同步，助手也写回同一设置字段。
// 显式 busy 禁用补足 fieldset 不会关闭 contentEditable 的差异。
import { PromptInput } from "@/components/prompt-input";
import { AnimaEditModels } from "./anima-edit-models";
import { Sparkles, Square } from "lucide-react";
import { RandomSeedButton } from "@/components/random-seed-button";
import { useTranslation } from "@/i18n";
import { VideoImageUpload } from "@/view/create/VideoImageUpload";
import type { AnimaEditState } from "@/hooks/use-anima-edit";
import { AnimaEditSettings, EditDisclosure } from "./anima-edit-settings";

/**
 * 上传组件复用已有图片选择、拖放、替换和移除入口。
 * 源文件缩略图只确认输入，不能把原图放进“结果图”画布制造成功假象。
 * 文件格式、大小与解码像素限制由 hook 再次校验。
 * 文件名在窄栏省略，title 仍保留完整名称。
 * 替换/删除原图不清空编辑指令，但会清空旧结果。
 * 运行时外层 fieldset 禁用上传，避免当前会话的输入被另一张图片替换。
 */
function EditSource({ editor }: { editor: AnimaEditState }) {
  // 该区域的数字序号只是阅读顺序，不是上传状态或进度。
  // VideoImageUpload 保留拖放入口，文件点击与拖放最终都经过同一校验函数。
  // imageUrl 只负责缩略图展示，真正上传仍使用 hook 保存的 File。
  // onSelect 使用 void 是因为 hook 已自行捕获导入异常并提供可读错误。
  // required 提示用户原图不可缺少，但实际拒绝提交不能只依赖星号标记。
  // 原图尺寸在完成解码后展示，不依据 MIME 或文件名猜测。
  // 文件名只用作普通 React 文本，不作为 HTML 或脚本解释。
  // 没有原图时传 null，符合共享上传组件的清空契约。
  const { t } = useTranslation(), { source } = editor;
  return <section data-anima-source className="space-y-2"><div className="flex items-center gap-2"><span className="rounded-md border border-border px-1.5 py-1 text-[10px] text-muted-foreground">01</span><h3 className="text-sm font-semibold">{t("create.animaEdit.source")}</h3></div><VideoImageUpload label={t("create.animaEdit.source")} required imageUrl={source?.url ?? null} onSelect={(file) => { void editor.importFile(file); }} onRemove={editor.clear} /><p className="text-xs text-muted-foreground">{t("create.animaEdit.fileHint")}</p>{source && <p className="truncate text-xs text-muted-foreground" title={source.file.name}>{source.file.name} · {source.width} × {source.height}</p>}</section>;
}

/**
 * 快捷指令只修改文本，不隐式提交模型请求。
 * 三个样例明确指出改变对象与保留对象，便于继续编辑。
 * 指令输入上限三千，字数取当前受控状态，不从旧 DOM 再读一份值。
 * 正向指令与反向词分开保存，切换高级设置不重置文本。
 * 文本框有显式 label 与自定义主题外观，保留原生文本输入的可访问性。
 * 原模板没有蒙版输入，此处不展示画笔或涂抹按钮。
 */
export function EditInstruction({ editor, idPrefix = "anima-edit" }: { editor: AnimaEditState; idPrefix?: string }) {
  // label 与编辑区 的固定 id 只在本工具中出现，不复制整页模板的 id。
  // 受控文本保证预设与手动编辑看到同一个值，没有另一份隐藏指令。
  // 预设点击不会自动拼接旧指令，用户可明确看到本次被替换的内容。
  // 后续继续输入仍使用同一输入组件，快捷指令不是不可编辑的模式开关。
  // 每个预设使用独立翻译路径，语言切换时按钮和示例保持一致。
  // 字符数只承担限长提示，不称为 token 数或推理消耗估算。
  // 输入组件限高滚动，长指令不会把固定宽度 rail 撑出主展示区。
  // 输入事件更新函数式状态，保留模型与高级参数的当前值。
  const { t } = useTranslation(), { settings, setSettings } = editor;
  return <section className="space-y-3"><div className="flex items-center gap-2"><span className="rounded-md border border-border px-1.5 py-1 text-[10px] text-muted-foreground">02</span><label htmlFor={idPrefix + "-instruction"} className="text-sm font-semibold">{t("create.animaEdit.instruction")}</label><span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{settings.instruction.length} / 3000</span></div><PromptInput id={idPrefix + "-instruction"} data-anima-instruction maxLength={3000} disabled={editor.busy || editor.importing} data-placeholder={t("create.animaEdit.placeholder")} aria-label={t("create.animaEdit.instruction")} value={settings.instruction} onValueChange={(instruction) => setSettings((previous) => ({ ...previous, instruction }))} /><div className="flex flex-wrap gap-2">{(["background", "expression", "lettering"] as const).map((name) => <button key={name} type="button" data-anima-preset={name} className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setSettings((previous) => ({ ...previous, instruction: t(`create.animaEdit.presets.${name}.text`) }))}>{t(`create.animaEdit.presets.${name}.label`)}</button>)}</div><p className="text-xs leading-6 text-muted-foreground">{t("create.animaEdit.instructionHint")}</p></section>;
}

/**
 * 依赖说明只提供人工安装步骤，不自动执行命令或记录“安装成功”。
 * 节点类型与工作流 class_type 一致，用户可在 ComfyUI 中搜索确认。
 * 命令是可选中的普通文本，长目录在窄屏换行，不撑宽整个页面。
 * 标准 custom_nodes 目录与重启步骤同时写明，避免只给仓库名。
 * 浏览器模板的 CORS 配置不复制到桌面 UI，正式应用走 Electron 代理。
 * 这不是首次引导已读持久化机制，因此没有新增用户数据格式。
 */
// 这里是安装前置说明，不探测 GPU 或伪造自定义节点已经安装成功。
// 原文字流依赖说明与安装步骤保持原样。
function EditDependencies() {
  // 安装步骤作为按需展开说明，正式界面不复制独立模板的浏览器连接表单。
  // Cosmos Reference 是本参考编辑链使用的自定义节点，不是 LoRA 文件本身。
  // 安装节点与选择模型是两个前置条件，删除编辑 LoRA 不会删除参考节点需求。
  // 展示库地址不代表下载或运行命令，用户仍在自己的 ComfyUI 环境人工安装。
  // 不启动终端、不请求主进程执行 shell，也不新增任意命令 IPC。
  // 命令是普通可选择 code 文本，特殊字符不会被 React 当脚本执行。
  // 官方安装失败应查看 ComfyUI 日志，这里不伪造 pip 依赖或兼容性判断。
  // 说明可在任何阶段展开，不改变当前会话参数或停止状态。
  const { t } = useTranslation();
  return <EditDisclosure title={t("create.animaEdit.dependencies")}><p className="text-xs leading-6 text-muted-foreground">{t("create.animaEdit.dependencyHint")}</p><p className="break-words text-xs font-medium">Apply Cosmos Reference Latent<br /><span className="text-muted-foreground">ApplyCosmosReferenceLatent</span></p><code className="block select-all break-all rounded-xl border border-border bg-muted/40 p-3 text-xs leading-6">git clone https://github.com/Mirumo0u0/ComfyUI-Cosmos-Reference.git</code><p className="text-xs leading-6 text-muted-foreground">{t("create.animaEdit.installHint")}</p></EditDisclosure>;
}

/**
 * 主按钮沿用项目连续渐变，右段固定 ×1，匹配当前单张编辑工作流。
 * 编辑任务进入公共队列，当前任务存续时禁止重复提交同一份编辑草稿。
 * footer 属于正常 flex 流，长参数表单只滚动中间区域，不覆盖末尾内容。
 * 停止入口只在活动阶段出现，保存或已请求停止时禁用。
 * 运行与停止方法都自行捕获错误，事件处理不产生未处理拒绝。
 * 错误保留在 footer 中，长信息允许换行，不依赖短时 toast。
 */
export function AnimaEditForm({ editor }: { editor: AnimaEditState }) {
  // 表单 submit 同时支持点击与键盘触发，preventDefault 避免静态页面导航刷新。
  // 忙碌时字段统一禁用，结果预览操作仍可以使用，不影响当前冻结输入。
  // 导入中同样禁用提交，避免引用尚未确认的下一张原图。
  // footer 位于滚动区外，桌面长表单仍能直接停止任务。
  // 窄屏整个工作区滚动时 footer 随表单正常排列，不覆盖结果区。
  // 状态文字通过 aria-live 表达，错误使用 alert，等待使用 status。
  // 长错误信息限制展示高度并允许滚动，不能把运行按钮挤到无法触达。
  // 停止按钮独立 type=button，不能因点击停止而重新触发 submit。
  // 停止在保存和 stopping 阶段禁用，实际边界同时由 hook 再次检查。
  // 主按钮显示 ×1 是当前编辑输出契约，不能从普通图片批量选择状态借用数值。
  // 所有用户可读语句由 create 命名空间提供，错误词条仍接受类型检查。
  const { t } = useTranslation();
  // 文字页只提供文字编辑；蒙版与边缘生成仍归顶部各自工具。
  // 这里删的是重复模式切换和 API 下载入口，不改变公共编辑队列。
  // 生成与骰子是并列控件，只有 submit 主按钮会进入运行入口。
  // 随机模式写入共享会话，文字改图与蒙版来回切换仍保持同一偏好。
  // footer 在内容滚动区外，长参数表单不会使停止入口无法触达。
  return <form data-anima-form className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-background" onSubmit={(event) => { event.preventDefault(); void editor.run(); }}>
    {/* rail：只有表单内容滚动，固定 footer 不与侧栏共享滚动条。 */}
    <div className="min-h-0 flex-1 overflow-y-auto p-4 [scrollbar-width:thin] sm:p-5"><fieldset disabled={editor.busy || editor.importing} className="min-w-0 space-y-6 disabled:opacity-70"><AnimaEditModels editor={editor} /><EditSource editor={editor} /><EditInstruction editor={editor} /><AnimaEditSettings editor={editor} /></fieldset><div className="mt-6"><EditDependencies /></div></div>
    {/* 界面：真实阶段、运行文字编辑与停止。 */}
    <footer className="shrink-0 space-y-3 border-t border-border/70 p-4"><p role={editor.error ? "alert" : "status"} data-anima-status className="max-h-28 overflow-y-auto break-words text-xs leading-5 text-muted-foreground" aria-live="polite">{editor.error || (editor.phase === "queued" ? t("create.generationTasks.status.queued") : t(`create.animaEdit.phase.${editor.phase}`))}</p><div className="flex min-w-0 items-center gap-2"><button data-anima-run type="submit" disabled={editor.busy || editor.importing} className="create-generate-button flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white shadow-sm hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"><Sparkles className="h-5 w-5" aria-hidden /><span className="min-w-0 flex-1 truncate">{t("create.animaEdit.run")}</span><span className="border-l border-white/35 pl-3 text-xs">× 1</span></button><RandomSeedButton random={editor.seedMode === 'random'} disabled={editor.busy || editor.importing} onEnable={() => editor.patch({ seedMode: 'random' })} /></div>{editor.busy && <button data-anima-stop type="button" disabled={editor.phase === "saving" || editor.phase === "stopping"} className="inline-flex items-center gap-1 rounded-md py-1 text-destructive disabled:opacity-40" onClick={() => { void editor.stop(); }}><Square className="h-3 w-3" />{t("create.animaEdit.stop")}</button>}</footer>
  </form>;
}
