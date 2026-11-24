// 原组件接入契约：两端实际校验器分别接受同一合法工程，再独立拒绝坏快照。
// 本检查使用临时真实文件与归档器，不代表已人工操作文件选择框或试听。
// 原资源哈希也在这里核对，防止嵌入过程中误把剪辑引擎改成了另一份实现。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os"), path = require("node:path"), crypto = require("node:crypto");
const ts = require("../apps/next/node_modules/typescript");
require.extensions[".ts"] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
const { InfiniteCanvasDocumentSchema } = require("../packages/shared/src/schemas/infinite-canvas.schema.ts");
const validation = require("../apps/electron/src/main/modules/canvas/project-validation");
const compositionValidation = require("../apps/electron/src/main/modules/canvas/composition-validation");
const archive = require("../apps/electron/src/main/modules/canvas/project-archive");
let count = 0;
const node = (id, kind, composition) => ({ id, position: { x: 0, y: 0 }, data: { kind, title: id, prompt: "", content: "", ratio: "16/9", ...(composition ? { composition } : {}) } });
const composition = { version: 1, state: { videoClips: [{ src: "composition-asset:asset-1", startTime: 0, endTime: 1, scale: 1.2, rotation: 15 }], audioClips: [], libraryMaterials: [{ url: "composition-asset:asset-1" }] }, assets: [{ id: "asset-1", media: { kind: "video", name: "video.mp4", path: "C:/fixture/video.mp4", size: 4 } }] };
const document = (data = composition) => ({ version: 1, name: "Composition", nodes: [node("composition", "composition", data), node("result", "video")], edges: [{ id: "result-edge", source: "composition", target: "result", sourceHandle: "out", targetHandle: "in" }] });
// 每个断言写明接受或拒绝，不用两端“都错”也相等的弱比较。
// 合法值额外核对解析后仍含效果，避免 Zod 自动去字段后假通过。
function check(value, expected) {
  assert.equal(InfiniteCanvasDocumentSchema.safeParse(value).success, expected, "shared schema");
  assert.equal(validation.document(value), expected, "main graph");
  count++;
}
function checkContracts() {
  // golden 先行：合法快照必须两端都接受，后续每个坏例都从它独立克隆。
  // 这样一次反证不会污染下一例，失败能定位到本例改变的契约。
  // 深比较还检查缩放和旋转未被 shared 解析静默剥离。
  check(document(), true);
  assert.deepEqual(InfiniteCanvasDocumentSchema.parse(document()).nodes[0].data.composition, composition);
  for (const url of ["https://outside.test/video.mp4", "blob:temporary", "file:///private", "composition-asset:unknown"]) {
    const bad = structuredClone(composition); bad.state.videoClips[0].src = url; check(document(bad), false);
  }
  const duplicate = structuredClone(composition); duplicate.assets.push(duplicate.assets[0]); check(document(duplicate), false);
  const invalid = structuredClone(composition); invalid.state.videoClips[0].scale = Infinity; check(document(invalid), false);
  const wrongKind = document(); wrongKind.nodes[0].data.kind = "image"; check(wrongKind, false);
  const cycle = document(); cycle.edges.push({ id: "cycle", source: "result", target: "composition" });
  assert.equal(validation.document(cycle), false); count++;
  const request = { name: "", fileName: "result.mp4", kind: "video", bytes: new Uint8Array([1]), download: false };
  // 此处的一字节只是请求形状 golden，不证明它是可解码 MP4。
  // 真实成片的解码由 Electron 专项单独覆盖，避免把校验成功当媒体成功。
  assert.equal(compositionValidation.mediaRequest(request), true); count++;
  for (const patch of [{ fileName: "../escape.mp4" }, { fileName: "bad.exe" }, { bytes: new Uint8Array() }, { download: "yes" }, { arbitraryPath: "C:/" }]) {
    assert.equal(compositionValidation.mediaRequest({ ...request, ...patch }), false); count++;
  }
  check({ version: 1, name: "old", nodes: [node("legacy", "composition")], edges: [] }, true);
}
// 工程搬家使用真实生产打包与恢复，不把 JSON 深拷贝冒充便携归档。
// 故意把旧登记大小设错，装箱时应以磁盘实际字节更新，输入本身不能变。
// 快照引用继续是资产号，只有 assets.media.path 在恢复后改变。
async function checkArchive() {
  // 文本正文故意不是合法视频：这里测归档引用与原字节保持，不测播放器。
  // 路径与登记大小同时变化，能发现“只保存 JSON、没有带媒体”的假便携包。
  // 打包前后序列化比较保护调用方对象，禁止为了装箱就地改掉正在编辑的工程。
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ir-composition-contract-"));
  const input = document(), source = path.join(root, "source.mp4");
  fs.writeFileSync(source, Buffer.from("real fixture bytes"));
  input.nodes[0].data.composition.assets[0].media.path = source;
  const before = JSON.stringify(input), output = path.join(root, "portable.ircanvas");
  await archive.writeArchive(output, input);
  const restored = await archive.readArchive(output, path.join(root, "user"));
  const asset = restored.nodes[0].data.composition.assets[0];
  assert.equal(fs.readFileSync(asset.media.path, "utf8"), "real fixture bytes");
  assert.equal(asset.media.size, fs.statSync(source).size);
  assert.equal(restored.nodes[0].data.composition.state.videoClips[0].src, "composition-asset:asset-1");
  assert.equal(JSON.stringify(input), before);
  assert.equal(validation.document(restored), true);
  count += 5;
}
// 清单记录的是给定原件的内容指纹，正式包不依赖个人电脑的资料目录。
// 消息适配器仅抑制提前成功提示，其差异另有记录；原剪辑与编码模块必须逐字一致。
function checkOriginals() {
  // 比较目标是提供包的逐文件清单，不是源码里重写出来的功能相似度。
  // adapted 标记的消息适配器使用接入后指纹；其源指纹仍保留供人工复核。
  // 其他模块要求字节一致，原件缺失或变动都会让本检查非零退出。
  const root = path.join(__dirname, "../apps/next/public/embedded-tools/video-composition");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "source-manifest.json")));
  for (const file of manifest.files) {
    assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "original", file.name))).digest("hex"), file.sha256, file.name);
    count++;
  }
}
async function main() {
  checkContracts();
  await checkResourcePaths();
  await checkArchive();
  checkOriginals();
  console.log("COMPOSITION_CONTRACT_OK", count);
}
// 固定目录可定位，任意嵌套和中间链接必须拒绝；链接夹具仅指向本轮临时目录。
async function checkResourcePaths() {
  const files = require('../apps/electron/src/main/modules/canvas/resource-files');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ir-composition-paths-'));
  fs.mkdirSync(path.join(root, 'Composition', 'video'), { recursive: true });
  assert.equal(await files.mediaPath(root, 'Composition/video/result.mp4'), path.join(root, 'Composition', 'video', 'result.mp4'));
  for (const value of ['../video/x.mp4','Composition/../video/x.mp4','Composition/cache/video/x.mp4','Composition/video/../x.mp4','Composition/video/x.mp4.']) assert.equal(files.validRelative(value), false);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ir-composition-outside-'));
  fs.mkdirSync(path.join(outside, 'video'));
  fs.rmdirSync(path.join(root, 'Composition', 'video')); fs.rmdirSync(path.join(root, 'Composition'));
  fs.symlinkSync(outside, path.join(root, 'Composition'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(files.mediaPath(root, 'Composition/video/result.mp4'), /unsafe-directory/);
  fs.unlinkSync(path.join(root, 'Composition'));
  fs.rmSync(root, { recursive: true }); fs.rmSync(outside, { recursive: true });
  count += 7;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
