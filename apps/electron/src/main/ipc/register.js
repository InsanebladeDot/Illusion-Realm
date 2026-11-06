/**
 * IPC handler 汇总注册入口。
 *
 * 按功能域汇总注册，handler 与对应业务模块放在 modules 的同一目录。
 * 窗口和系统交互归 core，本地 JSON 与路径处理归 storage。
 * 这里保留显式注册表，域注册失败会汇总上抛，防止应用带着缺失 IPC 启动。
 * preload 只消费 common 中的通道表，不得反向依赖主进程实现。
 * window：窗口尺寸与全屏由主进程控制，不放入页面状态服务。
 * theme：主题 IPC 与窗口同域维护，独立于模型生成任务。
 * dialog：系统选择框需要窗口上下文，继续由 core 提供。
 * models：目录扫描与模型资料属于本地模型能力。
 * modelDownloads：传输、断点和队列同属下载生命周期。
 * files：生成媒体的文件操作归 images，不能交给 preload 操作磁盘。
 * comfy：生成、上传及取消复用同一个服务适配。
 * paths：软件根目录和用户配置路径统一由 storage 解析。
 * shell：系统浏览器等外部交互归 core，业务域不复制该入口。
 * userData：主进程只做 JSON 读写，不加入渲染侧的默认值合并。
 * changelog：更新记录是只读资源，同样经文件读取边界返回。
 * video：视频与 GIF 共用 ffmpeg 注册入口，保持原任务协议。
 * animadex：角色检索服务继续独立于本地模型扫描。
 * agent：宿主工具、运行器和凭据在同一业务域协作。
 * civitai：Civitai 凭据独立于 Agent 服务商凭据维护。
 * promptAssistant：提示词助手保留自己的接口与配置生命周期。
 * account：认证令牌由账户模块管理，不混入用户设置文档。
 * cloudImages：云端图库复用账户会话，不建立另一份身份状态。
 * 注册表只聚合这些入口，不在此实现远端请求和文件变更。
 * 注册顺序保持迁移前一致，避免引入初始化先后差异。
 * 每个域仍显式列出，新增业务时可以直接审查能力是否暴露。
 * 不按目录自动发现 handler，防止临时脚本被误注册为产品能力。
 * 同一服务始终使用规范路径导入，CommonJS 缓存才能保持单实例。
 * 下载任务和 Agent 运行状态尤其不能因旧路径兼容副本而分裂。
 * 聚合层不向 renderer 暴露模块对象，只通过已定义的通道通信。
 * 参数形状继续在各域的 handler 中校验，不能以注册成功代替校验。
 * 窗口创建前完成注册，避免页面启动时遇到缺失 handler。
 * 注册日志只包含固定域名，不新增凭据或用户文件位置。
 * 失败域会收集后统一报告，单个模块失败不能掩盖其他遗漏。
 * 打包可达图从此入口遍历，可以覆盖各域的间接 require 依赖。
 */
const {
  registerWindowHandlers,
  registerThemeHandlers,
  registerDialogHandlers,
} = require("../core/windows/window.handlers");
const { registerModelHandlers } = require("../modules/models/models.handlers");
const { registerModelDownloadHandlers } = require("../modules/models/downloads/model-download.handlers");
const { registerFileHandlers } = require("../modules/images/files.handlers");
const { registerComfyHandlers } = require("../modules/comfy/comfy.handlers");
const { registerPathHandlers } = require("../storage/paths.handlers");
const { registerShellHandlers } = require("../core/shell.handlers");
const {
  registerUserDataHandlers,
  registerChangelogHandlers,
} = require("../storage/user-data.handlers");
const { registerVideoToolIpc } = require("../modules/ffmpeg/index.js");
const { registerAnimadexIpc } = require("../modules/animadex/index");
const { registerAgentHandlers } = require("../modules/agent/agent.handlers");
const { registerCivitaiHandlers } = require("../modules/civitai/civitai.handlers");
const { registerPromptAssistantHandlers } = require("../modules/prompt-assistant/prompt-assistant.handlers");
const { registerAccountHandlers } = require("../modules/account/account.handlers");
const { registerCloudImageHandlers } = require("../modules/cloud-library/cloud-images.handlers");

const { ipcMain } = require("electron");

/**
 * 域 → 注册函数。显式标注为元组数组：否则 TS 会推断成 (string | Function)[]，
 * 解构出的 name / register 都是联合类型，`register()` 会报「表达式不可调用」。
 * @type {Array<[string, () => void]>}
 */
const REGISTRATIONS = [
// 画布工程服务作为独立业务域注册，页面路由不负责创建 handler。
// 沿用汇总器的单次加载机制，刷新页面不会重复注册相同通道。
// 只注册本轮工程交换与素材复制，不把生成队列并入画布域。
// 该域不替换旧视频工具服务，截帧仍调用既有 FFmpeg handler。
// 模块名称用于诊断注册来源，不是可以由网页指定的动态模块路径。
// 注册失败应由原启动检查暴露，不能在页面里悄悄补一个空成功处理器。
  ["canvasProject", () => require("../modules/canvas/canvas-project.handlers").registerCanvasProjectHandlers()],
  ["window", registerWindowHandlers],
  ["theme", registerThemeHandlers],
  ["dialog", registerDialogHandlers],
  ["models", registerModelHandlers],
  ["modelDownloads", registerModelDownloadHandlers],
  ["files", registerFileHandlers],
  ["comfy", registerComfyHandlers],
  ["paths", registerPathHandlers],
  ["shell", registerShellHandlers],
  ["userData", registerUserDataHandlers],
  ["changelog", registerChangelogHandlers],
  ["video", () => registerVideoToolIpc()],
  ["animadex", () => registerAnimadexIpc()],
  ["agent", registerAgentHandlers],
  ["civitai", registerCivitaiHandlers],
  ["promptAssistant", registerPromptAssistantHandlers],
  ["account", registerAccountHandlers],
  ["cloudImages", registerCloudImageHandlers],
];

/**
 * 按域注册全部 IPC handler
 * @returns {void}
 */
function registerAllIpcHandlers() {
  /** @type {string[]} */
  const failed = [];

  for (const [name, register] of REGISTRATIONS) {
    try {
      register();
      console.log(`[IPC] ✅ ${name} handlers registered`);
    } catch (error) {
      failed.push(name);
      console.error(`[IPC] ❌ ${name} handlers failed:`, error);
    }
  }

  if (failed.length > 0) {
    throw new Error(`[IPC] 以下域注册失败: ${failed.join(", ")}`);
  }

  console.log("[IPC] 🎉 All handlers registered");
}

module.exports = { registerAllIpcHandlers, REGISTRATIONS };
