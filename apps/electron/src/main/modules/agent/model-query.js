/**
 * 统一模型清单的输入与分页：先核验参数，再对完整命中集合切页。
 * 像图书馆先找到整份目录，再取第几页；不能数满一页就停止统计总数。
 * 不扫描文件、不请求网络，也不读取或更改用户设置。
 */

// 工具分类是加载角色，系列是架构，两者不能用一个字符串代替。
// diffusion同时覆盖标准目录和UNet目录，实际来源另由rootId记录。
// 辅助文件可以浏览，但generate_image的model槽位不接受这些类别。
// all表示下面已登记的类别，不表示任意目录都能被识别和生成。
// search保留为旧调用别名，解析为all，不再把检索根当成一种模型。
// 家族unknown与conflict也可查询，便于用户找到需要补资料的文件。
// 这里列的是识别器现有规范标签，不从Agent输入动态创建新家族。
// 查询标签不赋予文件身份：筛选anima只能选出证据已为anima的条目。
// 名称关键词不参与系列认定，叫anima-style也可能是SDXL权重。
// 显式登记别名是为了兼容用户常说的目录名称，不接受随意拼写猜测。
const MODEL_KINDS = ["checkpoint", "lora", "diffusion", "text_encoder", "vae", "model_patch"];
const MODEL_SERIES = ["anima", "sdxl", "wan2.1", "wan2.2", "hunyuan-video", "ltx-video", "minimax", "flux", "sd1.x", "unknown", "conflict"];
const KIND_ALIASES = {search:"all",checkpoints:"checkpoint",loras:"lora",unet:"diffusion",diffusion_models:"diffusion",diffrent_models:"diffusion",text_encoders:"text_encoder",clip:"text_encoder",model_patches:"model_patch"};

/**
 * offset以过滤和稳定排序后的条目为单位，不是组数或磁盘字节。
 * limit默认40、最大100；客户端不能一次把所有权重清单灌进上下文。
 * 只接受安全整数，避免负数倒数切页、NaN或巨大数值产生含糊结果。
 * 数字字符串不会隐式转为数字，工具必须按Schema提供正确JSON类型。
 * 未提供参数才用默认值，null不是另一种缺省写法。
 * 参数错误在扫描前抛出，避免无效请求仍遍历用户模型库。
 * 错误只含字段规则，不拼接原始输入或用户文件路径。
 * 此函数不决定页码是否超尾；合法超尾由分页器返回正常空页。
 * @param {unknown} value 工具传入的页范围值
 * @param {number} fallback 缺省值
 * @param {number} minimum 最小合法整数
 * @param {number} maximum 最大合法整数
 * @returns {number} 已核验的页范围值
 */
function pageNumber(value, fallback, minimum, maximum) {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error("offset须为非负安全整数，limit须为1到100的整数");
  return value;
}

/**
 * 清单与LoRA查询共用这套规范，防止一个入口接受参数另一个却默默忽略。
 * kind缺省all，series缺省不过滤，query缺省为空关键词。
 * alias只用于类别，不能把系列anima当作类别目录。
 * 未知kind明确报错，不回落all后把无关LoRA冒充用户想看的主模型。
 * series支持规范标签及all；all仅表示不过滤，不改变未知模型证据。
 * query只做trim与小写处理，不执行正则、glob或文件读取。
 * query可匹配完整相对名中的子目录，便于搜索中文分类或版本。
 * 长度上限避免把整段聊天或工作流误当关键词传给磁盘查询。
 * 空数组和null不是查询对象，直接失败而不是展开成空查询。
 * 不接收扫描路径；即便传入未知字段，也不能改变设置中的目录根。
 * 返回的是规范查询，不修改调用方原始参数，日志仍可保留最初请求身份。
 * 模型传model用于LoRA比较时由原兼容入口处理，不在这里猜测文件。
 * series筛选与选定主模型的series是不同含义，前者不会替代后者校验。
 * 空series字符串视为无筛选，支持已清空的可选过滤输入。
 * 类别别名只读自有属性，防止constructor等继承属性成为非法分类对象。
 * 公共Schema还会向模型解释这些规则，运行期仍必须独立检查。
 * @param {Record<string,unknown>} args 工具入参
 */
function readModelQuery(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("模型查询参数必须为对象");
  const raw = args.kind === undefined ? "all" : args.kind;
  const alias = typeof raw === "string" && Object.hasOwn(KIND_ALIASES,raw) ? KIND_ALIASES[/** @type {keyof typeof KIND_ALIASES} */ (raw)] : raw;
  if (typeof alias !== "string" || !["all",...MODEL_KINDS].includes(alias)) throw new Error("不支持的模型类别kind，请使用工具声明中的分类");
  const series = args.series === undefined || args.series === "all" ? "" : args.series;
  if (typeof series !== "string" || (series && !MODEL_SERIES.includes(series))) throw new Error("不支持的模型系列series，请使用工具声明中的规范标签");
  const query = args.query === undefined ? "" : args.query;
  if (typeof query !== "string" || query.length > 200) throw new Error("query须为不超过200字符的文本");
  // 摘要只改变公开字段数量，不放宽名称、类别或兼容性检查。
  // 字符串 true 不能误当开关，主进程和直接工具调用都按布尔契约校验。
  // 旧调用缺省 false，已有详细清单与分页测试继续使用完整结果。
  // summary 与 limit 独立：小页可以详细返回，摘要也不能绕过最大页长。
  if (args.summary !== undefined && typeof args.summary !== "boolean") throw new Error("summary须为布尔值");
  return {kind:alias,series,query:query.trim().toLowerCase(),offset:pageNumber(args.offset,0,0,Number.MAX_SAFE_INTEGER),limit:pageNumber(args.limit,40,1,100),summary:args.summary === true};
}

/**
 * 过滤和排序必须由调用方先完成，分页器不能只看当前页再推算总数。
 * total是不受offset影响的命中数，翻页后仍能明确知道目录范围。
 * returned是这一页实际条数，末页不必凑满limit。
 * nextOffset只在后面还有记录时给出，否则为null。
 * 超尾页保持调用方offset，返回空items，不能偷偷跳回第一页。
 * truncated表示还有后续页，不声称之前页面未被读取。
 * 不缓存磁盘快照：文件增删后需从offset0重新查询才能得到连续新清单。
 * 查询本身不执行下载或锁定目录，不能保证跨页期间外部文件不变化。
 * 返回新slice，不改变生产清单的原始顺序和选择对象。
 * offset+returned不超过实际数组长度，nextOffset不会凭空增长。
 * 调用方序列化时可把items改名为models或loras，分页语义保持相同。
 * 泛型只表达条目原样通过，不把缺失字段断言为某种模型类型。
 * @template T
 * @param {T[]} items 已过滤且稳定排序的全集
 * @param {{offset:number,limit:number}} query 已核验的分页输入
 */
function modelPage(items, query) {
  const page = items.slice(query.offset,query.offset + query.limit);
  const nextOffset = query.offset + page.length < items.length ? query.offset + page.length : null;
  return {items:page,total:items.length,offset:query.offset,limit:query.limit,returned:page.length,nextOffset,truncated:nextOffset !== null};
}

// 两个查询声明使用同一组参数字段，不再手写两份不同的上下界。
// Schema只帮助模型构造参数，不能代替上面的运行期核验。
// enum保留老search别名，已有假模型与旧聊天调用不因升级突然断开。
// query检索相对名，不能理解为目录授权或任意文件选择器。
// 未暴露绝对路径字段，后续生成只应使用结果里的name。
// 页大小上限限定上下文体积，不意味着目录里最多只有100个模型。
// nextOffset由程序算出，模型无需自己累加页码或猜偏移量。
// series枚举来自同一常量，声明与校验不会因复制粘贴漏掉一个系列。
// 别名映射值都是已有类别，不会产生未登记的第四种主模型加载器。
// 返回结构中的kind永远是规范类别，不保留输入别名。
// all不包含未经分类的裸根文件，这些文件应先整理到正确类别目录。
// 类别别名用于输入方便，返回结果始终输出规范kind，避免下游分支增加多套值。
// 分页结果不携带会话游标，连续页要求期间目录保持稳定。
// 选择模型必须保存返回name，不能把页面序号当作生成参数。
// 名称搜索只是子串匹配，不保证能理解中文角色别名或模型宣传名称。
const MODEL_QUERY_PROPERTIES = {
  // 生成前先取少量摘要，用户要求清单或排错时才返回详细证据及字节数。
  // 页偏移和真实总数不缩减，摘要模式仍能准确判断是否还有后续项。
  // 这不是扫描缓存，目录的实际读取和生成前复核保持原有边界。
  summary:{type:"boolean",default:false,description:"生成准备时设true，仅返回必要名称、类别、可用性和失败原因；配合小limit避免整库灌入上下文。"},
  kind:{type:"string",enum:["all",...MODEL_KINDS,...Object.keys(KIND_ALIASES)],description:"按类别查询；主模型仅checkpoint或diffusion；unet/diffusion_models/diffrent_models均归diffusion。默认all。"},
  series:{type:"string",enum:["all",...MODEL_SERIES],description:"按资料或目录证据筛系列，如anima、sdxl；不按文件名或体积猜架构。"},
  query:{type:"string",maxLength:200,description:"按完整相对名称过滤，保留子目录和扩展名，不区分大小写。"},
  offset:{type:"integer",minimum:0,description:"过滤排序后的偏移，首次0，续页使用返回的nextOffset。"},
  limit:{type:"integer",minimum:1,maximum:100,default:40,description:"每页条数；total为所有命中数，nextOffset=null才到末尾。"},
};

// 仅导出无副作用的查询契约，文件扫描和生成检查保持独立业务职责。
// 任何入口复用它都不能因此获得额外的文件系统访问能力。
module.exports = { MODEL_KINDS, MODEL_QUERY_PROPERTIES, readModelQuery, modelPage };
