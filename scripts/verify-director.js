// 原导演台接入的反证检查，运行真实校验器与迁移器，不调用旧渲染引擎。
// golden 来自用户提供的原场景，不由当前实现反向生成预期。
// 这些是 Node 自动检查；模型能否显示、跟踪是否正确另由 Electron 实测。
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { load } = require("./lib/load-director-source");
const { test } = require("node:test");
const schema = load(path.resolve(__dirname, "../packages/shared/src/schemas/director.schema.ts"));
const main = require("../apps/electron/src/main/modules/canvas/director-validation");
const { migrateScene } = load(path.resolve(__dirname, "../apps/next/src/view/director/migrate-scene.ts"));
const native = require("./fixtures/director/native-scene.json");
const copy = () => structuredClone(native);

// 原人物没有强制 category，空姿势、肢体锁定和未知扩展都应原样保留。
// 这个反例专门防止旧 schema 的 strip 模式让保存悄悄丢字段。
// 比较完整副本而不是只比较对象数量，漏掉一个 IK 点也要失败。
test("原生快照无损通过 shared 与主进程，未知字段保留", () => {
  const scene = copy();
  scene.characters[0].posture = null;
  scene.characters[0].ik = { targets: { l_arm: { enabled: true, point: { x: 2, y: 1, z: -3 } } } };
  scene.characters[0].extension = { marker: [1, "native"] };
  scene.nativeExtension = { enabled: true };
  scene.props.push({ id: "native-prop", label: "Cube", category: "primitive", position: { x: 0, y: 0, z: 0 } });
  assert.equal(main.scene(scene), true);
  assert.deepEqual(schema.DirectorDocumentSchema.parse(scene), scene);
});

// 每个坏值独立从 golden 构造，避免上一个反例的破坏导致后一个假通过。
// 两端同时拒绝，不能只有渲染层拒绝而绕过 IPC 后仍可写入。
// undefined、NaN、循环和原型污染不属于同一问题，分别给出反例。
// NaN 放在扩展字段里，证明保留未知字段仍有安全边界。
test("两端拒绝坏引用、异常数值、深层数据与危险键", () => {
  const cases = [null, [], {}, undefined];
  for (const mutate of [
    scene => { scene.characters[0].position.x = NaN; },
    scene => { scene.nativeExtension = { x: Infinity }; },
    scene => { scene.characters.push(structuredClone(scene.characters[0])); },
    scene => { scene.activeCamera = "missing"; },
    scene => { scene.groups = [{ id: "g", label: "G", memberIds: ["missing"] }]; },
    scene => { scene.nativeExtension = JSON.parse('{"__proto__":{"polluted":true}}'); },
    scene => { scene.nativeExtension = new Date(); },
    scene => { scene.nativeExtension = Array(10001).fill(0); },
    scene => { scene.nativeExtension = scene; },
  ]) { const scene = copy(); mutate(scene); cases.push(scene); }
  for (const value of cases) {
    assert.equal(main.scene(value), false);
    assert.equal(schema.DirectorSceneSchema.safeParse(value).success, false);
  }
});

// 旧场景只在副本迁移；保存时明确标记原生宿主格式版本。
// 同一身份与动画帧号保留，不能为了换引擎把镜头和人物重新编号。
// 原 IK 使用世界目标，v1 的局部点必须先换坐标，v2 不应再次变换。
// 这里验证输入契约，不把旧人偶外观或姿势视觉一致性算作已验证。
test("v1 与 v2 输入迁移不改原件，原生重开不重复换 IK", () => {
  const legacy = require("./fixtures/director/legacy-scene.json");
  const before = JSON.stringify(legacy);
  const next = migrateScene(legacy);
  assert.equal(JSON.stringify(legacy), before);
  assert.equal(next.version, 3);
  assert.equal(next.characters[0].id, legacy.objects.find(item => item.kind === "character").id);
  assert.equal(main.scene(next), true);
  const v2 = copy();
  v2.version = 2;
  v2.characters[0].ik = { l_wrist: { x: 8, y: 2, z: 1 } };
  const migrated = migrateScene(v2);
  assert.deepEqual(migrated.characters[0].ik.targets.l_arm.point, { x: 8, y: 2, z: 1 });
  assert.deepEqual(migrateScene(migrated), migrated);
});

// 动画样例取自原组件，替换目标身份只是为了放进同一个 golden 场景。
// 原生曲线扩展需要完整保留；轨道故意指错类型时两端必须同时拒绝。
// 这不是播放质量测试，实际动画播放另在 Electron 中运行原界面。
test("原动画、曲线扩展与目标类型通过等价校验", () => {
  const scene = copy();
  scene.cameraAnimations = structuredClone(require("./fixtures/director/native-animation.json"));
  for (const animation of scene.cameraAnimations)
    for (const track of animation.tracks) track.targetId = scene.cameras[0].id;
  scene.cameraAnimations[0].tracks[0].channels[0].extraCurve = { values: [0, 0.5, 1] };
  assert.equal(main.scene(scene), true);
  assert.deepEqual(schema.DirectorDocumentSchema.parse(scene), scene);
  scene.cameraAnimations[0].tracks[0].targetType = "character";
  assert.equal(main.scene(scene), false);
  assert.equal(schema.DirectorDocumentSchema.safeParse(scene).success, false);
});

// 专线验证不运行 WebGL，专门反证“点击关闭就当作已经保存”的竞态。
// 回调写入故意悬挂，只有释放后才允许 ack，失败后仍要接受下一次真实重试。
// 不把这里的夹具承诺算作 Electron 工程落盘证明。
test("专线串行等待保存，重复编号不会再次确认，关闭失败可重试", async () => {
  const { DirectorBridge } = load(path.resolve(__dirname, "../apps/next/src/view/director/embed-bridge.ts"));
  const pair = new MessageChannel(), messages = [];
  pair.port2.onmessage = event => messages.push(event.data);
  let writes = 0, release;
  const states = [];
  const callbacks = { onSave: () => { writes++; return new Promise(resolve => { release = resolve; }); }, onConfirm: () => {}, onCancel: () => states.push("closed") };
  const bridge = new DirectorBridge(pair.port1, copy(), () => callbacks, (...state) => states.push(state));
  try {
    pair.port2.postMessage({ kind: "opened" });
    pair.port2.postMessage({ kind: "event", id: 1, event: "save", payload: copy() });
    await waitFor(() => writes === 1);
    assert.equal(messages.some(item => item.kind === "ack"), false);
    pair.port2.postMessage({ kind: "event", id: 1, event: "save", payload: copy() });
    release();
    await waitFor(() => messages.some(item => item.kind === "ack"));
    assert.equal(writes, 1);
    const closed = bridge.close();
    pair.port2.postMessage({ kind: "error" });
    await assert.rejects(closed);
    const retry = bridge.close();
    pair.port2.postMessage({ kind: "closed" });
    await retry;
    assert.equal(states.filter(item => item === "closed").length, 1);
  } finally { bridge.dispose(); pair.port2.close(); }
});

// 测试轮询也有上限，不让一个缺失消息把整个检查挂住。
// setTimeout 只负责等待可观察条件，不参与产品播放或保存成功判断。
async function waitFor(condition) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw Error("director-test-condition-timeout");
}

// 宿主媒体适配只换地址，不让 iframe 的 localfile 门票写进工程。
// 这里注入写图回调是为了验证失败边界，不算实机图片写入证明。
// 真正 JPEG 落盘与确认图片另在正式 Electron 回归检查。
test("媒体地址往返、连续保存保留预览与扩展，失败不改原工程", async () => {
  const { playableDirectorScene, persistDirectorMedia } = load(path.resolve(__dirname, "../apps/next/src/view/director/director-media.ts"));
  const { prepareDirectorSave } = load(path.resolve(__dirname, "../apps/next/src/view/infinite-canvas/save-director-scene.ts"));
  const scene = copy();
  scene.panoramaUrl = "C:/example/panorama.jpg";
  scene.previewPath = "C:/example/preview.jpg";
  scene.hostExtension = { sentinel: "keep" };
  assert.deepEqual(await persistDirectorMedia(playableDirectorScene(scene)), scene);
  const document = canvasDocument(scene);
  const snapshot = copy();
  const saved = await prepareDirectorSave(document, "scene", snapshot);
  assert.equal(saved.nodes[0].data.scene.previewPath, scene.previewPath);
  assert.deepEqual(saved.nodes[0].data.scene.hostExtension, { sentinel: "keep" });
  const before = JSON.stringify(document);
  await assert.rejects(prepareDirectorSave(document, "scene", snapshot, "data:image/jpeg;base64,AA==", false, async () => { throw Error("intentional-write-failure"); }));
  assert.equal(JSON.stringify(document), before);
});

// 使用生产工程归档器真实写包、移走源文件、再恢复到新目录。
// 同一图片被预览、全景和图片板引用，包里应只保存一份正文。
// 测试证明文件搬运和引用恢复；原图片的视觉解码不在此断言范围。
test("原生预览、全景和图片板随现有工程包恢复", async () => {
  const disk = require("node:fs/promises"), os = require("node:os");
  const archive = require("../apps/electron/src/main/modules/canvas/project-archive");
  const root = await disk.mkdtemp(path.join(os.tmpdir(), "ir-native-director-archive-"));
  try {
    const image = path.join(root, "source.png"), file = path.join(root, "scene.ircanvas");
    await disk.writeFile(image, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j25kAAAAASUVORK5CYII=", "base64"));
    const scene = copy();
    scene.previewPath = scene.panoramaUrl = image;
    scene.props.push({ id: "image-board", label: "Picture", category: "media", imageUrl: image, position: { x: 0, y: 0, z: 0 } });
    await archive.writeArchive(file, canvasDocument(scene));
    const { manifest } = await archive.readManifest(file);
    assert.equal(manifest.assets.length, 1);
    await disk.rename(image, image + ".away");
    const restored = (await archive.readArchive(file, path.join(root, "restored"))).nodes[0].data.scene;
    assert.notEqual(restored.previewPath, image);
    assert.equal(restored.panoramaUrl, restored.previewPath);
    assert.equal(restored.props[0].imageUrl, restored.previewPath);
    assert.deepEqual(await disk.readFile(restored.previewPath), await disk.readFile(image + ".away"));
  } finally { await disk.rm(root, { recursive: true, force: true }); }
});

// 隔离场景夹具仅提供画布必填字段，实际保存和打包仍调用生产逻辑。
// 不添加普通图片节点，专门覆盖藏在场景内部的三种图片引用。
function canvasDocument(scene) {
  return { version: 1, name: "Native director", nodes: [{ id: "scene", position: { x: 0, y: 0 }, data: { kind: "scene", title: "Scene", prompt: "", content: "", ratio: "16/9", scene } }], edges: [] };
}

// 扫描模块中的相对依赖与 CSS，缺文件必须在打包前失败。
// 资源摘要比较原件清单，唯一允许差异是记录过的路径与嵌入适配。
// 模型目录固定，旧 props.json 与重写引擎都不能作为运行时备用。
// 这是离线资源完整性检查，不能替代 Electron WebGL 解码与显示。
test("原模块依赖齐全，资源归位，旧引擎不再存在", () => {
  const root = path.resolve(__dirname, "../apps/next/public/director/original");
  for (const name of fs.readdirSync(root)) {
    if (!/\.(js|html|css)$/.test(name)) continue;
    const text = fs.readFileSync(path.join(root, name), "utf8");
    for (const match of text.matchAll(/["'`](\.\/[^"'`]+\.(?:js|css))["'`]/g)) assert.ok(fs.existsSync(path.resolve(root, match[1])), `${name}: ${match[1]}`);
  }
  const scene = fs.readFileSync(path.join(root, "SceneComposerDialog-BzigIK-a.js"), "utf8");
  assert.ok(scene.includes("/director/models/bodykun.glb"));
  assert.ok(!scene.includes("`/models/"));
  // 原资源里有线上识图按钮；本地没有服务时必须禁用，不能点击后静默失败。
  // 视频编码仍是原实现，只改目的地提示，不能继续声称已上传或创建了视频节点。
  assert.ok(scene.includes('title:`线上识图未接入，暂不可用`,disabled:!0'));
  assert.ok(scene.includes('title:`导出视频到本地`'));
  assert.ok(!scene.includes('视频已导出，正在上传并添加到画布'));
  for (const name of ["engine.ts", "model.ts", "rig.ts", "director.css", "reference.json"]) assert.equal(fs.existsSync(path.resolve(__dirname, "../apps/next/src/view/director", name)), false);
});
