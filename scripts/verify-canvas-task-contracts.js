/** 执行真实TS构图和可用性算法；不启动GPU，不声称模型权重已加载。 */
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path");
const { createRequire } = require("node:module");
const nextRequire = createRequire(path.resolve("apps/next/package.json"));
const ts = nextRequire("typescript"),
  cache = new Map();
let state = { models: [], paths: {}, scanning: false };

// 只隔离未调用的传输与全局状态，模板、参数和本地路径匹配直接执行产品代码。
function load(file) {
  if (cache.has(file)) return cache.get(file);
  if (file.endsWith(".json")) return JSON.parse(fs.readFileSync(file, "utf8"));
  const result = {};
  cache.set(file, result);
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  new Function("exports", "require", source)(result, (name) =>
    resolve(file, name),
  );
  return result;
}
function resolve(file, name) {
  if (name === "@/i18n")
    return { t: (key, values) => key + JSON.stringify(values ?? {}) };
  if (name === "@/stores/useSettingsStore")
    return { useSettingsStore: { getState: () => state } };
  if (
    [
      "@/api/comfyui",
      "@/utils/video-generation-queue",
      "@/utils/image-generation-queue",
      "./canvas-local-generation",
      "./canvas-output-target",
    ].includes(name)
  )
    return {};
  if (!name.startsWith(".") && !name.startsWith("@/"))
    return createRequire(file)(name);
  return resolvePath(file, name);
}
function resolvePath(file, name) {
  const bases = name.startsWith("@/")
    ? [
        path.resolve("apps/next/src", name.slice(2)),
        path.resolve("packages/shared/src", name.slice(2)),
      ]
    : [path.resolve(path.dirname(file), name)];
  const target = bases
    .flatMap((base) => [
      base + ".ts",
      base + ".json",
      base,
      path.join(base, "index.ts"),
    ])
    .find((item) => fs.existsSync(item) && fs.statSync(item).isFile());
  if (!target) throw Error("Cannot load " + name);
  return load(target);
}
const canvas = (name) =>
  load(path.resolve("apps/next/src/view/infinite-canvas", name + ".ts"));
const { fitCanvasCard } = canvas("canvas-fit-card");
const { canvasVideoRequest } = canvas("canvas-video-job");
const { buildVideoPrompt } = load(
  path.resolve("apps/next/src/utils/comfy/videoWorkflow.ts"),
);
const { getVideoModelSlots } = load(
  path.resolve("apps/next/src/utils/comfy/video-workflow-models.ts"),
);
const readiness = load(
  path.resolve("apps/next/src/utils/workflow-model-readiness.ts"),
);
const { workflowModelDraft } = load(
  path.resolve("apps/next/src/utils/workflow-model-draft.ts"),
);

function fit() {
  for (const [w, h] of [
    [1920, 1080],
    [1080, 1920],
    [256, 256],
    [9000, 100],
    [100, 9000],
  ]) {
    const card = fitCanvasCard(w, h);
    assert.equal(card.style, "fit");
    assert.ok(
      card.width >= 160 &&
        card.width <= 1200 &&
        card.height >= 100 &&
        card.height <= 900,
    );
    if (w / h < 6 && w / h > 0.2)
      assert.ok(Math.abs(card.width / card.height - w / h) < 0.01);
  }
  for (const w of [0, NaN, Infinity, -1])
    assert.equal(fitCanvasCard(w, 1080), null);
  console.log("PASS: 适应比例、极端尺寸边界和损坏元数据");
}
const image = {
  id: "i",
  data: {
    kind: "image",
    title: "Alice",
    media: {
      kind: "image",
      path: "C:/fixture/Alice.png",
      name: "Alice.png",
      size: 1,
    },
  },
};
const node = {
  id: "v",
  data: {
    kind: "video",
    workflow: "minimax-reference",
    ratio: "3/4",
    prompt: "@picture1 turn",
    videoMegapixels: 0.2,
    videoFps: 20,
    videoDuration: 5,
  },
};
const document = {
  name: "test",
  nodes: [image, node],
  edges: [{ id: "e", source: "i", target: "v" }],
};

function video() {
  const input = canvasVideoRequest(node, document);
  assert.equal(input.prompt, "<Picture 1> turn");
  assert.deepEqual(
    [input.resolution.width, input.resolution.height],
    [384, 544],
  );
  const graph = buildVideoPrompt({
    ...input,
    referenceMedia: [{ kind: "image", number: 1, name: "actual.png" }],
  });
  checkVideoGraph(graph);
  checkPromptConversion();
  checkFirstFrame();
  checkVideoSteps();
  console.log(
    "PASS: 视频实际构图、384×544/20FPS/5秒、参考上传槽、转换开关及模板LoRA",
  );
  return graph;
}
function checkVideoGraph(graph) {
  const nodes = Object.values(graph);
  const video = nodes.find(
    (item) => item.class_type === "MiniMaxH3ReferenceToVideo",
  );
  assert.equal(video.inputs.prompt, "<Picture 1> turn");
  assert.equal(video.inputs.width, 384);
  assert.equal(video.inputs.height, 544);
  assert.equal(
    nodes.find((item) => item.class_type === "CreateVideo").inputs.fps,
    20,
  );
  assert.equal(
    nodes.find((item) => item.class_type === "PrimitiveFloat").inputs.value,
    5,
  );
  assert.ok(
    nodes.some(
      (item) =>
        item.class_type === "LoadImage" && item.inputs.image === "actual.png",
    ),
  );
}
function checkPromptConversion() {
  const disabled = { ...node, data: { ...node.data, promptConversion: false } };
  assert.equal(canvasVideoRequest(disabled, document).prompt, "@picture1 turn");
  const labels = { image: "XXX", video: "Video", audio: "Audio" };
  const custom = {
    ...node,
    data: { ...node.data, promptReferenceLabels: labels },
  };
  assert.equal(canvasVideoRequest(custom, document).prompt, "<XXX 1> turn");
}
// 把节点参数送进两套真实模板，确认最终调度器使用覆盖值，原模板仍保留默认值。
function checkVideoSteps() {
  const { getVideoGenerationDefaults } = load(path.resolve("apps/next/src/utils/comfy/video-generation-settings.ts"));
  const references = [{ kind: "image", number: 1, name: "actual.png" }];
  for (const workflow of ["minimax", "minimax-reference"]) {
    const configured = { ...node, data: { ...node.data, workflow, videoSteps: 16 } };
    const input = canvasVideoRequest(configured, document);
    const graph = buildVideoPrompt({ ...input, imageName: "actual.png", referenceMedia: references });
    assert.equal(getVideoGenerationDefaults(graph).steps, 16);
    const untouched = { ...node, data: { ...node.data, workflow } };
    assert.equal(canvasVideoRequest(untouched, document).generationSettings.steps, workflow === "minimax" ? 6 : 4);
  }
}
function checkFirstFrame() {
  const firstNode = { ...node, data: { ...node.data, workflow: "minimax" } };
  assert.throws(() =>
    canvasVideoRequest(firstNode, { ...document, edges: [] }),
  );
  const first = canvasVideoRequest(firstNode, document);
  assert.equal(first.workflowId, "minimax");
  // 默认LoRA必须来自用户模板，不为绕过缺项悄悄清空。
  assert.ok(first.loras.length > 0);
}
const MODEL_PATHS = {
  searchPath: "C:/models",
  checkpointPath: "",
  diffusionModelsPath: "",
  lorasPath: "",
  embeddingsPath: "",
};
const MODEL_DIRS = {
  diffusionModels: "diffusion_models",
  clips: "text_encoders",
  vaes: "vae",
  loras: "loras",
};
function installedModels(graph) {
  return getVideoModelSlots(graph).map((slot, index) => ({
    id: String(index),
    type: slot.category === "loras" ? "lora" : "checkpoint",
    versions: [
      {
        filePath: `C:/models/${MODEL_DIRS[slot.category]}/${slot.defaultName.replaceAll("\\", "/")}`,
        bytes: 10,
      },
    ],
  }));
}
function checkMissingFiles(graph, models) {
  assert.deepEqual(
    readiness.missingWorkflowModels(graph, models, MODEL_PATHS),
    [],
  );
  assert.ok(
    readiness.missingWorkflowModels(graph, models.slice(1), MODEL_PATHS).length,
  );
  const empty = models.map((model) => ({
    ...model,
    versions: model.versions.map((file) => ({ ...file, bytes: 0 })),
  }));
  assert.ok(readiness.missingWorkflowModels(graph, empty, MODEL_PATHS).length);
}
function checkSubmitGuard(graph, models) {
  state = { models: [], paths: MODEL_PATHS, scanning: false };
  assert.throws(
    () => readiness.assertWorkflowModelsInstalled(graph),
    readiness.WorkflowModelsMissingError,
  );
  state = { models, paths: MODEL_PATHS, scanning: true };
  assert.throws(
    () => readiness.assertWorkflowModelsInstalled(graph),
    readiness.WorkflowModelsMissingError,
  );
  state.scanning = false;
  readiness.assertWorkflowModelsInstalled(graph);
}
function checkOptionalFiles(graph, models) {
  const clean = workflowModelDraft(graph, { loras: [] });
  const noLora = models.filter((model) => model.type !== "lora");
  assert.deepEqual(
    readiness.missingWorkflowModels(clean, noLora, MODEL_PATHS),
    [],
  );
  const upscale = workflowModelDraft(graph, {
    upscale: { enabled: true, model: "seedvr2_7b", scale: 2 },
  });
  assert.ok(
    readiness.missingWorkflowModels(upscale, models, MODEL_PATHS).length,
  );
}
function checkReadiness(graph) {
  const models = installedModels(graph);
  checkMissingFiles(graph, models);
  checkSubmitGuard(graph, models);
  checkOptionalFiles(graph, models);
  console.log(
    "PASS: 缺项/空文件/扫描中禁用、完整扫描解锁、移除LoRA与超分开关隔离",
  );
}
fit();
checkReadiness(video());
