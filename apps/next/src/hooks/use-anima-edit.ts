"use client";

/**
 * 文字改图界面适配：订阅常驻草稿，把执行交给公共 FIFO 队列。
 * 路由与模式切换不取消任务，也不释放仍供结果画布使用的对象 URL。
 * 只有用户显式停止才触发公共取消入口；任务卡片和表单共用 requestId。
 */
import { useAnimaEditStore, type EditSource } from "@/stores/use-anima-edit-store";
import { useAnimaEditModels } from "@/hooks/use-anima-edit-models";
import { enqueueAnimaEdit } from "@/utils/anima-edit-queue";
import { cancelImageGeneration } from "@/utils/image-generation-queue";
import { loadMaskImage } from "@/utils/mask-image";
import { t } from "@/i18n";
import { generateRandomSeed } from "@/utils/seed";
// 模板参数按模式分别保存，源图与任务生命周期仍由原公共会话管理。
// 同步读取用于生成和资源快速加载，不能等下一帧才取得正确参数。
// 文字表单显式切换不影响专用蒙版与边缘页面的模式绑定。
import { editDraftSetter, getAnimaEditDraft, patchAnimaEditDraft, useAnimaControlStore, type ControlMode } from '@/stores/use-anima-control-store';

// 版本号属于进程内导入顺序，不属于页面挂载次数。
// 两次快速选择使用最后一次结果，旧解码完成不能覆盖新素材。
// 离开页面不递增，合法导入仍可完成并在返回时恢复。
let sourceVersion = 0;

/**
 * MIME、字节大小与解码后像素数分别限制，三者不能相互替代。
 * 只支持 PNG/JPEG/WebP，不把任意拖入文件当图片转发到服务端。
 * 导入失败保留上一张可用原图，用户无需重新选择。
 * 新原图成功导入才清空旧结果，避免旧图被标成新原图的编辑产物。
 * 移除原图保留修改指令，与模板中的编辑操作一致。
 * 版本号在清除和替换素材时递增，迟到的解码不能复活已删除素材。
 * 一次只保留一张源图，与工作流的 LoadImage 契约一致。
 * 仅进程内保留素材，页面卸载不释放队列正在使用的 File。
 */
export async function importAnimaEditFile(file: File, controlMode?: "inpaint") {
  // 蒙版入口传入导出的透明 PNG；普通上传不带模式，恢复原文字改图。
  // 复用同一导入校验和会话，不复制画布笔迹或制造第二个生成状态。
  // 模式仅在源图成功解码后更新，坏文件不能切换现有工作流。
  // version 比较的是选择顺序，不能用文件名判断是否仍是同一次导入。
  // 两个不同目录的同名文件与连续选择同一文件都应视为新的请求。
  // importing 在解码之前置位，运行入口不应在尺寸尚未知时提交。
  // 错误只写编辑领域 store，不污染其他创建表单的提示。
  // clearResult 在有效源图替换时执行，非法文件不应清空已存在的有效结果。
  // clearRunError 在尝试导入时执行，让旧“缺原图”错误不遮盖新文件错误。
  // 两个回调分开，避免为了清理提示而提前删除用户已有可用数据。
  // 操作入口读取最新任务门闩，事件闭包不能绕过运行时的输入保护。
  // 单独的导入错误仍保留上一张可用源图，不自动重置用户已经选好的模型。
  // 本地解码由导入操作拥有，页面卸载不会把合法请求标记为过期。
  const state = useAnimaEditStore.getState(); if (state.taskId) return;
  // 错误和 importing 分别写回同一个领域 store，跨路由可恢复真正导入状态。
  // 不使用旧页面闭包中的 source，释放旧 URL 时总是读取当前源数据。
  // 保存成功的新 source 接管 URL，失败 catch 仅释放本次未接管的临时 URL。
  // 两次选择同名文件仍按版本顺序判断，不凭名称推断是同一次输入。
  // 缺原图提示在新导入开始时清除，让新的格式错误可以直接显示。
  // clearResult 只在导入真正成功时执行，坏文件不能抹掉上一轮有效输出。
  // 同步 setter 的封装只做状态合并，不触发上传、推理或目录读取。
  const setError = (error: string) => useAnimaEditStore.getState().patch({ error });
  const setImporting = (importing: boolean) => useAnimaEditStore.getState().patch({ importing });
  const clearRunError = () => setError("");
  const clearResult = () => state.setResult(null);
  // 源图和模式同步接管，不能出现新透明图配旧参考链的短暂有效草稿。
  // 模型、LoRA 与采样值分别留在对应模式草稿，导入不覆写用户已调参数。
  // 取消、保存和跨路由状态仍由原编辑 store 与公共队列负责。
  // 普通上传恢复文字表单，透明通道交接显式选择蒙版模板。
  // 模式与 source 在同一同步回调接管，不等待 effect 再修正采样默认值。
  const setSource = (source: EditSource) => { const previous = useAnimaEditStore.getState().source; if (previous) URL.revokeObjectURL(previous.url); state.patch({ source }); useAnimaControlStore.getState().setFormMode(controlMode ?? "text"); };
    // token 在第一个 await 前取得，快速连续导入时最后一次选择拥有写入权。
    // url 先初始化为空，格式校验失败时 catch 不会释放不存在的 URL。
    // 开始新导入先清旧提示，失败后展示本次错误而不是上一轮运行错误。
    // 原先的 source 暂留页面，只有新文件完成验证后才进行原子替换。
    // file.type 白名单不依赖扩展名，伪装为 .png 的文本不能靠文件名通过。
    // 字节大小在解码前检查，避免把超大文件先交给浏览器图像解码器。
    const token = ++sourceVersion; let url = ""; clearRunError(); setError(""); setImporting(true);
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || !file.size || file.size > 25 * 1024 * 1024) throw new Error(t("create.animaEdit.invalidFile"));
      // MIME 合法仍不等于字节可解码，loadMaskImage 使用浏览器实际解码结果。
      // 复用蒙版图像工具只是解码机制，两个编辑工具的素材状态仍相互独立。
      // naturalWidth/naturalHeight 是像素尺寸，不使用受 CSS 缩放影响的显示矩形。
      // 四千万像素限制覆盖高度压缩、文件小但解码内存过大的素材。
      // 解码失败走同一 catch，不允许坏图继续上传到 ComfyUI。
      url = URL.createObjectURL(file); const image = await loadMaskImage(url);
      if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error(t("create.animaEdit.tooLarge"));
      // 先检查 token 再写源数据，较慢的旧图片不能覆盖较快的新选择。
      // 过期导入也拥有临时 URL，丢弃时立即释放而非等待组件卸载。
      // 只有本次仍有效才清空旧结果，旧异步请求不能清掉新图的结果。
      // file、url 与尺寸在同一个对象写入，避免渲染时混用两张图片的信息。
      if (sourceVersion !== token) { URL.revokeObjectURL(url); return; }
      clearResult(); setSource({ file, url, width: image.naturalWidth, height: image.naturalHeight });
    // 失败释放本次临时 URL，但保留旧 source；错误提示也只属于当前 token。
    // 抛出的非 Error 值回落为已翻译说明，不把动态对象直接显示到界面。
    // finally 只结束当前导入，新选择已经开始时不能提前撤掉其 loading。
    } catch (reason) { if (url) URL.revokeObjectURL(url); if (token === sourceVersion) setError(reason instanceof Error ? reason.message : t("create.maskEditor.loadFailed")); }
    finally { if (token === sourceVersion) setImporting(false); }
}


/**
 * 显式清除只作用于草稿，不删除公共任务历史和已经落盘的图片。
 * 活动任务保持冻结输入，不能通过删除原图制造新的提交入口。
 * 先递增版本号，尚未完成的旧导入只能释放自身临时 URL。
 * 移除原图保留指令和模型选择，便于继续换图编辑。
 * URL 的释放在操作边界执行，React 严格模式重挂 effect 不影响素材。
 * 结果使用独立展示 URL，清空不会让任务卡片缩略图变成坏图。
 */
function clear() {
  const state = useAnimaEditStore.getState(); if (state.taskId) return;
  sourceVersion++; if (state.source) URL.revokeObjectURL(state.source.url);
  state.setResult(null); state.patch({ source: null, importing: false, error: "" });
}

/**
 * 页面只订阅 store，不注册取消或释放结果的 unmount cleanup。
 * settings、原图、选中模型、LoRA、错误和结果都能在返回编辑页后恢复。
 * run 同步写入 taskId 后才等待，连续点击不会重复创建当前编辑任务。
 * 队列返回 id 时任务已经可见，不能等开始生成后才出现在任务列表。
 * 排队时表单锁定并允许撤回，保存时停止入口禁用。
 * models.snapshot 沿用文生图参数校验和真实资源路径解析。
 * 任何失败都消费拒绝并恢复可操作状态，不产生未处理 Promise rejection。
 * 全局卡片中的失败状态由公共队列更新，这里仅同步编辑表单提示。
 */
// 显式 text 与控制模式使用同一个入口，移除重复模式按钮后仍固定读取文字草稿。
// 不传参数的旧调用方继续沿用 formMode，专用蒙版和边缘调用方不受影响。
export function useAnimaEdit(requestedMode?: ControlMode | 'text') {
  // 领域 store 保存结果与草稿，hook 实例只提供当前组件所需的订阅视图。
  // 模型 hook 的初始化识别 null 与空数组，返回时不会重新预载已移除 LoRA。
  // 使用相同的 store 动作供所有回调写入，避免页面间出现两份不同会话。
  // 真实执行闭包持有 File 和冻结参数，页面隐藏不需要人为暂停任务。
  // 输入组件重建后从 settings 恢复文本，不依赖保留旧 DOM 节点才能生效。
  // 取消后 result 仍为空，不能将未完成任务和之前成功产物混淆。
  // 最终状态更新不等待动画、rAF 或 visibilitychange，窗口遮挡不阻止收尾。
  // 不调用远端全局清队列命令，任务隔离由已有 requestId 桥接提供。
  // source 和 result 的 URL 均由显式草稿操作释放，不注册卸载回收。
  // 应用完全退出仍会释放进程资源，此处只承诺页面和模式切换的存活性。
  // 默认值同步读取，不在 effect 重置；首帧生成也使用正确模板参数。
  // 专用工具和文字表单都可固定 mode，兼容调用方仍可通过 formMode 选择。
  // 只分离参数和资源，taskId、阶段和结果仍保持一份权威状态。
  // patch 将 seedMode 写本模式，其余运行字段仍写公共 store。
  // 函数式 setter 使用最新草稿，连续调整滑条不会丢失其他字段。
  // 已排队参数由执行器复制，切工具不会改变运行中的请求。
  const state = useAnimaEditStore(), control = useAnimaControlStore(), mode = requestedMode ?? control.formMode;
  const draft = getAnimaEditDraft(mode), models = useAnimaEditModels(mode), setSettings = editDraftSetter(mode, 'settings');
  const patch: typeof state.patch = value => { const { seedMode, ...shared } = value; if (seedMode) patchAnimaEditDraft(mode, { seedMode }); state.patch(shared); };
  // 事件处理读取最新 store，不能仅靠闭包中上一帧的 busy 防止重复提交。
  // File 已验证解码才可提交；导入未完成时不允许悄悄使用上一张原图。
  // 缺源图只显示本地错误，不能创建空任务或发上传请求。
  // 队列闭包持有源 File，离开页面之后上传仍可完整完成。
  // settings 与模型列表在点击时统一快照，后续设置只作用于下一次请求。
  // 回调引用 store 而不是 React setter，页面卸载不会丢失最终结果。
  // 旧结果清空由 store 释放展示 URL，公共卡片的历史缩略图不受影响。
  // finally 在成功、取消和失败路径都释放 taskId，允许修正输入后重试。
  // 控制编辑直接提交本次画布导出，不覆盖文字编辑的原图。
  // 覆盖值只在本次调用有效，队列复制参数并持有原始文件字节。
  // 尺寸来自同一次导出，不使用上一张源图的尺寸。
  // 模式在快照时合并，切换工具不能改变已经排队的任务。
  // taskId 在第一个等待前设置，控制与文字工具共用防重入门闩。
  const run = async (prepared?: { source: EditSource; controlMode: 'edge' | 'inpaint' }) => {
    const current = useAnimaEditStore.getState(); if (current.taskId || current.importing) return;
    if (!prepared?.source && !current.source) { current.patch({ error: t("create.animaEdit.sourceRequired") }); return; }
    current.setResult(null); current.patch({ error: "", phase: "queued" });
    try {
      // 随机值每次提交只抽取一次，排队和上传重试不能再次改变。
      // 自定义数字仍原样校验，不用随机回退掩盖无效输入。
      // 冻结任务保存实际随机值，草稿保留之前的自定义值。
      // 文字和两种控制模式共用同一个提交边界。
      // 提交读取事件时最新模式草稿，不能复用隐藏文字表单的采样参数。
      // 随机偏好也分模式，未调整蒙版时保留 JSON 的固定种子基准。
      // 本次生成只抽取一次随机值，队列上传重试不会再次改变它。
      const latest = getAnimaEditDraft(mode);
      const settings = latest.seedMode === 'random' ? { ...latest.settings, seed: String(generateRandomSeed()) } : latest.settings;
      const job = enqueueAnimaEdit((prepared?.source ?? current.source)!, models.snapshot(prepared ? { ...settings, controlMode: prepared.controlMode } : settings), (phase) => current.patch({ phase }));
      current.patch({ taskId: job.id }); current.setResult(await job.promise);
    } catch (reason) { current.patch({ error: editError(reason) }); }
    finally { current.patch({ taskId: null, phase: "idle" }); }
  };
  // 停止统一经过公共队列，不直接调用 ComfyUI 全局 interrupt。
  // queued 的取消不上传、不调用后端；generating 则等待后端确认。
  // checking/uploading 会保留槽位直至已有 IPC 返回，避免取消后并发放行。
  // 保存开始不能承诺撤销已写入的图片，表单和任务卡片都遵守同一边界。
  // 停止本身不清除原图、参数或 LoRA，用户可以直接修正后重试。
  // stopping 防止重复点击；run 的 finally 是最终解除忙碌状态的唯一位置。
  // 取消接口失败保留为明确错误，不能只撤掉 loading 伪装停止成功。
  // 跨路由返回后 stop 读取的仍是同一 taskId，能准确停止已有任务。
  const stop = async () => {
    const current = useAnimaEditStore.getState(); if (!current.taskId || ["saving", "stopping"].includes(current.phase)) return;
    current.patch({ phase: "stopping" });
    try { await cancelImageGeneration(current.taskId); }
    catch (reason) { current.patch({ error: editError(reason) }); }
  };
  // taskId 而非 phase 是是否存在任务的权威来源，queued 也必须锁定表单。
  // store 只保留进程内状态，完整重启后的运行恢复不是此次页面切换保证。
  // 原接口保持稳定，输入组件与蒙版工具无需了解队列内部调度细节。
  // 表单普通上传明确不携带 inpaint，避免下一张 JPEG 误沿用透明蒙版模式。
  // 蒙版专用入口由工具父组件显式调用，不会自动提交生成或上传。
  // 返回值契约保持 importFile，既有拖放和文件选择组件无需更换接口。
  // 资源读取器保留原选择引用，异步解析可判断是否中途换了模型。
  // 草稿 setter 不接管 URL，仍由原 source/result 动作释放资源。
  // 模式切换不重置参数，返回后恢复对应模板最近一次手动选择。
  // 控制表单展示与真实提交读取同一个草稿，不再伪装共享默认值。
  // getDraft 同步读内存，无网络调用，也不触发生成。
  // setMode 只影响文字表单，专用工具始终绑定其明确模式。
  return { ...state, ...draft, patch, setSettings, getDraft: () => getAnimaEditDraft(mode), patchDraft: (value: Parameters<typeof patchAnimaEditDraft>[1]) => patchAnimaEditDraft(mode, value), setMode: control.setFormMode, models, importFile: (file: File) => importAnimaEditFile(file), clear, busy: state.taskId !== null, run: () => run(), runControl: (file: File, width: number, height: number, controlMode: 'edge' | 'inpaint') => run({ source: { file, width, height, url: '' }, controlMode }), stop };
}

// 错误码先收窄，不能把跨 IPC 的动态对象当可信 Error 实例。
// COMFY_STOP_FAILED 优先于取消，表示无法确认远端停止而非已经取消成功。
// 断连保持独立文案，队列清空后的表单不能误显示为正常完成。
// DOMException AbortError 覆盖排队撤回和检查/上传阶段的本地停止。
// 普通业务校验保留 message，未知值回落通用失败说明。
// 错误展示不包含 stack，也不输出完整素材或模型目录到日志。
function editError(reason: unknown): string {
  const code = reason && typeof reason === "object" && "code" in reason ? reason.code : "";
  if (code === "COMFY_STOP_FAILED") return t("create.generationTasks.stopFailed");
  if (code === "COMFY_DISCONNECTED") return t("create.generationTasks.disconnected");
  if (code === "COMFY_CANCELLED" || (reason instanceof DOMException && reason.name === "AbortError")) return t("create.generationTasks.cancelled");
  return reason instanceof Error ? reason.message : t("create.page.generateFailed");
}
export type AnimaEditState = ReturnType<typeof useAnimaEdit>;
