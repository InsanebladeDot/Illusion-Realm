// 无限画布的本地文档模型：只描述节点、参数和连接，不承担生成或文件读写。
// 世界坐标像桌上纸张的位置；缩放只移动观察桌面的镜头，不修改纸张本身。
// React Flow 负责镜头和命中检测，本模块只补充幻域自己的连接约束。
import { canvasInputOverflow, canvasIsTextToImage } from "./canvas-input-rules";
import type { Connection, Edge, Node } from "@xyflow/react";
import type { UserDataInfiniteCanvas } from "@/types/infinite-canvas";
import { FileText, Image, Music2, StickyNote, Video, Film } from "lucide-react";

// 类型名称属于幻域自有协议，不声称兼容参考软件的工程文件。
// 便签只用于组织想法，不作为媒体输入，因此没有连接端口。
export const NODE_KINDS = ["text", "image", "video", "audio", "composition", "note", "scene"] as const;
export type CanvasAddKind = NodeKind | "upscale" | "compare";
export type NodeKind = (typeof NODE_KINDS)[number];
export const NODE_ICONS = { text: FileText, image: Image, video: Video, audio: Music2, note: StickyNote, composition: Film, scene: Film };
// 显式键表也供静态文案门禁识别，不能靠动态拼接把未翻译词条藏起来。
export const NODE_LABELS = { text: "canvas.text", image: "canvas.image", video: "canvas.video", audio: "canvas.audio", note: "canvas.note", composition: "canvas.composition", scene: "canvas.director" } as const;
export const CONNECTION_ERRORS = { self: "canvas.self", duplicate: "canvas.duplicateEdge", type: "canvas.type", cycle: "canvas.cycle", input: "canvas.imageInputOverflow" } as const;

// 参数是可显式保存的本地草稿；未提交到生成服务，也不冒充服务返回结果。
// prompt 是生成意图，content 是用户手写文本，两者不冒充生成结果。
// ratio 记录未来生成画面的比例；当前卡片几何仍按组件样式库，不修改媒体文件。
// 名称与提示词分别限长，避免粘贴巨量文字让节点尺寸失控。
// ratio仍以字符串形状承接磁盘数据，运行时允许项由shared schema收紧。
// 去掉旧四项类型断言后，新增合法比例不再被错误伪装成旧联合类型。
// 序列化直接保留用户确认的斜杠身份，不能按当前画质重新推断比例。
// 同一比例可以配不同输出像素，不能用尺寸反推覆盖这个选择。
// 反向恢复仍经过生产校验，类型断言不能替代坏工程拒绝。
// 卡片显示形状属于card，不会因为新增竖向比例变更已有卡片大小。
// 节点标题、源文件名与ratio互不关联，改名不能重置比例。
// 复制和撤销使用同一作品快照，新比例与原四项享有相同行为。
export interface CanvasData extends Record<string, unknown> {
  kind: NodeKind;
  title: string;
  prompt: string;
  promptConversion?: boolean;
  promptReferenceLabels?: import("@/schemas/prompt-reference-labels.schema").PromptReferenceLabels;
  content: string;
  ratio: string;
  // 场景是纯数据快照，不能写入渲染器、播放钟或 DOM。
  scene?: import("@illusion-realm/shared/schemas/director.schema").DirectorScene;
  // 原合成工程是节点独立数据，不借用工具箱视频编辑器的时间模型。
  composition?: UserDataInfiniteCanvas["nodes"][number]["data"]["composition"];
  mode?: string;
  upscale?: import("@/utils/comfy/seedvr2-workflow").UpscaleSettings;
  // 直接从加号导入的参考图，只存受管文件引用；连线输入另由边表达。
  inputImages?: UserDataInfiniteCanvas["nodes"][number]["data"]["inputImages"];
  // 只保存无密钥的服务选择，仍沿用本节点的提示词、数量与历史。
  remoteImage?: UserDataInfiniteCanvas["nodes"][number]["data"]["remoteImage"];
  // 每个节点保留自己的模板选择，复制与撤销继续沿用原 data 快照。
  // 类型从磁盘契约推导，不能在面板里放宽到任意模板文件名。
  // 旧节点缺值时由共享选择入口显示默认模板，不把临时 UI 状态落盘。
  workflow?: UserDataInfiniteCanvas["nodes"][number]["data"]["workflow"];
  // 各模板的 LoRA 覆盖随节点保存，缺省继承与显式清空保持区别。
  // 共享类型推导与主进程校验同源，面板不能放入组件或设置 store。
  // 修改总是替换配置表和目标数组，旧副本、撤销快照不会被原地改写。
  workflowLoras?: UserDataInfiniteCanvas["nodes"][number]["data"]["workflowLoras"];
  // 直接沿用共享契约；每张音频卡拥有自己的表单草稿，不写创作页的全局状态。
  audioParameters?: UserDataInfiniteCanvas["nodes"][number]["data"]["audioParameters"];
  // 数量来自同一磁盘契约，不能由每个参数条独立扩展支持范围。
  // 不可变节点更新使复制卡片保留旧数量，后续单卡修改不会串值。
  // 缺省与显式一张的区别保留到序列化，浏览旧工程不会制造假修改。
  // 模板附表只含纯参数，资源选择器自己的多选草稿不进入作品。
  // 从 shared 推导防止侧栏与保存器分别定义一套容易漂移的配置。
  // 所有更新替换当前模板项，复制节点的旧附表不会被后续编辑原地改变。
  // 视频原表单的确认参数随节点保存；媒体副本仍位于工程受管目录。
  videoModelOverrides?: UserDataInfiniteCanvas["nodes"][number]["data"]["videoModelOverrides"];
  // 视频输出独立于图片模板附表，沿用共享磁盘类型而非在UI再写一份接口。
  // 改画质只产生不可变数据补丁，不重编码已导入的视频或改变卡片比例。
  // 时长与画质都属于当前节点，复制后编辑只替换目标节点的标量值。
  // 导入媒体的真实时长仍来自媒体解码，不能把生成意图当成源文件元数据。
  // 未确认字段保持undefined，序列化时省略，不因浏览节点写出一份默认时长。
  // 视频生成尚未接通，读取这些配置不能触发文件操作或占用任务队列。
  // 输出像素按width、height固定键序规范化，用户JSON键序不同不会造成假未保存。
  // 时长是数字标量，复制后不需要共享可变对象，改副本不会反向修改源节点。
  // 媒体真实元数据仍保留在media及解码层，不被生成意图里的秒数覆盖。
  // 新字段随已有serializeCanvas进入同一工程，不新增独立存储文件或侧表。
  // 帧率按FPS明确命名，避免把整段帧数和每秒帧数保存在同一个含糊字段。
  // 标量随当前节点进入原保存器，另一节点的时长和帧率不因切选发生变化。
  // 不读取源文件探测结果来覆盖用户下一次生成的帧率意图。
  videoSteps?: UserDataInfiniteCanvas["nodes"][number]["data"]["videoSteps"];
  videoFps?: UserDataInfiniteCanvas["nodes"][number]["data"]["videoFps"];
  videoMegapixels?: UserDataInfiniteCanvas["nodes"][number]["data"]["videoMegapixels"];
  videoDuration?: UserDataInfiniteCanvas["nodes"][number]["data"]["videoDuration"];
  videoOutput?: UserDataInfiniteCanvas["nodes"][number]["data"]["videoOutput"];
  imageParameters?: UserDataInfiniteCanvas["nodes"][number]["data"]["imageParameters"];
  batchSize?: UserDataInfiniteCanvas["nodes"][number]["data"]["batchSize"];
  createdAt?: number;
  resizeLocked?: boolean;
  noteAppearance?: UserDataInfiniteCanvas["nodes"][number]["data"]["noteAppearance"];
  annotations?: UserDataInfiniteCanvas["nodes"][number]["data"]["annotations"];
  card?: UserDataInfiniteCanvas["nodes"][number]["data"]["card"];
  // 来源引用是不可变小对象，副本可以共用它；更换文件必须替换整个引用。
  // 不往这里放播放位置、加载错误或 DOM，撤销和磁盘只保留作品内容。
  // 类型直接从 shared 推导，不能在渲染层维护另一份不同字段的媒体契约。
  // imported 文件不覆盖 prompt 或 content，这些字段仍表达生成意图与手写正文。
  // media 缺失代表空媒体卡，不等于一次导入失败；失败状态在实际预览会话中显示。
  // 更换来源要整体替换对象，保证复制片段和旧历史快照不会被原地修改影响。
  // 播放和失败都不会触碰此引用，因此一次试听不会消耗撤销记录。
  media?: NonNullable<UserDataInfiniteCanvas["nodes"][number]["data"]["media"]>;
}
export type CanvasNode = Node<CanvasData, "canvas">;
// CanvasDocument 描述可被保存与撤销的作品。
// workspace 是可选归属，不是画布标题的别名。
// 新纯文字画布可以没有 workspace。
// 首次导入成功才取得主进程分配的目录。
// 标题与目录分开，改名不会使每个 media.path 失效。
// 节点数组中保留世界位置，不保存屏幕坐标。
// 边数组只表达引用，不保存播放器状态。
// 剪贴板、鼠标手势和菜单开合在外层会话里。
// 卡片尺寸属于作品参数，需要跟着节点持久化。
// 已保存旧节点没有 card 时保持原默认布局。
// 媒体副本对象按不可变约定替换，不允许就地修改 path。
// 工程导出使用相同序列化字段，避免出现另一份节点模型。
export interface CanvasDocument { fixedSize?: boolean; name: string; nodes: CanvasNode[]; edges: Edge[]; workspace?: UserDataInfiniteCanvas["workspace"] }

// 按 schema 顺序排配置键，避免先编辑 SDXL 再编辑 Anima 时签名顺序不一致。
// 像固定表格列序：内容相同就应该得到同一份保存签名，与点击先后无关。
// 未覆盖仍保持 undefined，不能用空对象冒充用户主动设置过所有模板。
// 数组内顺序保留，它代表用户原有 LoRA 链顺序，不能为了签名排序模型。
// 此步骤只整理小型参数表，不复制模型字节，也不扫描资源目录。
// 显式白名单避免把临时配置页开关带进作品；两端另有形状验证。
// 每次返回新表，整理签名不能原地重排当前节点或撤销历史。
function serializeWorkflowLoras(value: CanvasData["workflowLoras"]) {
  // 像只归档填过的表格列：未配置列连键名都不带，避免被误认成跨类型配置。
  // JSON 会省略 undefined，但保存前先验内存对象，因此不能指望写盘替我们清理。
  // 图片表若带 minimax:undefined，归属校验仍会正确拒绝这个视频专用键。
  // 用同一顺序构造有效键，既保留严格归属，也避免调整模板顺序造成假脏状态。
  // 空数组必须带上，它表示用户明确清空，不等于继续继承模板默认值。
  // 返回全新对象，不删改原表，因此副本与撤销快照不会受到清理过程影响。
  // 行内容及顺序原样交给 schema 验证；这里不会限幅或吞掉非法权重。
  if (!value) return undefined;
  return {
    ...(value.anima !== undefined ? { anima: value.anima } : {}),
    ...(value.sdxl !== undefined ? { sdxl: value.sdxl } : {}),
    ...(value.moss !== undefined ? { moss: value.moss } : {}),
    ...(value["anima-edit"] !== undefined ? { "anima-edit": value["anima-edit"] } : {}),
    ...(value["minimax-image-edit"] !== undefined ? { "minimax-image-edit": value["minimax-image-edit"] } : {}),
    ...(value.minimax !== undefined ? { minimax: value.minimax } : {}),
    ...(value["minimax-reference"] !== undefined ? { "minimax-reference": value["minimax-reference"] } : {}),
  };
}

/** 只把稳定的作品字段写入用户文档，React Flow 的临时测量和选择态不跨页面保存。 */
// 序列化是用户草稿与工程交换共同的数据出口。
// workspace 按原归属写入草稿，工程打包器在副本中去掉本机归属。
// 这里不做资产扫描，保持普通保存不会完整读取大视频。
// card 放入显式字段白名单，临时 CSS 计算值不跨边界。
// undefined 可选字段交给 JSON 自然省略，兼容早期作品。
// 媒体引用仍保留本机路径形式，不保存协议 URL。
// 实际打包时另转换相对路径，不能改变正在编辑的对象。
// 边端口恢复统一 in/out，保持正式节点只有这一套端口契约。
// 不序列化 selection，打开工程后用户重新选择操作对象。
// 不序列化 measured，窗口与卡片尺寸变化后需要重新测量。
// 不把 source 的内存 DOM 或 browser File 混进节点数据。
// 序列化结果是纯数据，主进程无需 React 或 Next 运行时即可校验。
// 参数表按磁盘契约的栏目顺序装订，不能因为填写先后不同一直显示待保存。
// 这里只整理小型纯对象，不引入 Zod 运行时，也不让模型依赖浏览器或 Node。
// 缺省字段继续省略，避免给旧作品写入没有编辑过的默认参数。
// 先整理外层模板，再整理单个附表，嵌套对象各有自己的固定栏目。
// 对象都是新建，原参数、复制节点与历史快照不会被原地改写。
// 未知字段不在白名单中，外部数据仍应先由恢复校验拒绝，不能靠序列化修复。
// 表单只能写已登记字段，执行权限校验仍在实际任务边界。
// 这一步的稳定签名保证保存状态准确，不是生成模型已经可用的证明。
// 参数表为空保留空表，和缺省未配置是两种可表达的状态。
// 遍历顺序来自固定工作流清单，不依赖用户选择和最近操作的先后。
// Object.fromEntries 只接受本模块创建的固定身份，不把外部字符串当执行路径。
// 返回类型仍从同一磁盘契约推导，不能在这里扩大参数范围。
// 比如先填 SDXL 再填 Anima，用户参数表的插入顺序可能与 schema 不同。
// 若保存直接沿插入顺序输出，恢复后 schema 排成 Anima 在先，会改变 JSON 签名。
// 文件内容其实一致，却会被自动保存当成仍有修改，这就是固定键序要解决的问题。
// 不对 LoRA 行排序，因为加载顺序有业务意义；这里只整理无序的模板字段栏目。
// 显式空负面词与零 CFG 通过按字段读取保留，不使用布尔回落语法。
// 这一规则同时作用于手工保存、自动保存和工程交换，不建立旁路格式。
// 所有纯参数在原 data 中，选中、高亮和滚动状态没有出现在输出对象。
// 未配置模板不会为了凑齐三列而插入 undefined 空项，主进程归属规则仍严格。
// 副本可能暂时共享未修改附表，但后续 patch 会替换父表和当前模板对象。
// 序列化也不在旧对象上 delete 字段，因此过去的撤销快照不受影响。
// 输入已经在恢复边界验证，这里不是任意外部 JSON 的修复器。
// 未来新增字段漏了白名单会导致保存丢失，专项反证必须同时检查解析保留。
// 模板表按 schema 的固定顺序输出，避免先编辑参考流再编辑首尾帧时出现假未保存。
// 内层 loader 表仍保留原顺序，record schema 不对它重新排序。
// 这里只新建外层表，不修改输入对象，历史快照和复制节点仍能保留旧值。
// 缺省字段不物化默认，模型文件更新后未覆盖的槽仍继承原模板。
// 空对象也应保留，重置之后不能因为没有自定义键而恢复以前的覆盖。
// JSON 会省略 undefined，两端得到相同字节顺序后才可稳定比较保存签名。
function serializeVideoModels(value: CanvasData["videoModelOverrides"]): CanvasData["videoModelOverrides"] {
  return value ? { minimax: value.minimax, "minimax-reference": value["minimax-reference"] } : undefined;
}

function serializeImageParameters(value: CanvasData["imageParameters"]): CanvasData["imageParameters"] {
  if (value === undefined) return undefined;
  return Object.fromEntries((["anima", "sdxl", "anima-edit", "minimax-image-edit", "moss"] as const)
    .filter(key => value[key] !== undefined)
    .map(key => [key, serializeImageParameterRow(value[key]!)]));
}
// 单行按 schema 的固定键序整理，保持 JSON 往返后的签名相同。
// model 和 size 也要整理，不能只处理模板表却漏掉嵌套对象的输入顺序。
// 模型两个身份各自保留原字节，不能用显示名字覆盖版本路径。
// 尺寸状态保留基础边长与倍率，不把最终 width/height 再混入保存结构。
// 辅助覆盖的节点号映射没有显示次序语义，原插入顺序可原样保留。
// 负面词空串、CFG 零值和种子空串都是有效草稿，不能按真假值丢掉。
// seedMode 和 seed 分别保存，随机模式不能清除用户上次自定义的数字。
// 只有缺省使用 undefined，在 JSON 中自然省略，不转成 null。
// sampler 与 scheduler 保留 ComfyUI 内部名称，不通过当前语言翻译。
// 这一层不校验模型存在性，机器离线也应能保存自己的配置。
// 保持纯函数，没有缓存或全局变量，两个画布实例可以独立调用。
// 不序列化选择器 open、搜索词或焦点对象，它们只属于当前界面会话。
// 后续新增字段必须同步 schema、主进程、此处及格式反证，不能只在侧栏添加。
// 每笔返回新对象使历史快照保持不可变，复制后修改不会串改过去的记录。
// 参数本身不会触发解码，卡片正在播放的媒体资源不受整理过程影响。
// 函数输出只参与已有保存路径，不创建第二种工程格式或写盘服务。
function serializeImageParameterRow(row: NonNullable<NonNullable<CanvasData["imageParameters"]>["moss"]>) {
  return {
    model: row.model ? { modelId: row.model.modelId, versionId: row.model.versionId } : undefined,
    modelOverrides: row.modelOverrides,
    negative: row.negative,
    steps: row.steps,
    cfg: row.cfg,
    sampler: row.sampler,
    scheduler: row.scheduler,
    seed: row.seed,
    seedMode: row.seedMode,
    size: row.size ? { mode: row.size.mode, aspectRatio: row.size.aspectRatio, customWidth: row.size.customWidth, customHeight: row.size.customHeight, scale: row.size.scale } : undefined,
    ...(row.slg !== undefined ? { slg: row.slg } : {}),
  };
}

// 固定字段顺序与 schema 相同，避免重开后仅因键序不同显示未保存。
function serializeAudioParameters(row: CanvasData["audioParameters"]) {
  if (!row) return undefined;
  return { unetName: row.unetName, steps: row.steps, durationSeconds: row.durationSeconds,
    seed: row.seed, random: row.random, count: row.count, loras: row.loras,
    modelOverrides: row.modelOverrides ? { text: row.modelOverrides.text, reference: row.modelOverrides.reference } : undefined,
    reference: row.reference ? { kind: row.reference.kind, path: row.reference.path, name: row.reference.name, size: row.reference.size } : undefined,
    engine: row.engine, gptSovits: row.gptSovits ? { textLanguage: row.gptSovits.textLanguage, referenceLanguage: row.gptSovits.referenceLanguage,
      transcript: row.gptSovits.transcript, cut: row.gptSovits.cut, gptWeight: row.gptSovits.gptWeight, sovitsWeight: row.gptSovits.sovitsWeight,
      speed: row.gptSovits.speed, interval: row.gptSovits.interval, seed: row.gptSovits.seed, random: row.gptSovits.random } : undefined };
}

export function serializeCanvas(document: CanvasDocument): UserDataInfiniteCanvas {
  return {
    version: 1,
    name: document.name,
    fixedSize: document.fixedSize,
    workspace: document.workspace,
    // 固定字段顺序像给归档盒贴统一标签；同样内容不能因编辑先后而被误判为未保存。
    // schema 解析会按契约顺序重建对象，因此签名和写盘必须采用同一套字段次序。
    // media 按 schema 的字段次序归档，避免重新打开后同一引用被误判为未保存。
    // 不展开任意 data 属性：播放状态和浏览器错误永远不能混进用户文档。
    // 字段排在 createdAt 之后与 schema 一致，防止保存后重开出现对象顺序假脏。
    // 路径保留本地形式，buildLocalFileUrl 是临时展示转换，不能在这里持久化。
    // 旧节点没有 media 时 JSON 会省略 undefined，原草稿格式依然可以读回。
    // 不展开 File 或二进制，即使导入很大视频，用户 JSON 也只增加少量引用数据。
    // 作品复制只增加节点引用，不在序列化阶段复制或上传源文件。
    // 模板编号随节点保存和工程交换，重开不会退回“模型未接入”。
    // 显式列出字段，仍不把菜单开关、DOM 或任务中的凭据写到工程。
    // 不修改创建页全局系列；两处只是引用同一模板，草稿各自独立。
    // workflowLoras 顺序与 schema 一致，避免保存后规范化顺序产生假脏。
    // 这里只写参数引用，不复制 LoRA 大文件，媒体工程导出仍走原受管资产。
    // 各数组由面板不可变更新，序列化阶段没有修改共享模型或创建页草稿。
    nodes: document.nodes.map(node => ({ id: node.id, position: { x: node.position.x, y: node.position.y }, data: { kind: node.data.kind, title: node.data.title, prompt: node.data.prompt, promptConversion: node.data.promptConversion, promptReferenceLabels: node.data.promptReferenceLabels, content: node.data.content, ratio: node.data.ratio, mode: node.data.mode, upscale: node.data.upscale, workflow: node.data.workflow, workflowLoras: serializeWorkflowLoras(node.data.workflowLoras), audioParameters: serializeAudioParameters(node.data.audioParameters), imageParameters: serializeImageParameters(node.data.imageParameters), videoModelOverrides: serializeVideoModels(node.data.videoModelOverrides), videoSteps: node.data.videoSteps, videoFps: node.data.videoFps, videoMegapixels: node.data.videoMegapixels, videoDuration: node.data.videoDuration, videoOutput: node.data.videoOutput ? { width: node.data.videoOutput.width, height: node.data.videoOutput.height } : undefined, remoteImage: node.data.remoteImage, inputImages: node.data.inputImages, batchSize: node.data.batchSize, createdAt: node.data.createdAt, resizeLocked: node.data.resizeLocked, noteAppearance: node.data.noteAppearance, annotations: node.data.annotations, card: node.data.card, media: node.data.media, scene: node.data.scene, composition: node.data.composition } })),
    edges: document.edges.map(edge => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: "out", targetHandle: "in" })),
  };
}

/** 重新打开时补回画布运行所需的 type，并把旧文档当成不选中的静态作品。 */
// 恢复边界先使用 shared schema 规范可选字段。
// name 缺失兼容早期文档，最后得到可显示的空标题。
// workspace 缺失保持 undefined，不能沿用上一份工程的目录。
// 这也是显式返回 workspace 的原因，不能只展开旧 state 保留残留归属。
// 每张节点补 type=canvas，让图引擎继续调用同一个适配组件。
// 已保存节点没有 selected，所以恢复明确以未选状态开始。
// 参数面板因此不会在打开工程时同时展开所有媒体节点。
// 媒体内容仍按各自 path 实际加载，而不是用包清单假造 ready。
// 旧文件缺失只影响对应卡片，不应使恢复丢弃其他文本节点。
// 边的视觉曲线重新计算，不恢复上次屏幕上的 path 像素。
// 卡片自定义尺寸属于 data，恢复时原样交回组件。
// 来源文件大小不被当作画面宽高，竖屏仍由浏览器自然尺寸显示。
// 恢复操作不会自动运行节点生成任务或上传素材。
// 用户想编辑参数需要明确选中目标，避免误修改隐含默认项。
// 文档可以有两个同名视频卡，恢复按各自 id 保持独立。
// 同一 media.path 也不会让它们合成一个节点。
// 播放与暂停状态不在文档里，恢复后不会自动发声。
// 主题与应用导航不属于画布文档，这里不切换全局设置。
// 旧文档新字段的默认兼容只发生在数据边界，不批量重写其他用户分段。
// 工程打开失败时不会调用本函数拿一个空对象继续。
// 因此恢复函数只处理已被接受的工程，不承担错误回落清场。
export function restoreCanvas(document: UserDataInfiniteCanvas): CanvasDocument {
  return {
    name: document.name,
    workspace: document.workspace,
    fixedSize: document.fixedSize,
    nodes: document.nodes.map(node => ({ ...node, type: "canvas", selected: false })),
    edges: document.edges.map(edge => ({ ...edge, selected: false })),
  };
}

// 撤销保存的是数据快照，不保存鼠标位置、菜单焦点或视口。
// 选择和拖动中的临时标志不属于作品，恢复后需要重新选择操作目标。
// 嵌套 card/media 以整体替换保持不可变；剪贴板跨副本另外执行深拷贝。
// measured 属于布局缓存，交还给画布重新测量，避免旧尺寸压住参数面板。
// 历史快照保存当前已确认的 card 与 media 引用。
// 嵌套对象由 updateNodeData 整体替换，因此旧快照不会被就地修改。
// 剪贴板另外深拷贝，是为了隔开跨副本的独立底稿。
// 这两个用途不同，不能把历史快照当作会话剪贴板直接复用。
// workspace 一起进入快照，撤销首次导入可恢复尚未分配目录的作品状态。
// 撤销不会实际删除目录，磁盘资产生命周期比一笔图事务更长。
// 重做引用仍有效，不要求重新复制原文件。
// 临时测量清除可避免恢复后卡片宽高沿用错误缓存。
// selected 和 dragging 清除避免撤销把鼠标手势带回半完成状态。
// 位置复制为新对象，之后的图引擎坐标更新不改旧快照。
// 边对象也复制，选择高亮变化不倒灌进历史。
// 标题与参数仍是作品部分，撤销尺寸或名称时可以恢复。
// 截图和播放器句柄不在快照，历史不会持有视频解码缓冲。
// 五十步限制来自 reducer，不在这里隐藏裁剪节点数组。
// 序列化与快照都显式包含归属，避免保存和撤销看到两份不同工程。
// 更换媒体后的旧地址可以留在历史里，因此当前不做立即资产回收。
export function snapshot(document: CanvasDocument): CanvasDocument {
  return {
    name: document.name,
    workspace: document.workspace,
    fixedSize: document.fixedSize,
    nodes: document.nodes.map(node => ({
      ...node, measured: undefined, selected: false, dragging: false,
      position: { ...node.position }, data: { ...node.data },
    })),
    edges: document.edges.map(edge => ({ ...edge, selected: false })),
  };
}

// 工具条、节点菜单和键盘复制同用此函数，副本参数不会引用原件的可变对象。
// 新 ID 由用户操作入口提供，撤销或重算不会随机改变节点身份。
export function duplicateNodes(nodes: CanvasNode[], id: string): CanvasNode[] {
  const copies = nodes.filter(node => node.selected).map(node => ({
    ...node, data: structuredClone(node.data), selected: true, id: `${node.id}-copy-${id}`,
    position: { x: node.position.x + 36, y: node.position.y + 36 },
  }));
  return [...nodes.map(node => ({ ...node, selected: false })), ...copies];
}

// 自连接、重复边、便签连线和不支持的输入都在同一个入口拒绝。
// 文本可给任意生成节点提供描述；图片可引用到图片和视频节点。
// 音频及视频当前仅允许同类型引用，避免暗示已接通跨媒体转换。
// 这里的“引用”只是有向关系，不传播结果、不上传内容、不触发任务。
export function connectionError(connection: Connection, document: Pick<CanvasDocument, "nodes" | "edges">, allowInactiveImages = false) {
  const source = document.nodes.find(node => node.id === connection.source);
  const target = document.nodes.find(node => node.id === connection.target);
  if (!source || !target || source.id === target.id) return "self";
  if (document.edges.some(edge => edge.source === source.id && edge.target === target.id)) return "duplicate";
  // 对比只读两张图片，不输出新图片；不能把滑动窗口误接成生成素材。
  if (source.data.mode === "compare") return "type";
  if (target.data.mode === "compare") {
    if (source.data.kind !== "image") return "type";
    if (document.edges.filter(edge => edge.target === target.id).length >= 2) return "input";
    return reaches(target.id, source.id, document.edges) ? "cycle" : null;
  }
  if (target.data.mode === "upscale") {
    if (!["image", "video"].includes(source.data.kind) || document.edges.some(edge => edge.target === target.id)) return "type";
    return reaches(target.id, source.id, document.edges) ? "cycle" : null;
  }
  const from = source.data.kind;
  const to = target.data.kind;
  if (from === "note" || to === "note" || from === "composition" && to !== "video" || !(from === "text" || from === to || from === "image" && to === "video" || from === "scene" && to === "image" || from === "composition" && to === "video" || to === "composition")) return "type";
  if (!(allowInactiveImages && canvasIsTextToImage(target.data)) && (from === "image" || from === "scene") && canvasInputOverflow(target.id, target.data, document, 1)) return "input";
  return reaches(target.id, source.id, document.edges) ? "cycle" : null;
}

// 像沿单行道走一遍：若目标能走回起点，再修一条路就会绕成环。
// 使用显式待查列表，节点数量增加时也不依赖递归调用栈。
// visited 防止坏数据里的旧环让检查永远转圈，不只防止新建的环。
// 只读连接数组，检查失败不修改任何已有连接。
function reaches(start: string, end: string, edges: Edge[]) {
  const pending = [start];
  const visited = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === end) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(...edges.filter(edge => edge.source === id).map(edge => edge.target));
  }
  return false;
}
