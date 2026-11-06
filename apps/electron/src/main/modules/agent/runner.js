/**
 * 跑一次 Agent：拉起 Python sidecar，把它 stdout 上的 NDJSON 事件逐帧转发给渲染层。
 *
 * 三条硬要求（都来自同类功能的教训）：
 * 1. **密钥只走 stdin**：命令行参数会进进程列表与日志，`argv` 里永远不出现 key；
 * 2. **取消要连整棵进程树收**：Python 自己还会拉起一个 MCP 工具子进程，
 *    只 kill 父进程会留下孤儿（ffmpeg 那边踩过同样的坑）；
 * 3. **半行不打断**：stdout 是字节流，一帧可能被切成两段 —— 只有读到换行才解析，
 *    坏行跳过并记日志，不让它毁掉整次运行。
 *
 * stderr 不参与协议（FastMCP 会把 "Processing request ..." 之类的日志打在 stderr），
 * 只透传到主进程控制台，方便排查。
 */
const { spawn } = require("child_process");

const { IPC_CHANNELS } = require("../../../common/ipc-channels");
const { resolveAgentRuntime, describeAgentRuntime } = require("./locate");
const { AGENT_DEFAULTS } = require("./defaults");
const { findHostTool, hostToolSpecs } = require("./host-tools");
// provider、固定服务地址和密钥在主进程作为同一次运行的快照解析。
// 不将密钥选择委托给页面，也不因下一次切换而改变正在运行的任务。
// 无 provider 的内部假模型脚本继续保留旧 baseUrl 兼容路径。
const { providerRunConfig } = require("./provider-run-config");

/**
 * 单次运行上限（毫秒）；模型 + 工具来回跑满也要能被兜住。
 *
 * 默认给到 12 分钟而不是 5 分钟：宿主工具里有一条会真的去生图（排队 + 采样 + 下载，
 * 一到两分钟起步），再叠上模型的多轮往返，5 分钟在正常使用下就会撞线。
 * 想收紧 / 放宽仍然走 `ILLUSION_AGENT_TIMEOUT_MS`。
 */
const DEFAULT_TIMEOUT_MS = Number(process.env.ILLUSION_AGENT_TIMEOUT_MS ?? 12 * 60 * 1000);

/** @type {Map<string, { child: import("child_process").ChildProcess, timeout: NodeJS.Timeout | null }>} */
const activeRuns = new Map();
let runSequence = 0;

/**
 * 宿主工具可额外返回只给界面看的图片路径；模型只接收 `result` 文本。
 * @param {unknown} value
 * @returns {{ result: string, images: string[] }}
 */
function normalizeHostToolResult(value) {
  if (!value || typeof value !== "object") {
    return { result: String(value ?? ""), images: [] };
  }
  const { result, images } = /** @type {{ result?: unknown, images?: unknown }} */ (value);
  return {
    result: String(result ?? ""),
    images: Array.isArray(images)
      ? images.filter((item) => typeof item === "string" && item.length > 0)
      : [],
  };
}

/**
 * 图片产物不经过模型，生成完成后直接推给当前 Agent 消息。
 * @param {{ send: (channel: string, payload: unknown) => void }} sender
 * @param {string} runId
 * @param {string} name
 * @param {string[]} images
 */
function emitToolArtifacts(sender, runId, name, images) {
  // 取消先从 activeRuns 移除，OS 终止尚未完成也不能再投递产物。
  // 已提交的生图队列独立运行；停止回答不会删除已经生成的文件。
  // 这里阻止迟到事件复活会话，不把旧结果挂到下一条回复。
  if (images.length === 0 || !activeRuns.has(runId)) return;
  try {
    sender.send(IPC_CHANNELS.AGENT_EVENT, {
      runId,
      type: "tool_artifacts",
      name,
      images,
    });
  } catch {
    /* 窗口已销毁：模型侧仍照常收到文字工具结果 */
  }
}

/**
 * 组装 stdin 里那份 payload：渲染层给的配置 + 主进程侧的密钥（渲染层永远拿不到它）
 * @param {import("@illusion-realm/shared").AgentRunOptions} options
 * @returns {string} 一行 JSON（末尾带换行，Python 侧按行读）
 */
function buildPayloadLine(options) {
  /** @type {Record<string, unknown>} */
  const config = {
    ...AGENT_DEFAULTS,
    ...(options.config || {}),
    // 宿主工具由主进程说了算：放在最后，调用方覆盖不掉
    hostTools: hostToolSpecs(),
  };
  /**
   * 密钥来自「环境变量 / `.env`（**只用于开发测试**）→ 设置页里存的那把」，
   * 见 `agent/secret.js`。两条来源都不在时**不报错**：payload 里就是没有 apiKey，
   * 由 Python 侧给出「缺少 API Key」的 error 帧 —— 但正常路径上不该走到那里，
   * 渲染层在发送前就拦住了（见 `useAgentStore.sendDraft`）。
   */
  // 显式 Euzhi 缺密钥时提前失败，防止 Python 继承另一个站点的环境密钥。
  // endpoint 最后由主进程限定，页面不能把已存密钥发往自定义 URL。
  // hostTools 仍由上面的正式宿主清单生成，provider 不改变工具授权。
  const resolvedConfig = providerRunConfig(config);
  const payload = {
    question: options.question,
    // 图片以实际字节的 data URL 进入 stdin，而非仅保留渲染端缩略图。
    // 不通过命令行传递，避免内容出现在进程参数列表。
    // 无附件时明确空数组，兼容 Python 的纯文本默认分支。
    images: options.images || [],
    history: options.history || [],
    config: resolvedConfig,
  };
  return `${JSON.stringify(payload)}\n`;
}

/**
 * 处理 sidecar 的宿主工具请求：在本进程执行后把结果写回它的 stdin。
 *
 * 两条纪律：① 帧里的 `id` 必须原样带回（Python 侧按 id 认领响应）；
 * ② 任何失败都变成 `ok:false` 的正常响应 —— 抛出去会让模型侧只能等超时。
 * @param {{ id?: unknown, name?: unknown, arguments?: unknown }} frame
 * @param {import("child_process").ChildProcess} child
 * @param {string} runId
 * @param {{ send: (channel: string, payload: unknown) => void }} sender 发起本次运行的发送端
 * @returns {Promise<void>}
 */
async function respondToHostRequest(frame, child, runId, sender) {
  // stdout 可能在取消与 taskkill 生效之间仍含完整工具请求帧。
  // 必须在执行工具前检查，不只是把模型文字隐藏。
  // 仅阻止尚未开始的操作，已进入宿主的任务保留原收尾路径。
  if (!activeRuns.has(runId)) return;
  const requestId = typeof frame.id === "string" ? frame.id : "";
  const toolName = typeof frame.name === "string" ? frame.name : "";
  const tool = findHostTool(toolName);

  /** @type {{ type: string, id: string, ok: boolean, result?: string, error?: string }} */
  let response;
  if (!requestId) {
    console.error("[AGENT] 宿主请求缺少 id，已忽略:", JSON.stringify(frame).slice(0, 200));
    return;
  }
  if (!tool) {
    response = {
      type: "host_response",
      id: requestId,
      ok: false,
      error: `未知的宿主工具：${toolName || "(空)"}`,
    };
  } else {
    try {
      const args =
        frame.arguments && typeof frame.arguments === "object"
          ? /** @type {Record<string, unknown>} */ (frame.arguments)
          : {};
      const toolResult = normalizeHostToolResult(
        await tool.run(args, { sender, runId })
      );
      emitToolArtifacts(sender, runId, toolName, toolResult.images);
      response = {
        type: "host_response",
        id: requestId,
        ok: true,
        // `ctx` 只给需要转发的工具用（如 generate_image 要走渲染层）；
        // 主进程能自己做完的工具忽略它即可（如 list_local_models）。
        result: toolResult.result,
      };
    } catch (error) {
      response = {
        type: "host_response",
        id: requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // 等待宿主期间可能取消，不能再把结果送给已终止的 sidecar。
  // 与产物检查一起覆盖文字和图片两条回执路径。
  // 不因迟到结果重新添加 activeRuns，也不产生新的工具请求。
  if (!activeRuns.has(runId)) return;
  try {
    child.stdin?.write(`${JSON.stringify(response)}\n`);
  } catch (error) {
    console.error(
      `[AGENT] 回写宿主工具结果失败（run=${runId}）:`,
      error instanceof Error ? error.message : error
    );
  }
}

/**
 * 结束整棵进程树（Windows 用 taskkill /T，其余平台退化为 SIGKILL）
 * @param {import("child_process").ChildProcess} child
 * @returns {void}
 */
function killProcessTree(child) {
  if (!child || child.killed) return;
  try {
    if (process.platform === "win32" && child.pid) {
      // Windows 清理范围严格限定本次 Python PID 及其子进程。
      // taskkill 的异步失败不会被外层 try 捕获，回调另做父进程兜底。
      // windowsHide 避免用户每次停止回复弹出命令行窗口。
      // 已退出进程的 kill 由 Node 返回 false，无需覆盖取消状态。
      require("child_process").execFile("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }, (error) => {
        if (error) child.kill("SIGKILL");
      });
      return;
    }
  } catch {
    /* 落到下面的 SIGKILL */
  }
  try {
    child.kill("SIGKILL");
  } catch {
    /* 进程可能已经退出 */
  }
}

/**
 * 启动一次运行
 * @param {{ sender: { send: (channel: string, payload: unknown) => void }, options: import("@illusion-realm/shared").AgentRunOptions, manualPath?: string | null }} params
 * @returns {{ ok: true, runId: string } | { ok: false, error: string }}
 */
function startAgentRun({ sender, options, manualPath }) {
  // 在创建子进程前检查服务商和密钥，配置失败不能留下空等 stdin 的孤儿进程。
  // 解析出的密钥只存在这份局部 payload，不回到 IPC 成功结果里。
  // 假模型继续走同一解析器，测试能核对实际传给 sidecar 的 provider 和 model。
  let payloadLine;
  try { payloadLine = buildPayloadLine(options); }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Invalid Agent configuration' }; }
  const runtime = resolveAgentRuntime({ manualPath });
  if (!runtime) {
    return { ok: false, error: `找不到 Agent 运行时（Python 或打包产物）。\n${describeAgentRuntime()}` };
  }

  runSequence += 1;
  const runId = `agent-${Date.now().toString(36)}-${runSequence}`;

  let child;
  try {
    child = spawn(runtime.command, runtime.args, {
      cwd: runtime.cwd,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    return { ok: false, error: `启动 Agent 失败：${error instanceof Error ? error.message : String(error)}` };
  }

  /** @param {import("@illusion-realm/shared").AgentEvent} event */
  const emit = (event) => {
    // 停止时同步撤销转发资格，不等待系统完成进程树清理。
    // 覆盖 token、工具状态、final 与 exit 错误，旧运行不能复活。
    // 正常结束在 finish 删除前仍可发送最后一帧。
    if (!activeRuns.has(runId)) return;
    try {
      sender.send(IPC_CHANNELS.AGENT_EVENT, { runId, ...event });
    } catch {
      /* 窗口已销毁：丢掉这一帧，别让转发失败拖垮主进程 */
    }
  };

  let sawFinal = false;
  let buffer = "";
  const timeout = setTimeout(() => {
    emit({ type: "error", message: `运行超过 ${Math.round(DEFAULT_TIMEOUT_MS / 1000)} 秒，已中止` });
    // 看门狗同样撤销事件资格，避免超时后又收到迟到 final。
    // 复用取消入口清理计时器与进程树，不维护第二套状态机。
    // 错误先发出，随后注销，因此页面能看到明确超时原因。
    cancelAgentRun(runId);
  }, DEFAULT_TIMEOUT_MS);

  const finish = () => {
    if (timeout) clearTimeout(timeout);
    activeRuns.delete(runId);
    // 收尾时再关 stdin：宿主工具的响应要走同一条管道，**不能在写 payload 时就 end()**
    try {
      child.stdin?.end();
    } catch {
      /* 进程可能已经退出 */
    }
  };

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event && typeof event.type === "string") {
          // 宿主工具请求是**内部协议帧**：本进程处理，不转发给渲染层
          if (event.type === "host_request") {
            void respondToHostRequest(event, child, runId, sender);
            continue;
          }
          if (event.type === "final") sawFinal = true;
          emit(event);
        }
      } catch {
        // 坏行只记录：协议帧出问题不该让整次运行静默失败
        console.error("[AGENT] 跳过无法解析的事件行:", line.slice(0, 200));
      }
    }
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    // FastMCP 的正常日志也在这里，只透传不解析
    process.stdout.write(`[AGENT:stderr] ${chunk}`);
  });

  child.on("error", (error) => {
    emit({ type: "error", message: `Agent 进程启动失败（${runtime.source}）：${error.message}` });
    finish();
  });

  child.on("exit", (code) => {
    const cancelled = !activeRuns.has(runId) && !sawFinal;
    if (!sawFinal && !cancelled) {
      emit({ type: "error", message: `Agent 进程退出（exit=${code ?? "null"}）且没有给出最终结果` });
    }
    finish();
  });

  /**
   * 只写不关：stdin 是**双向协议**的一条腿 —— sidecar 会在这条管道上等宿主工具的响应
   * （见 host-tools.js）。写成 `stdin.end(payload)` 会让桥在第一个工具调用时静默失效
   * （症状：模型调用工具后一直等到 30 秒超时）。
   */
  // 使用启动前固定的快照，网络与 Python 初始化期间切换设置不会串用令牌。
  // stdin 保持打开，以便后续宿主工具回执继续通过双向协议返回。
  // 不把 payloadLine 输出到日志，因为其中包含主进程注入的 API Key。
  child.stdin.write(payloadLine);
  activeRuns.set(runId, { child, timeout });
  return { ok: true, runId };
}

/**
 * 取消一次运行
 * @param {string} runId
 * @returns {boolean} 是否真的取消到了一个在跑的运行
 */
function cancelAgentRun(runId) {
  const entry = activeRuns.get(runId);
  if (!entry) return false;
  activeRuns.delete(runId);
  if (entry.timeout) clearTimeout(entry.timeout);
  killProcessTree(entry.child);
  return true;
}

/** 应用退出时把还在跑的 run 全部收掉（避免留孤儿进程） */
function cancelAllAgentRuns() {
  for (const runId of Array.from(activeRuns.keys())) cancelAgentRun(runId);
}

module.exports = { startAgentRun, cancelAgentRun, cancelAllAgentRuns, buildPayloadLine };
