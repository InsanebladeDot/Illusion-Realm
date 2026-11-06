/**
 * 请求帮助函数和代理保持在同一 comfy 目录，共用有界超时与错误归一化。
 * 导出的代理函数名称不变，既有生成调用方无需跟随目录分类调整协议参数。
 */
/** ComfyUI 代理：提交、轮询及下载共用有界请求，可取消生成由会话管理器关联服务端任务。 */
const { randomUUID } = require("crypto");
const { setTimeout: delay } = require("node:timers/promises");
const { comfyError, requestComfy, readComfyJson, normalizeComfyError } = require("./comfy-request");

const POLL_INTERVAL_MS = 800;
const MAX_WAIT_MS = 10 * 60 * 1000;

/**
 * 本模块的共享类型。
 *
 * 刻意用本地 typedef 而非 import shared 类型：
 * 主进程是手写 CommonJS，运行期解析不到 packages/shared；且这些是 ComfyUI 原始响应形状，
 * 与 shared 里给渲染进程用的类型（ComfyGeneratedImage 带 Blob/objectUrl）并不相同。
 *
 * @typedef {object} ViewFileRef ComfyUI history 里的文件引用（可能不规整）
 * @property {unknown} [filename]
 * @property {unknown} [subfolder]
 * @property {unknown} [type]
 *
 * @typedef {object} ViewCandidate 下载候选参数（已规整）
 * @property {string} filename
 * @property {string} subfolder
 * @property {string} type
 *
 * @typedef {object} OutputFile history 输出条目里的一个文件
 * @property {string} nodeId
 * @property {string} kind images / videos / gifs / audio…
 * @property {string} filename
 * @property {string} subfolder
 * @property {string} type
 * @property {string} folderType
 *
 * @typedef {object} ComfyQueueResult /prompt 响应
 * @property {string} prompt_id
 * @property {number} [number]
 * @property {Record<string, unknown>} [node_errors]
 *
 * @typedef {object} ComfyOutputRecord 返回给渲染进程的单条输出
 * @property {string} nodeId
 * @property {string} filename
 * @property {string} subfolder
 * @property {string} folderType
 * @property {string} kind
 * @property {string} dataUrl
 */

/**
 * @param {string} serverAddress 形如 127.0.0.1:8188
 * @returns {string}
 */
function buildBase(serverAddress) {
  return `http://${serverAddress}`;
}

/**
 * 提交工作流到 ComfyUI
 * @param {string} serverAddress
 * @param {object} prompt ComfyUI API 格式工作流
 * @param {string} clientId
 * @returns {Promise<ComfyQueueResult>}
 */
async function queuePrompt(serverAddress, prompt, clientId) {
  const response = await requestComfy(serverAddress, "/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, client_id: clientId }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw comfyError("COMFY_EXECUTION_FAILED",
      `ComfyUI 提交失败 (${response.status})${detail ? `: ${detail}` : ""}`
    );
  }

  return response.json();
}

/**
 * 取单次任务的历史记录
 * @param {string} serverAddress
 * @param {string} promptId
 * @param {AbortSignal} [signal]
 * @returns {Promise<Record<string, unknown>>}
 */
async function fetchHistory(serverAddress, promptId, signal) {
  return /** @type {Record<string, unknown>} */ (await readComfyJson(
    serverAddress, `/history/${encodeURIComponent(promptId)}`, {}, signal
  ));
}

/**
 * 构造共用上传表单，三类素材都通过官方 /upload/image 原样写入 input。
 * @param {string} filename
 * @param {string} dataBase64
 * @param {unknown} subfolder
 */
function createUploadForm(filename, dataBase64, subfolder) {
  const extension = /\.[a-z0-9]+$/i.exec(filename)?.[0].toLowerCase() || "";
  /** @type {Record<string, string>} */
  const mime = {
    ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
    ".wav": "audio/wav", ".mp3": "audio/mpeg", ".flac": "audio/flac", ".ogg": "audio/ogg", ".m4a": "audio/mp4",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".png": "image/png",
  };
  const form = new FormData();
  form.append("image", new Blob([Buffer.from(dataBase64, "base64")], { type: mime[extension] || "application/octet-stream" }), filename);
  form.append("overwrite", "true");
  if (typeof subfolder === "string" && subfolder) form.append("subfolder", subfolder);
  return form;
}

/**
 * 上传素材到 ComfyUI 输入目录，返回 { name, subfolder, type }，沿用图片上传 IPC 契约。
 * @param {string} serverAddress
 * @param {{ filename: unknown, dataBase64: unknown, subfolder: unknown }} payload
 * @returns {Promise<object>}
 */
async function uploadImageToComfy(serverAddress, { filename, dataBase64, subfolder }) {
  if (!serverAddress) {
    throw new Error("未配置 ComfyUI 服务地址");
  }
  if (typeof filename !== "string" || !filename) {
    throw new Error("缺少上传图片数据");
  }
  if (typeof dataBase64 !== "string" || !dataBase64) {
    throw new Error("缺少上传图片数据");
  }

  const response = await fetch(`${buildBase(serverAddress)}/upload/image`, {
    method: "POST",
    body: createUploadForm(filename, dataBase64, subfolder),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `ComfyUI 图片上传失败 (${response.status})${detail ? `: ${detail}` : ""}`
    );
  }

  return response.json();
}

/**
 * 候选下载参数：ComfyUI 的 history 里 `filename / subfolder / type` 并不总是规整：
 * - 有的节点把子目录塞进 `filename`（`sub/xxx.png` 而 subfolder 为空）；
 * - 有的用反斜杠（Windows 风格）写 subfolder；
 * - type 可能报成 temp（PreviewImage）或 output（SaveImage）。
 * 这里按「先原样，再逐步兜底」的顺序生成候选，正常情况第一个就命中。
 *
 * @param {ViewFileRef} file
 * @returns {ViewCandidate[]} 按优先级排列的候选参数
 */
function buildViewCandidates(file) {
  const baseType = typeof file?.type === "string" && file.type ? file.type : "output";
  const rawSubfolder = typeof file?.subfolder === "string" ? file.subfolder : "";
  const rawFilename = typeof file?.filename === "string" ? file.filename : "";

  /** @type {Array<{ key: string, filename: string, subfolder: string }>} */
  const pairs = [];
  /**
   * @param {string} filename
   * @param {string} subfolder
   * @returns {void}
   */
  const push = (filename, subfolder) => {
    const key = `${filename}|${subfolder}`;
    if (!filename || pairs.some((item) => item.key === key)) return;
    pairs.push({ key, filename, subfolder });
  };

  push(rawFilename, rawSubfolder);
  // 1) subfolder 反斜杠 → 正斜杠
  push(rawFilename, rawSubfolder.replace(/\\/g, "/"));
  // 2) filename 里带了子目录 → 拆成 subfolder + basename
  if (/[\\/]/.test(rawFilename)) {
    const normalized = rawFilename.replace(/\\/g, "/");
    const index = normalized.lastIndexOf("/");
    const subfolder = [rawSubfolder.replace(/\\/g, "/"), normalized.slice(0, index)]
      .filter(Boolean)
      .join("/");
    push(normalized.slice(index + 1), subfolder);
  }

  const typeOrder = [baseType, ...["output", "temp", "input"].filter((type) => type !== baseType)];
  /** @type {ViewCandidate[]} */
  const candidates = [];
  for (const type of typeOrder) {
    for (const pair of pairs) {
      candidates.push({ filename: pair.filename, subfolder: pair.subfolder, type });
    }
  }
  return candidates;
}

/**
 * 拼 ComfyUI /view 下载地址
 * @param {string} serverAddress
 * @param {ViewCandidate} candidate
 * @returns {string}
 */
function buildViewUrl(serverAddress, candidate) {
  const params = new URLSearchParams({
    filename: candidate.filename,
    subfolder: candidate.subfolder ?? "",
    type: candidate.type ?? "output",
  });
  return `${buildBase(serverAddress)}/view?${params.toString()}`;
}

/**
 * 下载输出文件（图片/视频/gif 通用）
 * @param {string} serverAddress
 * @param {ViewFileRef} file
 * @param {AbortSignal} [signal]
 * @returns {Promise<string>} data URL
 */
async function fetchFileDataUrl(serverAddress, file, signal) {
  const candidates = buildViewCandidates(file);
  /** @type {Error | null} */
  let lastError = null;

  for (const candidate of candidates) {
    const url = buildViewUrl(serverAddress, candidate);
    /** @type {Response} */
    let response;
    try {
      response = await requestComfy(serverAddress, url.slice(buildBase(serverAddress).length), {}, signal);
    } catch (error) {
      throw normalizeComfyError(error, signal);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      lastError = new Error(
        `ComfyUI 文件下载失败 (${response.status})：${url}${
          detail ? ` · ${detail.slice(0, 160)}` : ""
        }`
      );
      continue;
    }

    let buffer;
    try { buffer = Buffer.from(await response.arrayBuffer()); }
    catch (error) { throw normalizeComfyError(error, signal); }
    const mimeType = response.headers.get("content-type") || "application/octet-stream";
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  }

  throw lastError ?? new Error("ComfyUI 文件下载失败：没有可用的下载参数");
}

/**
 * 通用收集历史输出中的文件（images / videos / gifs / audio 等）
 * @param {Record<string, unknown>} entry history 中单次任务的条目
 * @returns {OutputFile[]}
 */
function collectOutputFiles(entry) {
  /** @type {OutputFile[]} */
  const files = [];
  const outputs = /** @type {Record<string, Record<string, unknown>>} */ (
    entry.outputs ?? {}
  );

  for (const [nodeId, output] of Object.entries(outputs)) {
    for (const [kind, value] of Object.entries(output ?? {})) {
      if (!Array.isArray(value)) continue;
      for (const item of value) {
        if (
          item &&
          typeof item === "object" &&
          typeof (/** @type {{ filename?: unknown }} */ (item).filename) === "string" &&
          typeof (/** @type {{ type?: unknown }} */ (item).type) === "string"
        ) {
          const file = /** @type {{ filename: string, type: string, subfolder?: unknown }} */ (
            item
          );
          files.push({
            nodeId,
            kind,
            filename: file.filename,
            subfolder: typeof file.subfolder === "string" ? file.subfolder : "",
            // ComfyUI 的文件夹类型（output / temp / input）：下载时必须原样带上，
            // PreviewImage 存的是 temp、SaveImage 存的是 output，弄错就是 404
            type: file.type,
            folderType: file.type,
          });
        }
      }
    }
  }
  return files;
}

/**
 * 轮询等待任务产出结果
 * @param {string} serverAddress
 * @param {string} promptId
 * @param {AbortSignal} [abortSignal]
 * @returns {Promise<Record<string, unknown>>} 已有输出的 history 条目
 */
async function waitForHistory(serverAddress, promptId, abortSignal) {
  const deadline = AbortSignal.timeout(MAX_WAIT_MS);
  const signal = abortSignal ? AbortSignal.any([abortSignal, deadline]) : deadline;

  while (!deadline.aborted) {
    signal.throwIfAborted();
    const history = await fetchHistory(serverAddress, promptId, signal);
    const entry = /** @type {Record<string, unknown> | undefined} */ (
      history?.[promptId]
    );
    const status = /** @type {{ status_str?: string, completed?: boolean } | undefined} */ (entry?.status);
    if (status?.status_str === "error") throw comfyError("COMFY_EXECUTION_FAILED", "ComfyUI workflow execution failed");
    if (entry && collectOutputFiles(entry).length > 0) {
      return entry;
    }
    if (status?.completed) throw comfyError("COMFY_EXECUTION_FAILED", "ComfyUI completed without outputs");
    await delay(POLL_INTERVAL_MS, undefined, { signal }).catch((error) => { throw normalizeComfyError(error, signal); });
  }

  throw comfyError("COMFY_TIMEOUT", "ComfyUI generation timed out");
}

/**
 * 拉取某一类模型清单
 * @param {string} serverAddress
 * @param {string} category ComfyUI model directory name
 * @returns {Promise<string[]>}
 */
async function fetchModelList(serverAddress, category) {
  const response = await fetch(
    `${buildBase(serverAddress)}/models/${category}`, { signal: AbortSignal.timeout(10000) }
  );
  if (!response.ok) return [];
  const values = await response.json();
  return Array.isArray(values) ? values.filter((value) => typeof value === "string") : [];
}

/**
 * 拉取 Checkpoint 与 LoRA 清单
 * @param {string} serverAddress
 * @returns {Promise<import("@illusion-realm/shared").ComfyModelLists>}
 */
async function listComfyModels(serverAddress) {
  // ModelPatchLoader 使用 model_patches，不能从 diffusion_models 借用同名文件。
  // /models 接口返回真实相对路径，保留 Anima 等子目录与原始大小写。
  // 新清单仅增加返回字段，不更改旧 checkpoint/LoRA 的返回含义。
  // 请求与已有模型清单并行，沿用相同的超时和非成功响应处理。
  // 空目录返回空数组，由工作流检查给出缺少具体补丁的可读错误。
  // 本地设置扫描和远端可用性是两回事：本机有文件不代表服务端已加载。
  // 这里只列资源，不自动安装节点、不复制模型、不读取 safetensors 内容。
  const [checkpoints, loras, diffusionModels, clip, textEncoders, vaes, modelPatches] = await Promise.all([
    fetchModelList(serverAddress, "checkpoints"),
    fetchModelList(serverAddress, "loras"),
    fetchModelList(serverAddress, "diffusion_models"),
    fetchModelList(serverAddress, "clip"),
    fetchModelList(serverAddress, "text_encoders"),
    fetchModelList(serverAddress, "vae"),
    fetchModelList(serverAddress, "model_patches"),
  ]);
  return { checkpoints, loras, diffusionModels, clips: [...new Set([...clip, ...textEncoders])], vaes, modelPatches };
}

/**
 * 提交工作流并等待产物，下载为 data URL 返回
 * @param {string} serverAddress
 * @param {object} prompt ComfyUI API 格式工作流
 * @param {{ signal?: AbortSignal, onQueued?: (id: string) => void }} [options]
 * @returns {Promise<{ promptId: string, images: ComfyOutputRecord[], videos: ComfyOutputRecord[] }>}
 */
async function generateWithComfy(serverAddress, prompt, options = {}) {
  if (!serverAddress) {
    throw new Error("未配置 ComfyUI 服务地址");
  }

  const clientId = randomUUID();
  const queued = await queuePrompt(serverAddress, prompt, clientId);

  if (queued.node_errors && Object.keys(queued.node_errors).length > 0) {
    throw comfyError("COMFY_EXECUTION_FAILED",
      `ComfyUI 工作流校验失败: ${JSON.stringify(queued.node_errors)}`
    );
  }

  const promptId = queued.prompt_id;
  if (typeof promptId !== "string" || !promptId) throw comfyError("COMFY_EXECUTION_FAILED", "ComfyUI returned no prompt ID");
  options.onQueued?.(promptId);
  options.signal?.throwIfAborted();
  const entry = await waitForHistory(serverAddress, promptId, options.signal);

  /** @type {ComfyOutputRecord[]} */
  const images = [];
  /** @type {ComfyOutputRecord[]} */
  const videos = [];

  for (const file of collectOutputFiles(entry)) {
    const dataUrl = await fetchFileDataUrl(serverAddress, file, options.signal);
    /** @type {ComfyOutputRecord} */
    const record = {
      nodeId: file.nodeId,
      filename: file.filename,
      subfolder: file.subfolder,
      folderType: file.folderType,
      kind: file.kind,
      dataUrl,
    };
    if (file.kind === "images") {
      images.push(record);
    } else {
      videos.push(record);
    }
  }

  if (images.length === 0 && videos.length === 0) {
    throw comfyError("COMFY_EXECUTION_FAILED", "ComfyUI 任务完成，但未返回任何输出");
  }

  options.signal?.throwIfAborted();
  return { promptId, images, videos };
}

module.exports = {
  generateWithComfy,
  uploadImageToComfy,
  listComfyModels,
  fetchFileDataUrl,
  buildViewCandidates,
  buildViewUrl,
  collectOutputFiles,
};
