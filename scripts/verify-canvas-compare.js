/** 直接运行生产解析与两端连接校验；虚构路径只验契约，图片解码留给Electron。 */
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const localRequire = createRequire(path.resolve("apps/next/package.json"));
const ts = localRequire("typescript"), cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function("exports", "require", code)(exports, name => {
    if (!name.startsWith(".")) return localRequire(name);
    return load(path.resolve(path.dirname(file), name + ".ts"));
  });
  return exports;
}
const compare = load(path.resolve("apps/next/src/view/infinite-canvas/canvas-compare-sources.ts"));
const model = load(path.resolve("apps/next/src/view/infinite-canvas/canvas-model.ts"));
const main = require("../apps/electron/src/main/modules/canvas/project-validation");
// 共享形状也运行实际源码；转译钩子只在本测试进程存在，不带进产品主进程。
require.extensions[".ts"] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
const { InfiniteCanvasDocumentSchema } = require("../packages/shared/src/schemas/infinite-canvas.schema.ts");
const node = (id, mode, kind = "image") => ({ id, position: { x: 0, y: 0 }, data: { kind, mode, title: id, content: "", prompt: "", ratio: "1/1" } });
const media = name => ({ kind: "image", path: `C:/fixture/${name}.png`, name: name + ".png", size: 1 });

// 超分即使先接也固定为结果；尚未生成只返回原图，不能以邻居或结果冒充原图。
function checkSources() {
  const original = node("original"), result = node("result", "upscale");
  original.data.media = media("original"); result.data.media = media("result");
  const before = JSON.stringify([original, result]);
  for (const inputs of [[original, result], [result, original]]) assert.deepEqual(compare.canvasCompareSources(inputs, []), { original: original.data.media, result: result.data.media });
  assert.deepEqual(compare.canvasCompareSources([result], [original]), { original: original.data.media, result: result.data.media });
  assert.equal(compare.canvasCompareSources([result], []).original, undefined);
  assert.equal(JSON.stringify([original, result]), before);
  delete result.data.media;
  assert.deepEqual(compare.canvasCompareSources([result], [original]), { original: original.data.media, result: undefined });
}

// 独立期望拒绝第三图、音视频/文本和对比输出；保存边界必须与交互端一致。
function checkContracts() {
  const nodes = [node("a"), node("b"), node("c"), node("target", "compare"), node("video", undefined, "video"), node("text", undefined, "text")];
  const edge = source => ({ id: source, source, target: "target", sourceHandle: "out", targetHandle: "in" });
  const document = { version: 1, name: "compare", nodes, edges: [edge("a"), edge("b")] };
  assert.equal(InfiniteCanvasDocumentSchema.safeParse(document).success, true);
  assert.equal(InfiniteCanvasDocumentSchema.safeParse({ ...document, nodes: [node("bad", "compare", "video")], edges: [] }).success, false);
  assert.equal(main.document(document), true);
  assert.equal(main.document({ ...document, edges: [...document.edges, edge("c")] }), false);
  assert.equal(model.connectionError(edge("c"), document), "input");
  for (const source of ["video", "text"]) {
    assert.equal(main.document({ ...document, edges: [edge(source)] }), false);
    assert.equal(model.connectionError(edge(source), { ...document, edges: [] }), "type");
  }
  const output = { id: "out", source: "target", target: "a", sourceHandle: "out", targetHandle: "in" };
  assert.equal(main.document({ ...document, edges: [output] }), false);
  assert.equal(model.connectionError(output, { ...document, edges: [] }), "type");
  assert.equal(main.document({ ...document, nodes: nodes.map(item => item.id === "target" ? node("target", "compare", "video") : item), edges: [] }), false);
}
checkSources(); checkContracts();
console.log("CANVAS_COMPARE_OK: source roles, pending output, no mutation, two-image limit, type and output rejection at renderer/main boundaries");
