// 独立反证：公开 schema 与主进程分别判断同一批合法/非法图片请求。
// 预期矩阵直接来自用户规则，不调用产品判定函数来生成预期。
// 这像用两把不同的尺子测同一块板，而不是拿尺子的刻度证明它自己正确。
// 本脚本不联网、不读真实密钥、不计费；真实媒体落盘另由 Electron 场景覆盖。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("../apps/next/node_modules/typescript");
require.extensions[".ts"] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
const { EuzhiImageRequestSchema } = require("../packages/shared/src/schemas/euzhi-images.schema.ts");
const { InfiniteCanvasDocumentSchema } = require("../packages/shared/src/schemas/infinite-canvas.schema.ts");
const validate = require("../apps/electron/src/main/modules/euzhi-images/validation");
const canvas = require("../apps/electron/src/main/modules/canvas/project-validation");
const { connectionError, serializeCanvas } = require("../apps/next/src/view/infinite-canvas/canvas-model.ts");
const { canvasInputRule } = require("../apps/next/src/view/infinite-canvas/canvas-input-rules.ts");
const image = { kind: "image", name: "input.png", path: "C:/fixture/input.png", size: 1 };
const config = { provider: "euzhi", model: "gpt-image-2.5-sunburst", size: "1024x1024", quality: "medium" };
const golden = { id: "10000000-0000-4000-8000-000000000001", name: "Contract", configuration: config, mode: "text", prompt: "test", n: 1, images: [] };
let checked = 0;
function check(request, expected) {
  assert.equal(EuzhiImageRequestSchema.safeParse(request).success, expected);
  assert.equal(validate.request(request), expected);
  checked += 2;
}
// 每种模型先测正常文生图，再穷举三种用途的零、一、多、超额输入。
// n 与输入张数独立：一次输出六张不意味着要上传六张输入。
// 不允许空提示词、未知模型、额外端点/密钥字段、非法批量数或视频冒充图片。
// 任意值也不能使手写 validator 抛异常，否则 IPC 校验外层无法包装错误。
function requests() {
  for (const model of ["gpt-image-2", "gpt-image-2.5-sunburst", "gpt-image-2.5-flare"]) {
    for (const [mode, accepted] of [["text", [0]], ["image", [1]], ["reference", [1, 2, 8]]]) {
      for (const count of [0, 1, 2, 8, 9]) check({ ...golden, configuration: { ...config, model }, mode, images: Array(count).fill(image) }, accepted.includes(count));
    }
  }
  for (const n of [1, 2, 4, 6]) check({ ...golden, n }, true);
  for (const patch of [{ prompt: " " }, { n: 0 }, { n: 3 }, { n: 10 }, { mode: "auto" }, { endpoint: "https://example.com" }, { apiKey: "fixture" }, { configuration: { ...config, model: "Image2.5 Flare" } }, { mode: "image", images: [{ ...image, kind: "video" }] }]) check({ ...golden, ...patch }, false);
  for (const value of [null, undefined, 0, "bad", [], {}, { ...golden, images: [null] }]) check(value, false);
}
// 用已有图模型检查本地及远端上限，而不是只测新 API 请求。
// 文本描述边允许保留，图片边的数量限制不能误伤文本输入。
// 跨媒体的旧自连接/循环判定仍从原 connectionError 经过，不新建另一套图逻辑。
// 同一工作流没有图片时可以先编辑参数；最低数量在执行时阻止提交。
const data = { kind: "image", title: "", prompt: "", content: "", ratio: "1/1" };
function connections() {
  for (const [target, maximum] of [[{ ...data, workflow: "anima" }, 0], [{ ...data, workflow: "sdxl" }, 0], [{ ...data, workflow: "anima-edit" }, 1], [{ ...data, kind: "video", workflow: "wan2.2" }, 1], [{ ...data, kind: "video", workflow: "minimax" }, 1], [{ ...data, kind: "video", workflow: "minimax-reference" }, 8], [{ ...data, remoteImage: config, mode: "text" }, 0], [{ ...data, remoteImage: config, mode: "image" }, 1], [{ ...data, remoteImage: config, mode: "reference" }, 8]]) {
    assert.equal(canvasInputRule(target).max, maximum);
    const nodes = [{ id: "target", data: target }, ...Array.from({ length: 9 }, (_, index) => ({ id: `s${index}`, data }))];
    const doc = { nodes, edges: [] };
    for (let count = 0; count <= maximum; count++) {
      const edge = { source: `s${count}`, target: "target", sourceHandle: "out", targetHandle: "in" };
      assert.equal(connectionError(edge, doc), count === maximum ? "input" : null);
      if (count < maximum) doc.edges.push({ ...edge, id: `e${count}` });
      checked++;
    }
  }
}
// 保存、恢复、便携工程都共享节点 schema；远端选择必须留存但不能夹带密钥。
// 配置属于图片节点，视频与音频即使能选择本地模板也不能夹带图片请求配置。
// 当前 schema 版本继续兼容不含 remoteImage 的旧工程，没有强制全库迁移。
// 序列化要保持公开 schema 的字段顺序，避免保存签名因点选顺序变成假脏。
function persistence() {
  const document = { version: 1, name: "", nodes: [{ id: "i", position: { x: 0, y: 0 }, data: { ...data, mode: "reference", remoteImage: config } }], edges: [] };
  assert.equal(canvas.document(document), true);
  const saved = serializeCanvas(document);
  assert.deepEqual(InfiniteCanvasDocumentSchema.parse(saved), saved);
  for (const patch of [{ remoteImage: { ...config, apiKey: "fixture" } }, { kind: "video" }, { mode: "unknown" }]) {
    const bad = { ...document, nodes: [{ ...document.nodes[0], data: { ...document.nodes[0].data, ...patch } }] };
    assert.equal(canvas.document(bad), false);
    assert.equal(InfiniteCanvasDocumentSchema.safeParse(bad).success, false);
    checked += 2;
  }
  checked += 2;
}
// 覆盖历史方图、宽屏和竖屏，并拦下坏格式、过大尺寸和未对齐边长。
function sizes() {
  for (const size of ["1024x1024", "1024x576", "1152x2048", "2048x2048"]) {
    check({ ...golden, configuration: { ...config, size } }, true);
  }
  for (const size of ["auto", "0x1024", "1024x575", "4096x2048", "2048x2048 ", "01024x1024", 1024, null]) {
    check({ ...golden, configuration: { ...config, size } }, false);
  }
}
requests(); sizes(); connections(); persistence();
console.log("EUZHI_IMAGE_CONTRACTS_OK", { checked, evidence: "pure-contract/no-network" });
