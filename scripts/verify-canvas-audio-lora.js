/** 纯数据反证：真实资源映射、两端校验、保存签名和归档索引；不加载模型权重或生成声音。 */
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { createRequire } = require("node:module");
const ts = require("../apps/next/node_modules/typescript"), cache = new Map();
const main = require("../apps/electron/src/main/modules/canvas/project-validation");
const archive = require("../apps/electron/src/main/modules/canvas/project-archive");

function sourceFile(file) {
  return [file, `${file}.ts`, path.join(file, "index.ts")].find(item => fs.existsSync(item) && fs.statSync(item).isFile());
}

// 只替换翻译为稳定 key；执行当前生产 TS，shared 依赖仍从它自己声明的包解析。
function load(file) {
  file = sourceFile(file);
  if (file.endsWith(".json")) return JSON.parse(fs.readFileSync(file, "utf8"));
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const external = createRequire(file);
  const dependency = name => {
    if (name === "@/i18n") return { t: key => key };
    if (name.startsWith("@illusion-realm/shared")) return load(path.resolve("packages/shared/src", name === "@illusion-realm/shared" ? "index.ts" : name.slice("@illusion-realm/shared/".length)));
    if (name.startsWith("@/")) return load(sourceFile(path.resolve("apps/next/src", name.slice(2))) ?? path.resolve("packages/shared/src", name.slice(2)));
    if (name.startsWith(".")) return load(path.resolve(path.dirname(file), name));
    return external(name);
  };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", code)(dependency, module, module.exports);
  return module.exports;
}

const resources = load(path.resolve("apps/next/src/utils/localModelResources.ts"));
const { InfiniteCanvasDocumentSchema: schema } = load(path.resolve("packages/shared/src/schemas/infinite-canvas.schema.ts"));
const { serializeCanvas, restoreCanvas } = load(path.resolve("apps/next/src/view/infinite-canvas/canvas-model.ts"));
const audio = load(path.resolve("apps/next/src/view/infinite-canvas/canvas-audio-parameters.ts"));
const base = { version: 1, name: "audio contract", nodes: [{ id: "audio", position: { x: 0, y: 0 }, data: { kind: "audio", title: "", prompt: "sound", content: "", ratio: "1/1" } }], edges: [] };
let checked = 0;
function check(name, run) { run(); checked++; console.log("PASS", name); }

function model(folder, names = ["model"]) {
  const filePath = `C:/models/loras/${folder}`;
  return { id: filePath, filePath, name: folder.split("/").pop(), type: "lora", iconPath: null,
    versions: names.map(name => ({ id: `${filePath}/${name}.safetensors`, filePath: `${filePath}/${name}.safetensors`, name })) };
}

check("Minimax 子分类、深层目录及同目录所有权重均可选；Anima/SDXL 不混入", () => {
  const models = [model("mInImAx/MiniMax_h3_video/风格/Style", ["a", "b"]), model("MINIMAX/MiniMax_h3_video/加速lora", ["fast"]), model("Minimax/MiniMax_h3_video/细节/More/Nested"), model("Minimax/MiniMax_h3_image/编辑"), model("Anima/风格/Other"), model("SDXL/风格/Other")];
  const groups = resources.buildCreateExtensionsFromLocal(models, { searchPath: "C:/models" }, "minimax");
  assert.deepEqual(groups.map(item => item.name).sort(), ["MiniMax_h3_image", "MiniMax_h3_video"]);
  const video = groups.find(item => item.name === "MiniMax_h3_video");
  assert.equal(video.versions.length, 4);
  for (const model of models.slice(0, 4)) for (const file of model.versions) assert.ok(groups.some(group => group.versions.some(item => item.id === resources.makeLocalLoraId(file.filePath))));
  assert.equal(resources.buildCreateExtensionsFromLocal(models, { searchPath: "C:/models" }, "anima").flatMap(group => group.versions).length, 1);
});

const valid = { unetName: "Minimax/audio.safetensors", steps: 10, durationSeconds: 5.5, seed: "123", random: false, count: 2,
  loras: [{ id: "one", name: "Minimax/fast.safetensors", strength: 0.8 }], modelOverrides: { text: { clip: "clip.safetensors" }, reference: {} },
  reference: { kind: "audio", path: "C:/work/Audio/reference.wav", name: "reference.wav", size: 42 } };

function sample(parameters, kind = "audio") {
  const value = structuredClone(base); Object.assign(value.nodes[0].data, { kind, audioParameters: parameters }); return value;
}

check("音频参数两端接受并保留；旧无参数工程兼容", () => {
  for (const document of [base, sample({}), sample(valid)]) {
    assert.equal(main.document(document), true);
    assert.deepEqual(schema.parse(document), document);
  }
});

check("两端拒绝跨类型、坏种子、时长、步数、重复 LoRA 和非法参考", () => {
  const invalid = [null, [], { extra: 1 }, { random: 1 }, { seed: "no" }, { seed: "1".repeat(33) }, { steps: 1.5 }, { steps: 101 }, { durationSeconds: NaN }, { durationSeconds: 0 }, { durationSeconds: 61 }, { count: 3 }, { modelOverrides: { video: {} } }, { loras: [...valid.loras, ...valid.loras] }, { reference: { ...valid.reference, kind: "image" } }];
  for (const row of invalid) { assert.equal(main.document(sample(row)), false, JSON.stringify(row)); assert.equal(schema.safeParse(sample(row)).success, false, JSON.stringify(row)); }
  for (const kind of ["image", "video", "text"]) { assert.equal(main.document(sample(valid, kind)), false); assert.equal(schema.safeParse(sample(valid, kind)).success, false); }
});

check("GPT-SoVITS 合成节奏兼容旧画布，两端拒绝相同的非法数字", () => {
  for (const gptSovits of [{}, { speed: 0.25, interval: 0 }, { speed: 4, interval: 30 }]) {
    const document = sample({ engine: "gpt-sovits", gptSovits });
    assert.equal(main.document(document), true);
    assert.deepEqual(schema.parse(document), document);
  }
  // 保存状态比较 JSON 签名，权重和语速同时填写时也必须用同样的字段顺序。
  const populated = sample({ engine: "gpt-sovits", gptSovits: { gptWeight: "fixture.ckpt", speed: 1.35, interval: 0 } });
  const serialized = serializeCanvas(restoreCanvas(schema.parse(populated)));
  assert.equal(JSON.stringify(serialized), JSON.stringify(schema.parse(serialized)));
  // 小于下限、大于上限和非有限数字都不能通过工程保存边界。
  for (const gptSovits of [{ speed: 0.24 }, { speed: 4.01 }, { interval: -0.01 }, { interval: 30.01 }, { interval: Infinity }, { speed: "1" }]) {
    const document = sample({ engine: "gpt-sovits", gptSovits });
    assert.equal(main.document(document), false);
    assert.equal(schema.safeParse(document).success, false);
  }
});

check("重开签名稳定、复制后不串值、空 LoRA 不复活", () => {
  const document = sample({ reference: valid.reference, count: 2, random: false, seed: "12", loras: [] });
  const serialized = JSON.parse(JSON.stringify(serializeCanvas(restoreCanvas(schema.parse(document)))));
  assert.equal(JSON.stringify(serialized), JSON.stringify(schema.parse(serialized)));
  const copy = structuredClone(serialized.nodes[0]); copy.data.audioParameters.seed = "99";
  assert.equal(serialized.nodes[0].data.audioParameters.seed, "12");
  assert.deepEqual(audio.canvasAudioSettings(serialized.nodes[0].data, true).loras, []);
});

check("参考进入原归档和回收索引，连线缺失和多参考拒绝", () => {
  const document = sample(valid), node = document.nodes[0];
  const refs = archive.nodeReferences(node); assert.equal(refs.length, 1); assert.equal(refs[0].kind, "audio");
  refs[0].set("C:/relocated/reference.wav"); assert.equal(node.data.audioParameters.reference.path, "C:/relocated/reference.wav");
  assert.equal(audio.canvasAudioInput(node, document).path, "C:/relocated/reference.wav");
  document.nodes.push({ ...structuredClone(base.nodes[0]), id: "source" }); document.edges.push({ id: "edge", source: "source", target: "audio" });
  assert.throws(() => audio.canvasAudioInput(node, document));
  delete node.data.audioParameters.reference;
  assert.throws(() => audio.canvasAudioInput(node, document));
});

check("SQLite 真实原子表反读保留音频参数，防止保存白名单漏项", () => {
  const db = require("../apps/electron/src/main/storage/sqlite/connection").openConnection(":memory:");
  try {
    require("../apps/electron/src/main/storage/sqlite/canvas-store").saveCanvas(db, sample(valid));
    assert.deepEqual(require("../apps/electron/src/main/storage/sqlite/canvas-load").loadCanvas(db), sample(valid));
  } finally { db.close(); }
});

console.log(`CANVAS_AUDIO_LORA_OK ${checked}/${checked}`);
