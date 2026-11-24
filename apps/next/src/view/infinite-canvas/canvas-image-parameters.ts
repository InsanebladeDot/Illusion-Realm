// 将节点的独立工作单接到创建页原构建器；这里不组装第二份 ComfyUI 工作流。
// 尺寸、模型路径检查、LoRA权重和随机种子均沿用原工具函数。
// 参数适配的读写范围是可持久化纯数据，不是创建页组件实例。
// 工作流完整身份决定附表页，模型文件名决定权重，二者是不同维度。
// 例如同为 Anima 系列的编辑和标准文生图仍可能有不同步数与 LoRA 默认。
// 默认配置只在提交时补齐，不能让一次打开侧栏就写满用户工程。
// 显示的默认值与执行的默认值都从同一模板读取，避免表单说二十步却执行三十步。
// 模型覆盖解析失败不能用默认模型替代，因为那会违背用户明确选择。
// 随机种子的冻结属于请求身份，复制节点不意味着重复利用同一次随机采样结果。
// 自定义种子可重现同一参数意图，但不保证跨硬件模型版本得到逐像素相同图片。
// 输出宽高是请求目标，真实图像解码后还会作为结果元数据保存。
// 已有结果像素不会因修改下一次生成设置而被重写。
// LoRA 权重与采样 cfg 分属不同参数，不能用同一个数值控件写入同一键。
// 辅助模型覆盖不作为主模型总类判断，这次适配不改变现有统计口径。
// 任务进入队列后不再跟踪活跃工作流开关，防止中途切模板改变已排队请求。
// 对节点数据的读取没有隐式联网，模型真实列表由执行器在必要时刷新。
// 本模块错误交给上层统一分类，不在纯构建函数里弹通知或更新全局界面。
// 纯参数测试与集成请求都使用同一构建入口，不能导出能跑而按钮提交漏字段。
// 未来增加新字段时要同步附表类型与两端验证，不能只给这里加一个未保存属性。
// 这两种情况不能都解释成回默认，否则损坏数据会被悄悄隐藏。
import { t } from "@/i18n";
import { buildGenerateParams } from "@/utils/comfy/buildGenerateParams";
import { getImageWorkflowDefaults, resolveImageWorkflowSeries } from "@/utils/comfy/imageWorkflow";
import { ANIMA_EDIT_DEFAULTS, type AnimaEditSettings } from "@/utils/comfy/anima-edit-workflow";
import { MINIMAX_IMAGE_EDIT_DEFAULTS } from "@/utils/comfy/minimax-image-edit-workflow";
import { canvasImageWorkflow, canvasOutputDimensions } from "./canvas-output-size";
import { generateRandomSeed, isValidSeed } from "@/utils/seed";
import { useSettingsStore } from "@/stores/useSettingsStore";
import type { CanvasData } from "./canvas-model";

// 允许空种子留在输入草稿，但真正提交时不能把空文本默默当成自定义零。
// 随机种子在点击时固定，进入队列后不会追着其他页面的骰子变化。
// 这里只读取当前节点的模板项，不借用创建页的提示词或模型选择草稿。
// 本函数在提交瞬间读取节点快照，不能在任务排队后再读取可变表单。
// 参数附表按完整工作流身份读取，图片编辑不会误用 Anima 文生图那一行。
// 缺省采样值来自实际模板，这里不维护第二份看起来相同的默认常量。
// 自定义种子必须有正文且在原安全范围内，不能把空串转换为零后当作用户确认。
// 随机模式在调用时掷一次骰子，队列等待期间不会随页面重绘换种子。
// settings 仅提供模型索引与安装根，它不提供当前创建页选中的模型身份。
// 同名模型的展示图不是执行身份，实际路径由 buildGenerateParams 解析。
// 主模型覆盖若不能解析，直接拒绝；不能回退模板模型却让界面声称覆盖已应用。
// 没有主模型覆盖时保留模板默认语义，params 允许缺省 checkpointName。
// 正向来自节点已有 prompt；负向来自当前模板覆盖，两个来源不能互相拼接。
// 已有公共构建器处理本地 LoRA 路径与权重，本层不手写一条新的加载器链。
// 空的扩展选择是用户明确选择无扩展，不借用创建页最后勾选的 LoRA。
// 图片输出以最终像素传入，不把批量张数或卡片缩放当作宽高倍率。
// 本地文生图按所选系列执行；编辑由独立适配器增加参考图链。
// 辅助模型覆盖保留原对象形状，后续构建器负责按加载槽身份应用。
// 函数不上传、不写文件，非法种子或失效模型应在服务副作用前失败。
// 返回独立参数对象，批量下一张改变 seed 不应修改当前已在执行的对象。
export function canvasImageParameters(data: CanvasData) {
  const selected = canvasImageWorkflow(data);
  const workflow = selected === "minimax-image-edit" ? "anima" : selected;
  const row = data.imageParameters?.[workflow] ?? {};
  const defaults = workflow === "anima-edit" ? ANIMA_EDIT_DEFAULTS : getImageWorkflowDefaults(workflow);
  const seed = row.seedMode === "custom" ? Number(row.seed) : generateRandomSeed();
  if (row.seedMode === "custom" && (!row.seed || !isValidSeed(seed))) throw Error(t("create.animaEdit.invalidSeed"));
// 设置仓库里的模型集合是索引，允许共享读取，但所选 model 字段必须来自当前节点。
// 用户在创建页换模型不会影响一张已经保存覆盖值的画布节点。
// 节点没有覆盖则由真实模板决定，不能拿创建页最后一次选中作为隐式默认。
// 同源图片复制后可以独立改 LoRA，这里只读取传入 data 那份数组。
// 高级采样缺值才继承模板，合法的零 CFG 必须用空值合并保留。
// seedMode 为 custom 才解析文本，random 下保留的旧文本不应被误提交。
// 步骤和调度器不会从控件 DOM 提取，因此隐藏侧栏不改变实际任务参数。
// 解析过程不依赖封面加载，缺少模型图片不能改变实际权重路径。
// 尺寸读取方法与画质显示共用，不能再使用卡片 data.size 的世界坐标尺寸。
// selectedExtensions 使用原扩展类型，让已有路径与权重约束在同一入口执行。
// 构建失败向上抛出，后续不会继续进行受管导入或新增空结果节点。
// 返回 params 中不附带 settings 全部内容，减少跨层暴露无关用户配置。
// 模型辅助覆盖按原字段传递，模板中不存在的槽位由原加载器规则处理。
// 反向正文明确属于模板项，换工作流时不会复用另一模板的负向确认值。
  const settings = useSettingsStore.getState();
  const dimensions = canvasOutputDimensions(data);
  const params = buildGenerateParams({ positivePrompt: data.prompt, negativePrompt: row.negative ?? "", seed, steps: row.steps ?? defaults.steps, cfg: row.cfg ?? defaults.cfg,
    samplerName: row.sampler ?? defaults.samplerName, scheduler: row.scheduler ?? defaults.scheduler, ...dimensions,
    selectedModel: row.model ?? { modelId: "", versionId: "" }, selectedExtensions: data.workflowLoras?.[workflow] ?? [], localModels: settings.models, paths: settings.paths, series: resolveImageWorkflowSeries(workflow) });
  if (row.model && !params.checkpointName) throw Error(t("canvas.generationFailed"));
  return { ...params, modelOverrides: row.modelOverrides, upscale: data.upscale, slg: workflow === "moss" && data.imageParameters?.moss?.slg === true };
}

// 编辑的参考 latent、默认编辑LoRA与MP限制仍由原文字改图构建器执行。
// 未覆盖扩展时保留编辑模板默认；显式空数组则表示用户确实移除了全部LoRA。
// 编辑任务像在同一台机器前加一个参考图夹具，原主模型与采样流程继续使用。
// instruction 必须是本节点正文，不读取原编辑页尚未提交的指令。
// 编辑默认 LoRA 与普通图片默认不同，未配置时从真实编辑模板深拷贝。
// undefined 表示继承，空数组表示用户主动移除，不能用 length 的真假混淆两者。
// 已选择扩展时采用公共模型解析后的路径和权重，避免提交展示用的扩展 ID。
// 深拷贝默认数组防止后续修改一张节点污染全局默认。
// 负向没有覆盖时允许空串，不把文生图的长默认负面词硬套到编辑指令。
// String(seed) 满足原编辑表单契约，不另造会丢精度的种子格式。
// 模型加载覆盖直接转交原编辑构建器，不通过显示名猜 CLIP 和 VAE。
// 这个返回值是执行快照，不把 File 或对象 URL 塞进可持久化节点。
// 编辑的参考图片数量在读取素材前校验，参数构建不绕开输入约束。
export function canvasEditParameters(data: CanvasData): AnimaEditSettings {
  if (data.workflow === "minimax-image-edit") return canvasMinimaxEditParameters(data);
  const params = canvasImageParameters(data);
  return { ...ANIMA_EDIT_DEFAULTS, instruction: data.prompt, negative: data.imageParameters?.["anima-edit"]?.negative ?? "", seed: String(params.seed),
    steps: params.steps!, cfg: params.cfg!, samplerName: params.samplerName!, scheduler: params.scheduler!, checkpointName: params.checkpointName ?? ANIMA_EDIT_DEFAULTS.checkpointName,
    loras: data.workflowLoras?.["anima-edit"] === undefined ? structuredClone(ANIMA_EDIT_DEFAULTS.loras) : params.loras ?? [], modelOverrides: params.modelOverrides,
    upscale: data.upscale };
}

/** H3 只消费自身附表，不从 Anima 全局草稿继承模型和扩展。 */
export function canvasMinimaxEditParameters(data: CanvasData): AnimaEditSettings {
  const row = data.imageParameters?.["minimax-image-edit"] ?? {};
  const seed = row.seedMode === "custom" ? row.seed ?? "" : String(generateRandomSeed());
  return { ...structuredClone(MINIMAX_IMAGE_EDIT_DEFAULTS), instruction: data.prompt, seed, promptConversion: data.promptConversion, promptReferenceLabels: data.promptReferenceLabels,
    loras: data.workflowLoras?.["minimax-image-edit"]?.map(({ name, strength }) => ({ name, strength })) ?? structuredClone(MINIMAX_IMAGE_EDIT_DEFAULTS.loras),
    modelOverrides: row.modelOverrides, upscale: data.upscale };
}
