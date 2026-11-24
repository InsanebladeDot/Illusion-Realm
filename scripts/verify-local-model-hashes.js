/** SHA256匹配回归：真实本地读写，使用临时目录，不读取用户模型、不联网。
 * Node运行；单独验证指纹规则和多版本匹配，不依赖 Electron 页面。
 */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { createHash } = require("node:crypto");
const ts = require("../apps/next/node_modules/typescript");
let root;
const ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
// 只替换配置读取，不替换授权、模型字节读取或摘要保存。
const pathsModule = require.resolve("../apps/electron/src/main/modules/models/downloads/model-download-paths");
require.cache[pathsModule] = { id: pathsModule, filename: pathsModule, loaded: true, exports: {
  configuredPaths: () => ({ searchPath: root }),
  isInside: (base, target) => { const relative = path.relative(base, target); return !!relative && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative); },
} };
const { hashLocalModel } = require("../apps/electron/src/main/modules/models/local-model-hash-service");
const { openModelHash } = require("../apps/electron/src/main/modules/models/local-model-hash");
const { readEntry } = require("../apps/electron/src/main/modules/models/local-model-metadata");
const { readSnapshot, readCachedHash, saveCachedHash } = require("../apps/electron/src/main/modules/models/local-model-hash-cache");
const { reserveFolders } = require("../apps/electron/src/main/modules/models/model-folder-locks");

// 转译的是生产纯函数；类型导入被移除，不创建另一份匹配算法。
function matcher() {
  const module = { exports: {} };
  const file = path.resolve(__dirname, "../apps/next/src/utils/civitai-local-models.ts");
  const code = ts.transpileModule(require("node:fs").readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function("module", "exports", code)(module, module.exports);
  return module.exports;
}
/** 同名和短摘要都不能认作同一个文件。命中版本的第二个文件也应归到该版本。 */
function matchingCases() {
  const { findLocalCivitaiVersions, localModelHashes } = matcher();
  const latestHash = "f".repeat(64);
  const model = { versions: [
    { id: 102, name: "v0.2", files: [{ name: "same.safetensors", sha256: latestHash }] },
    { id: 101, name: "v0.1", files: [
      { name: "same.safetensors", sha256: "e".repeat(10) },
      { name: "other.safetensors", sha256: ABC.toUpperCase() },
    ] },
  ] };
  const matches = hashes => findLocalCivitaiVersions(model, hashes).map(version => version.id);
  assert.deepEqual(matches(new Set()), []);
  assert.deepEqual(matches(new Set(["e".repeat(10)])), []);
  assert.deepEqual(matches(new Set(["d".repeat(64)])), []);
  assert.deepEqual(matches(new Set([ABC])), [101]);
  assert.deepEqual(matches(new Set([latestHash, ABC])), [102, 101]);
  model.versions[1].files.push({ name: "duplicate.safetensors", sha256: ABC });
  assert.deepEqual(matches(new Set([ABC])), [101]);
  // 已失效的本地记录不能回退到来源文件里留下的旧摘要。
  const hashes = localModelHashes([
    { status: "ready", metadata: { sha256: ABC.toUpperCase() } },
    { status: "ready", metadata: { sha256: "f".repeat(10) } },
    { status: "invalid", metadata: { sha256: latestHash } },
    { status: "ready", localSha256: "", metadata: { sha256: latestHash } },
  ]);
  assert.deepEqual([...hashes], [ABC]);
  assert.deepEqual(matches(hashes), [101]);
}
async function fixture(name, content = "abc") {
  const model = path.join(root, name + ".safetensors");
  await fs.writeFile(model, content);
  return model;
}
async function basicCases() {
  const file = await fixture("first");
  assert.deepEqual(await hashLocalModel(file), { status: "saved", sha256: ABC });
  const cache = JSON.parse(await fs.readFile(file + ".sha256.json", "utf8"));
  assert.equal(cache.sha256, ABC);
  assert.equal((await readEntry(file, [root])).localSha256, ABC);
  assert.equal((await hashLocalModel(file)).status, "existing");
  const second = await fixture("second", "different content");
  assert.notEqual((await hashLocalModel(second)).sha256, ABC);
  await fs.writeFile(file, "changed");
  assert.equal(await readCachedHash(file), "");
  assert.equal((await hashLocalModel(file)).status, "saved");
  assert.equal(await readCachedHash(file), createHash("sha256").update("changed").digest("hex"));
}
async function preserveCases() {
  const file = await fixture("source"), source = JSON.stringify({ version: 1, creator: "Keep", trainedWords: ["word"], custom: { x: 1 } });
  await fs.writeFile(file + ".civitai.json", source);
  assert.equal((await hashLocalModel(file)).status, "saved");
  assert.equal(await fs.readFile(file + ".civitai.json", "utf8"), source);
  const broken = await fixture("broken-source");
  await fs.writeFile(broken + ".civitai.json", "broken json");
  assert.equal((await hashLocalModel(broken)).status, "saved");
  assert.equal((await readEntry(broken, [root])).localSha256, ABC);
  const badCache = await fixture("broken-hash");
  await fs.writeFile(badCache + ".sha256.json", "broken json");
  assert.equal((await hashLocalModel(badCache)).status, "metadataInvalid");
  assert.equal(await fs.readFile(badCache + ".sha256.json", "utf8"), "broken json");
  const known = await fixture("known");
  await fs.writeFile(known + ".civitai.json", JSON.stringify({ version: 1, sha256: ABC.toUpperCase() }));
  assert.equal((await hashLocalModel(known)).status, "existing");
}
async function safetyCases() {
  assert.equal((await hashLocalModel(path.join(root, "..", "outside.safetensors"))).status, "invalid");
  const file = await fixture("locked"), unlock = reserveFolders([root]);
  try { assert.equal((await hashLocalModel(file)).status, "busy"); } finally { unlock(); }
  const first = await hashLocalModel(file);
  assert.equal(first.status, "saved");
  const previous = await readSnapshot(file + ".sha256.json");
  await fs.writeFile(file + ".sha256.json", JSON.stringify({ version: 1, custom: "external" }));
  await assert.rejects(saveCachedHash(file, previous, ABC, async () => {}), /changed/);
  assert.equal(JSON.parse(await fs.readFile(file + ".sha256.json", "utf8")).custom, "external");
  assert.ok(!(await fs.readdir(root)).some(name => name.endsWith(".part")));
}
/** 取消、文件中途改动、链接越界均不能提交摘要；只操作本轮临时文件。 */
async function interruptionCases() {
  const file = await fixture("interrupted");
  const controller = new AbortController(); controller.abort();
  await assert.rejects(openModelHash(file, controller.signal), /timeout/);
  const opened = await openModelHash(file, new AbortController().signal);
  try {
    await fs.writeFile(file, "changed while open");
    await assert.rejects(opened.verify(), /changed/);
  } finally { await opened.release(); }
  const target = path.join(root, "directory-hash");
  await fs.mkdir(target);
  await fs.symlink(target, file + ".sha256.json", process.platform === "win32" ? "junction" : "dir");
  assert.equal((await hashLocalModel(file)).status, "metadataInvalid");
  assert.ok((await fs.lstat(file + ".sha256.json")).isSymbolicLink());
}

async function main() {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "ir-sha256-test-"));
  try {
    matchingCases(); await basicCases(); await preserveCases(); await safetyCases(); await interruptionCases();
    console.log("PASS: SHA256-only, multiple versions, disk cache, preservation, stale records, authorization, locks and conflict cleanup");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
