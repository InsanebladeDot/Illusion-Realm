/**
 * Agent 注册与 runner 现在位于同域，校验后的参数仍直接交给原运行器。
 * 密钥 IPC 继续只提供摘要，目录选择和模型目录刷新不会返回原始密钥。
 * 宿主工具调用回执复用原通道，不随目录命名调整工具协议。
 * 模型目录服务的缓存与凭据选择保持同一生命周期。
 * 不存在旧目录兼容实现，避免 Agent 的活动运行表被重复加载。
 */
/**
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * result：沿用统一 IPC 结果和参数校验入口。
 * ipc-channels：通道值必须与 shared 的类型表一致，路径调整不能重命名通道。
 * result：注册时先移除同名 handler，返回值仍为 IpcResult。
 * ipc-channels：避免新旧通道混用造成 invoke 找不到 handler。
 * result：业务错误不跨进程抛出，目录迁移不能改变失败形状。
 */
const { IPC_CHANNELS } = require("../../../common/ipc-channels");
const { registerHandle } = require("../../ipc/result");
const { startAgentRun, cancelAgentRun } = require("./runner");
const { settleHostCall } = require("./host-tools");
// 密钥状态和修改按 provider 隔离，旧 preload 省略 provider 时兼容硅基流动。
// 目录请求由主进程发起，renderer 不持有联网认证头。
// 主进程与 shared schema 的允许集保持一致，非允许值直接拒绝。
const { ENDPOINTS, providerStatus, updateProviderKey } = require("./provider-secrets");
const { getProviderCatalog } = require("./provider-catalog");
// 图片与历史在启动 sidecar 前验证，不能把本机预览地址交给远端。
// 手写校验器对应 shared schema，不增加渲染端可访问的文件读取通道。
// 错误只回固定原因，不含图片数据或用户路径。
const { validateMessageImages } = require("./input-messages");
/**
 * 不接受自定义 provider 名称或对象，防止密钥目录选择被页面任意扩展。
 * undefined 只用于旧客户端兼容，不代表允许 null 或空字符串。
 * @param {unknown} value
 */
function validProvider(value) { return value === undefined || value === 'siliconflow' || value === 'euzhi'; }
// provider validator 只检查允许集，具体默认行为由每个 handler 明确提供。
// 状态接口允许省略不代表目录接口允许省略，目录仍要求明确 provider。
// validation error 文案固定，不插值输入，避免把错误参数里的令牌泄露到页面。

/**
 * 入参校验：Agent 的入参里**不允许**出现密钥字段。
 * 显式拒绝（而不是静默忽略）——渲染层若哪天开始传 apiKey，那是设计走偏了，
 * 让它当场失败比留一个「看起来能用」的口子安全。
 * @param {unknown[]} args
 * @returns {string | null}
 */
function validateRunArgs(args) {
  const options = args[0];
  if (!options || typeof options !== "object") return "options 必须是对象";
  const { question, config } = /** @type {{ question?: unknown, config?: unknown }} */ (options);
  if (typeof question !== "string" || !question.trim()) return "question 必须是非空字符串";
  // 每次都检查当前和历史图片，纯文本旧客户端省略字段继续合法。
  // 提前失败避免已经清空草稿却启动一个无法读图的 Python 任务。
  // 校验结果沿用 registerHandle 的 INVALID_ARGUMENT 返回方式。
  const messageError = validateMessageImages(options); if (messageError) return messageError;
  if (config && typeof config === "object" && "apiKey" in config) {
    return "config 里不允许出现 apiKey：密钥由主进程侧注入";
  }
  // 运行时只允许固定 provider 以及它自己的地址，不能通过配置导出已保存密钥。
  // 未显式 provider 的旧页面只可使用原默认地址；本地假模型测试直接调用 runner。
  // 模型必须是有限非空字符串，真正可用性仍由目录与服务商共同判断。
  if (config && (typeof config !== 'object' || Array.isArray(config))) return 'Invalid Agent config';
  if (config && typeof config === 'object') {
    // 数组会在上一分支拒绝，不能用数字属性模拟合法配置对象。
    // baseUrl 检查发生在 startAgentRun 之前，拒绝时不会创建子进程。
    // 不能只检查 URL 协议合法；即使是 HTTPS 的陌生域名也不能收到已存令牌。
    // 省略 provider 时仍限定到原站点，不能借旧客户端兼容路径绕过边界。
    // model 的长度检查只管数据形状，是否存在由服务商负责最终确认。
    // apiKey 的拒绝更早发生，即使 provider 合法也不允许 renderer 注入原文。
    // 不在此根据目录可见性做同步网络请求，运行 IPC 应保持及时响应。
    const c = /** @type {Record<string,unknown>} */ (config);
    // 请求轮数是有限整数，拒绝超范围输入而非悄悄放大调用预算。
    // 与 Python 的硬上限一致，省略值继续使用默认四轮。
    // 内部 runner 仍由 Python 限幅，不能绕过此处依赖 UI 自律。
    if (c.maxSteps !== undefined && (typeof c.maxSteps !== 'number' || !Number.isInteger(c.maxSteps) || c.maxSteps < 1 || c.maxSteps > 6)) return 'Invalid Agent round limit';
    if (!validProvider(c.provider)) return 'Invalid Agent provider';
    if (c.baseUrl !== undefined && c.baseUrl !== ENDPOINTS[c.provider === 'euzhi' ? 'euzhi' : 'siliconflow']) return 'Invalid Agent endpoint';
    if (c.model !== undefined && (typeof c.model !== 'string' || !c.model.trim() || c.model.length > 200)) return 'Invalid Agent model';
  }
  return null;
}

/**
 * Agent 域：
 * - `agent:run` 启动一次运行（立刻返回 runId，结果走 `agent:event`）；
 * - `agent:cancel` 把整棵进程树收掉；
 * - `agent:hostResult` 收渲染层对宿主工具调用的回执（请求方向相反，走 `agent:hostCall`）；
 * - `agent:secretStatus` / `agent:secretSet` / `agent:secretClear` 管密钥。
 *
 * 密钥这三个通道**只回状态摘要**（有没有 / 从哪来 / 怎么存的 / 尾 4 位）：
 * 原值进了渲染进程就等于进了日志与崩溃报告，见 `agent/secret.js` 的文件头。
 * @returns {void}
 */
function registerAgentHandlers() {
  // 所有注册都经过 registerHandle，参数不合法统一返回 INVALID_ARGUMENT。
  // 状态读取和修改不向页面暴露 secret.js 的文件参数。
  // 同名通道重新注册由公共注册器处理，不能累积重复监听。
  // 目录 handler 只回公开数据和账户可见性，不回服务商原始响应正文。
  // force 刷新是 GET，不创建聊天任务或修改服务商账户。
  // provider 参数与 key 同次传入，异步保存不会读取新的 UI 标签状态。
  // 保留 Agent cancel 和 host result 通道，不改变已有工具权限与取消语义。
  // 新目录不向任意 webContents 广播，只有发起 IPC 的页面拿到结果。
  // Euzhi 没密钥时正常返回未配置，不能回落到硅基流动的环境凭据。
  // 保存和清除后的状态来自同一 provider，状态对象没有 endpoint 或本地路径。
  registerHandle(
    IPC_CHANNELS.AGENT_RUN,
    /**
     * @param {Electron.IpcMainInvokeEvent} event
     * @param {import("@illusion-realm/shared").AgentRunOptions} options
     * @returns {Promise<import("@illusion-realm/shared").AgentRunHandle>}
     */
    async (event, options) => {
      const result = startAgentRun({ sender: event.sender, options });
      if (!result.ok) throw new Error(result.error);
      return { runId: result.runId };
    },
    validateRunArgs
  );

  registerHandle(
    IPC_CHANNELS.AGENT_CANCEL,
    /** @param {Electron.IpcMainInvokeEvent} _event @param {string} runId */
    async (_event, runId) => cancelAgentRun(runId),
    /** @param {unknown[]} args @returns {string | null} */
    (args) => (typeof args[0] === "string" && args[0] ? null : "runId 必须是非空字符串")
  );

  registerHandle(
    IPC_CHANNELS.AGENT_HOST_RESULT,
    /**
     * 渲染层执行完宿主工具后的回执。**无论成败都要回** —— 不回的话主进程那边要等到
     * 工具自己的超时才收场（生图那条是 10 分钟）。
     * @param {Electron.IpcMainInvokeEvent} _event
     * @param {import("@illusion-realm/shared").AgentHostCallResult} payload
     * @returns {Promise<boolean>} 是否认领到了一次在等的调用
     */
    async (_event, payload) => settleHostCall(payload),
    /** @param {unknown[]} args @returns {string | null} */
    (args) => {
      const payload = args[0];
      if (!payload || typeof payload !== "object") return "回执必须是对象";
      const { callId } = /** @type {{ callId?: unknown }} */ (payload);
      return typeof callId === "string" && callId
        ? null
        : "callId 必须是非空字符串";
    }
  );

  registerHandle(
    IPC_CHANNELS.AGENT_SECRET_STATUS,
    // 无参数保留旧调用；参数数量也要检查，避免忽略额外未知载荷。
    // 只回状态和尾号，不回目录、密钥或加密文件原文。
    // 服务商选择在主进程重新校验，不能依赖页面下拉菜单。
    /** @param {Electron.IpcMainInvokeEvent} _event @param {import('@illusion-realm/shared').AgentProvider} [provider] */
    async (_event, provider = 'siliconflow') => providerStatus(provider),
    (args) => args.length <= 1 && validProvider(args[0]) ? null : 'Invalid Agent provider'
  );

  registerHandle(
    IPC_CHANNELS.AGENT_SECRET_SET,
    // 保存作用域是调用时传入的 provider，不读取之后可能变化的页面选择。
    // API Key 校验失败信息不回显入参，短密钥也不输出。
    // 主进程复用原有加密机制，renderer 只收到当前站点的新状态。
    /** @param {Electron.IpcMainInvokeEvent} _event @param {string} apiKey @param {import('@illusion-realm/shared').AgentProvider} [provider] */
    async (_event, apiKey, provider = 'siliconflow') => updateProviderKey(provider, apiKey),
    /**
     * 只校验"是非空字符串"：密钥形态由服务商决定，这里不该猜。
     * **不回显入参**（校验失败信息里也不能带 key 片段）。
     * @param {unknown[]} args
     * @returns {string | null}
     */
    (args) =>
      args.length <= 2 && validProvider(args[1]) && typeof args[0] === "string" && args[0].trim() && args[0].length <= 8192 ? null : "Invalid Agent credential"
  );

  registerHandle(
    IPC_CHANNELS.AGENT_SECRET_CLEAR,
    // 清除 Euzhi 不触及旧站点密钥，环境变量的旧优先级也保持原样。
    // 有环境配置时清除文件仍显示 env，不误导用户以为远端已禁用。
    // 同样拒绝附带多余参数，契约与 shared tuple 对齐。
    /** @param {Electron.IpcMainInvokeEvent} _event @param {import('@illusion-realm/shared').AgentProvider} [provider] */
    async (_event, provider = 'siliconflow') => updateProviderKey(provider, null),
    (args) => args.length <= 1 && validProvider(args[0]) ? null : 'Invalid Agent provider'
  );
  // 目录是只读操作，但仍校验 force 布尔值，不能由页面指定任意 URL。
  // 手动刷新最多复用一个进行中的请求；失败保留原目录并带错误码。
  // registerHandle 统一把异常转成 IpcResult，不跨进程传播原始堆栈。
  registerHandle(IPC_CHANNELS.AGENT_CATALOG,
    /** @param {Electron.IpcMainInvokeEvent} _event @param {import('@illusion-realm/shared').AgentProvider} provider @param {boolean} [force] */
    async (_event, provider, force) => getProviderCatalog(provider, force),
    (args) => args.length >= 1 && args.length <= 2 && args[0] !== undefined && validProvider(args[0]) && (args[1] === undefined || typeof args[1] === 'boolean') ? null : 'Invalid Agent catalog request');
}

// 验证器供真实页面冒烟的捕获入口复用，负向用例仍经过生产校验。
// 导出不增加 preload 能力，普通页面不能访问主进程模块。
// 这样测试替换付费运行实现时不会顺便绕过 provider / endpoint 边界。
module.exports = { registerAgentHandlers, validateRunArgs };
