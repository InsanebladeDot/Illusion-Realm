"use client";

/** 漫画对话框入口：直接打开合成编辑，素材、画布和属性共用一份本地文档。 */
// AppShell与窗口控制继续由tools/layout拥有，此页不再绘制重复大标题和主题按钮。
// 工具说明在窗口门牌展示；返回工具箱仍有明确链接，不依赖浏览器历史猜目标。
// 静态模板与用户自定义素材只在目录适配层汇合，不复制到用户数据文件。
// 导入与导出分别有真实busy状态，失败都保留现有文档和选择。
// 页面卸载使请求代号失效，迟到解码不会写入新的页面实例。
// 用代号像给每次取件一张号码牌，只接收当前号码，过期结果自然丢弃。
// 图片数据通过浏览器File读取，不使用File.path或Node文件系统。
// 该工具完全在本地编辑，不发给ComfyUI、模型供应商或图片搜索服务。
// 文档目前是会话内存，界面明确提醒离开前导出，不伪装自动保存成功。
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@/i18n";
// modal：模板选择复用资源弹窗，关闭后画布和属性继续保留同一份编辑文档。
// 库的选择回调只新增一层并关闭弹窗，不复制第二份画布或属性状态。
// 只有打开时挂载48张素材卡，默认两栏不再被素材列表占据宽度。
import { ResourceDialogShell } from "@/components/ResourceDialogShell";
import { downloadBlob } from "@/utils/download-blob";
import { loadUserDataDocument } from "@/utils/userDataDocument";
import { DialogueLibrary } from "./dialogue-library";
import { DialogueProperties } from "./dialogue-properties";
import { DialogueStage } from "./dialogue-stage";
import { DIALOGUE_TEMPLATES, type DialogueTemplate } from "./dialogue-data";
import { exportDialogue, loadDialogueImage, readDialogueBlob } from "./dialogue-render";
import { useDialogueEditor } from "./use-dialogue-editor";
// 模板弹窗只复用焦点边界，不把资源选择与真实图层选择放到同一个状态里。
// 选择模板成功后新增气泡，关闭弹窗再由属性栏读取新的图层参数。
// 取消时不新增或修改任何图层，因此Delete目标不会无故变化。
import { useDialogueTemplatePicker } from "./use-dialogue-template-picker";
import styles from "./dialogue.module.css";

// 自定义素材来自既有cartoonBubble段，不新增文件、数据库或同步协议。
// 只恢复data:image图片，避免历史脏值让资源面板加载任意网络地址。
// 只读现有内容，不因过滤一个坏记录就把整个段保存为空覆盖用户文件。
// 加载错误保留48种静态模板并显示独立反馈，不能误报用户“没有素材”。
// cancelled在卸载时阻止setState，但用户文档的共享读取不被随意abort。
// 两个调用方读取同一文档缓存时互不取消对方的读取。
// 资源恢复不是自动添加气泡，默认画布仍保持空白合成状态。
// 原自定义字体数据同样留在文档，当前系统字体编辑不删除它们。
// 用户文件名作为普通文字显示，不拼进翻译键或资源URL。
// custom类别只在资源列表使用，不与ComfyUI模型分类共用状态。
// hydration完成前不访问磁盘或window，符合静态导出的首屏规则。
// 所有异步拒绝在本hook处理，失败不会变成未处理Promise。
// 错误文字通过现有语言系统更新，不直接输出原始异常或私人路径。
// 列表合并依赖custom数组身份，拖动图层不会重新生成48条目录数据。
// 只接收有效id和name，旧文档缺字段时跳过坏记录而不是使页面崩溃。
function useCustomTemplates() {
  // 空custom数组与loading状态分别保存，防止以长度0推测读取是否完成。
  // 读取成功但用户没有旧素材应进入ready，不能持续显示“正在加载”。
  // 从用户文档读取并不授权写入，过滤坏记录后不自动保存整个空段。
  // 如果旧记录使用https源地址，此版本会跳过；不会打开资源窗就悄悄联网。
  // asset.id与asset.name检查是兼容历史数据的最低身份要求，不是重建一个新目录协议。
  // data URL前缀匹配只是入口约束，实际字节是否能解码由图片加载阶段判断。
  // custom类下的name是用户原名，不会按当前语言重新翻译。
  // 默认深色文字只是新气泡初始值，用户可在属性色板独立调整。
  // 这里不迁移customFonts，已有记录保持原样，当前文字继续使用系统字体。
  // status字符串在render时翻译，不把中文提示保存到数据状态里。
  // 被动副作用只在挂载后读取文档，静态预渲染不会访问preload。
  // 共享读取Promise可能仍被其他页面使用，cancelled只让本接收方停止更新。
  // then和catch都检查标记，离开时读取成功或失败都不会写入已卸载组件。
  // 不提供自动重试轮询，重新进入页面才重新发起恢复，避免坏文件造成后台循环。
  const { t } = useTranslation(), [custom, setCustom] = useState<DialogueTemplate[]>([]), [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let cancelled = false;
    void loadUserDataDocument().then(result => {
      if (cancelled) return;
      setCustom(result.data.cartoonBubble.customAssets.filter(asset => typeof asset.id === "string" && typeof asset.name === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(asset.src)).map(asset => ({ id: asset.id, name: asset.name, category: "custom", src: asset.src, color: "#20222f", vertical: false })));
      setStatus("ready");
    }).catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, []);
  return { custom, message: status === "loading" ? t("dialogue.loadingCustom") : status === "error" ? t("dialogue.customError") : "" };
}

export function DialoguePage() {
  // 本页面拥有作品会话，公共控件、模板库和窗口说明都只接收最小展示参数。
  // svg ref只给画布与导出器，模板弹窗不需要访问实际绘图DOM。
  // input ref只用于真实系统选择器触发，不从ref尝试读取本机绝对路径。
  // token不是文件id，它只区分异步请求归属，不能写到作品或用户设置中。
  // useMemo合并目录，移动气泡只改变editor.doc，不会重建48条资源配置。
  // 自定义数据加载结束才改变custom引用，因此目录合并频率与真实资源变化一致。
  // error用固定联合类型，不能将浏览器异常对象直接拼进翻译路径。
  // busy为互斥联合而非两个布尔值，避免同时声称正在导入和正在导出。
  // 页面清理递增token，不主动销毁由共享用户文档读取器拥有的缓存。
  // 返回工具箱通过固定路由，不依赖上一个浏览历史恰好属于工具箱。
  // 页面中的会话提示与窗口操作说明承担不同职责，一个说明保存边界，一个说明操作。
  // 默认不自动选择classic-left，空白画稿也能先导入背景再挑模板。
  // 模板添加与关闭在同一个onAdd意图内执行，不能把“关闭”误当“应用最后悬停项”。
  // 读文件错误在work栏显示，不用模态警告挡住用户继续编辑已有图层。
  // 缺图反馈不删除已有内容，后续导出也会真实检查每张需要的资源。
  // 同一选中气泡的templateId只给库做样式标记，删除始终按实例UUID执行。
  // input隐藏是为了复用属性按钮的视觉体系，不代表使用了未经授权的后台文件读取。
  // accept帮助系统过滤文件，但不能取代导入处理器内的格式与大小校验。
  // 输入事件先保存File再清空input值，异步流程仍持有本次选择的真实File对象。
  // 如果先读取files再异步访问event.currentTarget，事件目标可能已失效，因此不这样写。
  const { t } = useTranslation(), editor = useDialogueEditor(), { custom, message } = useCustomTemplates();
  const templates = useMemo(() => [...DIALOGUE_TEMPLATES, ...custom], [custom]);
  const svg = useRef<SVGSVGElement>(null), input = useRef<HTMLInputElement>(null), token = useRef(0);
  const [busy, setBusy] = useState<"import" | "export" | null>(null), [error, setError] = useState<"importError" | "exportError" | "missingImage" | null>(null);
  // 模板弹窗是局部展示状态，不写入文档历史或用户设置。
  // Escape与关闭按钮由公共外壳统一处理，页面不另写全局弹窗监听。
  // 关闭弹窗不会重置画布，重复打开仍能继续添加不同模板。
  const picker = useDialogueTemplatePicker();
  useEffect(() => () => { token.current++; }, []);
  const importBackground = async (file: File | undefined) => {
    // 像按原图比例移动贴纸：更换画布尺寸时保留图层的相对位置。
    // 文件读取、解码和像素数校验全部通过后才提交，失败保留旧画面。
    // 像素上限在解码后检查，不能完全避免解码阶段的内存峰值。
    if (!file || busy) return;
    const request = ++token.current; setBusy("import"); setError(null);
    try {
      if (!/\.(png|jpe?g|webp)$/i.test(file.name) || file.size > 20 * 1024 * 1024) throw new Error();
      const data = await readDialogueBlob(file), image = await loadDialogueImage(data);
      if (image.naturalWidth * image.naturalHeight > 64000000) throw new Error();
      if (request === token.current) editor.change(doc => ({ ...doc, background: data, width: image.naturalWidth, height: image.naturalHeight, layers: doc.layers.map(layer => ({ ...layer, x: layer.x / doc.width * image.naturalWidth, y: layer.y / doc.height * image.naturalHeight })) }));
    } catch { if (request === token.current) setError("importError"); }
    finally { if (request === token.current) setBusy(null); }
  };
  const exportImage = async () => {
    // 先复制当前SVG再异步编码；离开页面后号码失效，避免迟到下载。
    if (!svg.current || busy) return;
    const request = ++token.current; setBusy("export"); setError(null);
    try {
      const blob = await exportDialogue(svg.current, editor.doc.width, editor.doc.height);
      if (request === token.current) downloadBlob(blob, "comic-dialogue.png");
    } catch { if (request === token.current) setError("exportError"); }
    finally { if (request === token.current) setBusy(null); }
  };
  return <div data-dialogue-editor className={styles.workspace}>
    {/* 工作栏：只保留返回、会话提示和错误，不重复渲染图1的大标题区域。 */}
    {/* 描述在窗口head的共用槽内，main的可用高度交给两栏编辑器。 */}
    {/* 文件input清空后允许再次选择同一个文件，取消选择不改变文档。 */}
    <div className="flex min-w-0 flex-wrap items-center gap-3 text-xs"><Link href="/tools" className="inline-flex items-center gap-1 rounded px-1 py-1.5 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft size={14} />{t("toolBox.main.back")}</Link><span className="min-w-0 text-muted-foreground">{t("dialogue.sessionHint")}</span>{error && <span role="alert" data-dialogue-error className="text-destructive">{t(`dialogue.${error}`)}</span>}</div>
    <input ref={input} data-dialogue-file hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void importBackground(file); }} />
    <div className={styles.regions} aria-label={t("dialogue.hint")}>
      {/* stage：双击通过onEditText通知本页会话，不把输入状态放进静态模板。 */}
      {/* 画布与右栏共享同一editor，选中、正文许可、样式和历史没有第二份副本。 */}
      {/* 单击和双击回调分开注入，资源弹窗等调用方无需知道画布的指针细节。 */}
      <DialogueStage doc={editor.doc} templates={templates} selectedId={editor.selected?.id ?? null} svgRef={svg} onSelect={editor.select} onEditText={editor.editText} onPatch={editor.patch} onStart={editor.startGesture} onEnd={editor.endGesture} onImageError={() => setError("missingImage")} />
      <DialogueProperties editor={editor} templates={templates} importing={busy === "import"} exporting={busy === "export"} onTemplates={picker.openPicker} onImport={() => input.current?.click()} onExport={() => { void exportImage(); }} />
    </div>
    {/* modal：模板样式按需打开；选择后回到两栏画布，不留下固定素材栏。 */}
    {/* 公共弹窗承担焦点、关闭和滚动边界，素材库继续只承担搜索与选择。 */}
    {/* 元素只在打开时挂载，关闭后不会保留一批不可见但可Tab的卡片。 */}
    {picker.open && <ResourceDialogShell open title={t("dialogue.library")} titleId="dialogue-template-title" onOpenChange={picker.onOpenChange} bodyScroll={false} bodyPadded={false}><DialogueLibrary items={templates} selected={editor.selected?.templateId ?? null} onAdd={item => { editor.add(item); picker.onOpenChange(false); }} status={message} /></ResourceDialogShell>}
  </div>;
}
