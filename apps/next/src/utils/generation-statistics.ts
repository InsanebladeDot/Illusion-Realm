/**
 * 生成统计的纯计算：恢复小票、识别工作流模型，再按本机日历汇总。
 * 所有入口只消费普通数据，不请求网络、不扫描模型文件、不读取图片。
 * 像收银台对账：取消的小票先拿走，再分别数订单与实际交付商品。
 * 对应任务成功率按任务算，产图和模型使用次数按已落盘图片算。
 */
import { GenerationRecordSchema, type GenerationHistory, type GenerationModel, type GenerationRecord } from "@/schemas/generation-history.schema";
import type { ComfyApiPrompt } from "@/types/comfy";

// 同一文件在 UNET 与 diffusion_models 名称下仍属于同一个主模型。
// Windows 分隔符转成斜线，大小写统一仅用于身份比较。
// 展示名称保留原文；两个目录中的同名文件仍保留不同身份。
// role 是身份的一部分，LoRA 与主模型即使同名也要分别计数。
/**
 * 身份比较的约定：
 * 只在比较键里统一大小写，展示值仍来自原始工作流。
 * 保留扩展名，避免不同格式的同名模型文件被合并。
 * 保留中间目录，因为用户可以同时安装多个版本。
 * 不读取绝对配置根目录，身份来自 ComfyUI 接受的模型名称。
 * unet 与 diffusion_models 是主加载体系的目录称呼差异。
 * 这个称呼差异不应让同一个相对文件变成两个使用项。
 * Checkpoint 与 LoRA 的作用不同，即使文件名相同也分别计算。
 * 统计身份不等于 Civitai 文件内容指纹，重命名会产生新的名称身份。
 * 本轮没有读取模型字节，所以不会为统计增加 SHA256 扫描成本。
 * 未知名称不会用“Anima”这一系列名称补位，系列不能定位具体文件。
 */
export function generationModelKey(model: GenerationModel): string {
  return `${model.role}:${model.name.replace(/\\/g, "/").toLowerCase()}`;
}

// 动态 JSON 先检查版本和列表，再逐条验证，而不是直接类型断言。
// 一条坏记录不能清空其他有效历史；未知字段由 schema 白名单剔除。
// 重复任务取最后一份有效终态，损坏副本不能覆盖前一份好数据。
// 恢复返回新数组，不修改用户文档或调用方传来的对象。
// 旧文档没有这个可选段时得到空账本，不猜测图片以前生成的日期。
/**
 * 恢复时的容错次序：
 * 顶层不是对象时直接回到空账本，不能访问未知值的 records。
 * 版本不是当前支持值时停止解释，不将未来字段当作旧格式使用。
 * records 必须是数组，字符串的可迭代性不代表它是记录清单。
 * 每条记录独立交给 schema，局部损坏只影响这一条。
 * schema 会丢弃未声明字段，导入的额外密钥不会再被导出。
 * 时间有限值校验保证图表不会收到 Infinity 或 NaN。
 * 时间先后校验保证平均耗时不会出现负数。
 * 图片数要求非负整数，不能把小数任务或字符串数量混进总数。
 * 同 ID 后到的有效记录替换先前记录，适合恢复重复落盘片段。
 * 同 ID 后到的无效记录被忽略，不能破坏先前的有效记录。
 * Map 只用于运行时去重，返回值仍是能够 JSON 序列化的数组。
 * 返回新容器便于 Zustand 按引用变化更新，原文档无需原地修改。
 * 旧文档缺段不触发磁盘扫描，避免把用户导入图片算成本机生成。
 * 恢复动作没有网络副作用，在离线模式下也可以展示既有统计。
 * 这里不会重新保存文档，真正写入由公共 storage 的调用者决定。
 */
export function normalizeGenerationHistory(value: unknown): GenerationHistory {
  if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1 || !("records" in value) || !Array.isArray(value.records)) return { version: 1, records: [] };
  const records = new Map<string, GenerationRecord>();
  for (const entry of value.records) {
    const parsed = GenerationRecordSchema.safeParse(entry);
    if (parsed.success) records.set(parsed.data.id, parsed.data);
  }
  return { version: 1, records: [...records.values()] };
}

// 从实际送出的图读取模型，不拿表单里尚未解析的别名做统计。
// 这份映射只允许主模型和 LoRA 加载器，VAE/CLIP 不会混进来。
// UNETLoader 代表 unet/diffusion_models 体系；Checkpoint 保留独立类别。
// 节点名称只是键，不按节点 ID 或文件体积判断模型类别。
// 默认工作流自带的 LoRA 同样会出现在实际图中，不会漏算。
/**
 * 加载器白名单的边界：
 * UNETLoader 读取 unet_name，不能读取同节点上一个随意的 name 字段。
 * Checkpoint 的两个常用节点读取 ckpt_name，保持同一个主模型角色。
 * LoRA 节点读取 lora_name，其模型名称不能覆盖主模型标题。
 * 模型类型来自节点职责，而不是中文名称里是否出现“大模型”。
 * 基础系列来自业务选择，本统计器不根据名称猜测 Anima 或 SDXL。
 * 文件大小不参与分类，小 LoRA 和大 LoRA 都是 LoRA。
 * 控制用 ModelPatchLoader 属于其他资源，不计入这次两类模型总数。
 * VAE 解码器与 CLIP 编码器属于工作流依赖，不计成主要模型。
 * 输出保存器、采样器和文本编码器也不是模型文件身份。
 * 增加新加载器时应核对其文件字段和权重字段，再扩充这张映射。
 */
const MODEL_LOADERS = {
  UNETLoader: { field: "unet_name", role: "main", loader: "unet" },
  CheckpointLoaderSimple: { field: "ckpt_name", role: "main", loader: "checkpoints" },
  CheckpointLoader: { field: "ckpt_name", role: "main", loader: "checkpoints" },
  LoraLoader: { field: "lora_name", role: "lora", loader: "loras" },
  LoraLoaderModelOnly: { field: "lora_name", role: "lora", loader: "loras" },
} as const;

// ComfyUI 从输出节点回溯执行，模板里断开的旧模型不能算实际使用。
// 像沿着插线板查电器：只有接到输出这条线路的加载器才属于本次任务。
// 以图片输出为起点沿节点连接回走，visited 避免重复分支和坏图中的循环。
// 完整工作流已有输出节点；只含加载器的检查片段则保留原节点供身份预览。
// 链接必须是二元数组且目标确实存在，不把任意数字数组当成文件身份。
/**
 * 回溯执行图的约定：
 * SaveImage 和 PreviewImage 都是本项目现有图片工作流的真实输出。
 * 输出节点可以有多个，共用上游的模型仍只需访问一次。
 * 一个节点的 inputs 里既有普通参数，也有指向上游的连接。
 * 连接用目标节点 ID 加输出序号表示，所以要求是两个元素。
 * 输出序号需要整数，颜色数组或自由文本不能误当成节点连接。
 * 节点 ID 在 JSON 中是字符串，数值 ID 在比较前统一转成字符串。
 * 目标不存在时不把 undefined 加入结果，坏连接留给工作流执行校验报告。
 * visited 先登记再追溯上游，循环连接不会耗尽调用栈。
 * 使用显式栈而不是递归，较长的 LoRA 链不会增加 JavaScript 栈深。
 * 断开的旧加载器可能仍留在模板 JSON，但它不参与执行就不能算使用。
 * 预览源图的分支没有采样模型时，不会凭空产生主模型身份。
 * 回溯只读取输入，不改变 prompt 的节点顺序或连接关系。
 * 没有输出的片段用于纯身份检查，不能据此宣称工作流可成功执行。
 */
function generationModelNodes(prompt: ComfyApiPrompt) {
  const pending = Object.keys(prompt).filter(id => ["SaveImage", "PreviewImage"].includes(prompt[id].class_type));
  if (!pending.length) return Object.values(prompt);
  const visited = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id) || !prompt[id]) continue;
    visited.add(id);
    for (const value of Object.values(prompt[id].inputs)) {
      if (Array.isArray(value) && value.length === 2 && Number.isInteger(value[1]) && prompt[String(value[0])]) pending.push(String(value[0]));
    }
  }
  return [...visited].map(id => prompt[id]);
}

// 同一个 LoRA 重复加载时，在一张图里只记一次使用。
// 权重为零且不影响 CLIP 的 LoRA 没有效果，不能算成使用过。
// 负权重仍然生效，因此不能用“大于零”作为启用条件。
// 输出只含模型身份；提示词与服务器信息不会被夹带进统计。
// 调用者在每次真实提交前更新快照，失败但没有产图不会记模型使用量。
/**
 * 模型快照的读取次序：
 * 先回溯到参与输出的节点，再按加载器白名单取身份。
 * 模型名称必须是非空字符串，错误输入不转换成字符串占位。
 * 保留空格和目录字符的实际意义，不用模糊搜索替换另一个模型。
 * 反斜杠只做分隔符规范化，磁盘文件和服务端配置不会在这里改名。
 * LoRA 的模型权重与 CLIP 权重都为零才代表完全没有作用。
 * 模型权重为负仍然影响输出，不能把负数当作未选择。
 * 标准 ModelOnly 节点没有 CLIP 权重，其缺省视为零。
 * 普通 LoRA 节点只有 CLIP 生效时也记录使用，避免低估实际链路。
 * 多个同身份 LoRA 节点只保留一个模型身份，使用频次按图片计。
 * 这里还没有产图，所以仅返回候选使用快照，不直接增加统计。
 * 后续保存失败时图片数为零，快照本身不会让模型出现在使用榜。
 * 快照不包含 LoRA 权重，当前统计只表示是否使用，不估计作用强度。
 * 快照不复制整个节点输入，提示词和参考图名称因此不会进入账本。
 */
export function generationModelsFromPrompt(prompt: ComfyApiPrompt): GenerationModel[] {
  const models = new Map<string, GenerationModel>();
  for (const node of generationModelNodes(prompt)) {
    const definition = MODEL_LOADERS[node.class_type as keyof typeof MODEL_LOADERS];
    if (!definition) continue;
    const name = node.inputs[definition.field];
    if (typeof name !== "string" || !name.trim()) continue;
    if (definition.role === "lora" && Number(node.inputs.strength_model ?? 0) === 0 && Number(node.inputs.strength_clip ?? 0) === 0) continue;
    const model: GenerationModel = { role: definition.role, loader: definition.loader, name: name.replace(/\\/g, "/") };
    models.set(generationModelKey(model), model);
  }
  return [...models.values()];
}

// 日期键使用本机年/月/日，避免 UTC 把夜间生成挪到昨天。
// 按日历加减天数，而不是固定减二十四小时，兼容夏令时切换。
// 数值时间保留毫秒精度，显示格式由界面的当前语言决定。
/**
 * 本机日期分组的约定：
 * 用户看到的十一月一日应对应本机十一月一日，而不是 UTC 的某一天。
 * 日期键包含年份，跨年查询不会把两个一月一日合并。
 * 月和日补成两位，日期标签可以稳定截取月日部分。
 * 这个键用于分组，不作为显示语言的翻译来源。
 * 用户切换语言不会改变同一记录归属哪个本地日历日。
 * 用户切换系统时区后，按当前本机时区重新解释既有时间戳。
 * 记录本身仍保留绝对毫秒时间，因此不会在时区变更时改写历史。
 */
function dayKey(time: number): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// 趋势的空成功率用 null，不能把当天没运行解释成成功率零。
// 模型比例仍是原始次数，最后按所选角色单独归一化。
// 两组比例各自加到百分之百，主模型不会被多个 LoRA 稀释。
// distribution 按实际终态显示成功/失败，不能从提示词猜人物或风景。
/**
 * 汇总结果的消费约定：
 * total 表示图片数量，不是成功任务数量。
 * attempts 表示已执行且纳入分母的任务数量。
 * successRate 使用百分数形式，五十直接表示百分之五十。
 * averageMs 保留毫秒，显示层再格式化成秒而不提前舍入。
 * modelCount 是主要模型与 LoRA 两类去重数量之和。
 * mainCount 和 loraCount 用于解释模型总数的组成。
 * dates、counts 和 rates 按相同下标对应同一天。
 * 小时分布固定二十四项，即使某小时没有图片也保留位置。
 * outcomes 只表达任务终态证据，没有推断人物或风景主题。
 * usage 的 value 保留原始使用次数，百分比留给选中角色的图表计算。
 * 主模型用量不与 LoRA 用量相加成为图片数量。
 * 这些字段都是派生结果，不再持久化，避免与原始账本互相矛盾。
 */
export interface GenerationStatistics {
  total: number; attempts: number; successRate: number | null; averageMs: number | null;
  modelCount: number; mainCount: number; loraCount: number;
  dates: string[]; counts: number[]; rates: (number | null)[]; hours: number[];
  outcomes: { name: "completed" | "failed"; value: number }[];
  usage: Record<"main" | "lora", { name: string; value: number }[]>;
}

// 所有图表按同一组日期取记录，不能一张图用提交日、另一张用完成日。
// 没有任务的日期仍保留零张图片，折线不会把中间一天直接跳过去。
// 成功率没有分母时用 null，图表会留空而不是画成零或百分之百。
// 汇总不修改记录，因此切换七天/三十天不会消费掉历史数据。
/**
 * 每日折线的分母约定：
 * 一天失败两次且没有成功时，其成功率确实为零。
 * 一天没有任何任务时，其成功率未知，因此返回 null。
 * 零和未知在 ECharts 中表现不同，不能为了线条连续而互相替换。
 * 生成张数按每条记录已经确认的图片数量累计。
 * 一个四张批次只贡献一次任务尝试，但可以贡献四张产图。
 * 部分批次失败会降低当天成功率，其已保存图片仍保留在当天张数。
 * 用户停止的记录已经在上层过滤，不需要每张图重复实现停止规则。
 * 同一天完成的任务按完成日期归组，排队跨夜不会占用提交日期的结果。
 * 日期数组的顺序由 calendarDates 决定，不依赖历史写入先后。
 * 这里返回独立数组，图表的选中或悬停不会修改账本。
 */
function dailyStatistics(records: GenerationRecord[], dates: string[]) {
  const daily = dates.map(date => records.filter(record => dayKey(record.finishedAt) === date));
  return {
    dates,
    counts: daily.map(entries => entries.reduce((sum, entry) => sum + entry.images, 0)),
    rates: daily.map(entries => entries.length
      ? entries.filter(entry => entry.status === "completed").length / entries.length * 100 : null),
  };
}

// 准备与落盘都属于任务执行时间，不能用图片张数除总耗时冒充单图采样耗时。
// failed 参与成功率分母，但其耗时不混入成功任务平均值。
// 缺少 startedAt 的历史记录不补零；否则平均值会被未知数据人为拉低。
// 产图总数与任务次数分别输出，批次失败前留下的文件仍有真实数量。
/**
 * 指标卡的计算约定：
 * 成功率分母采用任务数，不会因一个批次多产图而提高其权重。
 * 平均时长同样采用成功任务数，批次大小由任务本身体现。
 * 当前无法单独得到每张图的远端采样时间，不能伪造单图平均值。
 * 开始时间缺失时不把提交时间顶上去，否则排队时间会被计入执行。
 * 成功任务全部缺少开始时间时，平均值仍保持未知。
 * 有失败任务但没有成功任务时，成功率为零，平均成功耗时未知。
 * 总图片数量从真实保存数相加，与任务请求的 total 字段无关。
 * 失败任务的图片数可以大于零，表示它在后续一轮执行中出了异常。
 * 平均值保留未舍入数字，七天和三十天切换不会累积舍入误差。
 */
function metricStatistics(records: GenerationRecord[], successful: GenerationRecord[]) {
  const timed = successful.filter(record => record.startedAt !== null);
  return {
    total: records.reduce((sum, record) => sum + record.images, 0),
    attempts: records.length,
    successRate: records.length ? successful.length / records.length * 100 : null,
    averageMs: timed.length
      ? timed.reduce((sum, record) => sum + record.finishedAt - record.startedAt!, 0) / timed.length : null,
  };
}

// 设置日期只改变这个临时对象，不修改系统时钟或账本里的时间戳。
// 使用本机日历计算往前几天，夏令时的一天可以少于或多于二十四小时。
// 参数只来自面板的七天/三十天以及今日卡的一天，不接受用户文件提供的长度。
/**
 * 周期边界的约定：
 * 七天窗口包含今天以及之前六个本机日历日。
 * 三十天窗口包含今天以及之前二十九个本机日历日。
 * 今日卡传一天，因而复用完全相同的边界机制。
 * 每一个日期都从 now 新建，不能在共享 Date 上累计移动造成偏差。
 * setDate 自动处理月末、年末以及闰年二月。
 * 先按日历调整再取日期键，夏令时不需要固定的毫秒补偿。
 * 数组从旧到新排列，趋势图的横轴可以直接使用。
 */
function calendarDates(days: number, now: number): string[] {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now);
    date.setDate(date.getDate() - days + index + 1);
    return dayKey(date.getTime());
  });
}

// 每张已保存图片为其中每个不同模型贡献一次使用量。
// 部分失败批次仍保留已经写盘的图片，失败不应抹掉真实文件。
// 用户主动停止由上层排除整张小票，符合“不作数”的明确要求。
// 不根据本机安装多少模型推算使用量，没生成过的模型不会出现。
/**
 * 使用次数和去重的约定：
 * 每条任务的 models 表示同一批次中实际采用的加载组合。
 * 本项目批次只改变随机种子，模型组合在这个批次中保持一致。
 * 因此可以用已保存图片数同时增加每个参与模型的使用次数。
 * 失败前保存两张时，每个模型增加两次，而不是按请求总数增加。
 * 没有保存结果的失败任务不应让一个从未成功使用的模型进入榜单。
 * 同一个模型在 models 数组中重复出现时先去重，防止旧数据放大频次。
 * 角色过滤发生在统计之前，主模型与 LoRA 分母从源头保持独立。
 * 相同 basename 的不同子目录有独立 key，用户可区分自己安装的版本。
 * 排序先按次数递减，次数相同再按完整名称稳定排序。
 * 稳定排序避免界面更新时同频模型互相抢位置。
 * 返回原始次数便于明细解释，不把早已舍入的百分比再相加。
 */
function modelUsage(records: GenerationRecord[], role: "main" | "lora") {
  const counts = new Map<string, { name: string; value: number }>();
  for (const record of records) {
    const unique = new Map(record.models.filter(model => model.role === role).map(model => [generationModelKey(model), model]));
    for (const [key, model] of unique) {
      if (record.images > 0) counts.set(key, { name: model.name, value: (counts.get(key)?.value ?? 0) + record.images });
    }
  }
  return [...counts.values()].sort((left, right) => right.value - left.value || left.name.localeCompare(right.name));
}

// 纯汇总接口接受显式 now，回归可以固定跨日边界而不用改系统时间。
// 只包含当前本机日之前的指定天数，不把未来或已取消记录算进去。
// 成功率分母是成功任务加异常失败任务，不是图片张数。
// 平均时长只取成功任务，包含模型准备、生成与保存，排队不参与。
// 空账本的总量为零，成功率/平均时长为未知，两者语义不能混淆。
/**
 * 整个汇总的执行顺序：
 * 首先生成当前本机窗口的日期集合，再筛选进入统计的终态任务。
 * 主动停止整项排除，包括停止前该项已经留下的部分结果。
 * 未来时间戳即使在今天，也不会提前进入今天的产图数量。
 * 较早历史保留在账本中，只是当前查询不展示，不会被删除。
 * 成功任务集合用于成功率与平均成功耗时，两张卡使用同一批任务。
 * 模型使用从同一份筛选结果计算，避免周期切换后模型数停留在旧值。
 * 小时图按完成时刻分配图片，不把一次任务平均摊给所有等待小时。
 * 生成趋势和小时图的图片总数应一致，可以相互核对。
 * 结果分布的成功数量加失败数量应等于 attempts，可以核对成功率分母。
 * modelCount 应等于 mainCount 加 loraCount，而不是两组百分比相加。
 * 没有任务的账本仍返回完整日期和小时位置，方便空态显示明确的零产图。
 * 没有任务的成功率和耗时保持 null，不能把“还没有生成”说成失败。
 * 汇总不写盘，用户反复切换周期不会重复记录同一生成。
 */
export function summarizeGenerationHistory(history: GenerationHistory, days: number, now = Date.now()): GenerationStatistics {
  const dates = calendarDates(days, now);
  const records = history.records.filter(record => record.status !== "cancelled" && record.finishedAt <= now && dates.includes(dayKey(record.finishedAt)));
  const successful = records.filter(record => record.status === "completed");
  const usage = { main: modelUsage(records, "main"), lora: modelUsage(records, "lora") };
  const hours = Array.from({ length: 24 }, () => 0);
  for (const record of records) hours[new Date(record.finishedAt).getHours()] += record.images;
  return {
    ...metricStatistics(records, successful),
    ...dailyStatistics(records, dates),
    modelCount: usage.main.length + usage.lora.length, mainCount: usage.main.length, loraCount: usage.lora.length,
    hours, usage, outcomes: [{ name: "completed", value: successful.length }, { name: "failed", value: records.length - successful.length }],
  };
}
