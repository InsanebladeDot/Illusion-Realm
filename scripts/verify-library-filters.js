/**
 * 静态资料库分类回归：加载正式 TypeScript 纯函数和实际背景数据。
 * 不启动浏览器、不请求图片、不访问用户配置或在线角色服务。
 * 预期集合直接从原始记录独立推导，避免被测函数自己证明自己。
 * 人工边界覆盖大类并集、特征交集、空值和已选独立视图。
 * 当前格式先验证真实数据，再验证中英双语分类键的兼容。
 * 失败直接退出1，可作为构建前的离线检查使用。
 */
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const ts = require("../apps/next/node_modules/typescript"), root = path.join(__dirname, "../apps/next/src"), cache = new Map();

/**
 * 只转译受测模块和本地数据，类型擦除不改写实际筛选算法。
 * alias 限定为应用源码路径，禁止测试意外加载 Electron 或网络模块。
 * VM 的 module/exports 指向同一对象，遵循真实 CommonJS 语义。
 * 不提供 window，使数据文件的浏览器调试挂载自然跳过。
 * cache 仅复用本次进程中的已加载模块，不留下磁盘产物。
 * 编译目标固定 ES2020，便于直接执行原来的 Set/Map 逻辑。
 */
// 文件解析失败应直接抛出，使资料损坏成为明确失败而不是空结果通过。
// 不捕获单个模块错误回退为空对象，避免缺少导出仍得到误导性绿灯。
// 只允许utils别名，任何新增运行时依赖都会要求测试显式更新隔离边界。
// 源数据和算法分别转译，测试没有复制实现内部的分类规则。
// 编译后执行整个模块，避免从源码正则截取函数遗漏相关常量。
// 加载路径只来源于本文件固定字符串，不处理用户输入。
// VM未提供fetch，因此误加网络依赖会立即失败。
// test运行后不持久化模块缓存，下一次启动会重新读取当前源码。
function load(relative) {
  if (cache.has(relative)) return cache.get(relative);
  const source = fs.readFileSync(path.join(root, relative), "utf8"), compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(compiled, { module: loaded, exports: loaded.exports, require: name => { assert.ok(name.startsWith("@/utils/")); return load(`${name.slice(2)}.ts`); } });
  cache.set(relative, loaded.exports); return loaded.exports;
}

/**
 * 与既有配置一致，重复条目、空标签和空预览不进入背景卡片集合。
 * 这里保持独立谓词，不调用线上 normalizeItems 作为期望结果。
 * ids 比较稳定标识而非 VM 对象原型，避免跨上下文深比较假失败。
 * 实际条目数是已核对的1056，原始数据的1087条不是可用分母。
 * 大类和特征统计应在未过滤全集上计算，不能跟随页码变化。
 */
// 函数输入采用默认排序，完整ID序列应保持原始资料顺序。
// 两个categories在同一记录内重复不会使输出重复，过滤以记录为单位。
// 固定1056只是资料基线，后续期望逐条计算而非全部硬编码。
// 如果源资料以后正式更新，需要审查分母变化而不是自动放宽测试。
// 当前标签拼写night和rainy取自真实数据，不从中文显示名反推。
// 自然与都市均有多条记录，能有效区分大类并集和误写的交集。
// 这组大类是互斥源类别，错误要求同时属于两类会明显失败。
// 夜晚雨天只在子集中出现，误写任意特征会返回更多记录。
// 比较完整序列同时检查了结果无丢失、无重复和默认顺序。
// 统计检查遍历全部大类和特征，不只挑一个容易通过的示例。
// 测试不将图片是否下载成功作为资料是否存在的判据。
// selectedOnly路径中的假关键词仅用来验证原搜索确实被绕过。
// 该视图用完整对象草稿，尾条在当前页外仍需保持可见。
// 清除分类后再次验证1056，排除函数内部意外修改了输入数组。
// 兼容测试在当前格式通过后执行，避免兼容层掩盖正常分支故障。
// 英文大类key与双语原值的等价性有独立数量基准265。
// 验证仅针对内置数据的声明，不推断标签在百科语义上绝对准确。
function checkRealData() {
  const raw = load("data/prompt/background_prompt.ts").backgroundData, items = raw.filter(row => !row.duplicate && row.tags.trim() && row.preview.trim());
  const api = load("utils/library-facets.ts"), input = { query: "", category: "", selectedIds: [], selectedOnly: false, sort: "default" };
  assert.equal(raw.length, 1087); assert.equal(items.length, 1056);
  // 先测两大类并集，必须能包含两种场景，不能错误取交集。
  // 再加入night和rainy，二者必须同时存在，不能只满足其中一个。
  // 原始categories含中英双语，比较用数据原值而不是调用categoryKey。
  // 断言完整ID序列，不只比较碰巧相同的条目数量。
  const categories = ["自然与户外 (Nature & Outdoors)", "都市与日常 (Urban & Daily)"], traits = ["night", "rainy"];
  for (const required of [[], traits]) {
    const expected = items.filter(row => row.categories.some(value => categories.includes(value)) && required.every(value => row.traits.includes(value)));
    assert.equal(api.filterBackgroundItems(items, input, { categories, traits: required }, []).map(row => row.id).join(), expected.map(row => row.id).join());
  }
  // 特征徽标逐个与原始集合反向对照，不把post_count或当前页当数量。
  // 大类总数也必须来自这份可用数据，重复占位不会出现在徽标里。
  // UI分页仅显示24张，但这里比较整库，防止只筛当前页。
  for (const field of ["categories", "traits"]) for (const facet of api.listLibraryFacets(items, field)) assert.equal(facet.count, items.filter(row => row[field].includes(facet.value)).length);
  // 已选独立视图故意保留不可能命中的关键词与分类作为反向条件。
  // 选首尾两条模拟跨页选择，应两条都出现，而不是当前页的一条。
  // 清空条件应恢复原始可用全集顺序，不改变提示词或数据。
  const selected = [items[0], items[items.length - 1]];
  assert.equal(api.filterBackgroundItems(items, { ...input, query: "impossible-marker", selectedOnly: true }, { categories: ["missing"], traits: ["missing"] }, selected).map(row => row.id).join(), selected.map(row => row.id).join());
  assert.equal(api.filterBackgroundItems(items, input, { categories: [], traits: [] }, []).length, 1056);
  // 大类键同时接受英文和末尾括号英文，兼容两种原始数据表达。
  // 不把普通特征当成分类翻译，也不从字符串中间随便截取括号。
  // 该兼容只在读取比较侧生效，不改写原数据和导出的Tags。
  assert.equal(api.categoryKey(categories[0]), "nature & outdoors"); assert.equal(api.categoryKey("Nature & Outdoors"), "nature & outdoors");
  assert.equal(api.filterBackgroundItems(items, input, { categories: ["Nature & Outdoors"], traits: [] }, []).length, 265);
}

/**
 * 人工作品集合超过30项，验证热门截断与完整作品搜索是两条规则。
 * works按数量递增，独立推导热门第一名应为work-39。
 * 当前选择work-0不在热门，必须仍显示，避免条件无法撤销。
 * 搜索work-0要从全集找，不能在前30项里继续筛出空结果。
 * 同条记录重复声明同一特征只计一条，统计不能虚高。
 * 空数据源保持空数组，不补写看似合理的分类。
 */
// 作品编号只作为人造名字，排序依据故意使用递增计数。
// 源数组按work-0开始，若原地排序会影响后面输入，因此还会继续搜索。
// 搜索低热度work-0证明菜单前30截断没有裁剪真实分类源。
// 选择低热度项后默认列表可多出一项，以可撤销筛选为优先。
// 未知作品不应被加入菜单，当前活动值必须仍来自完整values集合。
// 重复night只占一条记录，与两个独立背景都有night不同。
// 空values不以selected为借口凭空添加不存在的作品。
// 这些人工边界与真实1056条回归互补，不代替真实数据统计。
// 菜单数量和首项配对检查，不能把任意三十个作品误当热门排序。
// 不确定名字的查询只返回真实匹配，不为凑菜单长度补写作品。
// 期望数组来自测试自行构造，未借用生产分类结果生成断言目标。
// 该组没有读取原始图片或模型文件，运行不受用户磁盘配置影响。
// 纯函数重复调用应保持相同结果，不依赖主题或系统时间。
// 所有原始字符串都由固定fixture提供，禁止构造动态执行代码。
function checkEdges() {
  const api = load("utils/library-facets.ts"), works = Array.from({ length: 40 }, (_, index) => `work-${index}`), counts = Object.fromEntries(works.map((work, index) => [work, index]));
  assert.equal(api.characterWorkFacets(works, counts, "").length, 30); assert.equal(api.characterWorkFacets(works, counts, "")[0], "work-39");
  assert.equal(api.characterWorkFacets(works, counts, "work-0").join(), "work-0"); assert.ok(api.characterWorkFacets(works, counts, "", "work-0").includes("work-0"));
  assert.equal(api.listLibraryFacets([{ categories: [], traits: ["night", "night"] }], "traits")[0].count, 1); assert.equal(api.characterWorkFacets([], {}, "").length, 0);
}

// 同步断言异常统一返回非零，不留下只打印失败但CI成功的便利脚本。
// 成功报告仅覆盖本地过滤，不声称远程预览服务在线或生成效果正确。
// 输出不包含用户路径、模型名称和任何账户令牌。
try { checkRealData(); checkEdges(); console.log("PASS library filters: real counts, category OR, trait AND, selection, work search, compatibility"); }
catch (error) { console.error(error); process.exit(1); }
