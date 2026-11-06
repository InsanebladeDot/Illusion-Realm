/**
 * 给Agent返回可直接使用的模型目录JSON，不再用展示标题代替实际文件名。
 * 目录和系列证据复用LoRA生成预检，公共结果显式挑字段，绝不输出内部绝对路径。
 * 只查文件与已有资料，不读权重张量、不计算哈希、不请求Civitai或ComfyUI。
 */
const fs = require("node:fs/promises");
const path = require("node:path");
const { catalog, rootsFor, imageModelIssue } = require("./lora-tools");
const { MODEL_KINDS, readModelQuery, modelPage } = require("./model-query");

/**
 * roots是货架说明，models是货架上的文件，两者不能混用名字来统计。
 * root.id来自类别映射或配置键，公开结果不包含盘符或用户目录。
 * groups统计实际文件所在的相对文件夹，不按同名文件的显示标题合并。
 * files是该根扫描到的全部模型数，不随名称或系列筛选改变。
 * total则在外层代表筛选命中数，避免把两个不同口径混淆。
 * 缺失目录正常返回missing，不能伪装成“没有这种分类”。
 * 目录存在但无读权限返回unreadable，用户应检查权限而非重新下载模型。
 * 这里的目录读取仅用于可达性检查，不解析额外文件或扩大扫描根。
 * 不创建不存在的目录，不把查询升级为设置修改。
 * stat跟随配置根本身的链接，单个模型仍由readEntry的真实路径授权把关。
 * 路径不是绝对值时标记invalid，不能让当前工作目录决定工具扫到哪里。
 * 显式异常分支只返回通用状态，不把OS异常里的私人路径传回模型。
 * 目录在扫描后被删除时标记missing，文件结果仍会在公开适配时再次核验。
 * 相同相对名在不同root可单独统计，不因为显示名相同少算一个文件。
 * roots摘要用于解释配置，不作为生成工具的model参数。
 * @param {import('./lora-tools').Root} root 设置推导的类别根
 * @param {import('./lora-tools').Model[]} rows 本次扫描的完整条目
 */
async function describeRoot(root, rows) {
  const items = rows.filter(item => item.rootId === root.id);
  let status = "available";
  try {
    if (!path.isAbsolute(root.root)) status = "invalid";
    else if (!(await fs.stat(root.root)).isDirectory()) status = "invalid";
    else await fs.readdir(root.root);
  } catch (error) {
    status = error && typeof error === "object" && "code" in error && error.code === "ENOENT" ? "missing" : "unreadable";
  }
  return {id:root.id,kind:root.kind,status,groups:new Set(items.map(item => path.posix.dirname(item.name))).size,files:items.length};
}

/**
 * usable只回答generate_image当前入口的本地前置条件，不保证真实GPU加载。
 * 主模型必须系列已知、类别对应加载器，并且完整相对名唯一。
 * Anima需要diffusion，SDXL需要checkpoint，其他系列暂不进入图片工具。
 * 家族相同不代表所有工作流都支持，该边界与imageModel原检查一致。
 * LoRA没指定主模型时不能给true，使用null明确要求后续兼容查询。
 * 未知或冲突系列给false及原始原因，不能两个unknown相等就放行。
 * 文本编码器、VAE和补丁是辅助文件，给false说明不能填model槽位。
 * 辅助类别的false不表示文件损坏，也不阻止创建页工作流正常使用它们。
 * 同名冲突在完整未筛选候选中统计，series过滤不能隐藏另一个候选。
 * 这像检票前先核对姓名和车次，还不是证明列车已发车。
 * bytes读取失败或文件为空时不能宣称本地前置检查已通过。
 * 目录查询不会反序列化权重，非空伪文件也可能被归类为本地可尝试项。
 * 真正的模型格式、文本编码器组合及显存限制由提交ComfyUI后确定。
 * 原因文本只使用相对名称和类别，不拼接用户绝对位置。
 * @param {import('./lora-tools').Model} item 已扫描条目
 * @param {number|null} bytes 当前文件字节数
 * @param {number} matches 同一加载角色下完整相对名的候选数量
 * @returns {{usable:boolean|null,reason:string}} 本地可用性与解释
 */
function localUsability(item, bytes, matches) {
  if (bytes === null || bytes === 0) return {usable:false,reason:"文件不可读取、授权失败或为空，请检查模型目录和文件"};
  if (!["checkpoint","diffusion","lora"].includes(item.kind)) return {usable:false,reason:"辅助组件，不能填入generate_image的主模型model或loras参数"};
  if (["unknown","conflict"].includes(item.family)) return {usable:false,reason:item.reason};
  if (matches > 1) return {usable:false,reason:"完整相对名称在多个类别根重复，请先整理目录或设置，禁止猜路径"};
  if (!["anima","sdxl"].includes(item.family)) return {usable:false,reason:"当前generate_image仅支持Anima和SDXL，此系列仅可查询"};
  if (item.kind === "lora") return {usable:null,reason:"须把选定主模型的name传给list_loras，确认compatible=true后使用"};
  const issue = imageModelIssue(item);
  if (issue) return {usable:false,reason:issue};
  return {usable:true,reason:"本地前置条件通过，提交时仍须核对ComfyUI清单及实际加载结果"};
}

/**
 * 按公开契约重新构造对象，不能把内部Model直接展开到返回JSON。
 * name由类别根相对路径产生，含扩展名，Agent不应再自己补目录或后缀。
 * bytes是精确文件长度，不把5.4GB这种显示文字再转回近似数字。
 * 只对当前页最多100项stat，不为显示一个页面读取所有文件的体积。
 * stat只读文件信息，不顺序扫描GB级权重内容。
 * 授权失败时直接返回null字节，不触碰可能逃逸配置目录的文件。
 * 扫描之后文件被移动或删除时，stat失败返回不可用条目，不整页报错。
 * 绝对路径仍留在主进程内部，公共字段只保留rootId与相对name。
 * series与原family同源，列表不维护第二套推断规则。
 * evidence保留判断依据，reason解释当前工具的可用状态，两者语义不同。
 * trainedWords是资料中的触发词，不强制自动添加到用户提示词。
 * validation固定local_precheck，防止把usable=true误读成真实加载测试成功。
 * ambiguity比较时忽略Windows大小写和斜杠差异，但不删除任何目录段。
 * 主模型只与主模型比较重名，不能让同名LoRA阻止合法主模型选择。
 * LoRA则只在LoRA集合内部消歧，符合原生成选择器的候选边界。
 * 此适配器没有写盘、下载或生成副作用，失败不留下半份元数据。
 * @param {import('./lora-tools').Model} item 本页条目
 * @param {Map<string,number>} names 完整候选的名称计数
 */
// 读取bytes发生在身份检查后，名称相同不意味着允许越过配置根读取。
// 来源资料无效时仍能报告磁盘体积，但reason要求修复资料后再加载。
// bytes=null表达未知，不用0伪装读取失败，0专门保留给真实空文件。
// stat返回大于安全整数的长度时也用null，避免JSON数字悄悄失去精度。
// 外部删除文件只使该项不可用，不应让整页其他模型一起消失。
// 完整名称保留中文、空格和实际扩展名，客户端不必按显示名逆向拼路径。
// name规范使用正斜杠，生成层仍按原规则与ComfyUI反斜杠名称比对。
// rootId表明来自unet还是diffusion_models，但不拼到name前面。
// 这是因为ComfyUI节点接收的是类别根以下名称，带类别前缀反而找不到文件。
// 模型可用标记没有落盘，因此用户移动模型后下一次查询会重新计算。
// 同一条目每次显示触发词都来自当前旁车，不复用另一个同名版本的介绍。
// 返回对象没有sourceUrl或downloadUrl，目录查询不会泄露带参数的下载地址。
// evidence只表示已有资料和路径中的家族标签，不表示读过模型头部结构。
// validation让UI或模型能区分本地静态预检与未来可能增加的真实加载验证。
// 即使文件非空且架构标签匹配，缺少文本编码器仍可能使真实工作流失败。
// 这个状态不能替用户证明显存充足，显存属于执行时环境。
// 主模型项不额外声明默认权重或采样参数，这些仍来自工作流模板。
// LoRA的强度不属于清单固有信息，生成请求可以显式选择自己的权重。
// 同名消歧是执行参数问题，查询会保留两个记录解释来源，不静默去掉一个。
// 公共字段逐一列出，后续给内部Model加字段不会自动扩大云端可见内容。
async function describeModel(item, names) {
  let bytes = /** @type {number|null} */ (null);
  try {
    if (item.available) {
      const stat = await fs.stat(item.filePath);
      if (stat.isFile() && Number.isSafeInteger(stat.size)) bytes = stat.size;
    }
  } catch { /* 文件可能在扫描后被移动；保留条目并明确标记不可用。 */ }
  const key = `${item.kind === "lora" ? "lora" : "main"}:${item.name.toLowerCase()}`;
  return {name:item.name,kind:item.kind,series:item.family,rootId:item.rootId,bytes,...localUsability(item,bytes,names.get(key) || 0),evidence:item.reason,trainedWords:item.trainedWords,validation:"local_precheck"};
}

/**
 * 查询主模型时同时扫描另一种主模型根，防止筛选类别隐藏完整名冲突。
 * 这些额外候选只用于消歧，不会混入用户请求的models和roots。
 * LoRA和辅助类别没有这项额外扫描，不为找一条LoRA遍历所有主模型。
 * 查询all时使用登记的全部类别，但不会扫任意未分类的文件夹。
 * 确定性顺序使用类别、完整名称和rootId，不受文件系统枚举先后影响。
 * 先过滤、再排序、最后切页；命中总数由完整数组给出。
 * 因此第40条之后的模型仍能通过nextOffset继续获取。
 * category和series两个条件取交集，不能按名称体积替代架构证据。
 * query匹配完整相对路径，便于找包含中文或多级分类的模型。
 * 搜索为空不会捏造默认模型；空清单应让用户去设置页配置。
 * 参数核验发生在扫描之前，错误kind不会触发一次全库回退扫描。
 * 这里调用同一catalog，生成前LoRA预检也通过该机制寻找真实文件。
 * @param {ReturnType<typeof readModelQuery>} query 已核验输入
 * @param {import('./lora-tools').Paths} paths 用户路径设置
 */
// 主模型名称冲突的判据与selectModel保持同一候选边界。
// 同名checkpoint和diffusion即使不同家族也不能由series过滤后强行消歧。
// name匹配包含目录与扩展名，只比较basename会把不同系列混在一起。
// 辅助组件参与列表排序，却不会影响主模型同名计数。
// 标准化只改比较键，不改返回给ComfyUI的源名称。
// rootId作为最后排序项，使两条同名记录的页面顺序可重复。
// 可重复顺序仅针对未改变的目录，并非对外部文件增删提供事务快照。
// 文件组数与命中数分开报告，名称过滤后roots.files仍是原目录全量。
// 选kind=text_encoder只返回编码器根，不用遍历主模型来推断其是否兼容。
// 选kind=lora只扫描LoRA，保持原专用查询的开销边界。
// 未知系列依然保留在all结果，用户可用series=unknown单独排查。
// 来源冲突用独立conflict值，不把“没识别”和“证据互相矛盾”合并。
// 家族过滤严格相等，Wan2.1与Wan2.2不会因为都叫Wan就混入同一组。
// query与series都为空时返回全部已分类文件，仍受分页控制。
// 没有模型时可返回类别根的missing或available，帮助区别缺目录与空目录。
// 根状态检查只表示该目录可读取，不保证所有子目录都没有权限问题。
// 底层扫描器跳过不可读子目录的既有行为未改变，不能宣称全盘审计完成。
async function queryCatalog(query, paths) {
  const kinds = /** @type {import('./lora-tools').Root['kind'][]} */ (query.kind === "all" ? MODEL_KINDS : [query.kind]);
  const scanKinds = kinds.some(kind => kind === "checkpoint" || kind === "diffusion") ? [...new Set([...kinds,.../** @type {const} */ (["checkpoint","diffusion"])])] : kinds;
  const rows = await catalog(paths,scanKinds);
  const names = new Map();
  for (const item of rows) {
    const key = `${item.kind === "lora" ? "lora" : "main"}:${item.name.toLowerCase()}`;
    if (["lora","checkpoint","diffusion"].includes(item.kind)) names.set(key,(names.get(key) || 0) + 1);
  }
  const matched = rows.filter(item => kinds.includes(item.kind) && (!query.series || item.family === query.series) && (!query.query || item.name.toLowerCase().includes(query.query)));
  matched.sort((a,b) => a.kind.localeCompare(b.kind,"en") || a.name.localeCompare(b.name,"en") || a.rootId.localeCompare(b.rootId,"en"));
  const roots = await Promise.all(rootsFor(paths).filter(root => kinds.includes(root.kind)).map(root => describeRoot(root,rows)));
  return {rows:matched,names,roots};
}

/**
 * 宿主桥仍传文字，但文字内容是一份JSON；不需要新增IPC或preload方法。
 * version用于识别工具返回契约，不改变模型文件或用户文档格式。
 * 未配置任何路径时给not_configured与可执行的设置建议，不猜磁盘位置。
 * 目录已配置但无命中时给empty，具体缺失和权限状态在roots中区分。
 * total大于0但offset超尾是正常空页，status仍为ok，不误报目录不存在。
 * 只序列化公开字段，不能泄漏roots内部的绝对root属性。
 * returned与nextOffset沿用公共分页规则，LoRA清单也使用同一实现。
 * notes明确本地预检的边界，不把文件存在与真实生成成功等同。
 * limit限制输出体积，不限制磁盘扫描统计或可访问的总记录数量。
 * 本次扫描无跨调用缓存；跨页期间增删文件时应重新从0查询。
 * 不在这里吞掉参数或目录扫描异常，上层已有工具错误通道负责交付。
 * 异步返回的Promise由宿主执行器等待，既有超时和取消机制保持不变。
 * 对不存在的模型不自动挑一个相近名字，避免生成与用户选择不一致。
 * @param {Record<string,unknown>} args 工具查询参数
 * @param {import('./lora-tools').Paths} paths 从设置读取的固定快照
 * @returns {Promise<string>} 公共JSON结果
 */
// 工具返回始终是一份JSON，不能在前后附加人类说明导致JSON.parse失败。
// 说明文字集中在notes数组，客户端可显示而不需要解析排版缩进。
// status描述整个筛选结果，单条可用性在各自usable和reason中表达。
// not_configured是没有任何有效路径字段，不等于已配置目录但没有模型。
// 当前类别没有独立路径时roots可为空，notes提示到设置页补配置。
// 返回filters使用规范化值，用户可知道unet实际上按diffusion查询。
// 模型series字段是证据结论，与filters.series请求值不能互相替代。
// 全部命中数先计算再截取，查询第100项不会让total突然只剩当前页数量。
// current offset被原样记录，超尾空页不会误触发调用方从0循环读取。
// 空页nextOffset为null，Agent应停止续页而不是换参数重复扫描。
// Promise.all只处理本页，limit上限控制并行stat数量。
// 返回roots先完成状态检查，目录配置错误可在同一结果里解释。
// 模型被外部移动时本次清单可能是瞬时快照，后续执行仍需二次确认。
// 这份JSON不包含模板默认模型名称，不把未查询到的默认文件当成存在。
async function listModels(args, paths) {
  const query = readModelQuery(args);
  const result = await queryCatalog(query,paths);
  const {items,...page} = modelPage(result.rows,query);
  const described = await Promise.all(items.map(item => describeModel(item,result.names)));
  // 正式扫描和可用性判断先完整执行，摘要不能把缺文件等失败信息过滤掉。
  // 保留可直接传给生成器的完整名称、类别和系列，不用简称代替模型身份。
  // 成功项省去重复原因和字节数；失败项保留原因，便于停止并请用户配置。
  // 根状态与分页不变，空结果仍能区分缺目录、未配置和关键词无匹配。
  // 详细模式继续原契约，既有目录检查和用户要求的完整清单不丢信息。
  const models = query.summary ? described.map(({name,kind,series,usable,reason}) => ({name,kind,series,usable,...(usable ? {} : {reason})})) : described;
  return JSON.stringify({version:1,status:!rootsFor(paths).length ? "not_configured" : page.total ? "ok" : "empty",roots:result.roots,models,...page,filters:{kind:query.kind,series:query.series || null,query:query.query},notes:["name含全部子目录和扩展名，原样传给生成工具；禁止猜测或拼接路径。","usable仅针对generate_image本地前置条件；null表示须先选主模型核实LoRA兼容性，非实际加载成功。","空结果先检查roots状态；未配置、目录缺失或不可读时请用户到设置→模型路径配置。","nextOffset=null表示无后续页；目录变化后从offset=0重新查询。"]});
}

// 扫描授权和兼容性判据仍由原模块持有，公共适配只导出查询入口。
// Agent不能直接取得内部rows、filePath或绕过生成前二次校验。
module.exports = { listModels };
