const { randomUUID } = require("crypto");

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
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  const response = await fetch(`${buildBase(serverAddress)}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, client_id: clientId }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `ComfyUI 提交失败 (${response.status})${detail ? `: ${detail}` : ""}`
    );
  }

  return response.json();
}

/**
 * 取单次任务的历史记录
 * @param {string} serverAddress
 * @param {string} promptId
 * @returns {Promise<Record<string, unknown> | null>} 失败（非 2xx）返回 null
 */
async function fetchHistory(serverAddress, promptId) {
  const response = await fetch(
    `${buildBase(serverAddress)}/history/${encodeURIComponent(promptId)}`
  );
  if (!response.ok) return null;
  return response.json();
}

/**
 * 上传图片到 ComfyUI 输入目录，返回 { name, subfolder, type }
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

  const buffer = Buffer.from(dataBase64, "base64");
  const form = new FormData();
  form.append("image", new Blob([buffer], { type: "image/png" }), filename);
  form.append("overwrite", "true");
  if (typeof subfolder === "string" && subfolder) form.append("subfolder", subfolder);

  const response = await fetch(`${buildBase(serverAddress)}/upload/image`, {
    method: "POST",
    body: form,
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
 * @returns {Promise<string>} data URL
 */
async function fetchFileDataUrl(serverAddress, file) {
  const candidates = buildViewCandidates(file);
  /** @type {Error | null} */
  let lastError = null;

  for (const candidate of candidates) {
    const url = buildViewUrl(serverAddress, candidate);
    /** @type {Response} */
    let response;
    try {
      response = await fetch(url);
    } catch (error) {
      lastError = new Error(
        `ComfyUI 文件下载失败：${error instanceof Error ? error.message : error}（${url}）`
      );
      continue;
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

    const buffer = Buffer.from(await response.arrayBuffer());
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
  const startedAt = Date.now();

  while (Date.now() - startedAt < MAX_WAIT_MS) {
    if (abortSignal?.aborted) {
      const error = new Error("ComfyUI 任务已取消");
      error.name = "AbortError";
      throw error;
    }

    const history = await fetchHistory(serverAddress, promptId);
    const entry = /** @type {Record<string, unknown> | undefined} */ (
      history?.[promptId]
    );
    if (entry && collectOutputFiles(entry).length > 0) {
      return entry;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error("ComfyUI 生成超时，请检查队列与服务器日志");
}

/**
 * 拉取某一类模型清单
 * @param {string} serverAddress
 * @param {string} category checkpoints / loras
 * @returns {Promise<string[]>}
 */
async function fetchModelList(serverAddress, category) {
  const response = await fetch(
    `${buildBase(serverAddress)}/models/${category}`
  );
  if (!response.ok) return [];
  return response.json();
}

/**
 * 拉取 Checkpoint 与 LoRA 清单
 * @param {string} serverAddress
 * @returns {Promise<{ checkpoints: string[], loras: string[] }>}
 */
async function listComfyModels(serverAddress) {
  const [checkpoints, loras] = await Promise.all([
    fetchModelList(serverAddress, "checkpoints"),
    fetchModelList(serverAddress, "loras"),
  ]);
  return { checkpoints, loras };
}

/**
 * 提交工作流并等待产物，下载为 data URL 返回
 * @param {string} serverAddress
 * @param {object} prompt ComfyUI API 格式工作流
 * @returns {Promise<{ promptId: string, images: ComfyOutputRecord[], videos: ComfyOutputRecord[] }>}
 */
async function generateWithComfy(serverAddress, prompt) {
  if (!serverAddress) {
    throw new Error("未配置 ComfyUI 服务地址");
  }

  const clientId = randomUUID();
  const queued = await queuePrompt(serverAddress, prompt, clientId);

  if (queued.node_errors && Object.keys(queued.node_errors).length > 0) {
    throw new Error(
      `ComfyUI 工作流校验失败: ${JSON.stringify(queued.node_errors)}`
    );
  }

  const promptId = queued.prompt_id;
  const entry = await waitForHistory(serverAddress, promptId);

  /** @type {ComfyOutputRecord[]} */
  const images = [];
  /** @type {ComfyOutputRecord[]} */
  const videos = [];

  for (const file of collectOutputFiles(entry)) {
    const dataUrl = await fetchFileDataUrl(serverAddress, file);
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
    throw new Error("ComfyUI 任务完成，但未返回任何输出");
  }

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
