/** 微小占位文件只测试真实目录扫描；媒体来自固定夹具，不能当作真实权重或GPU证据。 */
const fs = require("node:fs"),
  path = require("node:path");
const { registerHandle } = require("../../apps/electron/src/main/ipc/result");
const C = require("../../apps/electron/src/common/ipc-channels").IPC_CHANNELS;
function writeModels(models, names) {
  // 同一名字分别出现在各加载目录，测试仍由实际类别选择正确路径。
  for (const directory of [
    "diffusion_models",
    "text_encoders",
    "vae",
    "loras",
    "checkpoints",
  ]) {
    for (const name of names) {
      const file = path.join(models, directory, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "fixture weights");
      if (directory === "loras" && process.env.CANVAS_TASKS_SMOKE === "1") {
        fs.writeFileSync(
          file + ".civitai.json",
          JSON.stringify({ version: 1, trainedWords: ["task_trigger"] }),
        );
      }
    }
  }
}
function installModels(root, document, state) {
  const models = path.join(root, "models");
  if (process.env.CANVAS_TASKS_SMOKE === "1")
    state.names.push("task-trigger.safetensors");
  writeModels(models, state.names);
  document.settings.paths = {
    searchPath: models,
    checkpointPath: "",
    diffusionModelsPath: "",
    lorasPath: "",
  };
  registerHandle(C.MODELS_SCAN, (_event, directory, type) =>
    require("../../apps/electron/src/main/modules/models/scanner").scanModelsInDirectory(
      directory,
      type,
    ),
  );
  if (process.env.CANVAS_TASKS_SMOKE === "1") {
    require("../../apps/electron/src/main/storage/user-data").readUserData =
      () => ({ data: document });
    const metadata = require("../../apps/electron/src/main/modules/models/local-model-metadata");
    registerHandle(
      C.MODELS_READ_METADATA,
      (_event, files) => metadata.readLocalModelMetadata(files),
      metadata.validateMetadataArgs,
    );
  }
}
function writePortrait(root) {
  const { nativeImage } = require("electron");
  const image = path.join(root, "portrait.png");
  fs.writeFileSync(
    image,
    nativeImage
      .createFromPath(
        path.resolve("scripts/fixtures/video-composition/image.png"),
      )
      .resize({ width: 180, height: 320 })
      .toPNG(),
  );
  return image;
}
function seed(root) {
  const image = writePortrait(root);
  const media = {
    kind: "image",
    path: image,
    name: "Alice.png",
    size: fs.statSync(image).size,
  };
  const nodes = structuredClone(TASK_NODES);
  nodes[0].data.media = media;
  nodes[1].data.inputImages = [media];
  nodes[3].data.workflowLoras = {
    anima: [
      {
        extensionId: `local-lora:${path.join(root, "models", "loras", "task-trigger.safetensors")}`,
        weight: 1,
      },
    ],
  };
  return { version: 1, name: "本轮回归", edges: [], nodes };
}
const BASE_DATA = { title: "test", prompt: "test", content: "", ratio: "1/1" };
const TASK_NODES = [
  {
    id: "fit-image",
    position: { x: 80, y: 100 },
    data: { ...BASE_DATA, kind: "image" },
  },
  {
    id: "video-job",
    position: { x: 700, y: 100 },
    data: {
      ...BASE_DATA,
      kind: "video",
      workflow: "minimax-reference",
      ratio: "3/4",
      videoMegapixels: 0.2,
      videoFps: 20,
      videoDuration: 5,
      prompt: "@picture1 turn",
    },
  },
  {
    id: "job-a",
    position: { x: 80, y: 600 },
    data: { ...BASE_DATA, kind: "image", workflow: "anima", prompt: "first" },
  },
  {
    id: "job-b",
    position: { x: 700, y: 600 },
    data: { ...BASE_DATA, kind: "image", workflow: "anima", prompt: "second" },
  },
];
/** 显式创建工程后保存种子，不依赖旧草稿迁移计时，避免后台清理先写迁移标记。 */
async function createProject(root, document) {
  const {
    createCanvasLibrary,
  } = require("../../apps/electron/src/main/modules/canvas/canvas-library");
  const library = createCanvasLibrary(path.join(root, "user"));
  const entry = await library.request({
    operation: "create",
    name: document.name,
    folderId: null,
  });
  const current = await library.request({ operation: "load", id: entry.id });
  await library.request({
    operation: "save",
    id: entry.id,
    document: { ...document, workspace: current.workspace },
  });
  await library.request({ operation: "close", id: entry.id });
}
module.exports = { installModels, seed, createProject };
