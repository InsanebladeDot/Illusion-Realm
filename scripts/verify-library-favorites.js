/** 收藏格式反证：执行生产校验器，坏条目与旧文档不能污染其他资料库。 */
// 本脚本不启动 Electron；真正写盘、界面切换和下载另由页面专项覆盖。
// TypeScript 仅转译语法，校验逻辑本身不在测试中重新实现。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../apps/next/node_modules/typescript");
const source = fs.readFileSync(path.join(__dirname, "../apps/next/src/utils/library-favorites.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const loaded = { exports: {} };
vm.runInNewContext(compiled, { exports: loaded.exports, module: loaded });
const api = loaded.exports;

// 快照故意带未知字段，恢复后不应把它夹带到用户的导出文件中。
// 相同 ID 在不同库是不同收藏；不能用一个全局 Set 把另一库的条目吞掉。
// 同库重复 ID 则取最后一份有效快照，不显示两张重复卡片。
const item = { id: "shared", name: "Example", tags: "one, two", preview: "", categories: ["group"], traits: [], secret: "exclude" };
const input = { version: 1, items: { pose: [item, { ...item, name: "Updated" }, { id: "broken" }], background: [item], expression: null } };
const current = api.normalizeLibraryFavorites(input);
assert.equal(current.items.pose.length, 1);
assert.equal(current.items.pose[0].name, "Updated");
assert.equal(current.items.background.length, 1);
assert.equal(current.items.expression.length, 0);
assert.equal(Object.hasOwn(current.items.pose[0], "secret"), false);
assert.equal(item.name, "Example");

// 未来版本、缺字段和错误顶层形状应得到独立空数据，不能抛异常。
// 检查背景库仍保留有效条目，证明一条坏动作不会清空整个收藏文档。
// 空对象每次新建，两个实例不能共享同一个可变数组。
for (const bad of [undefined, null, [], 1, "bad", { version: 99 }, { version: 1, items: [] }]) {
  const result = api.normalizeLibraryFavorites(bad);
  assert.equal(Object.values(result.items).flat().length, 0);
}
const first = api.emptyLibraryFavorites();
first.items.pose.push(item);
assert.equal(api.emptyLibraryFavorites().items.pose.length, 0);

// 已取消收藏的快照不能复活；非法数字不能进入热度排序。
// 只保留合法身份对应的快照，另一个同名角色不能靠名字偷换身份。
// 恢复名称和标签用于离线应用，不用虚构在线推荐 LoRA 填满详情。
const character = { slug: "a", name: "Alice", trigger: "alice", count: Infinity, tags: ["1girl", 3], reference: { hair: "blonde", eye: "blue" } };
const snapshots = api.normalizeFavoriteCharacters([character, { ...character, slug: "removed" }, null], ["a"]);
assert.equal(snapshots.length, 1);
assert.equal(snapshots[0].count, 0);
assert.equal(snapshots[0].tags.join(","), "1girl");
assert.equal(snapshots[0].reference.hair, "blonde");

// 收藏集合在完整快照上建立；第二页资料不能因当前页只有一条而丢失。
// 旧 local 身份编码的名字与作品可恢复，未知在线身份则保持未解决。
// 损坏的百分号编码不能让整个用户文档加载失败。
const oldLocal = "local:the%20legend%20of%20zelda:princess%20zelda";
const catalog = api.favoriteCharacterCatalog(["a", "b", oldLocal, "online-old", "local:%:bad"], snapshots, [{ ...snapshots[0], slug: "b", name: "Bob", trigger: "bob" }]);
assert.equal(catalog.length, 3);
assert.equal(catalog[2].copyright, "the legend of zelda");
assert.equal(catalog[2].trigger, "princess zelda");
assert.equal(api.filterFavoriteCharacters(catalog, "ALICE", "", { hair: "blonde" }).length, 1);
assert.equal(api.filterFavoriteCharacters(catalog, "alice", "", { eye: "red" }).length, 0);
assert.equal(api.filterFavoriteCharacters(catalog, "", "the legend of zelda", {}).length, 1);
console.log("LIBRARY_FAVORITES_FORMAT_OK");
