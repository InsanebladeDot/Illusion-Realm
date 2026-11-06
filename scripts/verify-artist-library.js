/**
 * 画师资料和收藏的离线回归：实际执行生产TypeScript查询器与Zustand store。
 * 用户文档存储替换为内存适配器，其余搜索、排序、分组action保持正式实现。
 * 不访问在线预览、账号、模型目录或付费生成接口。
 * 预期基于原始JSON独立计算，避免复用查询器生成自己的期望。
 * 成功退出0，任何断言或加载异常退出1，适合构建前运行。
 */
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const ts = require("../apps/next/node_modules/typescript"), root = path.join(__dirname, ".."), cache = new Map();
let saved;

/**
 * 仅拦截统一文档storage，保存结构化克隆而非store的活动引用。
 * rehydrate会重新读取保存值，能发现partialize/merge遗漏数据的问题。
 * zod与zustand使用项目实际依赖，不模拟持久化middleware的行为。
 * TypeScript通过正式编译器转为CommonJS，源码里的注释不作为可执行代码。
 * 模块缓存仅本进程有效；创建第二个store实例时显式清除缓存。
 * JSON由JSON.parse读取，不运行第三方data.js中的window赋值。
 * 不提供fetch，生产查询器误加网络依赖时测试应直接失败。
 * crypto仅提供UUID生成，fixture不依赖操作系统时钟产生分组ID。
 * require只接收已知alias与两个正式依赖，不静默回落到任意模块。
 * load失败会向外抛出，不能把缺少资料误认为正常空结果。
 * 跨VM数组用ID序列或长度断言，避免因原型不同制造假失败。
 * 真实文件写盘与窗口重载留给Electron页面专项，此处不冒称已覆盖。
 */
function load(relative) {
  if (cache.has(relative)) return cache.get(relative);
  const text = fs.readFileSync(path.join(root, relative), "utf8");
  if (relative.endsWith(".json")) return JSON.parse(text);
  const module = { exports: {} }, compiled = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  vm.runInNewContext(compiled, { module, exports: module.exports, structuredClone, crypto, require: name => { if (name === "@/utils/userDataStorage") return { createUserDataSectionPersistStorage: () => ({ getItem: () => ({ state: structuredClone(saved) }), setItem: (_key, value) => { saved = structuredClone(value.state); }, removeItem: () => undefined }) }; if (name.startsWith("@/")) return load(`apps/next/src/${name.slice(2)}${name.endsWith(".json") ? "" : ".ts"}`); if (name.startsWith("@illusion-realm/shared/")) return load(`packages/shared/src/${name.slice("@illusion-realm/shared/".length)}.ts`); assert.ok(["zod", "zustand", "zustand/middleware"].includes(name)); return require(path.join(root, name === "zod" ? "packages/shared/node_modules" : "apps/next/node_modules", name)); } });
  cache.set(relative, module.exports); return module.exports;
}

/**
 * 首先检验正式资料的40600条基线、唯一ID及原名完整性。
 * 七种排序逐项独立求期望，不能只比较首个恰好相同的卡片。
 * 随机排列验证全集无丢失、无重复、相同seed一致及不同seed变化。
 * 反向搜索使用不存在的名字，必须返回空集合而非自动放宽条件。
 * 已选视图故意带不命中的搜索和未知组，应仍保留首尾两位画师。
 * 分组从整个源集合过滤，末位画师不在第一页也必须可查到。
 * 原始转义括号作为提示词保留，图片文件名去转义后再URL编码。
 * 预览URL检查只验证映射约定，不证明公网图片可达。
 */
async function main() {
  const raw = JSON.parse(fs.readFileSync(path.join(root, "apps/next/src/data/prompt/artist-reference.json"), "utf8"));
  const api = load("apps/next/src/utils/artist-library.ts"), items = api.ARTIST_ITEMS, input = { query: "", selectedOnly: false };
// 基线数量写死40600，防止抽取脚本漏掉一段数据却仍自洽通过。
// 唯一ID断言防止两个名字相同的记录被误当作同一位画师。
// 标签序列与原JSON全量对照，不只抽查首页几个英文名字。
// 这里比较的是导入内容，不以UI的分页总数作为数据完整性证明。
// 测试输入明确为空关键字，排序比较不会混入过滤差异。
// 热度并列时以名字排序，期望同样显式指定平局规则。
// 名称排序使用与生产相同语言约定，但独立构造比较器。
// 升序与降序分别运行，防止两个按钮实际上都调用降序。
// 独特性与作品数分别取各自字段，避免不同选项只改label。
// 随机测试传固定seed，使失败可重现，不依赖Math.random的偶然排列。
// 同seed必须相同，验证分页不会在每次查询时重新洗牌。
// 不同seed应不同，验证随机选项没有退化成固定排序。
// 集合大小验证每条记录恰好出现一次，不能只比较返回数组长度。
// 分组测试使用最后一条记录，明确覆盖第一页以外的数据。
// 未知搜索不许回退全部，避免没有结果却冒充已找到画师。
// 只看已选故意给未知分组，验证草稿不被隐藏条件吞掉。
// 预览去转义与提示词保留转义是两项不同契约，同时检查。
// 没有向公网请求缩略图，URL字符串正确不等于图片服务在线。
  assert.equal(raw.length, 40600); assert.equal(new Set(raw.map(item => item.id)).size, raw.length); assert.equal(items.map(item => item.tags).join(), raw.map(item => item.name).join());
  // 单独构造收藏fixture，只包含首尾两项，避免依赖生产默认收藏。
  // 测试组只含末项，用来区分默认收藏与具体分组的查询范围。
  // 固定组名不参与查询，查询只能按组id匹配。
  // fixture包含合法version，格式校验与内容查询不会混为同一失败。
  // 所有排序都接收同一份fixture，结果差异只能来自排序规则。
  const collections = { version: 1, favorites: [items[0].id, items.at(-1).id], groups: [{ id: "test", name: "Test", artistIds: [items.at(-1).id] }] };
  for (const sort of api.ARTIST_SORTS.filter(value => value !== "random")) { const expected = [...raw].sort((a, b) => { const name = a.name.localeCompare(b.name, "en"); if (sort.startsWith("name")) return sort === "name-asc" ? name : -name; const value = sort.startsWith("works") ? a.post_count - b.post_count : a.uniqueness_score - b.uniqueness_score; return (sort.endsWith("desc") ? -value : value) || name; }); assert.equal(api.filterArtistItems(items, input, "", collections, sort, [], 0).map(item => item.id).join(), expected.map(item => item.id).join()); }
  const random = seed => api.filterArtistItems(items, input, "", collections, "random", [], seed).map(item => item.id).join(); assert.equal(random(7), random(7)); assert.notEqual(random(7), random(8)); assert.equal(new Set(random(7).split(",")).size, raw.length);
  assert.equal(api.filterArtistItems(items, { ...input, query: "absent artist 0000" }, "", collections, "works-desc", [], 0).length, 0);
  assert.equal(api.filterArtistItems(items, input, "test", collections, "works-desc", [], 0)[0].id, items.at(-1).id);
  assert.equal(api.filterArtistItems(items, { query: "absent", selectedOnly: true }, "unknown", collections, "works-desc", [items[0], items.at(-1)], 0).length, 2);
  const escaped = items.find(item => item.name.includes("\\(")); assert.ok(escaped.tags.includes("\\(")); assert.ok(!decodeURIComponent(escaped.preview).includes("\\("));
  // 旧文档没有画师段时恢复空收藏，schema不接受未来未知版本。
  // 手改文档中的重复收藏去重，孤立组成员被清理。
  // 两次读取分别新建store实例，防止旧内存掩盖merge丢字段。
  // action方法来自当前版本，不允许文档对象替换业务方法。
  // 收藏、分组与成员变化由正式persist middleware自动保存。
  const storePath = "apps/next/src/stores/use-artist-library-store.ts";
  let store = load(storePath).useArtistLibraryStore; await store.persist.rehydrate(); assert.equal(store.getState().collections.favorites.length, 0);
  store.getState().toggle("87540"); store.getState().saveGroup("", " Test "); const group = store.getState().collections.groups[0]; store.getState().assign(group.id, ["129952", "129952"], true); store.getState().saveGroup(group.id, "Renamed");
  assert.equal(saved.version, 1); assert.equal(saved.groups[0].name, "Renamed"); assert.equal(saved.groups[0].artistIds.join(), "129952"); assert.ok(saved.favorites.includes("129952"));
  // 重新实例化后必须恢复收藏、组名和成员，不能只测同一store的getState。
  // 移出分组保留默认收藏，删除分组同样不删除源数据或收藏。
  // 最后取消收藏清理所有组中的成员，保持成员是收藏子集的不变量。
  // 分别测试移除、删除与取消收藏，不能把三种操作实现成同一个清空。
  cache.delete(storePath); store = load(storePath).useArtistLibraryStore; await store.persist.rehydrate(); assert.equal(store.getState().collections.groups[0].name, "Renamed");
  store.getState().assign(group.id, ["129952"], false); assert.ok(saved.favorites.includes("129952")); store.getState().assign(group.id, ["129952"], true); store.getState().toggle("129952"); assert.equal(saved.groups[0].artistIds.length, 0); store.getState().deleteGroup(group.id); assert.ok(saved.favorites.includes("87540"));
// 收藏删除用正式toggle执行，不直接编辑生产store来构造通过结果。
// 组名首尾空格应在保存时清理，重载后不应恢复带空格名称。
// 同组重复加入相同id需去重，不能累计重复成员。
// 加入组同时进入默认收藏，这是持久化模型约定而非UI临时效果。
// 移出组必须保留默认收藏，验证分组成员关系与收藏关系的区别。
// 取消收藏反向清理组成员，防止组里残留不属于收藏的孤立编号。
// 删除组之后还检查另一个收藏，避免实现粗暴清空全部状态。
// 新实例必须执行rehydrate，不能直接读前一个store的内存对象。
// 保存值采用structuredClone，生产state后续变化不能偷偷修改测试存档。
// 未来版本输入必须回落空收藏，不按当前结构误读未知格式。
// 该断言仅覆盖画师分段，不对整个用户文档升级流程作额外保证。
// 真实用户文档路径完全未参与，此测试不会修改用户已有收藏。
// 测试没有网络超时或鉴权夹具，不能用来证明预览服务可访问。
// 生成模型未启动，因此不声明画师提示词的实际图像效果。
// 异常经过顶层catch以退出1结束，持续集成不能把失败当成功。
// 测试日志只含固定基线与断言结果，不输出用户模型路径。
  saved = { version: 2, favorites: ["87540"], groups: [] }; cache.delete(storePath); store = load(storePath).useArtistLibraryStore; await store.persist.rehydrate(); assert.equal(store.getState().collections.favorites.length, 0);
  console.log("PASS artist library: 40600 records, seven sorts, independent selections, preview mapping, validated persistence and group lifecycle");
}

// 异步失败显式非零退出；不吞异常返回成功，也不输出用户生产数据。
// 这里仅输出断言堆栈，测试源路径与固定夹具不包含密钥。
main().catch(error => { console.error(error); process.exit(1); });
