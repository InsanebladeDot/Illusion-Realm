/**
 * 构建产物新鲜度自检：冒烟脚本跑的是静态导出 `apps/next/out`，不是源码。
 *
 * 为什么必须有这道自检：`out` 陈旧时冒烟会给出**误导性的红灯**。本轮就真遇到过 ——
 * 「高度过渡没有中间帧」这条断言失败，重建之后同一条断言通过，那是旧产物而不是代码回归
 * （`pnpm check` 不构建，所以它不会帮你发现这件事）。让人反复怀疑自己刚写的代码，
 * 是最贵的一种假信号；宁可在这里响亮地拦住。
 *
 * 判定分两档，先权威后启发式：
 *   1. **指纹档（权威）**：构建时由 `scripts/record-build-fingerprint.js` 把当时源码目录的
 *      逐文件 sha256 记到 `apps/next/.next/build-fingerprint.json`；自检时重算并比对，
 *      逐个文件能说出「谁变了」。内容比对不受 `git checkout/stash` 改写 mtime 的干扰。
 *   2. **mtime 档（启发式兜底）**：还没有指纹文件时（本机制刚落地、或产物是旧流程构建的），
 *      退回比较源码目录里最新的 mtime 与 `.next/BUILD_ID`（构建标记）。这一档的已知误报是
 *      「只改了 mtime、内容没变」（git 操作就是如此）—— 此时按它说的重建一次即可消除，
 *      方向上是安全的（宁可多构建一次，也不要把陈旧产物当回归）。
 *      mtime 档判为「新」时顺手补记一次指纹，此后就走权威档。
 *
 * 为什么不能只用 `.next/BUILD_ID`：它只证明「构建发生过」，证明不了「构建的是当前这份源码」。
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..", "..");
const NEXT_DIR = path.join(REPO_ROOT, "apps", "next");
const EXPORT_DIR = path.join(NEXT_DIR, "out");
const RECORD_FILE = path.join(NEXT_DIR, ".next", "build-fingerprint.json");
const BUILD_ID_FILE = path.join(NEXT_DIR, ".next", "BUILD_ID");
const RECORD_VERSION = 1;

/** 影响渲染进程产物的源码树 */
const SOURCE_TREES = ["apps/next/src", "apps/next/public", "packages/shared/src"];

/**
 * 子包根目录里「自动纳入」的构建输入：按后缀收，避免靠人记着往清单里加。
 * 只取代码/配置后缀（不取 md），否则改一篇文档也会喊「产物过期」，喊多了就没人看了。
 */
const SOURCE_PACKAGE_ROOTS = ["apps/next", "packages/shared"];
const AUTO_INCLUDE_SUFFIXES = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json", ".yml", ".yaml"];

/**
 * **构建期生成的文件**必须排除：它们会自己变，放进指纹就会产生「永久假过期」。
 * 实测踩到：`apps/next/next-env.d.ts` 由 Next 自动重写（它落在 `apps/next/` 根目录、
 * 后缀又正好是 `.ts`），于是**没有任何源码改动的两次冒烟都会以 exit 2 收场** ——
 * 这正是「天天喊狼来了，然后被人关掉」的那种门禁。
 * 判定原则：**只要一个文件是构建工具写出来的，它就不是构建输入。**
 */
const GENERATED_FILE_NAMES = new Set(["next-env.d.ts", "tsconfig.tsbuildinfo"]);

/**
 * 跨包 / 工作区级别的构建输入：这些没法从子包目录推出来，必须显式列。
 * 缺文件会**响亮失败**（见 `missingExplicitInputs`）—— 清单腐烂比漏文件更危险。
 */
const SOURCE_FILES = [
  "tsconfig.base.json",
  "pnpm-lock.yaml",
  /**
   * `logs.md` 是**构建输入**：`scripts/sync-changelog.mjs` 在 build 前把它复制成
   * `apps/next/public/changelog.md`，再进入静态导出。漏掉它就会出现
   * 「改了 logs.md、指纹却说产物是新的」这种假绿 —— 而「更新」页读的正是那份产物。
   * 两条防线：① 它在清单里；② 下面还有一条「副本必须与源一致」的不变量。
   */
  "logs.md",
];

/** 生成物与其源文件的一致性不变量（比手工清单更难腐烂） */
const GENERATED_PAIRS = [
  { generated: "apps/next/public/changelog.md", source: "logs.md", generator: "scripts/sync-changelog.mjs" },
];

/** 这些目录即使落在源码树里也不参与指纹（构建产物 / 依赖） */
const IGNORED_DIRS = new Set(["node_modules", ".next", "out"]);

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function walkTree(absoluteDir, collected) {
  let entries;
  try {
    entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
  } catch {
    return collected;
  }
  for (const entry of entries) {
    const absolute = path.join(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      walkTree(absolute, collected);
    } else if (entry.isFile()) {
      collected.push(absolute);
    }
  }
  return collected;
}

/** 列出参与指纹的全部文件（相对仓库根的 posix 路径，已排序） */
function collectSourceFiles() {
  const absolute = [];
  for (const tree of SOURCE_TREES) walkTree(path.join(REPO_ROOT, tree), absolute);
  for (const root of SOURCE_PACKAGE_ROOTS) {
    // 只取子包根目录这一层的文件：更深的内容已由 SOURCE_TREES 覆盖
    for (const entry of fs.readdirSync(path.join(REPO_ROOT, root), { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (GENERATED_FILE_NAMES.has(entry.name)) continue;
      if (!AUTO_INCLUDE_SUFFIXES.includes(path.extname(entry.name))) continue;
      absolute.push(path.join(REPO_ROOT, root, entry.name));
    }
  }
  for (const file of SOURCE_FILES) {
    const target = path.join(REPO_ROOT, file);
    if (fs.existsSync(target)) absolute.push(target);
  }
  return [...new Set(absolute)]
    .map((item) => toPosix(path.relative(REPO_ROOT, item)))
    .sort();
}

/** 显式清单里不存在的文件：清单腐烂时响亮失败，而不是悄悄少算 */
function missingExplicitInputs() {
  return SOURCE_FILES.filter((file) => !fs.existsSync(path.join(REPO_ROOT, file)));
}

/**
 * 生成物 ↔ 源文件一致性：`changelog.md` 是 `logs.md` 的构建期副本，
 * 两者不一致就说明导出用的是旧的更新日志（典型是被单独改过或没重建）。
 */
function generatedPairsOutOfSync() {
  const drifted = [];
  for (const pair of GENERATED_PAIRS) {
    const generatedPath = path.join(REPO_ROOT, pair.generated);
    const sourcePath = path.join(REPO_ROOT, pair.source);
    if (!fs.existsSync(generatedPath) || !fs.existsSync(sourcePath)) continue;
    if (hashFile(pair.generated) !== hashFile(pair.source)) {
      drifted.push({ ...pair });
    }
  }
  return drifted;
}

function hashFile(relativePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(REPO_ROOT, relativePath)))
    .digest("hex");
}

/**
 * 工具链指纹：**可追溯用，不参与「是否过期」的判定**。
 *
 * 为什么需要：指纹只覆盖源码，所以避开了 Next 产物里的构建时间戳 / 随机 BUILD_ID；
 * 但反过来也意味着「源码没变、只升级了 Electron / Next / loader」这类变化如果不在指纹里，
 * 就完全不可追溯。锁文件内容其实已在指纹范围内（`pnpm-lock.yaml` 显式列入），
 * 这里额外把它的 hash 与关键版本单独记一份，让「这次过期是代码改的还是依赖换的」一眼可辨。
 */
function computeToolchain() {
  const readJson = (relativePath) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8"));
    } catch {
      return {};
    }
  };
  const versionOf = (relativePath, packageName) => {
    const pkg = readJson(relativePath);
    return (
      pkg.dependencies?.[packageName] ??
      pkg.devDependencies?.[packageName] ??
      "unknown"
    );
  };
  return {
    lockfileHash: fs.existsSync(path.join(REPO_ROOT, "pnpm-lock.yaml"))
      ? hashFile("pnpm-lock.yaml")
      : "missing",
    versions: {
      electron: versionOf("apps/electron/package.json", "electron"),
      next: versionOf("apps/next/package.json", "next"),
      react: versionOf("apps/next/package.json", "react"),
    },
  };
}

/** 当前源码的逐文件指纹 + 汇总指纹 */
function computeFingerprint() {
  const files = collectSourceFiles();
  const hashes = {};
  for (const file of files) hashes[file] = hashFile(file);
  const summary = crypto
    .createHash("sha256")
    .update(files.map((file) => `${file}:${hashes[file]}`).join("\n"))
    .digest("hex");
  return { files: hashes, summary, fileCount: files.length, toolchain: computeToolchain() };
}

/** 构建收尾时调用：把当前源码指纹落盘，作为下次自检的权威基准 */
function recordBuildFingerprint({ quiet = false, fingerprint = null } = {}) {
  const computed = fingerprint ?? computeFingerprint();
  fs.mkdirSync(path.dirname(RECORD_FILE), { recursive: true });
  fs.writeFileSync(
    RECORD_FILE,
    `${JSON.stringify(
      {
        version: RECORD_VERSION,
        recordedAt: new Date().toISOString(),
        fileCount: computed.fileCount,
        summary: computed.summary,
        toolchain: computed.toolchain ?? null,
        files: computed.files,
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  if (!quiet) {
    console.log(
      `[build-fingerprint] 已记录源码指纹：${computed.fileCount} 个文件 / ${computed.summary.slice(0, 12)}`
    );
  }
  return computed;
}

function readRecord() {
  try {
    const record = JSON.parse(fs.readFileSync(RECORD_FILE, "utf8"));
    if (record.version !== RECORD_VERSION || !record.files) return null;
    return record;
  } catch {
    return null;
  }
}

/** 逐文件比对，返回变化清单（新增 / 删除 / 内容变化） */
function diffAgainstRecord(record, fingerprint) {
  const changed = [];
  for (const [file, hash] of Object.entries(fingerprint.files)) {
    if (!(file in record.files)) changed.push(`${file}（新增）`);
    else if (record.files[file] !== hash) changed.push(`${file}（内容已变）`);
  }
  for (const file of Object.keys(record.files)) {
    if (!(file in fingerprint.files)) changed.push(`${file}（已删除）`);
  }
  return changed;
}

function newestSourceFiles(limit = 8) {
  return collectSourceFiles()
    .map((file) => ({ file, mtime: fs.statSync(path.join(REPO_ROOT, file)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit);
}

/** 过期原因里补一句「是不是依赖也变了」，便于一眼分清代码改动与工具链变更 */
function toolchainNote(record, fingerprint) {
  const before = record.toolchain ?? null;
  const now = fingerprint.toolchain ?? null;
  if (!before || !now) return "（本次记录没有工具链字段，无法判断依赖是否变化）";
  const changes = [];
  if (before.lockfileHash !== now.lockfileHash) changes.push("依赖锁文件");
  for (const [name, version] of Object.entries(now.versions)) {
    if (before.versions?.[name] !== version) {
      changes.push(`${name} ${before.versions?.[name] ?? "?"} → ${version}`);
    }
  }
  return changes.length === 0
    ? "（依赖与关键版本未变，属源码改动）"
    : `（工具链也有变化：${changes.join(" / ")}）`;
}

/**
 * 自检结果：
 *   { ok, mode, detail, changed[] }
 * mode: "record"（内容比对通过）/ "record-stale" / "mtime"（启发式通过）/
 *       "mtime-stale" / "no-export"（产物不存在）
 */
function checkBuildFreshness() {
  if (!fs.existsSync(path.join(EXPORT_DIR, "index.html"))) {
    return {
      ok: false,
      mode: "no-export",
      detail: `静态导出目录不存在或不完整：${EXPORT_DIR}`,
      changed: [],
    };
  }

  /** 清单腐烂：显式列出的构建输入不见了 —— 先报这个，否则后面全是假绿 */
  const missing = missingExplicitInputs();
  if (missing.length > 0) {
    return {
      ok: false,
      mode: "input-list-rot",
      detail: `指纹清单里显式声明的构建输入不存在：${missing.join(" / ")}`,
      changed: missing,
    };
  }

  /** 生成物与源文件不一致：与「源码有没有变」正交，单独一条判据 */
  const drifted = generatedPairsOutOfSync();
  if (drifted.length > 0) {
    const fixHint = drifted
      .map((pair) => `  → 运行 pnpm build:next（内含 ${pair.generator}）后重跑；只改文档时也必须重建`)
      .join("\n");
    return {
      ok: false,
      mode: "generated-drift",
      detail:
        drifted
          .map((pair) => `${pair.generated} 与 ${pair.source} 内容不一致（应由 ${pair.generator} 生成）`)
          .join("；") + `\n${fixHint}`,
      changed: drifted.map((pair) => pair.generated),
    };
  }

  const fingerprint = computeFingerprint();
  const record = readRecord();

  if (record) {
    const changed = diffAgainstRecord(record, fingerprint);
    if (changed.length === 0) {
      return {
        ok: true,
        mode: "record",
        detail: `内容指纹一致（${fingerprint.fileCount} 个文件，记录于 ${record.recordedAt}）`,
        changed: [],
      };
    }
    return {
      ok: false,
      mode: "record-stale",
      detail:
        `构建基准指纹记录于 ${record.recordedAt}，之后有 ${changed.length} 个文件变化` +
        toolchainNote(record, fingerprint),
      changed,
    };
  }

  // 指纹档缺档：退回 mtime 启发式
  const markerFile = fs.existsSync(BUILD_ID_FILE) ? BUILD_ID_FILE : path.join(EXPORT_DIR, "index.html");
  const markerTime = fs.statSync(markerFile).mtimeMs;
  const newer = collectSourceFiles()
    .map((file) => ({ file, mtime: fs.statSync(path.join(REPO_ROOT, file)).mtimeMs }))
    .filter((item) => item.mtime > markerTime)
    .sort((a, b) => b.mtime - a.mtime);

  if (newer.length === 0) {
    // 启发式判定为「新」：顺手补记指纹，此后走内容比对的权威档
    try {
      recordBuildFingerprint({ quiet: true });
    } catch {
      /* 补记失败不影响本次结论 */
    }
    return {
      ok: true,
      mode: "mtime",
      detail:
        `无指纹记录，按 mtime 启发式判定为当前构建（构建标记 ${new Date(markerTime).toISOString()}）；` +
        `已补记指纹，此后按内容比对`,
      changed: [],
    };
  }

  return {
    ok: false,
    mode: "mtime-stale",
    detail:
      `无指纹记录，且 ${newer.length} 个源码文件比构建标记更新` +
      `（构建标记 ${new Date(markerTime).toISOString()}，最新源码 ${new Date(newer[0].mtime).toISOString()}）`,
    changed: newer.map((item) => item.file),
  };
}

module.exports = {
  EXPORT_DIR,
  RECORD_FILE,
  SOURCE_TREES,
  SOURCE_FILES,
  checkBuildFreshness,
  collectSourceFiles,
  computeFingerprint,
  generatedPairsOutOfSync,
  missingExplicitInputs,
  newestSourceFiles,
  recordBuildFingerprint,
};
