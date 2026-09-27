const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const { dialog } = require("electron");
const { resolveTools } = require("./locate");
const { probeVideo } = require("./probe");
const { startEditJob } = require("./jobs");
const { ensureDirectory, ensureUniqueFilePath } = require("../outputPaths");
const { IPC_CHANNELS } = require("../ipcChannels");
const { registerHandle } = require("../ipcHandlers");

/** 3D 模型文件大小上限（避免一次读入过大文件） */
const MAX_MODEL_FILE_BYTES = 64 * 1024 * 1024;

/** 已知的任务类型；未知类型通常意味着渲染进程比主进程新（主进程未重启） */
/** @type {Set<string>} */
const KNOWN_JOB_MODES = new Set(["single", "concat", "gif"]);

/**
 * 校验任务类型是否已知
 * @param {unknown} mode
 * @returns {void}
 */
function assertKnownMode(mode) {
  if (typeof mode === "string" && mode && !KNOWN_JOB_MODES.has(mode)) {
    throw new Error(
      `未知的导出类型「${mode}」：主进程可能不是最新版本，请完全退出应用后重新启动（仅刷新页面不会重载主进程）`
    );
  }
}

/**
 * 进行中的 ffmpeg 任务：jobId → child process
 * @type {Map<string, import("child_process").ChildProcess>}
 */
const activeJobs = new Map();
let jobSequence = 0;

const VIDEO_EXTENSIONS = [
  "mp4", "mov", "mkv", "avi", "webm", "flv", "wmv", "m4v", "ts", "mpg", "mpeg", "3gp",
];

/**
 * 读取 ffmpeg 版本号（`ffmpeg -version` 首行）
 * @param {string | null} ffmpegPath
 * @returns {Promise<string | null>}
 */
function readFfmpegVersion(ffmpegPath) {
  if (!ffmpegPath) return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(ffmpegPath, ["-version"], { windowsHide: true }, (error, stdout) => {
      if (error) return resolve(null);
      resolve(String(stdout).split("\n")[0]?.trim() ?? null);
    });
  });
}

function registerVideoToolIpc() {
  /** 探测 ffmpeg/ffprobe：手动指定 → 系统 PATH → 常见位置 → 内置 */
  registerHandle(IPC_CHANNELS.VIDEO_FFMPEG_STATUS, async (_event, manualFfmpegPath) => {
    const tools = resolveTools(manualFfmpegPath);
    return {
      ...tools,
      version: await readFfmpegVersion(tools.ffmpegPath),
    };
  });

  registerHandle(IPC_CHANNELS.VIDEO_SELECT_FFMPEG, async () => {
    const result = await dialog.showOpenDialog({
      title: "选择 ffmpeg 可执行文件",
      properties: ["openFile"],
      filters:
        process.platform === "win32"
          ? [{ name: "可执行文件", extensions: ["exe"] }]
          : [],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  registerHandle(IPC_CHANNELS.VIDEO_PICK_FILE, async () => {
    const result = await dialog.showOpenDialog({
      title: "选择视频文件（可多选，按选择顺序拼接）",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "视频文件", extensions: VIDEO_EXTENSIONS }],
    });
    if (result.canceled || result.filePaths.length === 0) return [];
    return result.filePaths;
  });

  /**
   * 选择**输出文件夹**（不是保存文件）：
   * 文件名由渲染进程按参数自动生成（也可自定义），这里只负责目录选择与创建。
   */
  registerHandle(IPC_CHANNELS.VIDEO_PICK_OUTPUT_FOLDER, async (_event, title) => {
    const result = await dialog.showOpenDialog({
      title: typeof title === "string" && title ? title : "选择输出文件夹",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  /**
   * 保存单个文件（未选择输出文件夹时的回退路径）：
   * 弹出系统「保存文件」对话框，返回完整的输出文件路径。
   */
  registerHandle(IPC_CHANNELS.VIDEO_PICK_OUTPUT, async (_event, defaultName, kind) => {
    const isGif = kind === "gif";
    const result = await dialog.showSaveDialog({
      title: isGif ? "保存 GIF 文件" : "保存视频文件",
      defaultPath: typeof defaultName === "string" && defaultName
        ? defaultName
        : isGif ? "output.gif" : "output.mp4",
      filters: isGif
        ? [{ name: "GIF 动图", extensions: ["gif"] }]
        : [
            { name: "MP4 视频", extensions: ["mp4"] },
            { name: "MKV 视频", extensions: ["mkv"] },
          ],
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });

  registerHandle(
    IPC_CHANNELS.VIDEO_PROBE,
    /**
     * @param {Electron.IpcMainInvokeEvent} _event
     * @param {{ inputPath: string, manualFfmpegPath?: string | null }} payload
     */
    async (_event, payload) => {
      const { inputPath, manualFfmpegPath } = payload ?? {};
      if (!inputPath) throw new Error("缺少视频路径");
      const { ffprobePath } = resolveTools(manualFfmpegPath);
      return probeVideo(ffprobePath, inputPath);
    }
  );

  /** 执行编辑：进度通过 video:progress 事件推送 */
  registerHandle(
    IPC_CHANNELS.VIDEO_RUN,
    /**
     * @param {Electron.IpcMainInvokeEvent} event
     * @param {{ job: import("@illusion-realm/shared").VideoEditJob, manualFfmpegPath?: string | null }} payload
     */
    async (event, payload) => {
      const { job: requestedJob, manualFfmpegPath } = payload ?? {};
      const job = requestedJob;
      // 渲染进程比主进程新（主进程未重启）时给出明确提示，而不是误报「缺少输入路径」
      assertKnownMode(job?.mode);
      const isGif = job?.mode === "gif";
      const isMultiInput = job?.mode === "concat" || isGif;

    if (!job?.outputPath) {
      throw new Error("缺少输出路径");
    }

    if (isMultiInput) {
      if (!Array.isArray(job.clips) || job.clips.length === 0) {
        throw new Error(isGif ? "GIF 任务缺少片段列表" : "拼接任务缺少片段列表");
      }
      if (job.clips.some((clip) => !clip?.inputPath)) {
        throw new Error(isGif ? "GIF 任务存在无效片段" : "拼接任务存在无效片段");
      }
      if (job.clips.some((clip) => clip.inputPath === job.outputPath)) {
        throw new Error("输出文件不能与任一输入文件相同");
      }
      if (isGif && !/\.gif$/i.test(job.outputPath)) {
        throw new Error("GIF 输出文件需使用 .gif 扩展名");
      }
    } else {
      if (!job?.inputPath) {
        throw new Error("缺少输入路径");
      }
      if (job.inputPath === job.outputPath) {
        throw new Error("输出文件不能与输入文件相同");
      }
    }

    const { ffmpegPath } = resolveTools(manualFfmpegPath);
    if (!ffmpegPath) {
      throw new Error(
        "未找到 ffmpeg。请安装 ffmpeg 并加入 PATH，或在页面中手动指定 ffmpeg 路径。"
      );
    }

    // 输出目录可能还不存在；同名文件自动让位，避免静默覆盖上一次的导出
    ensureDirectory(path.dirname(job.outputPath));
    const effectiveJob = {
      ...job,
      outputPath: ensureUniqueFilePath(job.outputPath),
    };

    const jobId = `video-${Date.now()}-${(jobSequence += 1)}`;
    const sender = event.sender;

    return new Promise((resolve, reject) => {
      const child = startEditJob({
        ffmpegPath,
        job: effectiveJob,
        onProgress: (progress) => {
          if (sender.isDestroyed()) return;
          sender.send(IPC_CHANNELS.VIDEO_PROGRESS_EVENT, { jobId, ...progress });
        },
        onDone: (result) => {
          activeJobs.delete(jobId);
          resolve({ jobId, ...result });
        },
        onError: (error) => {
          activeJobs.delete(jobId);
          reject(error);
        },
      });

      activeJobs.set(jobId, child);
    });
  });

  registerHandle(IPC_CHANNELS.VIDEO_CANCEL, async (_event, jobId) => {
    const child = activeJobs.get(jobId);
    if (!child) return false;
    activeJobs.delete(jobId);
    try {
      child.kill("SIGKILL");
    } catch {
      // ignore
    }
    return true;
  });

  // ---- 3D 视角（three.js）角色模型：选择与读取 ----
  registerHandle(IPC_CHANNELS.VIEW3D_PICK_MODEL, async (_event, defaultPath) => {
    const result = await dialog.showOpenDialog({
      title: "选择角色模型（.glb / .gltf）",
      // 记住上次导入的位置：默认打开到该目录
      defaultPath: typeof defaultPath === "string" && defaultPath ? defaultPath : undefined,
      properties: ["openFile"],
      filters: [
        { name: "3D 模型", extensions: ["glb", "gltf"] },
        { name: "全部文件", extensions: ["*"] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  /**
   * 读取模型文件为字节流：走 IPC 而不是让 GLTFLoader 直接 fetch 自定义协议，
   * 避免打包环境下的跨源/协议差异。
   */
  registerHandle(IPC_CHANNELS.VIEW3D_READ_MODEL_FILE, async (_event, filePath) => {
    if (!filePath || typeof filePath !== "string") {
      throw new Error("缺少模型文件路径");
    }
    if (!fs.existsSync(filePath)) {
      throw new Error(`模型文件不存在：${filePath}`);
    }
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      throw new Error("模型路径不是文件");
    }
    if (stat.size > MAX_MODEL_FILE_BYTES) {
      throw new Error(
        `模型文件过大（${(stat.size / 1024 / 1024).toFixed(1)} MB），上限 ${MAX_MODEL_FILE_BYTES / 1024 / 1024} MB`
      );
    }
    return {
      fileName: path.basename(filePath),
      data: fs.readFileSync(filePath),
    };
  });
}

module.exports = { registerVideoToolIpc };
