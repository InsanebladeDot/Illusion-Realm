"use client";

/**
 * 界面：编辑模型下方的两个快速加载入口，样式沿用已有紧凑主题按钮。
 * 只在明确点击后读取来源；模型和 LoRA 通过同一次 patch 原子写回草稿。
 * 异步读取期间检查原图和资源引用，迟到结果不能覆盖用户后来的手动选择。
 */
import { useRef, useState } from "react";
import { ImageDown, RefreshCw } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useAnimaEditStore } from "@/stores/use-anima-edit-store";
import type { AnimaEditState } from "@/hooks/use-anima-edit";
import { mergeEditResources, resourcesFromEditImage, resourcesFromImageMode } from "@/utils/anima-edit-resources";

/**
 * 两个入口的错误和成功提示独立于生成状态，避免把资源加载成功显示为生成成功。
 * 导入原图前仍可同步图片模式，但读取原图按钮明确禁用。
 * 所有按钮使用 type=button，不能因处于 form 中而隐式提交生成。
 * busy 同时检查当前 store，不能只依赖 React 下一帧更新 disabled。
 * 用户开始运行或更换原图后，异步元数据结果直接作废，不修改已冻结任务。
 * 返回的资源已经完整校验，因此不会出现主模型更新、LoRA 还留旧值的中间态。
 * 保留当前已选编辑 LoRA 的规则在说明中可见，用户可继续用标准列表移除。
 * 同步图片模式不要求导入原图，可以先准备资源再导入待编辑的图片。
 * 读取原图只读取当前 File，不从结果预览或图库当前高亮项猜测来源。
 * 导入中不允许读取，防止按钮指向上一张已经完成解码的源对象。
 * 主模型和 LoRA 都来自同一次加载，不使用两个独立异步回调交错提交。
 * 图片模式后续变化不会撤销编辑页的手动调权，因为没有建立双向订阅。
 * 选择取消仍由原资源弹窗处理，本入口不会改变其确认与取消契约。
 * 不新增下载入口，缺失资源需要用户通过原资源安装/扫描流程处理。
 * 失败提示持续保留到下一次加载，便于用户先核对信息再调整选择。
 * 成功文字不包含服务器可用性承诺，实际运行前仍会执行模型存在性检查。
 * 当前组件不拥有原图或结果 URL，卸载时不会释放队列正在使用的素材。
 * 跨路由离开后合法异步读取可写回同一编辑草稿，返回仍能看到已加载资源。
 * 若离开期间任务开始执行，taskId 检查保证它不会修改运行过程中的选择。
 * 本组件没有自动恢复默认编辑项的 effect，移除后的空列表可持续保留。
 * 使用原主题色和边框，浅色、深色以及自定义配色都沿用全局变量。
 * 小按钮允许换行，窄屏不强制压缩文字或把一个入口挤到功能区之外。
 * 按钮图标只作辅助说明，可访问名称由可见翻译文本提供。
 * 读取反馈通过单独 status 节点表达，不使用原生 alert 弹窗中断用户操作。
 * 网络断开不影响内嵌参数读取；资源是否能真正生成仍由后续流程报告。
 * pending 只约束本次资源读取，不显示成生成队列中的等待或运行状态。
 * 所有未知异常都在本层被捕获，按钮回调的 void 不会造成未处理拒绝。
 * 没有 source 时的非空断言受同步门闩保护，同一调用内不会重新读取可变 source。
 * 比较的是开始时捕获的源对象，避免 await 返回后误将新图片套入旧解析结果。
 * 任务开始再完成后仍可能回到 idle，资源引用和源对象检查还提供额外身份约束。
 */
export function AnimaEditResourceActions({ editor, getSourceFile }: { editor: AnimaEditState; getSourceFile?: () => File | null }) {
  // pending 是界面状态，lock 是同步防重入门闩，连点不能创建多个解析任务。
  // 提示内容通过翻译 key 生成，切换语言后的新操作使用当时语言。
  // 原图引用随成功替换更新，同名图片也能正确区分两个读取请求。
  // 不为元数据创建对象 URL，File 字节读取完后没有额外浏览器资源需要释放。
  // 组件不会监听图片模式自动联动，编辑模型修改与图片模型修改相互隔离。
  const { t } = useTranslation(), lock = useRef(false), [pending, setPending] = useState(false), [message, setMessage] = useState("");
  // 对比资源引用用于拒绝等待期间的手动模型修改和 LoRA 调权。
  // store setter 均创建新对象或新数组，这个比较不依赖显示名称。
  // 即使用户切换页面，已提交任务也不能被迟到的快速加载覆盖。
  // importing 为 true 时源对象还可能是上一张，因此同样不能应用读取结果。
  // settings 不在比较范围内：加载只改模型，用户修改指令不会被撤销。
  // sync 与 image 都用同一保护条件，防止两个入口出现不同的忙碌行为。
  // 失败提示也要检查身份，旧源图的错误不能盖住新源图的操作状态。
  // 同一图片被移除再导入会得到新 source 对象，因此旧读取自然失效。
  const load = async (fromImage: boolean) => {
    // 控制工具提供当前原始 File，读取元数据不能误用文字改图的旧素材。
    // getter 在等待后重新求值，换图期间迟到的结果必须丢弃。
    // 不从 PNG 导出结果读取，因为新编码的蒙版本来就没有原工作流块。
    // 资源取当前模式草稿，任务锁与源图仍读公共会话。
    // 文字编辑的默认扩展不能在快捷同步时混入蒙版模式。
    // 引用比较用于丢弃过时结果，不比较重新组装的 settings 对象。
    // 运行门闩在第一个 await 之前检查，隐藏页面也不能覆盖活动任务。
    const before = { ...useAnimaEditStore.getState(), ...editor.getDraft() }, sourceFile = getSourceFile ? getSourceFile() : before.source?.file;
    if (lock.current || before.taskId || before.importing || (fromImage && !sourceFile)) return;
    lock.current = true; setPending(true); setMessage("");
    // 完成后再次读取同一模式，另一个页面的选择不属于本次写回目标。
    // 用户改选模型或权重即拒绝迟到结果，不覆盖新的明确输入。
    // 图像元数据只解析用户开始读取时的那张原始 File。
    const unchanged = () => { const now = { ...useAnimaEditStore.getState(), ...editor.getDraft() }; return !now.taskId && !now.importing && (getSourceFile ? getSourceFile() === sourceFile : now.source === before.source) && now.selectedModel === before.selectedModel && now.extensions === before.extensions; };
    // 使用函数入口读取最新图片草稿，await 两条分支保持相同提交顺序。
    // 原图分支只读本地文本，既不上传也不请求 ComfyUI 模型推理。
    // 空 extensions 保留用户已删除编辑 LoRA 的选择，不重新触发预载初始化。
    // 合并结束只 patch 两个资源字段，结果画布、原图和采样参数保持现状。
    // 当前选择引用改变时明确忽略旧结果，不尝试把过期字段合并回新草稿。
    // pending 在成功、失败及失效分支都恢复，按钮不会永久保持加载状态。
    // 捕获 unknown 异常并只展示可读 message，不显示 stack 或原始对象。
    // 成功提示仅表示表单资源已加载，不声称远端模型存在或运行成功。
    try {
      const value = await (fromImage ? resourcesFromEditImage(sourceFile!) : resourcesFromImageMode());
      if (!unchanged()) return;
      // 主模型与 LoRA 原子写回当前模式，默认空蒙版不会添加编辑 LoRA。
      // 用户已选的附加扩展仍按既有合并规则保留，可在标准列表继续调整。
      // source、采样和活动任务不在此次 patch 范围内。
      editor.patchDraft({ selectedModel: value.selectedModel, extensions: mergeEditResources(value.extensions, before.extensions ?? []) });
      setMessage(t("create.animaEdit.resourcesLoaded"));
    } catch (reason) { if (unchanged()) setMessage(reason instanceof Error ? reason.message : t("create.animaEdit.resourceUnavailable")); }
    finally { lock.current = false; setPending(false); }
  };
  // 显式 disabled 与上面的同步检查互补：禁用展示状态不能替代实际边界判断。
  // 读取按钮在无原图时仍可见，使用户知道该功能需要先导入图片。
  // 长错误按单词换行，不能撑开固定宽度的创建表单或挤压预览区。
  // 两个图标均为本地 SVG，主题、网络或模型封面缺失不会导致入口消失。
  // aria-live 只播报结果提示，避免整个模型卡片反复打断读屏。
  // 读取中共享 pending 提示，同一时刻只有一个加载动作可执行。
  // 说明文字交代数据来源和编辑 LoRA 保留策略，避免用户误认为做了视觉识别。
  // 此区域本身不创建额外弹窗，与窄屏主区替换及原模型选择窗口相容。
  // 提示属于当前工具局部交互，不写入生成队列或持久化用户数据文档。
  // fieldset 在生成或导入时仍由原父组件统一禁用，按钮另外显式表达这些状态。
  const disabled = pending || editor.busy || editor.importing;
  return <div data-anima-resource-actions className="space-y-2"><div className="flex flex-wrap gap-2">
    {/* 界面：同步普通图片模式当前选择，复制后可以继续独立调权。 */}
    <button data-anima-sync-models type="button" disabled={disabled} onClick={() => { void load(false); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"><RefreshCw className="h-3.5 w-3.5" aria-hidden />{t("create.animaEdit.syncImageModels")}</button>
    {/* 界面：从已导入原图的内嵌工作流读取模型，缺参数时保持现有选择。 */}
    <button data-anima-read-models type="button" disabled={disabled || !(getSourceFile ? getSourceFile() : editor.source)} onClick={() => { void load(true); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"><ImageDown className="h-3.5 w-3.5" aria-hidden />{t("create.animaEdit.readImageModels")}</button>
  </div><p className="text-[11px] leading-5 text-muted-foreground">{t("create.animaEdit.resourceHint")}</p><p data-anima-resource-message role="status" aria-live="polite" className="break-words text-xs leading-5 text-muted-foreground">{pending ? t("create.animaEdit.readingModels") : message}</p></div>;
}
