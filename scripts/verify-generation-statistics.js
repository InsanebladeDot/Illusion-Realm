/**
 * 用真实统计、Zustand 和公共队列验证记账，文档与媒体服务使用隔离替身。
 * 像用测试小票验收银机：能证明计数与状态规则，不证明 GPU 出图、浏览器内存或真实重启。
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const ts = require("../apps/next/node_modules/typescript");
const root = path.resolve(__dirname, "..");
const modules = new Map();
const messages = [];
let disk = { version: 1, profile: { username: "kept" }, generationHistory: { version: 1, records: [] } };
let failSave = false;

// 文档读写均深拷贝且异步返回，捕获共享引用和提前 flush；failSave 只让下一次写入失败。
const mocks = {
  "@/i18n": { t: key => key },
  "@/utils/userDataDocument": {
    loadUserDataDocument: async () => ({ data: structuredClone(disk) }),
    saveUserDataDocument: async data => {
      if (failSave) { failSave = false; throw new Error("fixture write failure"); }
      disk = structuredClone(data);
    },
  },
  "@/stores/useToastStore": { useToastStore: { getState: () => ({ show: message => messages.push(message) }) } },
  "@/api/comfyui": { cancelComfyGeneration: async () => {}, revokeComfyImages: () => {} },
  "@/stores/useSettingsStore": {},
  "@/stores/useHistoryFolderStore": {},
  "@/stores/useGenerationNoticeStore": { useGenerationNoticeStore: { getState: () => ({ dismiss() {}, fail() {} }) } },
  "@/utils/comfy/imageWorkflow": {},
  "@/utils/comfy/resolveComfyModels": {},
  "@/utils/buildGeneratedImageMeta": {},
  "@/utils/generatedImages": {},
  "@/utils/electronBridge": {},
  "@/utils/saveGeneratedImages": {},
};

// 用项目 TypeScript 在内存加载生产模块，按原目录解析依赖；缓存共享 store，不复制统计算法。
function load(file) {
  if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} };
  modules.set(file, module);
  const localRequire = createRequire(file);
  const requireSource = name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith("@/") && !name.startsWith(".")) return localRequire(name);
    const bases = name.startsWith("@/")
      ? ["apps/next/src/", "packages/shared/src/"].map(base => path.join(root, base, name.slice(2)))
      : [path.resolve(path.dirname(file), name)];
    const target = bases.flatMap(base => [base + ".ts", base + ".tsx", base + ".json"]).find(candidate => fs.existsSync(candidate));
    if (!target) throw new Error("Missing fixture module: " + name);
    return target.endsWith(".json") ? localRequire(target) : load(target);
  };
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", compiled)(requireSource, module, module.exports);
  return module.exports;
}

// 固定本机中午验证跨日；模型保留子目录，保存数故意不同于请求数，用户名用于检查分段写入。
const api = load(path.join(root, "apps/next/src/utils/generation-statistics.ts"));
const history = load(path.join(root, "apps/next/src/stores/use-generation-history-store.ts")).useGenerationHistoryStore;
const tasks = load(path.join(root, "apps/next/src/stores/useGenerationTaskStore.ts")).useGenerationTaskStore;
const queue = load(path.join(root, "apps/next/src/utils/image-generation-queue.ts"));
const storage = load(path.join(root, "apps/next/src/utils/userDataStorage.ts"));
const now = new Date(2026, 10, 1, 12).getTime();
const mainModel = { role: "main", loader: "unet", name: "Anima/base.safetensors" };
const loraModel = { role: "lora", loader: "loras", name: "style/detail.safetensors" };
const metadata = { prompt: "fixture", model: mainModel.name, width: 512, height: 512, total: 1, folderId: null };
const pause = () => new Promise(resolve => setImmediate(resolve));

// 先验当前格式，再验旧数据与坏输入：局部损坏不清空好记录，同 ID 取最后有效项，未知字段剔除。
function checkFormat() {
  const record = { id: "golden", status: "completed", createdAt: now - 2000, startedAt: now - 1000, finishedAt: now, images: 2, models: [mainModel], secret: "strip" };
  const current = api.normalizeGenerationHistory({ version: 1, records: [record, { ...record, images: 3 }, null, { ...record, id: "bad", finishedAt: 0 }] });
  assert.equal(current.records.length, 1);
  assert.equal(current.records[0].images, 3);
  assert.equal(Object.hasOwn(current.records[0], "secret"), false);
  for (const input of [undefined, null, [], 3, { version: 2, records: [record] }, { version: 1, records: null }]) {
    assert.equal(api.normalizeGenerationHistory(input).records.length, 0);
  }
  assert.equal(api.normalizeGenerationHistory({ version: 1, records: [{ ...record, images: -1 }] }).records.length, 0);
}

// 同时放入同名不同目录、重复及零/负权重模型，分别核对主模型和 LoRA，避免漏项与多项抵消。
// 再接真实输出节点，断开的加载器必须排除；这里不加载真实权重。
function checkModels() {
  const graph = {
    a: { class_type: "UNETLoader", inputs: { unet_name: "Anima\\base.safetensors" } },
    b: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "SDXL/base.safetensors" } },
    c: { class_type: "LoraLoaderModelOnly", inputs: { lora_name: "style/detail.safetensors", strength_model: -0.5 } },
    d: { class_type: "LoraLoaderModelOnly", inputs: { lora_name: "style/detail.safetensors", strength_model: 0.5 } },
    e: { class_type: "LoraLoaderModelOnly", inputs: { lora_name: "off.safetensors", strength_model: 0 } },
    f: { class_type: "VAELoader", inputs: { vae_name: "base.safetensors" } },
    g: { class_type: "CLIPLoader", inputs: { clip_name: "clip.safetensors" } },
    h: { class_type: "LoraLoader", inputs: { lora_name: "clip/detail.safetensors", strength_model: 0, strength_clip: 1 } },
  };
  const models = api.generationModelsFromPrompt(graph);
  assert.equal(models.filter(model => model.role === "main").length, 2);
  assert.equal(models.filter(model => model.role === "lora").length, 2);
  assert.equal(models[0].name, "Anima/base.safetensors");
  // 加上输出连接后，断开的 Checkpoint 与 LoRA 不应继续参与实际任务统计。
  // 连接链只通向 a，重复访问或环路不能造成无限递归。
  graph.out = { class_type: "PreviewImage", inputs: { images: ["a", 0] } };
  assert.equal(api.generationModelsFromPrompt(graph).length, 1);
}

// 成功两张、失败前一张共三张，成功率 50%，平均成功耗时两秒；取消单整体排除。
// 同时验七/三十天切换、同日未来记录和空日期，防止只改日期轴而没过滤历史。
function checkSummary() {
  const base = { id: "ok", status: "completed", createdAt: now - 9000, startedAt: now - 3000, finishedAt: now - 1000, images: 2, models: [mainModel, loraModel] };
  const records = [base, { ...base, id: "failure", status: "failed", images: 1, models: [{ ...mainModel, name: "other/base.safetensors" }] }, { ...base, id: "stop", status: "cancelled", images: 10 }, { ...base, id: "old", createdAt: now - 20 * 86400000, startedAt: now - 20 * 86400000, finishedAt: now - 20 * 86400000 }, { ...base, id: "future", finishedAt: now + 1000 }];
  const result = api.summarizeGenerationHistory({ version: 1, records }, 7, now);
  assert.equal(result.total, 3);
  assert.equal(result.attempts, 2);
  assert.equal(result.successRate, 50);
  assert.equal(result.averageMs, 2000);
  assert.equal(result.modelCount, 3);
  assert.equal(result.usage.lora[0].value, 2);
  assert.equal(result.hours.reduce((sum, value) => sum + value, 0), result.total);
  assert.equal(result.counts.reduce((sum, value) => sum + value, 0), result.total);
  assert.equal(result.rates[0], null);
  assert.equal(api.summarizeGenerationHistory({ version: 1, records }, 30, now).attempts, 3);
  assert.equal(api.summarizeGenerationHistory({ version: 1, records: [] }, 7, now).successRate, null);
}

// 队列用受控执行回调，真实状态机负责记账；重复 completed 不重复计数，失败要拒绝且入账。
// 音频也走同一队列，但不能计入图片账本；其他用户文档段须保留。
async function checkCompletion() {
  const job = queue.enqueueGenerationTask(metadata, async id => {
    tasks.getState().update(id, { status: "generating", models: [mainModel, loraModel] });
    tasks.getState().update(id, { status: "saving" });
    tasks.getState().update(id, { status: "completed", savedPaths: ["fixture-a.png", "fixture-b.png"], completed: 1 });
  });
  await job.promise;
  await pause();
  const task = tasks.getState().tasks.find(item => item.id === job.id);
  tasks.getState().update(job.id, { status: "completed" });
  assert.equal(tasks.getState().tasks.find(item => item.id === job.id).finishedAt, task.finishedAt);
  assert.equal(history.getState().data.records.filter(item => item.id === job.id).length, 1);
  assert.equal(disk.generationHistory.records.find(item => item.id === job.id).images, 2);
  assert.equal(disk.profile.username, "kept");
  assert.ok(task.startedAt >= task.createdAt && task.finishedAt >= task.startedAt);
  const failed = queue.enqueueGenerationTask(metadata, async id => { tasks.getState().update(id, { status: "generating" }); throw new Error("ComfyUI fixture error"); });
  await assert.rejects(failed.promise);
  await pause();
  assert.equal(disk.generationHistory.records.find(item => item.id === failed.id).status, "failed");
  const audio = queue.enqueueGenerationTask({ ...metadata, mediaKind: "audio" }, async id => { tasks.getState().update(id, { status: "generating" }); tasks.getState().update(id, { status: "completed", savedPaths: ["fixture.wav"] }); });
  await audio.promise;
  await pause();
  assert.equal(history.getState().data.records.some(item => item.id === audio.id), false);
}

// 用 gate 固定一项运行、一项排队；撤回排队项不能执行，停止运行项不能提前释放执行槽。
// 两个 Promise 提前消费拒绝，取消不发无目标 interrupt，也不增加统计分母。
async function checkCancellation() {
  const before = api.summarizeGenerationHistory(history.getState().data, 7).attempts;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const first = queue.enqueueGenerationTask(metadata, async (id, signal) => { tasks.getState().update(id, { status: "generating" }); await gate; signal.throwIfAborted(); }, () => false);
  const second = queue.enqueueGenerationTask(metadata, async () => { throw new Error("must not execute"); });
  const firstRejected = assert.rejects(first.promise);
  const secondRejected = assert.rejects(second.promise);
  await queue.cancelImageGeneration(second.id);
  await queue.cancelImageGeneration(first.id);
  release();
  await Promise.all([firstRejected, secondRejected]);
  await pause();
  assert.equal(tasks.getState().tasks.find(item => item.id === second.id).startedAt, undefined);
  assert.equal(disk.generationHistory.records.find(item => item.id === first.id).status, "cancelled");
  assert.equal(api.summarizeGenerationHistory(history.getState().data, 7).attempts, before);
}

// 统计写入失败不改已完成的生成状态，保留待保存标记，显式 flush 能重试。
// 清空任务和账本内存后走真实 rehydrate，比完整快照；这是数据重载，不是真实进程重启。
async function checkPersistence() {
  failSave = true;
  const job = queue.enqueueGenerationTask(metadata, async id => { tasks.getState().update(id, { status: "generating" }); tasks.getState().update(id, { status: "completed", savedPaths: ["saved.png"] }); });
  await job.promise;
  await pause();
  assert.ok(messages.includes("profile.ui.historySaveFailed"));
  assert.equal(tasks.getState().tasks.find(item => item.id === job.id).status, "completed");
  await storage.flushUserDataSave();
  const snapshot = structuredClone(disk.generationHistory);
  history.setState({ data: { version: 1, records: [] } });
  tasks.setState({ tasks: [] });
  storage.primeUserDataDocument({ ...disk, generationHistory: snapshot });
  await history.persist.rehydrate();
  assert.deepEqual(history.getState().data, snapshot);
}

// 用 50 次真实任务状态迁移触发 40 张卡片上限；账本须留全 50 项，并点名核对最早记录。
async function checkRetention() {
  for (let index = 0; index < 50; index++) {
    const id = "retained-" + index;
    tasks.getState().add({ ...metadata, id, status: "queued", completed: 0, createdAt: Date.now(), previewUrl: null, savedPaths: [], error: null });
    tasks.getState().update(id, { status: "generating" });
    tasks.getState().update(id, { status: "completed", completed: 1, savedPaths: ["fixture.png"] });
  }
  await pause();
  assert.equal(tasks.getState().tasks.length, 40);
  assert.equal(history.getState().data.records.filter(record => record.id.startsWith("retained-")).length, 50);
  assert.ok(history.getState().data.records.some(record => record.id === "retained-0"));
}

// 各组串行共用 FIFO，结束前刷完隔离文档；断言失败须以非零退出。
/** 生成回执可能早于统计保存，等待实际事件循环再检查，最后 flush 收尾，不用假延时凑耗时。 */
async function main() {
  checkFormat();
  checkModels();
  checkSummary();
  await checkCompletion();
  await checkCancellation();
  await checkPersistence();
  await checkRetention();
  await storage.flushUserDataSave();
  console.log("GENERATION_STATISTICS_OK: format, workflow models, metrics, queue, cancellation, persistence");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
