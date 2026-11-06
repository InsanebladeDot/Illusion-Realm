"use client";
/**
 * Role TTS 常驻草稿和播放结果：路由卸载、切模式均不重置。
 * 只保留本次运行的 File/Blob URL，不把私人参考音频写入用户 JSON。
 * 队列负责执行生命周期，此 store 只关联当前任务并保留最近二十次结果。
 */
import { create } from 'zustand';
import { defaultAudioLoras } from '@/utils/comfy/audio-workflow';
import type { VideoLora } from '@/utils/comfy/video-workflow-loras';
import { enqueueAudioGeneration } from '@/utils/audio-generation-queue';
import { generateRandomSeed } from '@/utils/seed';
import { t } from '@/i18n';
// 批次数量沿用图片按钮菜单的数据来源，音频不另建一份选项范围。
// 每项仍独立进入公共 FIFO，关闭页面不丢整批任务。
// 菜单值之外的调用回落到一项，不把小数或异常数量直接交给循环。
import { IMAGE_COUNT_OPTIONS } from '@/data/createForm';
// 两份音频工作流的节点号不同，按参考模式分开保存辅助覆盖。
// 用户替换音频不会丢草稿，也不能让另一张图的 CLIP/VAE 节点串入当前提交。
import type { VideoModelOverrides } from '@/utils/comfy/video-workflow-models';

// 自定义 seed 用字符串保存，用户输入过程中的空值不应被强行改成零。
// random 模式在每次提交时采样，排队和执行时不会再换值。
// 结果为浏览器会话内的播放 URL，真正的文件已在 outputPath 下保存。
// taskId 用于关联全局队列卡片，离开页面后仍能查询正确任务状态。
// 错误写进同一个草稿，返回创建页还能看到失败原因。
// id 由公共任务 id 加输出序号组成，同任务多文件不会发生键冲突。
// url 是客户端生成的 blob: URL，不是可以保存到配置文件的远端地址。
// path 是主进程返回的已落盘路径，不能通过拼接 filename 自行猜测。
// 结果和表单字段同域保存，创建页面重挂载后无需重新查询远端历史。
// 结果数量上限约束浏览器播放资源，不限制已经保存到磁盘的文件数量。
// 参考素材只存在内存中，不借用下载队列或模型索引存放原始字节。
// error 表示最新表单提交的失败，历史任务有自己的卡片错误字段。
// 最新任务完成不清空 prompt，方便用户小幅调整后连续生成。
// 最新任务完成也不清空 reference，同一参考音频可以用于多次提交。
// seed 原始文本与 random 状态分开，切回固定模式能恢复先前编辑值。
// loras 保存实际相对模型名和权重，不只保存资源卡片的显示标题。
// 默认加速 LoRA 可以删除，空数组不能在 patch 或 setLoras 中自动补齐。
// 一个 store 只管理音频模式，不能修改图片或视频的扩展草稿。
// 对外 patch 的可修改字段有限，组件无法靠传 status 伪造成功任务。
// submit 为同步动作，真正异步过程由模块 FIFO 的 Promise 承接。
// 音频草稿不参与用户文档格式变更，无需添加落盘版本迁移。
// 页面卸载后 store 仍然存在，内存占用由结果上限和 File 替换自然控制。
// 恢复客户端进程之后草稿为空，磁盘音频仍可通过输出目录找到。
interface AudioResult { id: string; url: string; path: string }
interface AudioCreateState {
  prompt: string; reference: File | null; seed: string; random: boolean; loras: VideoLora[];
  // null 表示跟随当前音频图默认值，切换参考不会固化上一张图的步数。
  // unetName 是模型相对名而非带图前缀的节点 id，切换模板仍可保留选择。
  // 两字段只在点击时冻结，不能更新已经排队任务的实际模型与采样参数。
  unetName: string | null; steps: number | null;
  // null 跟随当前模板；显式数值在参考音频增删后仍保留用户选择。
  // 时长只属于音频草稿，不读写视频页的同名设置。
  // 路由卸载不重置，与已有提示词、步数保持相同生命周期。
  durationSeconds: number | null;
  // 无参考与参考图各保留一份选择，删除参考后可恢复之前的无参考配置。
  // 只保存在当前会话，不新增另一份用户存储或迁移字段。
  // 队列深拷贝本次分支，之后切换模式不会追溯修改已排队项。
  modelOverrides: Record<string, VideoModelOverrides>;
  taskId: string | null; error: string | null; results: AudioResult[];
  // patch 扩展两项真实工作流参数，不暴露任务终态或结果数组给 UI 写入。
  // 步数可恢复 null，让默认值继续跟随参考音频的有无。
  // 模型覆盖保存名称，不依赖 153:/157: 等模板内部节点前缀。
  // 时长加入同一受控 patch，不让组件创建一份切页就丢的局部状态。
  // 输入范围由共享控件限制，执行前仍有独立预检。
  // 外部传来的非法值不会直接提交到 ComfyUI。
  // patch 只写草稿，模型设置不能伪造任务状态或历史结果。
  // 合并时保留另一种音频模式的辅助配置，恢复默认同样只清当前分支。
  patch: (value: Partial<Pick<AudioCreateState, 'prompt' | 'reference' | 'seed' | 'random' | 'unetName' | 'steps' | 'durationSeconds' | 'modelOverrides'>>) => void;
  setLoras: (value: VideoLora[] | ((current: VideoLora[]) => VideoLora[])) => void;
  // 共用生成按钮传回 N 后必须真正创建 N 个任务，不能只有数量外观变化。
  // 不传数量仍表示一项，兼容表单提交和既有程序化调用。
  // 批次由公共 FIFO 串行执行，而非在本 store 并发请求 ComfyUI。
  submit: (count?: number) => void;
}

// 上次结果与任务列表不共享 object URL，任一列表裁剪不会破坏另一处播放。
// 一个任务可产生多个音频，分别保留路径而不是只展示第一个文件。
// 丢弃超过二十条的结果时释放 URL，已落盘文件不会跟着删除。
// 创建 URL 只发生在保存成功后，失败和取消路径没有额外播放资源。
// 结果写入使用最新 state，等待期间新任务的结果不会被旧闭包覆盖。
// 新结果置前，原有结果的相对顺序保持，切页回来依旧可以播放。
// appendResults 接收的结果来自 saveAudio 成功返回，不接受未保存的临时预览。
// 每个 Blob 只在结果入列时创建一个 object URL，不在 React render 中创建。
// 保存路径与输出以相同索引配对，避免多输出的播放按钮指向另一文件。
// 新结果先排列，再按上限裁剪，旧结果不会在生成开始时被提前清除。
// 并列多任务完成仍使用当前结果列表，不持有 submit 时的陈旧 results 数组。
// 删除 URL 前只看超出上限的项，列表中仍展示的项保持有效。
// 释放 URL 不等于删除输出文件，用户文件生命周期独立于浏览器资源。
// 同一路由重挂载不会执行此函数，结果不会重复插入。
// 新建 URL 的声音内容来自传输返回 Blob，播放不依赖参考文件。
// Blob 的 MIME 来自服务端响应，不从文件名或参考格式硬编码推断。
// 路径仅在用户界面和文件定位接口中使用，不写入日志。
// 结果 id 不包含 prompt，避免任务标识泄漏用户对白。
// 最新结果置前不会改变旧项 key，播放器不会因为索引移动被 React 当成新结果。
// 页面同时存在隐藏 stage 时，两个展示树读取同一份结果而非各自保存。
function appendResults(id: string, result: Awaited<ReturnType<typeof enqueueAudioGeneration>['promise']>) {
  const state = useAudioCreateStore.getState();
  const incoming = result.outputs.map((item, index) => ({ id: `${id}:${index}`, url: URL.createObjectURL(item.blob), path: result.savedPaths[index] }));
  const all = [...incoming, ...state.results];
  for (const item of all.slice(20)) URL.revokeObjectURL(item.url);
  useAudioCreateStore.setState({ results: all.slice(0, 20) });
}

// 入口同步创建任务身份，保证点击以后立刻可在标题栏队列看到排队状态。
// 空描述或非法参考文件等预校验异常由此转为可见错误，不抛到 React 事件层。
// 当前草稿可继续修改，但不会改写已经冻结的任务输入。
// 多次提交共享 FIFO，本模式不建立自己的并发循环。
// 后完成的旧任务不能把新任务的 taskId 覆盖回去。
// 旧任务仍保留自己的失败卡片，但不抢占最新表单的错误提示。
// cancelled 由全局任务状态展示，AbortError 不重复显示成生成失败。
// 保存失败保留失败状态，不创建无法在磁盘找到的播放历史。
// Promise 明确 catch，页面卸载以后异常也有接收者。
// 这里不使用 effect cleanup 中断任务，切模式不能等同于用户取消。
// 自定义 seed 必须只包含十进制数字，不接受科学计数法、负号或小数。
// Number 转换之后仍由 builder 检查安全整数，超长数字不能静默舍入。
// 随机种子复用现有 generateRandomSeed，保持项目已约定的合法范围。
// 随机值在点击边界生成，即使等待前一任务也不重新抽取。
// 随机模式不会清掉用户输入的固定 seed，之后切回仍能继续编辑。
// 预校验同步抛出时不创建 taskId，先前有效任务身份仍可查询。
// 成功入队以后先更新 taskId，再等待 promise，界面立即显示“添加到队列”。
// 当前任务身份不要求与全局最后一个任务相同，其他模式也能共享队列。
// then 仅保存成功结果，远端完成但本地保存失败不会进入播放列表。
// catch 检查任务身份，旧任务失败不覆盖用户新提交的错误状态。
// 即使旧任务失败不显示在表单，它的公共队列卡片仍然记着真实失败。
// AbortError 不写表单红色错误，任务中心已明确显示用户取消。
// 其他 Error.message 沿用 IPC 友好错误，不把主进程堆栈带入组件。
// 未知异常使用通用生成失败词条，避免把对象直接变成 [object Object]。
// 同步异常与异步异常分别捕获，两条路径都不会制造未处理拒绝。
// 此处不做失败重试，避免未确认远端状态时重复提交付费或 GPU 任务。
// 只有用户再次点击生成才创建新的队列项。
// 结果保存与提示完成后，Promise 的回调仍可在创建页之外运行。
// 返回页面时直接订阅 store 最新数据，不依靠路由参数传回结果。
// File 由草稿与已排队闭包分别引用，替换草稿参考不影响旧任务。
// 已经撤回的排队项释放执行闭包，不会留下永久占用的音频任务槽。
// 本 store 不把“切换模式”解释成“停止”，两种意图由不同入口处理。
// 完成任务保留在公共历史中，播放结果上限不会删掉任务状态记录。
// 所有提交状态只在一个客户端进程内共享，不宣称跨重启恢复推理。
// 固定种子零是合法值，不能用 truthy 判断把它替换为随机。
// 用户输入空格不能作为整数通过，本规则与纯构建器安全整数检查互补。
// catch 读取的是执行完成时的当前 taskId，不能使用提交时旧身份判断新任务。
// 同一次点击先冻结草稿，再逐项分配种子；后续 UI 修改不会穿透到任何一项。
// 第一项尊重固定种子，其余项沿用图片批次规则生成新种子，避免重复音频。
// 参数异常在第一项入队前校验，不能给用户留下半批有效、半批非法任务。
function submitAudio(count = 1) {
  try {
    const state = useAudioCreateStore.getState();
    const seed = state.random ? generateRandomSeed() : /^\d+$/.test(state.seed) ? Number(state.seed) : NaN;
    // 数量来源与共用下拉一致；每项有独立任务 id、完成记录和停止入口。
    // 每项内部仍只提交一次音频图，不在 ComfyUI 中篡改 latent 批量参数。
    // 循环在同一个同步动作中完成，File 与 LoRA 都来自同一份点击时草稿。
    const total = IMAGE_COUNT_OPTIONS.some(option => option.count === count) ? count : 1;
    for (let index = 0; index < total; index++) {
      // 每个批次项使用点击时的秒数，后续输入只影响下一次提交。
      // null 转 undefined 保留模板缺省语义，不能用零代替“未设置”。
      // 参考文件与时长同时进入同一项队列，防止执行时再读取当前页面。
      // 按真实 File 是否存在选分支，与构建器的模板决策一致。
      // 点击时就冻结辅助设置，不在任务开始时再读活动 UI。
      const job = enqueueAudioGeneration({ prompt: state.prompt, seed: index ? generateRandomSeed() : seed, loras: state.loras, unetName: state.unetName ?? undefined, steps: state.steps ?? undefined, durationSeconds: state.durationSeconds ?? undefined, modelOverrides: state.modelOverrides[state.reference ? 'reference' : 'text'] }, state.reference);
      useAudioCreateStore.setState({ taskId: job.id, error: null });
      void job.promise.then(result => appendResults(job.id, result)).catch((error: unknown) => {
        if (useAudioCreateStore.getState().taskId !== job.id || error instanceof DOMException && error.name === 'AbortError') return;
        useAudioCreateStore.setState({ error: error instanceof Error ? error.message : t('create.page.generateFailed') });
      });
    }
  } catch (error) { useAudioCreateStore.setState({ error: error instanceof Error ? error.message : t('create.audio.invalid') }); }
}

// 初始扩展直接读取正式模板；用户清空后不在重挂载时偷偷补回来。
// 空提示词引导用户写自己的对白，不自动发送模板作者的样例台词。
// 参考文件默认不存在，因此第一次提交选择 Audio_Minimax。
// patch 只开放表单字段，展示层不能随意修改完成结果或任务身份。
// setLoras 接受函数式更新，兼容公共扩展选择器的权重调整和多选操作。
// Zustand 只负责同一客户端运行期保留，重启后的生成任务恢复不在此功能范围。
// modelOverrides 与 reference 文件分别保存，换参考文件不等于清除用户资源选择。
// text/reference 两份字典避免参考被移除后仍把 157 前缀传到 153 图。
// 队列取入参快照后，用户继续调整下一段音频不会反向修改等待中的任务。
// 初始空字典是遵循模板，不能在首次打开时把默认值存成用户定制。
// 本字段沿用现有 store 生命周期，没有新增第二套 JSON 持久化或跨进程状态。
// patch 仍是原有浅合并，UI 更新分支前必须保留字典中另一分支的内容。
export const useAudioCreateStore = create<AudioCreateState>((set) => ({
  // 默认不写死主模型和步数，从所选图实时读取；用户选择后才设置覆盖值。
  // 初始随机模式和模板加速 LoRA 保持原行为。
  // 两份图的参考切换只改变默认值，显式覆盖保持用户选择。
  // 初始时长不固化为四秒，否则添加参考后无法跟随其五秒默认值。
  // 默认只在展示或入队时求值，用户修改后保留显式覆盖。
  // 与参考 File 一样，本次时长草稿不写入账户服务器。
  // 空分支表示跟随模板，不给内部占位节点或主模型预填辅助覆盖。
  // unetName 继续由原主模型卡片控制，辅助面板不接管这个字段。
  prompt: '', reference: null, seed: '0', random: true, unetName: null, steps: null, durationSeconds: null, modelOverrides: {}, loras: defaultAudioLoras(), taskId: null, error: null, results: [],
  patch: value => set(value), setLoras: value => set(state => ({ loras: typeof value === 'function' ? value(state.loras) : value })), submit: submitAudio,
}));
