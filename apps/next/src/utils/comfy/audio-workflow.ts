/**
 * MiniMax H3 音频图构建：按参考音频选择原始模板，只替换明确开放的参数。
 * 不经过视频分辨率修正：32×32 是本音频工作流的设计值。
 * 模板被深克隆，预校验、连续提交与界面选择都不会污染导入数据。
 * 参考模板文件名和运行时上传名使用英文，避免编码差异。
 * ComfyUI 模型相对路径支持 Unicode，不重命名磁盘模型或翻译对白。
 */
import textTemplate from '@/data/comfy/audioWorkflower/Audio_Minimax.json';
import referenceTemplate from '@/data/comfy/audioWorkflower/Audio_Reference_Minimax.json';
import type { ComfyApiPrompt } from '@/types/comfy';
import { t } from '@/i18n';
import { applyVideoLoras, getVideoLoras, type VideoLora } from './video-workflow-loras';
import { fetchComfyModelLists } from '@/api/comfyui';
import { applyResolvedVideoModels } from './resolve-video-models';
// UNet 覆盖沿用视频与图片共享的相对模型路径校验。
// 不新增模型名称白名单，用户改名后的 MiniMax 文件仍可按扫描结果选择。
// 只改变对应 loader 的值，模型链与加速 LoRA 连线仍由原图维护。
// 主模型仍独立选择，CLIP/VAE 使用共用辅助槽位校验，不能改写内部 pixel_space。
// 覆盖参数必须随本次音频输入快照传入，不能在等待队列时再读取活动表单。
import { applyVideoModelOverrides, applyWorkflowAuxiliaryOverrides, type VideoModelOverrides } from './video-workflow-models';
// 音频与视频使用相同 MiniMax 长度来源，沿用现有客户端时长范围。
// 这是客户端的输入护栏，不代表任意显存都能完成最长时长。
// 只复用数值边界，不调用视频的 FPS、尺寸或输出节点改写逻辑。
import { VIDEO_GENERATION_LIMITS } from './video-generation-settings';
// 与界面预览共用 H3 引用转换，不把 @audio 当普通对白直接传给模型。
// 转换在纯构图时完成，首次预校验失败就不会进入参考上传。
// 实际上传名只判断当前槽存在，最终提示词使用官方 Audio 编号。
import { normalizeAudioReferences } from './audio-prompt-references';

// prompt 是音频场景描述，也可包含用户希望保留原语言的对白。
// seed 必须是安全非负整数；随机值在提交快照时生成，而不是执行时生成。
// loras 缺省保留模板链；空数组明确表示移除加速 LoRA。
// referenceName 必须来自成功上传响应，不能直接使用本地文件路径。
// 参考图和无参考图默认分别为 5 秒和 4 秒，只有显式选择才覆盖。
// 两个模板的采样步数分别为 8 和 10，不能统一成视频页设置。
// UNet 和步数允许显式覆盖；CLIP 与两个 VAE 仍保持用户原图设置。
// 音频模型仍是 MiniMax 视频 UNet，不能替换成传统 TTS 模型加载器。
// referenceName 的存在对应参考图唯一的 LoadAudio，不对应另一个声线角色 id。
// LoRA 允许负权重及零权重的既有范围，最终校验继续由公共链构建器负责。
// 空 seed 文本在 store 转成 NaN，由纯构建器统一报告而不回落成随机。
// 本接口不包含批次数量，执行器每次只向 ComfyUI 提交一张图。
// 用户对白可含日文或中文，Unicode 在 JSON 传输中无需转写拼音。
// 英文上传文件名与对白翻译是不同问题，只有前者在传输层自动处理。
// unetName 缺省保留原模型名，steps 缺省保留当前图的采样步数。
// 这两个字段冻结到每项队列快照，修改后只作用于后续提交。
// 不允许通过非安全路径指定模型，也不能以非法步数偷偷回退默认值。
// durationSeconds 是期望秒数，不是传给 MiniMax 条件节点的帧数。
// 省略时保留所选模板默认值，旧调用方不需要补传参数。
// 排队时会冻结数值，避免改下一条草稿时串改上一条音频。
// 音频辅助设置随本次输入提交，不再读取用户后来切换到的参考状态。
// 有参考与无参考图的节点前缀不同，调用方必须提供匹配分支的覆盖。
// 未提供字段的旧调用者仍使用工作流文件名，不新增强制配置步骤。
// 主 UNet 仍使用 unetName 字段，不能从 modelOverrides 借道切换主模型。
// 输入只记录相对模型名，不记录用户音频字节或本地绝对音频路径。
// 音频文件上传与参考端口接线由原构建流程负责，辅助设置只改加载值。
export interface AudioWorkflowInput { prompt: string; seed: number; loras?: VideoLora[]; referenceName?: string; unetName?: string; steps?: number; durationSeconds?: number; modelOverrides?: VideoModelOverrides }

/**
 * 像沿着水管找阀门：从生成节点的 length 顺着连线找到秒数输入。
 * length 先连到帧数表达式，表达式的 values.a 再连到 PrimitiveFloat。
 * 不靠数字节点号，也不把图中任意浮点参数误认成时长。
 * 返回实际节点引用，UI 读默认值和构建器写覆盖使用同一来源。
 * 缺少这条链必须明确失败，不能展示已修改却仍生成默认长度。
 * 两份模板前缀不同，但连线契约相同，因此共用此查找方式。
 * 本函数只在内存图中读取，不发送请求或修改原始 JSON。
 * length 使用表达式的整数输出口，查找时只沿节点身份走，不改输出索引。
 * 客户端不重新计算表达式，避免 JavaScript 与 Python 舍入差异。
 * values.a 是表达式变量端口，不是生成节点上另一个可覆盖的参数。
 * 引用目标须同时符合节点类型与数字值约束，只有名称相似不能通过。
 * 将来模板换掉时长来源类型时需显式适配，不能偷偷沿用无效旧默认。
 */
function audioDurationNode(graph: ComfyApiPrompt) {
  const core = Object.values(graph).find(node => ['MiniMaxH3ImageToVideo', 'MiniMaxH3ReferenceToVideo'].includes(node.class_type));
  const length = core?.inputs.length;
  const source = Array.isArray(length) ? graph[length[0]]?.inputs['values.a'] : undefined;
  const duration = Array.isArray(source) ? graph[source[0]] : undefined;
  if (duration?.class_type !== 'PrimitiveFloat' || typeof duration.inputs.value !== 'number') throw new Error(t('create.audio.invalid'));
  return duration;
}

// 返回的节点对象全属本次调用，模型解析可以安全地写入相对路径。
// 使用是否有参考素材这个事实选择图，不让用户维护另一项易不一致的开关。
// 内部标识不受页面翻译和用户音频文件名影响。
// 原始 JSON 的节点 id 保留，方便对照 ComfyUI 本地执行结果。
export function audioWorkflowTemplate(reference = false): ComfyApiPrompt {
  return structuredClone(reference ? referenceTemplate : textTemplate);
}

/**
 * UI 和执行共用的默认值来源：按 loader 类型读取，而非硬编码数字节点 id。
 * 两份音频图的 UNet 槽前缀不同，但默认选择均来自各自正式 JSON。
 * steps 为 BasicScheduler 的真实输入；不用 LoRA 文件名里的 8step 猜测步数。
 * 返回节点 id 供已有模型选择器绑定覆盖值，内部业务草稿只保存模型名称。
 * 默认项读取失败明确报错，避免展示一个名称为空的模型卡片。
 * 纯函数不扫描磁盘，不因 UI 渲染重复触发模型清单网络请求。
 * 默认步数在导入、删除参考音频时跟随当前图，用户显式设置则优先。
 * 图中的默认值不被写回草稿，null 仍表示跟随模板而不是固定第一次读到的值。
 */
export function audioWorkflowDefaults(reference = false) {
  const graph = audioWorkflowTemplate(reference), unet = Object.entries(graph).find(([, node]) => node.class_type === 'UNETLoader');
  const steps = Object.values(graph).find(node => node.class_type === 'BasicScheduler')?.inputs.steps;
  if (!unet || typeof unet[1].inputs.unet_name !== 'string' || typeof steps !== 'number') throw new Error(t('create.audio.invalid'));
  // 默认时长直接沿当前图连线读取，导入参考时自动从四秒变为五秒。
  // 不把默认值写回草稿，null 始终表示跟随当前模板。
  // 读取与执行共享入口，避免 UI 和实际提交各维护一份默认秒数。
  return { unetId: unet[0], unetName: unet[1].inputs.unet_name, steps, durationSeconds: Number(audioDurationNode(graph).inputs.value) };
}

// 默认扩展来自实际模板，不另维护一份容易陈旧的硬编码模型路径。
// 两份图目前使用同一个加速 LoRA，切换素材不会重置用户编辑后的列表。
// 调用方得到独立数组，可以调整权重、删除或追加兼容模型。
export function defaultAudioLoras() { return getVideoLoras(audioWorkflowTemplate()); }

/**
 * 纯构建先于上传执行：空描述、非法种子或跨系列 LoRA 当场拒绝。
 * 参考模式的预校验可使用英文占位名；真正提交前再用上传结果重建。
 * MiniMax 系列判定复用既有视频 LoRA 校验，防止接入 Anima/SDXL 扩展。
 * 图中 length 连线、音频 VAE、采样器、控制连接均保留原始值。
 * 无参考模式不存在 LoadAudio，不会意外读取模板作者的个人文件。
 * 查找依据 class_type，避免把某个数字节点 id 当作唯一业务入口。
 * 缺少必需节点明确失败，不提交一张仍带模板对白的图。
 */
// 未覆盖时无参考模板 steps=10、参考模板为 8；显式设置则写入当前调度节点。
// 无参考模板默认 PrimitiveFloat.value=4，参考模板为 5；自定义只改秒数来源。
// ComfyMathExpression 的舍入与取模表达式是用户工作流的一部分，不能用秒数直接替换。
// 宽高 32×32 保留在 MiniMaxH3 条件节点，不代表最终音频的像素尺寸。
// MiniMaxH3ImageToVideo 的 conditioning 输出连接 BasicGuider，latent 输出连接采样器。
// 参考模板改用 MiniMaxH3ReferenceToVideo，但其 guider 和 latent 连线保持原图。
// 参考音频从 LoadAudio 输出零进入 ref_audios.ref_audio_1，而不是新的平面 audio 端口。
// 音频 VAE 同时供参考条件和 VAEDecodeAudio 使用，不得只改其中一端。
// PreviewAudio 连接解码器输出零，不能为保存而偷偷改成视频合成节点。
// 图不包含 SaveAudio，临时输出由主进程下载后另存到用户目录。
// 深克隆保留 _meta，方便节点执行错误回报原模板标题。
// _meta 中文标题仅是显示信息，不作为 API 图查找条件。
// 默认 LoRA 位于 UNet 与 guider/scheduler 之间，用户覆盖后仍需维持这条链。
// applyVideoLoras 删除旧节点再重接引用，不能只修改第一个节点的名称。
// 省略 loras 与传入空数组具有不同语义，构建器不把二者合并。
// 显式删除 LoRA 后 scheduler 和 guider 必须直连基础 UNet。
// 构建器不进行网络访问，可以在排队之前安全重复运行。
// 参考文件上传失败时不会使用模板里的 1.flac 作为补救输入。
export function buildAudioPrompt(input: AudioWorkflowInput): ComfyApiPrompt {
  if (!input.prompt.trim() || !Number.isSafeInteger(input.seed) || input.seed < 0) throw new Error(t('create.audio.invalid'));
  const graph = audioWorkflowTemplate(Boolean(input.referenceName));
  // 秒数先在本地预检，NaN、无穷值和越界值不能进入上传或队列。
  // UI 的滑条与数字输入采用同一范围，程序化调用也不能绕过护栏。
  // 支持小数秒，不强制取整；帧数舍入继续由原工作流表达式执行。
  // 默认范围沿用现有 MiniMax 设置，不能宣称是音频模型的官方能力上限。
  // 仅更新 PrimitiveFloat，保留 24 FPS 与 17n+5 的原图对齐规则。
  // 因此真实输出时长可能略有对齐差异，不能保证任意小数秒精确裁剪。
  // 不修改 core.length 为裸秒数，否则会把秒错当帧而破坏 latent 形状。
  // 缺省路径完全不改图，旧请求和模板整图基准保持一致。
  // 本轮图是深克隆，覆盖数值不会影响下一次读取的模板默认。
  // 参数错误抛给现有表单/队列处理，不静默夹成另一个时长。
  if (input.durationSeconds !== undefined) {
    if (!Number.isFinite(input.durationSeconds) || input.durationSeconds < VIDEO_GENERATION_LIMITS.durationMin || input.durationSeconds > VIDEO_GENERATION_LIMITS.durationMax) throw new Error(t('create.audio.invalidDuration'));
    audioDurationNode(graph).inputs.value = input.durationSeconds;
  }
  const core = Object.values(graph).find(node => ['MiniMaxH3ImageToVideo', 'MiniMaxH3ReferenceToVideo'].includes(node.class_type));
  const noise = Object.values(graph).find(node => node.class_type === 'RandomNoise');
  if (!core || !noise) throw new Error(t('create.audio.invalid'));
  // 先验证可选覆盖再改图，非法值在上传以前的预校验阶段即可被拒绝。
  // 用户明确改名后的模型只覆盖 UNet；原默认加速 LoRA 不会因此被清除。
  // 步数的界面与执行范围保持 1..100，整数约束防止送出不能运行的采样图。
  if (input.steps !== undefined && (!Number.isInteger(input.steps) || input.steps < 1 || input.steps > 100)) throw new Error(t('create.audio.invalidSettings'));
  const unetId = Object.keys(graph).find(id => graph[id].class_type === 'UNETLoader');
  if (input.unetName !== undefined && unetId) applyVideoModelOverrides(graph, { [unetId]: input.unetName }, 'minimax');
  if (input.steps !== undefined) for (const node of Object.values(graph)) if (node.class_type === 'BasicScheduler') node.inputs.steps = input.steps;
  // 引用必须指向当前单音频槽；删除参考后旧标签会明确报错。
  // seed 与提示词一起写进本次克隆图，不修改用户正在编辑的原稿。
  // 不转换对白语言，也不按素材名自动生成主观角色描述。
  core.inputs.prompt = normalizeAudioReferences(input.prompt, input.referenceName); noise.inputs.noise_seed = input.seed;
  if (input.referenceName) for (const node of Object.values(graph)) if (node.class_type === 'LoadAudio') node.inputs.audio = input.referenceName;
  applyVideoLoras(graph, input.loras, 'minimax');
  // 参考与无参考使用不同节点前缀，仅接受当前模板真正存在的辅助槽。
  // 实际模型解析和上传继续走原流程，设置不会伪造资源已安装。
  applyWorkflowAuxiliaryOverrides(graph, input.modelOverrides);
  return graph;
}

/**
 * 模型名按服务端当前目录解析，支持子目录及 Windows/Linux 分隔符。
 * pixel_space 是工作流节点提供的内置 VAE，不是要在磁盘查找的权重文件。
 * 浅拷贝只排除该内置槽；其余节点仍引用本次深克隆图，解析结果直接生效。
 * 列表不可用时沿用模板相对路径，让 ComfyUI 做最终节点校验。
 * 列表可用但模型缺失或同名歧义时，保留已有解析器的明确失败行为。
 * 音频 VAE 不会被当成视频 VAE 重选，始终跟随原模板连接。
 * 只复用模型解析，不调用视频尺寸、时长或参考图片变换逻辑。
 */
// 模板中的反斜杠只是相对目录分隔符，服务端解析负责采用当前列表的实际名称。
// 同 basename 多候选时不得随意取第一项，否则可能加载另一个模型版本。
// 无歧义的 basename 回退允许用户在不同子目录中安装同名权重。
// 完整匹配路径优先于 basename 推断，保留目录中的不同版本区分。
// 模型列表仅用于可用性解析，不构成一个新的硬编码模型白名单。
// MiniMax 系列 LoRA 限制仍来自原有资源规则，音频适配不单独扩大范围。
// pixel_space 节点本身依旧留在提交图里，过滤只作用于待检查槽集合。
// 过滤节点不删除其输入引用，guider、latent 和音频 VAE 的图结构不会被改变。
// 共享解析器可能抛出用户可见的缺失模型错误，此处不吞掉此类失败。
// 只有列表请求不可用被回退，后续构建或保存异常仍由队列记录。
export async function resolveAudioModels(graph: ComfyApiPrompt, server: string) {
  let lists;
  try { lists = await fetchComfyModelLists(server, true); } catch { return; }
  const loaders = Object.fromEntries(Object.entries(graph).filter(([, node]) => node.class_type !== 'VAELoader' || node.inputs.vae_name !== 'pixel_space'));
  applyResolvedVideoModels(loaders, lists);
}
