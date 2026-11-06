/**
 * Agent 的 LoRA 目录与兼容性预检，复用本地扫描器和受限来源文件读取。
 * 工具调用不接收任意扫描根；根目录只能来自应用已保存的模型路径设置。
 * 不读取大型模型权重，不上传文件，不触发 Civitai 网络查询或修改来源资料。
 * 兼容性证据是已有 baseModel 和明确的系列目录，不能依赖 Agent 自报系列。
 * 目录是用户分类提示，并非张量级架构鉴定；放错目录仍应通过补全来源纠正。
 * 缺少可识别证据时失败关闭，不把未知模型默认当作 SDXL 或 Anima。
 * 同时保留视频系列标签，以免把视频 LoRA 当作普通图片扩展使用。
 * 视频标签只供发现和拒绝交叉使用，不表示新增了 Agent 视频生成工具。
 * 返回架构相容仅说明可以尝试加载，不保证画风、训练底模及权重效果相同。
 */
const path = require("node:path");
// 查询参数与翻页规则集中管理，总清单和LoRA清单不会出现两种分页含义。
// 这个辅助层只检查输入与切数组，不参与模型家族判断或文件授权。
// 用户无法通过查询参数改变模型扫描根或扩大文件访问范围。
const { readModelQuery, modelPage } = require("./model-query");
const { scanModelsInDirectory } = require("../models/scanner");
const { readEntry } = require("../models/local-model-metadata");
/**
 * 路径来自设置，不从 MCP 参数反序列化为目录配置。
 * searchPath 启用时覆盖单独路径，保持与应用扫描约定一致。
 * 文件名是相对于实际模型类别根的完整名称，保留扩展名与所有子目录。
 * filePath 只在进程内部用于授权与精确匹配，不写入日志。
 * family 可以是 unknown 或 conflict，这两种状态均不能进入生成。
 * reason 是给 Agent 的公开诊断，不包含用户完整路径。
 * trainedWords 保持来源顺序，供 Agent 选用，不自动改写用户提示词。
 * kind 区分 checkpoint 与 diffusion，避免把 UNet 送入 checkpoint 加载器。
 * @typedef {{searchPath:string,checkpointPath:string,lorasPath:string,diffusionModelsPath:string}} Paths
 * @typedef {{root:string,id:string,kind:"lora"|"checkpoint"|"diffusion"|"text_encoder"|"vae"|"model_patch"}} Root
 * @typedef {{name:string,filePath:string,rootId:string,available:boolean,kind:Root['kind'],family:string,reason:string,trainedWords:string[]}} Model
 */

/**
 * 仅识别明确的系列标签；不使用包含 anima 的任意文件名作为判断依据。
 * SDXL 衍生底模的架构归为 sdxl，训练风格差异仍需用户自行确认。
 * Wan 2.1 与 2.2 分开返回，不把所有视频模型视为同一个兼容系列。
 * Flux 与 SD1.x 独立保留，防止无法识别的图片系列被回落到 SDXL。
 * 无版本的 Wan 或未知标签返回 unknown，不猜测其具体网络结构。
 * 正则匹配的是资料中的底模标签或单个目录段，不读取张量名称。
 * @param {string} value 底模标签或目录段
 * @returns {string} 规范系列名，未知时为 unknown
 */
function familyOf(value) {
  // Anima 与 Anima 版本名使用统一标签，因为现有图片模板只提供这一条网络系列。
  // 标签必须以系列名开头；角色名称中偶然出现 anima 不足以证明它是 Anima 权重。
  // Illustrious、Pony、NoobAI 在这里只表达 SDXL 架构归属，不表达训练集兼容性。
  // 不能把未识别的图片模型都当作 SDXL，否则 Flux 等权重会进入错误加载器。
  // 视频版本号只接受这里有明确规则的形式，未匹配的后续版本不会被默认为旧版。
  // 同属 Wan 的不同版本返回不同标签，查询兼容性不使用模糊的 video 统一值。
  // Hunyuan 与 Minimax 标签互不相通，不能因为同为视频生成就交换 LoRA。
  // LTX 只做已有资料标签归类，目前 generate_image 不会据此创建视频工作流。
  // 对精度、量化方式、训练 rank 没有作出推断；这些信息不在 baseModel 判据内。
  // 新架构应添加明确映射并补负向对照，而不是扩大 unknown 的默认允许范围。
  const label = value.toLowerCase().trim();
  if (/^anima(?:\b|[_-])/.test(label)) return "anima";
  if (/^(?:sdxl|sdxl\s*1|sdxl[-_ ]|sdxl\b|illustrious\b|pony\b|noobai\b)/.test(label)) return "sdxl";
  if (/^wan\s*[-_ ]?2[._]2\b/.test(label)) return "wan2.2";
  if (/^wan\s*[-_ ]?2[._]1\b/.test(label)) return "wan2.1";
  if (/^hunyuan[-_ ]?video\b/.test(label)) return "hunyuan-video";
  if (/^ltx[-_ ]?(?:video|2)\b/.test(label)) return "ltx-video";
  if (/^minimax\b/.test(label)) return "minimax";
  if (/^flux\b/.test(label)) return "flux";
  if (/^sd\s*1[._][45]\b/.test(label)) return "sd1.x";
  return "unknown";
}

/**
 * 从设置推导类别根，searchPath 下的 loras/checkpoints/diffusion_models 分开扫描。
 * unet 是 ComfyUI 允许的另一个主模型目录，与 diffusion_models 同属 UNet 加载。
 * 同时配置的重复根在后续文件路径集合去重，避免一次文件产生两条选择。
 * 不扫描 search 根里任意模型作为 LoRA，否则 VAE、CLIP 也可能混入候选。
 * 不存在的目录由现有扫描器返回空集，目录缺失不会误报为可用文件。
 * 未配置类别不会向磁盘根回落，不会以空字符串启动整盘扫描。
 * @param {Paths} paths 保存的路径设置
 * @returns {Root[]} 只能用于本轮扫描的类别根
 */
function rootsFor(paths) {
  // 返回的 root 必须是类别目录，不能直接用 search 根扫描全部权重后标成 LoRA。
  // 用户可以单独把 diffusionModelsPath 指向 Anima 子目录，后续保留其绝对目录证据。
  // search 的优先级与设置页一致，启用时旧的单独路径不会混入当前查询。
  // unet 与 diffusion_models 都可能存在；它们的相对名重复时选择函数会报歧义。
  // 没有配置任何根时返回空数组，由查询返回空清单，生成则明确找不到模型。
  // 不建立目录，也不检查下载来源；这个入口只描述当前已保存的本地资源。
  // 相对路径配置不具备文件授权能力，readEntry 会把它标为 unavailable。
  // 类别根不存在时不会创建，以免一次查询改变模型库目录布局。
  // path.join 使用主进程平台语义，生成节点名称的分隔符稍后再统一。
  const search = paths.searchPath.trim();
  // 像仓库按货架分区，检索根只提供仓库位置，不能把所有货物都标成主模型。
  // 每个类别目录拥有独立根，相对名称从这个根开始，不带类别前缀。
  // unet与历史拼写diffrent_models归入diffusion，但保留rootId说明实际来源。
  // 同名文件跨根出现时仍由选择器报歧义，不静默挑一个目录。
  // 编码器、VAE和补丁可列出供排查，但不会进入主模型或LoRA候选。
  // id仅是配置键或类别目录名，不包含用户磁盘位置。
  // 未配置检索根时仍沿用三个独立路径，不猜测它们的兄弟目录。
  // 没有创建额外目录或写回设置；缺失类别由查询报告状态。
  // 目录别名只影响发现，不证明ComfyUI已经配置对应的搜索路径。
  // 生成前仍须通过原服务器清单核验，不能把本地发现当成服务端可加载。
  // 每个数组项明确指定kind，防止目录拼写与工具分类值互相冒充。
  // 这里只补充已知类别布局，未知文件夹不猜成某种生成模型。
  if (search) return SEARCH_MODEL_ROOTS.map(([id,kind]) => ({root:path.join(search,id),id,kind}));
  // 先给原数组提供Root上下文，再过滤，避免JS类型推导把kind扩大为任意字符串。
  // 这不是把外部输入强制断言为合法类型，kind常量仍由编译器逐项检查。
  // 空路径在返回前删除，不允许扫描器把它解释为当前工作目录。
  const roots = /** @type {Root[]} */ ([{root:paths.lorasPath.trim(),id:"lorasPath",kind:"lora"}, {root:paths.checkpointPath.trim(),id:"checkpointPath",kind:"checkpoint"}, {root:paths.diffusionModelsPath.trim(),id:"diffusionModelsPath",kind:"diffusion"}]);
  return roots.filter(item => !!item.root);
}

// 类型与目录名称分开表达：两个目录可供同一种加载器使用。
// clip保留为旧版编码器目录别名，不与clip_vision混为同一类。
// 没有注册的目录不会被all递归扫描后错误标成主模型。
// 新目录若需支持，应在此加明确映射，并验证其生成入口是否真的可用。
// 下面的元组只描述布局，模型系列仍使用原有来源资料与目录证据。
// 单独配置路径的模式没有编码器等配置项，因此不从磁盘任意推导。
/** @type {[string, Root['kind']][]} */
const SEARCH_MODEL_ROOTS = [["loras","lora"],["checkpoints","checkpoint"],["diffusion_models","diffusion"],["unet","diffusion"],["diffrent_models","diffusion"],["text_encoders","text_encoder"],["clip","text_encoder"],["vae","vae"],["model_patches","model_patch"]];

/**
 * 资料与目录分别计算，再比较，不能让低可信目录覆盖已补全的 baseModel。
 * 使用完整配置根的目录段，使直接配置到 loras/Anima 的场景仍能识别系列。
 * 文件名不参与系列推断，名为 anima_style 的 SDXL 模型不能因此伪装成 Anima。
 * 不同系列目录嵌套属于冲突，拒绝从多个标签中随便选第一个。
 * 资料存在但底模不支持时也不允许目录兜底，避免未知视频架构被分类覆盖。
 * 资料损坏或版本不支持需先修复，不能把损坏当成缺少资料继续加载。
 * 来源 modelType 与扫描类别冲突时拒绝，避免把已知 Checkpoint 当成 LoRA。
 * 缺少资料且目录未标记时保持 unknown，返回补全资料或整理分类的建议。
 * 成功结果保留触发词，不把触发词强制追加到提示词。
 * @param {string} filePath 扫描得到的候选文件
 * @param {Root['kind']} kind 当前类别
 * @param {import('@illusion-realm/shared').LocalModelMetadataEntry} entry 授权后的读取结果
 */
function evidenceFor(filePath, kind, entry) {
  // ready 不等于底模已识别；baseModel 空字符串还需要参考明确的系列目录。
  // missing 只表示同名来源不存在，允许目录兜底；invalid 不允许这个降级。
  // unavailable 可能是路径逃逸或文件已被删除，同样不能给出可加载承诺。
  // unsupported 是来源格式版本不支持，需要先升级读取器或重新补全。
  // LoCon 是 LoRA 扩展类型，其他如 TextualInversion 不应交给模型 LoRA 加载器。
  // 未记录 modelType 的旧来源仍可使用 baseModel，不能因新增可选字段误伤历史资料。
  // 主模型资料明确声明为 LORA 时，即使位于 checkpoint 根也不能作为主模型。
  // 相同 family 在路径中出现多次只保留一次，不把重复目录误判为冲突。
  // 资料声明其他未知底模时不能借 Anima 目录“修正”，否则会掩盖真实架构。
  // 错误原因不会回显 filePath，避免将完整用户目录意外写入后续工具摘要日志。
  // 触发词从此版本 sidecar 获取，不读取同目录其他版本的模型介绍作为替代。
  const tags = [...new Set(path.dirname(filePath).split(/[/\\]/).map(familyOf).filter(item => item !== "unknown"))];
  const metadata = entry.metadata, base = metadata?.baseModel || "", family = familyOf(base);
  // 辅助组件有自己的来源类型，VAE或补丁不能被要求标为Checkpoint。
  // 这只影响其证据展示；baseModel仍只扫描主模型类别，不因此接受辅助文件。
  // LoRA与主模型继续严格校验来源modelType，避免目录误放绕过类别检查。
  const wrongType = metadata?.modelType && (kind === "lora" ? !/^(?:lora|locon)$/i.test(metadata.modelType) : ["checkpoint","diffusion"].includes(kind) && !/^checkpoint$/i.test(metadata.modelType));
  if (!["missing","ready"].includes(entry.status) || wrongType) return {family:"unknown",reason:"来源资料不可用或模型类型不符，请先补全或修复模型资料",trainedWords:[]};
  if (tags.length > 1 || (base && family !== "unknown" && tags.some(tag => tag !== family))) return {family:"conflict",reason:"baseModel 与目录系列标记冲突，请先核实模型分类",trainedWords:[]};
  const resolved = base ? family : tags[0] || "unknown";
  return {family:resolved,reason:resolved === "unknown" ? "无法识别模型系列，请补全 baseModel 资料或放入明确的系列目录" : base ? `baseModel: ${base}` : `系列目录: ${resolved}`,trainedWords:metadata?.trainedWords || []};
}

/**
 * 目录扫描与来源读取分离，复用扫描器已有的模型扩展名过滤。
 * 每批只打开八个来源文件，批内并行不会一次耗尽文件句柄。
 * 每个 readEntry 都重新验证真实路径，拒绝模型文件或来源文件链接逃逸。
 * 不跨调用缓存结果：用户刚补全资料、移动文件后下一次工具立即看到新状态。
 * 去重以绝对文件路径为键，同一文件不能因重复配置而产生歧义。
 * 相对名称使用斜杠传输，渲染端会与服务器返回的分隔符规范化后比较。
 * 元数据读取失败由 readEntry 转成状态，证据计算负责拒绝不可信候选。
 * @param {Paths} paths 本轮固定的设置快照
 * @param {Root['kind'][]} kinds 限制需要扫描的类别，查询 LoRA 时无需扫描主模型
 * @returns {Promise<Model[]>} 带拒绝原因的候选，不过滤未知项
 */
async function catalog(paths, kinds) {
  // 先限定类别再扫描，list_loras 无 model 时不会遍历所有主模型目录。
  // 扫描器按模型扩展名筛选，图片封面和来源 JSON 不会混成可加载文件。
  // 授权使用本条目所属类别根，不能用另一个更宽的配置根放宽读取范围。
  // 去重在元数据读取前执行，重复配置不会重复打开同一来源文件。
  // 批次之间顺序等待，因此大量目录不会启动无上限的 Promise.all。
  // 单项读取器负责关闭句柄，损坏 JSON 也不会让文件一直被占用。
  // 这里不计算 SHA-256：查兼容性不应每次都重新顺序读取 GB 级模型文件。
  // SHA-256 补全仍由既有独立工具完成，用户补全后再次查询即可看到资料。
  // 输出相对名使用扫描原有大小写，后续选择只在匹配时做 Windows 兼容比较。
  // 保留 unknown 与 conflict 是为了提供诊断，不代表生成入口允许这些状态。
  // 此快照无法阻止用户之后在外部改文件，正式加载错误仍由 ComfyUI 返回。
  const roots = rootsFor(paths).filter(item => kinds.includes(item.kind)), seen = new Set();
  const files = roots.flatMap(item => scanModelsInDirectory(item.root,item.kind === "lora" ? "lora" : "checkpoint").flatMap(group => group.versions.map(version => ({...item,filePath:version.filePath})))).filter(item => !seen.has(item.filePath) && seen.add(item.filePath));
  const result = /** @type {Model[]} */ ([]);
  for (let offset = 0; offset < files.length; offset += 8) {
    const batch = await Promise.all(files.slice(offset,offset+8).map(async item => {
      const entry = await readEntry(item.filePath,[item.root]);
      // rootId让公共清单按实际类别根统计，不从显示名称反猜文件位置。
      // 保留完整相对名和扩展名，生成工具可直接接收，不要求模型自行补路径。
      // filePath仍只在主进程内部使用，序列化公共结果时明确排除。
      // available仅记录真实路径授权是否成功，不能与系列识别成功混为一谈。
      // 损坏来源仍可统计模型大小，但未知兼容性不会被当作可直接加载。
      // unavailable禁止后续公开适配器再次对未授权文件进行stat。
      return {name:path.relative(item.root,item.filePath).replace(/\\/g,"/"),filePath:item.filePath,rootId:item.id,available:entry.status !== "unavailable",kind:item.kind,...evidenceFor(item.filePath,item.kind,entry)};
    }));
    result.push(...batch);
  }
  return result;
}

/**
 * 统一比较路径分隔符及 Windows 大小写，不删除目录信息。
 * 完整相对名或扫描得到的绝对名优先，最后才接受唯一的裸文件名。
 * 多个子目录存在同名文件时明确失败，不能静默取第一项。
 * 省略扩展名不自动拼接，以免混淆 safetensors 与其他格式的同名版本。
 * 拒绝绝对名以外的上级穿越写法；绝对名只能精确匹配扫描白名单。
 * 这个函数只选择扫描结果，不接受工具提供的额外文件读取目标。
 * @param {string} value Agent 提供的文件名
 * @param {Model[]} models 已扫描的候选
 * @returns {Model} 唯一匹配，未知或歧义抛出公开原因
 */
function selectModel(value, models) {
  // 裸名只在全体候选唯一时接受，不能用模型家族过滤后隐藏原本存在的歧义。
  // 完整相对名也可能在两个配置根重复，此时同样要求用户整理根或指定绝对白名单名。
  // 白名单绝对名只是现有扫描项的别名，不会以它作为新的扫描根。
  // 不把大小写规范化结果作为实际磁盘文件名打开，读取仍用原扫描 filePath。
  // 正斜杠和反斜杠相同是跨进程传输约定，不代表允许上级目录段。
  // 缺少扩展名不会触发猜测，不同格式的同名版本可能具有不同架构和量化方式。
  // 绝对路径不在配置库时匹配失败，即使磁盘上确实存在该文件也不会加载。
  // 错误里不列出所有绝对候选，Agent 应重新查询得到可公开的完整相对名。
  // exact 多项不能再回落到 basename，回落只会进一步放大歧义。
  const key = normalize(value);
  if (!key || key.split("/").includes("..")) throw new Error("模型名称无效");
  const exact = models.filter(item => normalize(item.name) === key || normalize(item.filePath) === key);
  const matches = exact.length ? exact : models.filter(item => normalize(item.name).split("/").pop() === key);
  if (matches.length !== 1) throw new Error(matches.length ? "模型名称存在歧义，请使用工具返回的完整相对名称" : "模型未在配置目录中找到，请先查询本地模型");
  return matches[0];
}
/**
 * 工具传输层统一规范，不改变文件名本身的空格、Unicode 或扩展名。
 * 不用 basename 作为规范形式，因为子目录包含必要的系列和消歧信息。
 * @param {string} value 相对名或白名单内绝对名
 */
function normalize(value) { return value.replace(/\\/g,"/").toLowerCase(); }

/**
 * JSON Schema 不能代替运行期校验，模型可能绕过声明传入任意结构。
 * 缺省和空数组都代表不加载额外 LoRA，保留旧 Agent 请求的行为。
 * 限制二十项避免不受限地扩张工作流；单项强度默认 1，可显式为 0 或负数。
 * 强度必须是有限数字，范围 [-5,5] 与现有视频 LoRA 参数护栏保持一致。
 * 不把字符串数字、null、NaN 静默转换成默认值，以免实际参数偏离用户输入。
 * 名称去掉外围空白，但保留内部空格；调用顺序就是最终模型链加载顺序。
 * 兼容性由实际文件证据决定，不读取单项自行声明的 series 字段。
 * @param {unknown} value 原始 loras 字段
 * @returns {Array<{name:string,strength:number}>} 校验后的新数组
 */
function parseLoras(value) {
  // map 的单项从 unknown 收口，不能利用 Array.isArray 带来的隐式 any 访问字段。
  // 数组中的 null 与字符串都不是合法模型记录，应立刻回报输入问题。
  // strength 不存在与值为 undefined 都采用默认值，显式 null 则属于错误。
  // strength=0 可能用于禁用某条扩展，必须保持而不是用 || 1 代替。
  // 负权重是有意义的模型参数，输入护栏不把所有负数当成非法值。
  // 强度范围按绝对值对称校验，正负超过五都阻止提交。
  // 空数组无需主模型证据，才能兼容旧 Agent 仅给 prompt 的请求。
  // 校验不触发目录读取，明显损坏的参数应在昂贵扫描之前失败。
  // name 是否存在与是否兼容稍后分别判断，避免所有错误都显示成“参数无效”。
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) throw new Error("loras 必须为最多 20 项的数组");
  return value.map((/** @type {unknown} */ item) => {
    if (!item || typeof item !== "object" || !("name" in item) || typeof item.name !== "string" || !item.name.trim()) throw new Error("LoRA 必须提供有效的 name");
    const strength = "strength" in item && item.strength !== undefined ? item.strength : 1;
    if (typeof strength !== "number" || !Number.isFinite(strength) || Math.abs(strength) > 5) throw new Error("LoRA strength 必须是 -5 到 5 之间的有限数字");
    return {name:item.name.trim(),strength};
  });
}

/**
 * 只有实际主模型证据确认后才允许加载 LoRA，不依靠 series 参数冒充架构。
 * 使用 LoRA 时必须明确 model，防止模板默认主模型与用户期望不一致。
 * 两种图片模板之外的家族暂不支持生成，即便模型与 LoRA 同属视频系列。
 * Anima 必须是 diffusion 根中的 UNet，SDXL 必须是 checkpoint 根中的模型。
 * series 省略时从实际模型推导，显式填写但不一致则拒绝，不自动替用户改系列。
 * 型号不明或资料冲突不能提交任务；错误只包含公开诊断而非完整用户路径。
 * @param {Record<string,unknown>} args 原始工具参数
 * @param {Paths} paths 设置快照
 * @returns {Promise<Model>} 已确认的主模型
 */
async function imageModel(args, paths) {
  // baseModel 先检查实际模型证据，防止 series 字段决定所有后续判断。
  // 这里只接受已有的两套图片模板，其他 family 要由对应生成工具另行实现。
  // 即便视频主模型与视频 LoRA family 相同，也不能送到 KSampler 图片模板。
  // Anima 使用单独 UNet 加载器，SDXL 使用包含相关组件的 checkpoint 加载器。
  // 根类别错误是配置问题，不能仅凭扩展名 safetensors 猜测文件可供哪种加载器。
  // 失败时不会自动从另一目录选一个同系列模型，以免实际输出偏离用户选择。
  // 此检查不证明所有模型文件都未损坏，权重反序列化仍由 ComfyUI 负责。
  // 相同系列但不同训练版本的效果需真实生成验证，不能在查询阶段保证质量。
  const model = await baseModel(args,paths);
  // 查询清单与执行入口使用同一个图片模板判据，避免usable与实际规则漂移。
  // 查询仍不加载权重，这里只是最终执行前再次确认同一基础条件。
  // 失败不尝试另一个相近名字，由用户或上游明确重新选择。
  const issue = imageModelIssue(model);
  if (issue) throw new Error(issue);
  return model;
}

/**
 * 图片模板能力只定义一份，总清单和生成预检共用。
 * family由来源证据产生，此函数不能让自报series改变真实模型身份。
 * 返回null仅表示系列及加载器匹配，不代表权重文件已成功反序列化。
 * LoRA列表不直接调用它，因为LoRA本身不是主模型加载器。
 * SDXL衍生架构沿用既有family规范，未新增视频执行能力。
 * 未知和冲突不能走默认Anima分支，以免本地目录错误被静默掩盖。
 * @param {Pick<Model,'family'|'kind'|'reason'>} model 已确认的模型信息
 * @returns {string|null} 不支持原因或通过标记
 */
function imageModelIssue(model) {
  if (!["anima","sdxl"].includes(model.family)) return `当前生图工具不支持该主模型系列（${model.family}）：${model.reason}`;
  if (model.kind !== (model.family === "anima" ? "diffusion" : "checkpoint")) return "主模型所在目录与当前工作流加载器类型不一致";
  return null;
}

/**
 * 主模型证据解析同时供目录查询和图片生成使用，不将视频查询误当作生图请求。
 * 查询视频主模型可以了解它与 LoRA 的系列关系，但不能通过图片工具生成视频。
 * 未知和冲突系列保持失败，不能把两个 unknown 当成相同架构判定为兼容。
 * 显式 series 是额外约束，主模型证据优先，填写错误会提示重新选择。
 * 查询入口不限制加载器，但图片生成入口会再次限制 UNet 与 checkpoint 的类别。
 * 返回包含内部路径只供同进程选择，不向模型输出完整磁盘路径。
 * @param {Record<string,unknown>} args 带主模型的请求
 * @param {Paths} paths 保存的目录设置
 * @returns {Promise<Model>} 可识别的实际主模型
 */
async function baseModel(args, paths) {
  // 模型必须唯一匹配扫描库，输入 series=anima 不能让不存在的文件获得兼容身份。
  // model 字符串为空时给出选择提示，不默默使用模板默认名称替代。
  // 单独验证主模型 family，避免 unknown 主模型与 unknown LoRA 恰好相等后放行。
  // conflict 与 unknown 分开保留诊断文字，前者需纠正已有分类而非仅补一个标签。
  // series 显式为 null 或其他类型也属于冲突，不把脏值当成“未指定”。
  // 视频查询会使用已识别的主模型，生成接口另外执行图片加载器约束。
  // 不将主模型底模写回来源资料，此模块始终是只读的执行前检查。
  // model.name 是规范相对名，后续服务器核对将使用它，不能再丢掉目录段。
  if (typeof args.model !== "string" || !args.model.trim()) throw new Error("使用 LoRA 时必须明确指定主模型 model");
  const model = selectModel(args.model.trim(),await catalog(paths,["checkpoint","diffusion"]));
  if (["unknown","conflict"].includes(model.family)) throw new Error(`无法确认主模型系列（${model.family}）：${model.reason}`);
  if (args.series !== undefined && args.series !== model.family) throw new Error("series 与实际主模型系列不一致");
  return model;
}

/**
 * 提交前入口：为带 LoRA 的生成请求产出规范相对名和已确认的模型系列。
 * 不含 LoRA 的旧请求仍由原有默认参数流程处理，不强制用户重新选择主模型。
 * LoRA 每项必须与实际主模型 family 相同，未知与冲突不会作为通配符。
 * 相同文件重复选择也拒绝，避免别名重复加载同一权重产生意外叠加强度。
 * 参数通过后才调用渲染端，失败路径不会提交 ComfyUI 或显示假成功。
 * 不保留调用端自报的 LoRA 架构字段，防止后续代码误把它当作已验证证据。
 * 主模型和 LoRA 的名称都保留类别根以下子目录，避免跨系列同名文件混淆。
 * 返回对象不改变原始请求，以便上层日志或调用状态保持原始参数快照。
 * @param {Record<string,unknown>} args Agent 原始参数
 * @param {Paths} paths 保存的设置
 * @returns {Promise<Record<string,unknown>>} 可向渲染端转发的请求
 */
async function prepareLoraGeneration(args, paths) {
  // 先校验数组边界，再扫描主模型；不合法请求不需要遍历用户模型库。
  // 主模型证据在 LoRA 扫描前确认，错误模型不应让 GPU 或渲染队列先启动。
  // 两个目录快照保持同一份 paths，调用中途修改设置不会混合新旧根。
  // 每个候选都独立判断 family，不能只检查数组第一项后默认后续项相同。
  // LoRA family 必须精确等于已确认的图片主模型 family，没有 unknown 通配逻辑。
  // 重复检查按 filePath 身份，裸文件名与完整路径都不能重复加载同一模型。
  // 返回的数组只保留已选真实名称与权重，不传递未经验证的来源或家族字段。
  // 参数规范化不改变 width、height、steps 等与本次兼容检查无关的输入。
  // 发生任何中间错误时整个 Promise 拒绝，不返回一半已通过的 LoRA 数组。
  // 接收端还会检查服务器清单，防止本地存在但远端不存在时按同名文件替代。
  // 这套判据只属于 Agent 宿主调用，不顺便改变创建页现有扩展筛选行为。
  const requested = parseLoras(args.loras);
  if (!requested.length) return {...args,loras:[]};
  const model = await imageModel(args,paths), candidates = await catalog(paths,["lora"]), selected = new Set();
  const loras = requested.map(item => {
    const lora = selectModel(item.name,candidates);
    if (lora.family !== model.family) throw new Error(`LoRA 与主模型不兼容：${lora.name}（${lora.family} → ${model.family}）；${lora.reason}`);
    if (selected.has(lora.filePath)) throw new Error("同一个 LoRA 不得重复加载");
    selected.add(lora.filePath);
    return {name:lora.name,strength:item.strength};
  });
  return {...args,model:model.name,series:model.family,loras};
}

/**
 * 查询返回系列、证据、触发词和不兼容原因，Agent 可以先查询再选模型。
 * model 可选：有主模型时使用实际证据比较，无主模型时只给系列信息。
 * 未知项目仍列出原因，不能用过滤隐藏“为什么找不到这个 LoRA”。
 * query 只筛选名称，不读取任意文件路径，也不修改设置或网络凭据。
 * 最多返回四十条并带总数与截断状态，过长时应提供更具体的 query。
 * 列表里的 compatible 不会绕过生成入口的二次校验，用户可以在两次调用间移动文件。
 * 无 model 时 compatible 为 null，不暗示所有系列都可以互换加载。
 * 返回是 JSON 文本，符合宿主工具文字结果契约，不引入新 IPC 通道。
 * @param {Record<string,unknown>} args 查询参数
 * @param {Paths} paths 用户配置
 * @returns {Promise<string>} 可由模型直接阅读的目录摘要
 */
async function listLoras(args, paths) {
  // model.family 已经排除 unknown/conflict，因此未知 LoRA 不会与未知主模型误相等。
  // 家族比较使用规范标签，SDXL 1.0 与 Pony 的显示文案不同不妨碍架构归类。
  // 返回 trainedWords 供调用方说明角色触发条件，但仍由用户决定是否写入提示词。
  // 兼容性拒绝原因与单项证据同时保留，用户可以区分家族不符和资料不完整。
  // 同名跨目录的文件分别返回完整相对名称，后续选择不会仅依靠展示标题。
  // 无 model 时仍可查询视频 LoRA，工具不会暗中调用图片生成来试探是否兼容。
  // 已删除的文件下一次扫描会消失，不把过去查询的条目作为永久可用状态。
  // 来源缺失不会触发自动补全，避免普通目录查询消耗网络或要求用户输入凭据。
  // 选定主模型时检查真实证据，查询并非直接接受 Agent 传入的系列字符串。
  // 不提供主模型时只回答“是什么”，不回答“对任意模型都可用”。
  // 列表不输出内部 filePath 字段，相对名足以传给后续生成工具。
  // total 在截断前统计，可判断需要更具体 query，而不会误认为只有四十项。
  // 兼容性比较不依赖 query，用户搜索角色名不能把同名错误系列变成可用项。
  // query 只对名称作大小写无关子串匹配，不解释正则或 glob 表达式。
  // 查询结果的 compatible 不持久化，下一次生成会重新校验模型库当前状态。
  // 视频相同家族只说明系列关系，高低噪声分支和具体工作流槽位仍需独立检查。
  // note 明确查询承诺的边界，不能将系列相同表述为真实张量加载已通过。
  // 返回 JSON 字符串而非对象，现有宿主工具通道无需增加新的序列化契约。
  // 分页先规范化再扫描；负偏移或非整数不能被slice解释成倒数取值。
  // model缺省时仍仅扫描LoRA，不为了一次浏览额外扫描全部主模型。
  // series筛选是独立条件，不以文件名包含anima替代真实家族证据。
  // 指定主模型时保留原兼容检查，过滤参数不能为错误系列制造兼容结论。
  // 排序在分页之前固定，目录读取顺序变化不会让下一页漏项或重复。
  // total表示全部命中数，不能在达到40条时提前停止计数。
  // nextOffset为null才到末尾，空结果和超尾页也采用同一约定。
  // 原family字段保留，新增分页不破坏已使用该字段的调用方。
  // 总清单与LoRA清单都使用同一个catalog与readModelQuery。
  // 两处只共用发现和查询机制，针对主模型的兼容结论仍属于这里。
  // 工具输出不包含任何内部filePath，不把完整磁盘路径发给云端模型。
  // truncated仅说明当前页后还有记录，与total一起辅助旧调用方理解范围。
  const query = readModelQuery(args);
  const model = args.model === undefined ? null : await baseModel({model:args.model},paths);
  const items = (await catalog(paths,["lora"])).filter(item => (!query.query || item.name.toLowerCase().includes(query.query)) && (!query.series || item.family === query.series));
  items.sort((a,b) => a.name.localeCompare(b.name,"en"));
  const page = modelPage(items,query);
  const detailed = page.items.map(({name,family,reason,trainedWords}) => ({name,family,reason:model && family !== model.family ? `与 ${model.family} 主模型系列不匹配；${reason}` : reason,trainedWords,compatible:model ? family === model.family : null}));
  // 小摘要仍保留触发词、完整路径及兼容结果，不能省到无法安全调用生成。
  // 只有已兼容条目省略重复证据，未知和不兼容仍解释原因。
  // 未选主模型的 null 不能被当作 false 或 true，保持原三态契约。
  // 分页在投影之前计算，摘要与详细查询可以沿同一 nextOffset 续读。
  // 用途是否适合当前画面仍需判断，compatible 只表示模型系列兼容。
  const loras = query.summary ? detailed.map(({name,family,compatible,trainedWords,reason}) => ({name,family,compatible,trainedWords,...(compatible === true ? {} : {reason})})) : detailed;
  return JSON.stringify({model:model?.name || null,series:model?.family || null,...page,items:undefined,loras,note:"仅确认系列分类，不保证实际加载或效果；兼容项须compatible=true。若未指定主模型compatible=null。nextOffset非空可续页，不要猜路径或省略扩展名。"});
}
// 总清单复用扫描和证据结果；生成仍须通过prepareLoraGeneration再次选择与校验。
// 名称匹配、家族识别和原始目录快照保持私有，避免形成多份可漂移的外部判据。
// preload 无新增文件读取 API，Agent 仍通过现有宿主调用与结果通道交互。
// 公共模型清单只复用这两个只读机制，选择和生成校验仍留在本模块。
// 导出不等于向preload增加API；Agent参数仍只能使用保存的设置路径。
// 这使主模型、LoRA和辅助文件的分类共用一张目录映射表。
module.exports = { listLoras, prepareLoraGeneration, catalog, rootsFor, imageModelIssue };
