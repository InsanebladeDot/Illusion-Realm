/**
 * 宿主工具注册表：Agent 能调用的「应用侧能力」都在这里**声明 + 实现**。
 *
 * 为什么放主进程：这些能力（模型扫描、图片 Meta、图库…）在 Electron 侧已经有实现，
 * 在 Python 里重写必然与这边分叉。所以声明经 payload 的 `hostTools` 传给 sidecar
 * （模型据此决定调不调用），实现留在本地：
 *
 *     sidecar → stdout  {"type":"host_request","id":…,"name":…,"arguments":…}
 *     本模块  → stdin   {"type":"host_response","id":…,"ok":true,"result":"…"}
 *
 * **加一个新工具 = 在这里加一条**（声明 + run），不用改 Python、不用改协议。
 *
 * 两种实现形态，按能力落在哪一侧选：
 * - **主进程能自己做完的**（读用户数据、扫目录…）→ `run` 直接返回结果，例如 `list_local_models`；
 * - **能力在渲染层的**（工作流组装、落盘、Meta 内嵌…）→ `run` 调 `callRenderer()` 把活转给
 *   渲染层（`apps/next/src/utils/agentHostTools.ts`），本进程只等回执。主进程是手写
 *   CommonJS，运行期拿不到渲染层的 TS，硬在这里重写就是第二套判据。
 */
const fs = require("fs");
const path = require("path");

const { scanModelsInDirectory } = require("../modelScanner");
const { IPC_CHANNELS } = require("../ipcChannels");

/** 单次结果最多列多少个模型文件（模型上下文很贵，宁可截断也别灌爆） */
const MAX_ENTRIES = 40;
/** 测试 / 调试用：覆盖用户数据文件位置（正常运行时用应用自己的那份） */
const ENV_USER_DATA = "ILLUSION_AGENT_USER_DATA";
/** 生图要排队 + 采样 + 下载，远超其它宿主工具；单独给它一条宽松的超时 */
const GENERATE_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * 发起本次运行的发送端。真实运行时是 Electron 的 `webContents`；
 * 这里只声明真正用到的 `send` —— 自检脚本能用最小假对象顶替（见 verify-agent-events.js），
 * 不必为了类型把整个 WebContents 拖进来。
 * @typedef {{ send: (channel: string, payload: unknown) => void }} HostToolSender
 */

/**
 * 等渲染层回执的调用（callId → 待兑现的 Promise）
 * @type {Map<string, { resolve: (value: { result: string, images: string[] }) => void, reject: (reason: Error) => void, timer: NodeJS.Timeout }>}
 */
const pendingHostCalls = new Map();
let hostCallSequence = 0;

/**
 * 把一次宿主工具调用转给**渲染层**执行，等它的回执。
 *
 * 与 `host_response`（主进程 → Python）是不同的一跳：这条是本进程 ↔ 渲染层的往返。
 * 三条纪律：① `sender.send` 可能因窗口销毁直接抛，必须当场 reject，
 * 否则调用要白等到超时；② 超时必须清掉 pending，避免 Map 无限增长；
 * ③ 回执（`settleHostCall`）由 `ipc-handlers/agent.handlers.js` 的 `agent:hostResult` 送达。
 * @param {HostToolSender} sender 发起本次 Agent 运行的发送端
 * @param {string} name 工具名
 * @param {Record<string, unknown>} args 工具入参
 * @param {number} timeoutMs 等回执的上限
 * @returns {Promise<{ result: string, images: string[] }>}
 */
function callRenderer(sender, name, args, timeoutMs) {
  hostCallSequence += 1;
  const callId = `hostcall-${Date.now().toString(36)}-${hostCallSequence}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingHostCalls.delete(callId);
      reject(new Error(`渲染层在 ${Math.round(timeoutMs / 1000)} 秒内没有回执（${name}）`));
    }, timeoutMs);
    pendingHostCalls.set(callId, { resolve, reject, timer });

    try {
      sender.send(IPC_CHANNELS.AGENT_HOST_CALL, { callId, name, arguments: args });
    } catch (error) {
      clearTimeout(timer);
      pendingHostCalls.delete(callId);
      reject(
        new Error(
          `窗口不可用，无法执行 ${name}：${error instanceof Error ? error.message : error}`
        )
      );
    }
  });
}

/**
 * 渲染层的回执入口。
 * @param {unknown} payload `{ callId, ok, result?, error? }`
 * @returns {boolean} 是否认领到了一次在等的调用（认领不到说明超时已收场，正常丢弃）
 */
function settleHostCall(payload) {
  if (!payload || typeof payload !== "object") return false;
  const { callId, ok, result, images, error } =
    /** @type {{ callId?: unknown, ok?: unknown, result?: unknown, images?: unknown, error?: unknown }} */ (
      payload
    );
  if (typeof callId !== "string" || !callId) return false;

  const entry = pendingHostCalls.get(callId);
  if (!entry) return false;

  pendingHostCalls.delete(callId);
  clearTimeout(entry.timer);
  if (ok) {
    entry.resolve({
      result: String(result ?? ""),
      images: Array.isArray(images)
        ? images.filter((item) => typeof item === "string" && item.length > 0)
        : [],
    });
  } else {
    entry.reject(new Error(String(error || "渲染层执行宿主工具失败")));
  }
  return true;
}

/**
 * 工具：生图（**执行端在渲染层**）。
 *
 * 不在这里调 `comfyProxy` 的原因：`comfyProxy` 只负责「提交工作流 → 等 history → 下载」，
 * 而它要的 API Prompt 得由渲染层的 `buildImagePrompt`（模板 JSON + 参数填槽 + LoRA 链）
 * 组装，产物还得由渲染层的 `saveGeneratedImagesToDisk` 落盘并内嵌 Meta。
 * 三段一起转过去，Agent 生成的图才和界面上点「生成」的结果完全一致（含图库归档）。
 * @param {Record<string, unknown>} args
 * @param {{ sender: HostToolSender, runId: string }} ctx
 * @returns {Promise<{ result: string, images: string[] }>}
 */
function generateImage(args, ctx) {
  return callRenderer(ctx.sender, "generate_image", args, GENERATE_TIMEOUT_MS);
}

/**
 * 人类可读的体积（主进程侧没有 renderer 的 formatBytes，这里自带一个）
 * @param {number} bytes
 * @returns {string}
 */
function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * 读应用设置里的模型路径。
 * 读的是**用户数据文档**（`settings.paths`），所以 Agent 看到的路径与它在设置页里填的一致。
 * @returns {{ searchPath: string, checkpointPath: string, lorasPath: string, diffusionModelsPath: string }}
 */
function readSettingsPaths() {
  const empty = {
    searchPath: "",
    checkpointPath: "",
    lorasPath: "",
    diffusionModelsPath: "",
  };
  try {
    const custom = (process.env[ENV_USER_DATA] || "").trim();
    /**
     * 两条读取路径：
     * - 显式给了 `ILLUSION_AGENT_USER_DATA`（自检 / 调试）→ **直接读那个文件**：
     *   这条路径不依赖 Electron，纯 Node 的自检脚本也能跑；
     * - 否则走应用自己的 `readUserData()`（懒加载：它依赖 electron 的 app）。
     */
    /** @type {{ settings?: { paths?: Record<string, unknown> } } | null} */
    let document = null;
    if (custom) {
      document = JSON.parse(fs.readFileSync(custom, "utf8"));
    } else {
      const { readUserData } = require("../userData");
      document = readUserData()?.data ?? null;
    }
    const paths = document?.settings?.paths;
    if (!paths || typeof paths !== "object") return empty;
    return {
      searchPath: typeof paths.searchPath === "string" ? paths.searchPath : "",
      checkpointPath:
        typeof paths.checkpointPath === "string" ? paths.checkpointPath : "",
      lorasPath: typeof paths.lorasPath === "string" ? paths.lorasPath : "",
      diffusionModelsPath:
        typeof paths.diffusionModelsPath === "string"
          ? paths.diffusionModelsPath
          : "",
    };
  } catch (error) {
    console.error("[AGENT] 读取模型路径失败:", error instanceof Error ? error.message : error);
    return empty;
  }
}

/**
 * 要扫的根目录。**检索路径优先**（与创建页 `scanAllModels` 同一条规则）：
 * 填了检索路径就只扫它，忽略下面三个具体路径。
 * @param {{ searchPath: string, checkpointPath: string, lorasPath: string, diffusionModelsPath: string }} paths
 * @returns {Array<{ key: string, label: string, type: "checkpoint" | "lora", dir: string }>}
 */
function resolveScanRoots(paths) {
  const trimmedSearch = paths.searchPath.trim();
  if (trimmedSearch) {
    return [{ key: "search", label: "检索路径（优先）", type: "checkpoint", dir: trimmedSearch }];
  }
  /** @type {Array<{ key: string, label: string, type: "checkpoint" | "lora", dir: string }>} */
  const roots = [];
  if (paths.checkpointPath.trim()) {
    roots.push({ key: "checkpoint", label: "Checkpoint", type: "checkpoint", dir: paths.checkpointPath.trim() });
  }
  if (paths.lorasPath.trim()) {
    roots.push({ key: "lora", label: "LoRA", type: "lora", dir: paths.lorasPath.trim() });
  }
  if (paths.diffusionModelsPath.trim()) {
    roots.push({
      key: "diffusion",
      label: "Diffusion（Anima 等）",
      type: "checkpoint",
      dir: paths.diffusionModelsPath.trim(),
    });
  }
  return roots;
}

/**
 * 单个文件条目的体积（拿不到就写「大小未知」）
 * @param {string} filePath
 * @returns {string}
 */
function describeSize(filePath) {
  try {
    return formatSize(fs.statSync(filePath).size);
  } catch {
    return "大小未知";
  }
}

/**
 * 工具：本地模型清单。
 *
 * 与界面的一致性：用的是**同一个扫描器**（`apps/electron/modelScanner.js`）与
 * 同一份路径设置，所以「Agent 说有 3 个」和设置页里看到的来源相同。
 * 但它**不做**界面那层的「是否可用于生成」过滤 —— 这里列的是目录里的模型文件，
 * 因此结果里会带上这句提示，免得模型过度承诺。
 * @param {{ kind?: string, query?: string }} [args]
 * @returns {Promise<string>}
 */
async function listLocalModels(args = {}) {
  const paths = readSettingsPaths();
  const roots = resolveScanRoots(paths);
  if (roots.length === 0) {
    return (
      "还没有配置模型目录，因此拿不到本地模型清单。" +
      "可以提示用户到「设置 → 模型路径」里填 Checkpoint / LoRA / Diffusion（或检索路径）后再问。"
    );
  }

  const wantedKind = typeof args.kind === "string" && args.kind ? args.kind : "all";
  const query = (typeof args.query === "string" ? args.query : "").trim().toLowerCase();
  const selectedRoots = roots.filter(
    (root) => wantedKind === "all" || wantedKind === root.key
  );
  if (selectedRoots.length === 0) {
    return `当前只配置了这些目录：${roots.map((root) => root.label).join("、")}，没有匹配「${wantedKind}」的。`;
  }

  const lines = ["本地模型清单（来自应用设置里的模型目录，用应用同一个扫描器得出）"];
  let listed = 0;
  let total = 0;
  let skippedByQuery = 0;

  for (const root of selectedRoots) {
    const exists = fs.existsSync(root.dir);
    lines.push("");
    if (!exists) {
      lines.push(`【${root.label}】${root.dir} —— 目录不存在（设置里改了位置或盘符变动？）`);
      continue;
    }

    const groups = scanModelsInDirectory(root.dir, root.type);
    const groupCount = groups.length;
    const fileCount = groups.reduce((sum, group) => sum + group.versions.length, 0);
    lines.push(`【${root.label}】${root.dir} —— ${groupCount} 组 / ${fileCount} 个文件`);
    if (fileCount === 0) {
      lines.push("  （这个目录里没有识别到模型文件）");
      continue;
    }

    for (const group of groups) {
      const matched = group.versions.filter(
        (version) => !query || version.name.toLowerCase().includes(query)
      );
      total += matched.length;
      if (matched.length === 0) continue;
      lines.push(`  ${group.name}/（${matched.length} 个）`);
      for (const version of matched) {
        if (listed >= MAX_ENTRIES) break;
        lines.push(`    - ${version.name}（${describeSize(version.filePath)}）`);
        listed += 1;
      }
      if (listed >= MAX_ENTRIES) break;
    }
  }

  if (query) {
    lines.push("");
    lines.push(`（已按关键词「${args.query}」过滤，命中 ${total} 个${skippedByQuery ? "" : ""}）`);
  }
  if (listed < total) {
    lines.push(`（还有 ${total - listed} 个未列出：清单太长会挤占对话上下文，需要更精确的结果请给出关键词）`);
  }
  lines.push("");
  lines.push(
    "说明：这里列的是模型目录里的文件；是否「可用于生成」以应用界面为准（界面会过滤 VAE / CLIP 等目录）。"
  );
  return lines.join("\n");
}

/** 注册表：加工具只动这一处 */
const HOST_TOOLS = [
  {
    name: "list_local_models",
    description:
      "列出本机配置的模型目录里有哪些模型文件（Checkpoint / LoRA / Diffusion），按目录分组给出名称与体积。" +
      "当用户问「我有哪些模型」「有没有某个模型」「本地模型清单」时调用它；" +
      "可以带 kind（all/checkpoint/lora/diffusion）限定目录、带 query 按名称关键词过滤。",
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["all", "search", "checkpoint", "lora", "diffusion"],
          description: "限定只看某一类目录，默认 all（全部）",
        },
        query: {
          type: "string",
          description: "按模型名过滤（不区分大小写），例如「anima」",
        },
      },
      required: [],
    },
    run: listLocalModels,
  },
  {
    name: "generate_image",
    description:
      "调用应用自己的生图功能画一张图（复用设置里的 ComfyUI 地址、工作流模板、输出目录与图库）。" +
      "当用户要求画画、生成图像、文生图、出图时调用它；不要试图自己拼 ComfyUI 请求。" +
      "耗时通常一到两分钟，调用期间等结果即可。返回保存路径；把路径告诉用户，不要复述参数。",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "正向提示词（必填），描述想要的画面" },
        negativePrompt: { type: "string", description: "反向提示词；省略则用应用的默认反向词" },
        series: {
          type: "string",
          enum: ["anima", "sdxl"],
          description: "模型系列，与创建页的两套工作流对应；默认 anima",
        },
        model: {
          type: "string",
          description:
            "模型文件名（Anima 填 diffusion_models 里的 unet_name，SDXL 填 checkpoints 里的 ckpt_name）；" +
            "省略则沿用工作流模板里写死的模型 —— 用户机器上未必有，拿不准时先问或先列本地模型",
        },
        width: { type: "integer", description: "宽度（像素），省略用模板默认" },
        height: { type: "integer", description: "高度（像素），省略用模板默认" },
        steps: { type: "integer", description: "采样步数，省略用模板默认" },
        cfg: { type: "number", description: "CFG 强度，省略用模板默认" },
      },
      required: ["prompt"],
    },
    /** 生图远慢于其它宿主工具：单独给一条宽松的等待上限（见 callRenderer） */
    timeoutMs: GENERATE_TIMEOUT_MS,
    run: generateImage,
  },
];

/**
 * 给 sidecar 的声明（只有声明，没有实现代码）。
 * `timeoutMs` 只在声明里出现，Python 侧按工具取用（见 `agent_core/host_tools.py`）——
 * 生图这类慢工具不该被 30 秒的全局默认值掐断。
 */
function hostToolSpecs() {
  return HOST_TOOLS.map((tool) => {
    /** @type {{ name: string, description: string, parameters: object, timeoutMs?: number }} */
    const spec = {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    };
    const timeoutMs = /** @type {{ timeoutMs?: unknown }} */ (tool).timeoutMs;
    if (typeof timeoutMs === "number") spec.timeoutMs = timeoutMs;
    return spec;
  });
}

/**
 * 按名字取工具（调用前先查、查不到就回错误文本，而不是抛）
 * @param {string} name
 */
function findHostTool(name) {
  return HOST_TOOLS.find((tool) => tool.name === name) || null;
}

module.exports = {
  HOST_TOOLS,
  hostToolSpecs,
  findHostTool,
  listLocalModels,
  settleHostCall,
};
