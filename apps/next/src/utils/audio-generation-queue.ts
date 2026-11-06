/**
 * Role TTS 队列适配：与文生图、编辑共用一个 FIFO，切换页面不取消任务。
 * 每次点击冻结参数、参考 File、服务和输出目录，后续修改只影响下一次。
 * 先校验再排队，放行后才上传；取消排队项不会产生远端上传副作用。
 * 内部 workflowId 使用英文，中文提示词及合法模型相对路径保持原样。
 */
import { enqueueGenerationTask, snapshotGeneration, generationSaveTarget } from '@/utils/image-generation-queue';
// 入队同时冻结所选模板默认值，卡片显示真实默认或用户选择的 UNet。
// reference File 决定模板，不能用上一次 UI 显示的节点前缀作为选择依据。
// 默认步数和模型名来自 JSON，等待期间调整表单不改变已经入队的任务。
import { audioWorkflowDefaults, buildAudioPrompt, resolveAudioModels, type AudioWorkflowInput } from '@/utils/comfy/audio-workflow';
import { audioExtension, generateAudio, saveAudio, uploadReferenceAudio } from '@/utils/comfy/audio-media';
import { useGenerationTaskStore } from '@/stores/useGenerationTaskStore';
import { useGenerationNoticeStore } from '@/stores/useGenerationNoticeStore';
// 旧完成通知的动作是“查看图片”，音频不能跳入该详情入口。
// 音频成功用明确的 toast 提示，任务中心仍保留可查看文件的真实结果。
// 不通过伪装图片路径复用通知，避免后续图库解析音频失败。
import { useToastStore } from '@/stores/useToastStore';
import { t } from '@/i18n';

// reference 是不可变 File，执行闭包持有它直到完成或撤回。
// 参数对象深克隆，避免 LoRA 权重在排队期间被外部修改。
// 构建时的占位文件名只用于本地校验，不会发送给 ComfyUI。
// 正式参考路径必须在上传结束后重新构建到 LoadAudio。
// id 同时是任务卡片身份和主进程取消会话身份，不另造一套取消状态。
// 音频生成仅开放单条任务，不能隐式使用图片页的批量数量。
// width/height 是内部工作流摘要，audio 标识让卡片不按图片展示它。
// remote 仅在真正调用生成 IPC 之前置为 true，避免上传时全局 interrupt。
// 先克隆用户参数再调用任何 await，后续修改 LoRA 权重不会穿透快照。
// reference File 自身不可变，不需要读取字节才能在队列闭包中安全保存。
// 引用文件的存在是自动选图唯一依据，不使用输入框中显示的名称判断。
// 没有参考时不会执行上传接口，也不会生成无效 LoadAudio 节点。
// 预校验时的 reference.flac 不表示真正输入编码，其值从不被发送。
// 当前输出模式为 fixed 时，目标仍需经过原队列的范围与根目录校验。
// 自由输出模式继续沿用项目既有规则，不增加一个音频专用路径配置。
// 目录解析发生在 FIFO 放行之后，排队期间不能提前创建大量输出目录。
// 目标路径返回后立即检查取消，避免撤回项继续上传参考。
// 参考上传结束后再次检查取消，防止等待期间的停止被吞掉。
// 构建图只替换当前快照，不能复用上一次任务已解析的模型节点。
// 模型清单刷新后再次检查取消，确保本地检查期间停止不触发远端推理。
// remote 在提交前同步置位，标题栏取消能够及时定位主进程会话。
// remote 回调读取闭包最新值，不捕获入队时的 false 常量。
// 主进程 requestId 一直使用 FIFO 提供的 id，不能另取工作流的 prompt_id。
// prompt_id 属于服务端返回值，requestId 则在排队时就存在。
// 结果下载后检查取消，取消项不能继续进入保存阶段。
// 保存开始以前设置 saving，公共停止入口据此保护已经开始的文件副作用。
// 即使保存期间用户点击停止，完整保存成功后仍如实标记 completed。
// completed 增加到 1 表示这张工作流已落盘，不表示只有一个输出文件。
// 多个音频输出全部列入 savedPaths，不能因为只显示一个播放器丢弃其余路径。
// 任务卡片不持有播放 URL，音频结果 store 独立负责播放资源的释放。
// 当前函数返回 id 与 promise，调用方可以在实际推理开始前就关联队列卡片。
// 排队撤回导致 promise 拒绝，由表单 store catch 负责消费。
// 远端普通节点错误只失败一项，后面合法任务可以继续执行。
// COMFY_DISCONNECTED 和 COMFY_TIMEOUT 沿用公共停止后续任务策略。
// COMFY_STOP_FAILED 不被改写成成功取消，远端未确认不能继续提交。
// 任务状态完全由公共 store 更新，音频不使用第二份 status 枚举。
// 音频模式不会读取 useCreateFormStore 的图片尺寸和批量数量。
// 提示词可以包含换行和非拉丁对白，冻结时不会 trim 掉内部格式。
// 模型摘要显示实际 UNet 文件名，音频标记区分任务媒介而不伪装成 TTS 引擎。
// 音频长度取显式覆盖或当前模板，不受视频页上次时长影响。
// 全局完成提示必须说音频，旧“图片已生成”通知不能复用错误文案。
// 实际 savedPaths 供任务中心定位文件，不被传入图片二创解析器。
// 用户切到其他路由时，模块级 pending 与执行闭包仍然可达。
// UI 重挂载只恢复草稿和结果，不重新执行尚未结束的提交。
// 音频任务和图片任务共用同一个运行槽，因此不会各自向 ComfyUI 并发提交。
// 本函数不改变 ComfyUI 的全局执行策略，只控制本客户端提交顺序。
// 用户其他客户端的任务不由此队列删除或重排。
// 没有显式用户取消时，不在组件 cleanup 发出任何 interrupt。
// 每个 await 的异常都由调度器统一 finishFailure，不在此层返回空成功值。
// 网络原始音频字节只在当前任务结果中短暂存在，调度完成后不保留冗余副本。
export function enqueueAudioGeneration(value: AudioWorkflowInput, reference: File | null) {
  // 显式覆盖优先，未覆盖时读取与参考素材相对应模板的模型与步数。
  // 将默认值也冻结进快照，实际执行不用重新读取另一页面的模型选择。
  // structuredClone 继续隔离嵌套 LoRA 数组和权重。
  const defaults = audioWorkflowDefaults(Boolean(reference));
  // 像打印后的订单：缺省秒数也在入队时确定，执行时不再读草稿。
  // 显式秒数优先于模板，参考文件存在性只决定未编辑时的默认。
  // 与模型、步数一起深克隆，批次等待期间改时长不会串入旧任务。
  const settings = structuredClone({ ...value, unetName: value.unetName ?? defaults.unetName, steps: value.steps ?? defaults.steps, durationSeconds: value.durationSeconds ?? defaults.durationSeconds });
  if (reference) audioExtension(reference);
  buildAudioPrompt({ ...settings, referenceName: reference ? 'reference.flac' : undefined });
  const snapshot = snapshotGeneration({ positivePrompt: settings.prompt });
  let remote = false;
  // 音频标记决定卡片媒介，model 则保留本任务真正使用的 UNet 名称。
  // 内部 32×32 仍不作为用户图像尺寸展示，队列卡片沿用音频分支。
  // 同一公共 FIFO 逐项执行按钮所选数量，单项的 total 始终为一。
  return enqueueGenerationTask({ prompt: settings.prompt, model: settings.unetName, width: 32, height: 32, total: 1, folderId: snapshot.folderId, mediaKind: 'audio' }, async (id, signal) => {
    const update = useGenerationTaskStore.getState().update;
    update(id, { status: 'generating' }); useGenerationNoticeStore.getState().start();
    const target = await generationSaveTarget(snapshot); signal.throwIfAborted();
    update(id, { folderId: target.folderId });
    const referenceName = reference ? await uploadReferenceAudio(reference, snapshot.server) : undefined;
    signal.throwIfAborted();
    const graph = buildAudioPrompt({ ...settings, referenceName });
    await resolveAudioModels(graph, snapshot.server); signal.throwIfAborted(); remote = true;
    const outputs = await generateAudio(graph, snapshot.server, id); signal.throwIfAborted();
    update(id, { status: 'saving' });
    const savedPaths = await saveAudio(outputs, target.path);
    update(id, { status: 'completed', completed: 1, savedPaths });
    // 公共队列串行，当前音频结束时可安全关闭其活动通知。
    // 成功提示只表示已经完成落盘，不能在下载临时输出以后提前显示。
    // 下一任务开始会重新调用 start，不与当前提示共用虚构图片路径。
    useGenerationNoticeStore.getState().dismiss(); useToastStore.getState().show(t('create.audio.saved'));
    return { outputs, savedPaths };
  }, () => remote);
}

/**
 * executeTask 内每个跨边界等待后都检查 signal，不把取消当作普通成功。
 * 保存一旦开始不再中途撤回，沿用公共队列对文件副作用的保护。
 * ComfyUI 断开、超时、停止失败的错误码由公共队列归类并终止后续待执行项。
 * 普通节点失败仅结束当前任务，不清除其他合法待执行任务。
 * 成功结果包含原始 Blob，播放端自行创建和释放 URL。
 * 保存到目录以后才增加 completed，临时预览不能冒充用户文件。
 * 不刷新图片图库计数，音频文件不会被错误统计为已生成图片。
 * 完成通知和输出路径都来自提交快照，不读取用户正在浏览的新目录。
 * 页面离开只卸载展示组件，不会释放任务闭包中的参考素材。
 * Promise 的拒绝由调用 store 消费，取消不会产生未处理异常。
 */
