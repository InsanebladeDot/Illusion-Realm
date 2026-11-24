/** 建立有真实文件的 MiniMax 深层目录；模型字节是占位，扫描真实，声音由 HTTP 夹具返回。 */
const fs = require("node:fs"), path = require("node:path");
const { ipcMain } = require("electron");
const { registerHandle } = require("../../apps/electron/src/main/ipc/result");
const { IPC_CHANNELS: C } = require("../../apps/electron/src/common/ipc-channels");

function installAudioModels(root, document, state) {
  const modelRoot = path.join(root, "models");
  const names = ["mInImAx/MiniMax_h3_video/风格/Style/a.safetensors", "mInImAx/MiniMax_h3_video/风格/Style/b.safetensors", "mInImAx/MiniMax_h3_video/加速lora/fast.safetensors", "mInImAx/MiniMax_h3_video/细节/Detail/detail.safetensors", "Anima/风格/Excluded/other.safetensors"];
  for (const name of names) {
    const file = path.join(modelRoot, "loras", name);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, "not real weights");
  }
  document.settings.paths = { searchPath: modelRoot, lorasPath: "", checkpointPath: "", diffusionModelsPath: "" };
  state.names.push(...names);
  // 仍执行正式异步目录扫描，不通过设置 store 注入已映射的卡片。
  ipcMain.removeHandler(C.MODELS_SCAN);
  registerHandle(C.MODELS_SCAN, (_event, directory, type) => require("../../apps/electron/src/main/modules/models/scanner").scanModelsInDirectory(directory, type));
}

module.exports = { installAudioModels };
