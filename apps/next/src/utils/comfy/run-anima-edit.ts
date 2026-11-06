/**
 * 文字改图执行适配：复用安全 IPC 上传、生成、版本化 PNG 保存和图库刷新。
 * 不在渲染进程请求 ComfyUI HTTP，也不建立第二套磁盘写入实现。
 * 原图只在用户明确运行时上传；所有参数与目标目录在等待前冻结。
 */
import { fetchComfyModelLists, generateWithComfy, revokeComfyImages, uploadImageToComfy } from "@/api/comfyui";
import { useHistoryFolderStore } from "@/stores/useHistoryFolderStore";
import { saveGeneratedImagesToDisk } from "@/utils/saveGeneratedImages";
import { buildGeneratedImageMeta } from "@/utils/buildGeneratedImageMeta";
import { loadMaskImage } from "@/utils/mask-image";
import { t } from "@/i18n";
import { buildAnimaEditPrompt, resolveAnimaEditModels, type AnimaEditSettings } from "./anima-edit-workflow";
import type { ComfyGeneratedImage } from "@/types/comfy";
// 编辑工作流与文生图共用模型身份提取和队列记账，不增加旁路账本。
// 快照必须放在模型解析后，不能保留表单中可能已被替换的短名字。
import { generationModelsFromPrompt } from "@/utils/generation-statistics";
import { useGenerationTaskStore } from "@/stores/useGenerationTaskStore";
// 模块复用已有 renderer API 封装，不直接访问 window.electronAPI 的原始通道。
// 同一封装保持 IpcResult 错误码，hook 可以区分断线与停止失败。
// 不把远端 promptId 当作本地 session.id，两者属于不同的生命周期。
// 编辑目前一次只运行单张，不读取普通图片队列的批量数量。
// 本执行器与普通生成共用输出写入器，因此文件命名规则仍一致。
// 生成成功但保存失败仍向上拒绝，用户能够知道输出没有进入图库。
// 额外图片的释放仅针对本次回包，不影响其他页面已经持有的结果。
// 默认输出目录解析失败不会用浏览器当前目录代替，继续由共享层表达失败。
// 文件上传是用户明确点击后的副作用，导入和调整参数不会发原图字节。
// 所有取消检查发生在异步返回边界，不能撤销已经提交的上传或文件写入。
// 远端任务真正停止依赖主进程取消确认，AbortSignal 本身不等价于服务端 interrupt。
// 输出尺寸不是生成速度或显存估算，本模块不提供未经测量的性能数字。
// 结果保存的是单张 PNG，不把参考图和产物拼在同一下载图中。
// 服务返回的临时图片先经安全桥读取为 Blob，renderer 不拼接任意服务文件 URL。
// 文件名替换只影响本次 prompt，原始 File 对象仍可用于用户重试。
// 测试使用隔离模型与图片回包，真实自定义节点兼容性仍需本机 ComfyUI 验证。

// 返回值保留结果 Blob，下载按钮不需要重新向服务器取图。
// URL 所有权在成功后交给公共队列；失败路径由执行器统一释放。
// 实际尺寸来自图片解码，不能拿 MP 估算值充当生成结果尺寸。
export interface AnimaEditResult { image: ComfyGeneratedImage; width: number; height: number; savedPaths: string[] }
// session.id 与主进程生成请求和取消请求使用同一标识，不能在上传后重新生成。
// signal 只中断本地后续阶段，远端执行仍由既有 cancel API 明确停止。
// onPhase 不包含百分比，当前后端桥接没有提供可用于该表单的进度事件。
// 返回结果意味着落盘完成；仅收到 ComfyUI 输出还不满足成功条件。
// savedPaths 留给后续调用者追踪保存结果，不把服务器临时目录冒充本机路径。
// 独立的会话对象让执行器不依赖 React 生命周期，也不会在内部更新组件。
// 服务器和保存路径由公共队列的提交快照提供，不在等待轮到任务时重新读设置。
// 上传和推理必须使用同一个服务器；切换页面或连接配置不能拆开一次任务。
// output 是经共享目标解析器校验后的本机目录，不是 ComfyUI 临时输出目录。
export interface AnimaEditSession { server: string; output: string; id: string; signal: AbortSignal; onPhase: (phase: "uploading" | "generating" | "saving") => void }

/**
 * 先检查模型，再上传；任一前置失败都不创建生成请求。
 * 上传文件使用随机名称，避免不同任务的同名原图相互覆盖。
 * 工作流使用上传回包的 subfolder/name，不假定服务器保留原名称。
 * 每个 await 边界后检查取消信号，停止上传等待后不能继续提交工作流。
 * 真正生成阶段交给既有 requestId 会话，因此停止可定位本次任务。
 * 共用图片构建器每次返回独立图，服务端路径匹配只作用于本次提交。
 * 同步调用 onPhase 仅报告真实阶段，不制造模型进度百分比。
 * 模型列表强制刷新，前一次安装成功不代表本次节点/模型仍可用。
 * 图片字节仅经过现有 preload 的最小 API 面传递。
 * 本函数不吞掉错误；hook 在当前表单显示具体失败并恢复可操作状态。
 */
export async function runAnimaEdit(file: File, value: AnimaEditSettings, session: AnimaEditSession): Promise<AnimaEditResult> {
  // 服务地址也按任务快照读取，生成和上传必须指向同一个 ComfyUI 实例。
  // 页面可以在其他功能中修改设置，但不能把本任务后半段切换到另一台服务。
  // 构建先做纯输入校验，非法指令或 seed 不消耗上传流量。
  // 原始 file.name 这里只是占位，实际提交必定使用服务端确认的上传名称。
  // 输出根路径查询可能跨 IPC 等待，返回后必须再次判断是否已经停止。
  // 模型刷新强制跳过缓存，避免服务重启或删除文件后仍按旧列表排队。
  // resolve 函数会覆盖本次图中模型名称，后续 Meta 必须保留解析后的名字。
  // 这些前置步骤未创建远端生成会话，停止时不调用全局中断。
  // 目标在入队时冻结，执行器只消费队列传入的上下文。
  // 不引用页面 hook，卸载也不能取消上传后的后续步骤。
  // 每个异步边界仍由 signal 防止显式停止后的提交。
  const { server, output } = session;
  const prompt = buildAnimaEditPrompt(value, file.name);
  // 任务可能在等待前一项时已被撤回，模型刷新前也要检查。
  // 此处没有创建远端会话，不发送无目标的 interrupt。
  // 真正取消由公共队列统一处理，本函数只遵循 signal。
  session.signal.throwIfAborted();
  resolveAnimaEditModels(prompt, await fetchComfyModelLists(server, true)); session.signal.throwIfAborted();
  // 控制补丁不计入主模型或 LoRA，真正加载的编辑 LoRA 则正常计入。
  // 更新任务只保存轻量身份，源 File 与完整图仍留在执行器中。
  // 上传或生成失败时没有落盘图片，统计不会凭这份快照制造使用量。
  useGenerationTaskStore.getState().update(session.id, { models: generationModelsFromPrompt(prompt) });
  session.onPhase("uploading");
  // 新 File 复用源字节，不先画进 canvas，避免丢失透明度或引入有损重编码。
  // 扩展名由允许的 MIME 决定，原文件名不直接参与服务端存储路径。
  // 随机会话名避免两个用户同名 input.png 的上传互相覆盖。
  // 请求取消不能撤回已经上传的 input 文件，此处只保证不再提交后续任务。
  // 上传返回可能包含子目录或服务端改名，不能假定请求名被原样保留。
  // subfolder 为空时 filter 去掉空段，避免以斜线开头变成根路径。
  // 不将上传缓存当作本机生成结果，只有模型输出进入正式保存流程。
  const extension = file.type === "image/jpeg" ? ".jpg" : file.type === "image/webp" ? ".webp" : ".png";
  const uploaded = await uploadImageToComfy(new File([file], `anima_edit_${session.id}${extension}`, { type: file.type }), server);
  session.signal.throwIfAborted(); prompt["edit-source"].inputs.image = [uploaded.subfolder, uploaded.name].filter(Boolean).join("/");
  session.onPhase("generating");
  // onPhase 同步发生在生成 IPC 之前，让停止按钮准确知道已进入远端阶段。
  // generateWithComfy 复用主进程的验证、等待、断线检测与 requestId 管理。
  // IPC 拒绝在创建图片 URL 之前抛出，因此这里不需要回收尚不存在的结果。
  // 返回后立即进入 try/finally 式资源保护区，后续任何错误都回收输出 URL。
  // 主动取消与模型完成可能同时到达，signal 检查防止取消后误保存成功。
  // 此处不自己轮询 history，不建立第二套超时或远端停止语义。
  const result = await generateWithComfy(prompt, { serverAddress: server, requestId: session.id });
  try {
    session.signal.throwIfAborted();
    const image = result.images.find((item) => prompt[item.nodeId]?.class_type === "PreviewImage");
    // 只接受当前图的 PreviewImage 输出，忽略其他节点的临时预览。
    // 没有预期图片时即失败，不能把原图补进去制造可下载的“结果”。
    // 图片解码确认真实尺寸，也能拒绝 MIME 声明为图片但字节损坏的回包。
    // 解码仍可能异步等待，此后第二次 signal 检查覆盖该时间窗口内的停止。
    // 实际结果可与估算 MP 尺寸不同，保存 Meta 使用解码值而非表单估算值。
    // 只有当前结果 image 的对象 URL 可能最终转交给页面。
    if (!image) throw new Error(t("create.animaEdit.noResult"));
    const decoded = await loadMaskImage(image.objectUrl); session.signal.throwIfAborted();
    session.onPhase("saving");
    // 保存阶段不再接受停止：主进程写文件的副作用无法靠 AbortSignal 回滚。
    // 标准参数摘要用于现有图片信息展示，精确连线仍以完整 workflow 为准。
    // UNet 和 LoRA 名从已解析图读取，不能保存上传前的本地绝对路径选择值。
    // LoRA 保留每个 strength_model，图片二创回读不应丢失新增扩展。
    // instruction 与构建器一样 trim，Meta 不把编辑前的额外空格当不同指令。
    // generationKind 标为 img2img，避免统计或二创时误认为无参考的文生图。
    // 不伪造 sourceImagePath，ComfyUI input 名称不能作为本机图片路径重用。
    const params = { positivePrompt: value.instruction.trim(), negativePrompt: value.negative, seed: Number(value.seed), steps: value.steps, cfg: value.cfg, samplerName: value.samplerName, scheduler: value.scheduler, width: decoded.naturalWidth, height: decoded.naturalHeight, checkpointName: String(Object.values(prompt).find((node) => node.class_type === "UNETLoader")?.inputs.unet_name ?? value.checkpointName), loras: Object.values(prompt).filter((node) => node.class_type === "LoraLoaderModelOnly").map((node) => ({ name: String(node.inputs.lora_name), strength: Number(node.inputs.strength_model) })) };
    const savedPaths = await saveGeneratedImagesToDisk([image], result.promptId, output, buildGeneratedImageMeta({ promptId: result.promptId, params, workflow: prompt, generationKind: "img2img" }));
    // 共享写入器负责 PNG prompt 与独立版本标记，不新增未版本化的私有格式。
    // 保存空列表是失败，不能仅依据生成请求返回就展示“已保存”。
    // 文件操作失败由调用方反馈，已有落盘副作用不在这里作未经确认的回滚。
    // 共享图库刷新只在保存成功后触发，失败任务不会添加不存在的记录。
    // 丢弃多余输出可防止服务返回其他预览时长期占用 Blob 内存。
    // image 交给公共队列作为任务缩略图；编辑结果另建展示 URL。
    // 如果卸载发生在保存中，文件和全局结果照常完成，不由页面 effect 回收。
    // catch 不改写错误码，断线、主动停止和保存失败仍可由 hook 区分。
    if (!savedPaths.length) throw new Error(t("create.page.saveFailed"));
    revokeComfyImages(result.images.filter((item) => item !== image)); useHistoryFolderStore.getState().refreshGeneratedImages();
    return { image, width: decoded.naturalWidth, height: decoded.naturalHeight, savedPaths };
  } catch (error) { revokeComfyImages(result.images); throw error; }
}

// 保存阶段暂不提供停止入口：文件写入已经进入主进程，不能伪装已经撤回。
// 保存失败时不显示“已生成”，也不保留可误认为已落盘的成功状态。
// 写入继续使用独立 illusionRealmMeta 版本块，prompt 块与提交对象一致。
// sourceImagePath 不伪造为服务端 input 名：上传名称并不是本机绝对路径。
// 参考图名称仍可通过 LoadImage 节点追溯，不另造未版本化的旁车格式。
// 原图与结果对照属于展示行为，不在此修改生成参数或图片字节。
// 结果筛选严格使用图片工作流的 PreviewImage 节点，不能取 history 中第一个不相关输出。
// 无结果、解码错误与磁盘保存错误都进入同一资源回收分支。
// 错误释放所有临时对象 URL，成功仅留下返回给页面的单张结果。
// 公共 FIFO 调度器负责串行执行，文字改图每个任务仍只输出一张。
