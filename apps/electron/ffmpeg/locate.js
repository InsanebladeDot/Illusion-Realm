const fs = require("fs");
const path = require("path");
const { app } = require("electron");

/**
 * ffmpeg / ffprobe 探测结果。source 与 shared 的 FfmpegStatus["source"] 保持一致；
 * 仅类型层引用 shared，运行期不 require。
 *
 * @typedef {"manual" | "path" | "common" | "bundled" | null} FfmpegSource
 * @typedef {{ ffmpegPath: string | null, ffprobePath: string | null, source: FfmpegSource }} ResolvedTools
 */

const IS_WINDOWS = process.platform === "win32";
const FFMPEG_BIN = IS_WINDOWS ? "ffmpeg.exe" : "ffmpeg";
const FFPROBE_BIN = IS_WINDOWS ? "ffprobe.exe" : "ffprobe";

/**
 * 路径是否指向一个真实文件
 * @param {string | null | undefined} filePath
 * @returns {boolean}
 */
function isFile(filePath) {
  if (!filePath) return false;
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * 系统 PATH 中的 ffmpeg/ffprobe
 * @param {string} binName
 * @returns {string | null}
 */
function findInSystemPath(binName) {
  const entries = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const dir of entries) {
    const candidate = path.join(dir, binName);
    if (isFile(candidate)) return candidate;
  }
  return null;
}

/**
 * 常见安装位置（含版本化目录，如 E:\Tool\ffmpeg\ffmpeg-9.0.1\bin）
 * @param {string} binName
 * @returns {string | null}
 */
function findInCommonLocations(binName) {
  const drives = ["C:", "D:", "E:", "F:", "G:", "H:"];
  /** @type {string[][]} */
  const directPatterns = [
    ["ffmpeg", "bin"],
    ["Tool", "ffmpeg", "bin"],
    ["Tools", "ffmpeg", "bin"],
    ["Program Files", "ffmpeg", "bin"],
    ["Program Files (x86)", "ffmpeg", "bin"],
    ["ProgramData", "chocolatey", "bin"],
  ];

  for (const drive of drives) {
    if (!isFile(`${drive}\\`) && !fs.existsSync(`${drive}\\`)) continue;

    for (const parts of directPatterns) {
      const candidate = path.join(`${drive}\\`, ...parts, binName);
      if (isFile(candidate)) return candidate;
    }
  }

  // 版本化目录：<root>\<parent>\<version>\bin\<bin>
  /** @type {string[][]} */
  const versionedParents = [
    ["Tool", "ffmpeg"],
    ["Tools", "ffmpeg"],
    ["ffmpeg"],
    ["AI", "ffmpeg"],
  ];

  for (const drive of drives) {
    if (!fs.existsSync(`${drive}\\`)) continue;
    for (const parentParts of versionedParents) {
      const parentDir = path.join(`${drive}\\`, ...parentParts);
      /** @type {import("fs").Dirent[]} */
      let subDirs = [];
      try {
        subDirs = fs.readdirSync(parentDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const sub of subDirs) {
        if (!sub.isDirectory()) continue;
        const withBin = path.join(parentDir, sub.name, "bin", binName);
        if (isFile(withBin)) return withBin;
        const flat = path.join(parentDir, sub.name, binName);
        if (isFile(flat)) return flat;
      }
    }
  }

  return null;
}

/**
 * 随应用分发的内置 ffmpeg（打包后 extraResources / 开发目录 / ffmpeg-static）
 * @param {string} binName
 * @returns {string | null}
 */
function findBundled(binName) {
  /** @type {string[]} */
  const candidates = [];

  // 打包后：extraResources 复制到 resources/ffmpeg/
  try {
    if (process.resourcesPath) {
      candidates.push(path.join(process.resourcesPath, "ffmpeg", binName));
    }
  } catch {
    // ignore
  }

  // 开发态：apps/electron/bin/ffmpeg/（monorepo 新结构）
  candidates.push(path.join(__dirname, "..", "bin", "ffmpeg", binName));

  try {
    const appPath = app?.getAppPath?.();
    if (appPath) {
      candidates.push(path.join(appPath, "bin", "ffmpeg", binName));
      candidates.push(path.join(appPath, "ffmpeg", binName));
    }
  } catch {
    // ignore
  }

  if (binName === FFMPEG_BIN) {
    try {
      // 可选依赖：未安装属于正常情况（下方 try/catch 会吞掉 require 失败），
      // 因此类型层显式抑制「找不到模块」，而不是给它们加 declare module。
      const staticPath = /** @type {unknown} */ (
        // @ts-expect-error ffmpeg-static 是可选依赖，可能未安装
        require("ffmpeg-static")
      );
      if (typeof staticPath === "string") candidates.push(staticPath);
    } catch {
      // ffmpeg-static 未安装
    }
  } else {
    try {
      const staticProbe = /** @type {{ path?: unknown } | null} */ (
        // @ts-expect-error ffprobe-static 是可选依赖，可能未安装
        require("ffprobe-static")
      );
      if (typeof staticProbe?.path === "string") candidates.push(staticProbe.path);
    } catch {
      // ffprobe-static 未安装
    }
  }

  for (const candidate of candidates) {
    if (isFile(candidate)) return candidate;
  }
  return null;
}

/**
 * 若 ffmpeg 与 ffprobe 同目录，直接取同目录下的可执行文件
 * @param {string | null} ffmpegPath
 * @returns {string | null}
 */
function findProbeNearFfmpeg(ffmpegPath) {
  if (!ffmpegPath) return null;
  const sibling = path.join(path.dirname(ffmpegPath), FFPROBE_BIN);
  return isFile(sibling) ? sibling : null;
}

/**
 * 解析可用的 ffmpeg / ffprobe：
 * 优先用户手动指定 → 系统 PATH → 常见安装位置 → 应用内置。
 * 结果按 manualFfmpegPath 缓存，避免每次任务都重新扫描磁盘。
 * @type {Map<string, ResolvedTools>}
 */
const resolveCache = new Map();

/**
 * @param {string | null | undefined} [manualFfmpegPath]
 * @returns {ResolvedTools}
 */
function resolveTools(manualFfmpegPath) {
  const cacheKey = manualFfmpegPath || "";
  const cached = resolveCache.get(cacheKey);
  if (cached) return cached;

  /** @type {string | null} */
  let ffmpegPath = null;
  /** @type {FfmpegSource} */
  let source = null;

  if (typeof manualFfmpegPath === "string" && isFile(manualFfmpegPath)) {
    ffmpegPath = manualFfmpegPath;
    source = "manual";
  }

  if (!ffmpegPath) {
    ffmpegPath = findInSystemPath(FFMPEG_BIN);
    if (ffmpegPath) source = "path";
  }

  if (!ffmpegPath) {
    ffmpegPath = findInCommonLocations(FFMPEG_BIN);
    if (ffmpegPath) source = "common";
  }

  if (!ffmpegPath) {
    ffmpegPath = findBundled(FFMPEG_BIN);
    if (ffmpegPath) source = "bundled";
  }

  let ffprobePath = findProbeNearFfmpeg(ffmpegPath);
  if (!ffprobePath) {
    ffprobePath =
      findInSystemPath(FFPROBE_BIN) ||
      findInCommonLocations(FFPROBE_BIN) ||
      findBundled(FFPROBE_BIN);
  }

  const result = { ffmpegPath, ffprobePath, source };
  resolveCache.set(cacheKey, result);
  return result;
}

module.exports = {
  resolveTools,
  FFMPEG_BIN,
  FFPROBE_BIN,
};
