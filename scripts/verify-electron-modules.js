/**
 * Electron 主进程模块加载验证：
 * 逐个 require 主进程模块并断言导出成员存在，防止 ESM/CJS 混用导致
 * 主进程启动即崩（表现为所有 IPC 都 "No handler registered"）。
 *
 * 运行：npx electron scripts/verify-electron-modules.js
 */
const results = [];
function check(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

/**
 * 主进程模块只能依赖：Node 内置模块、相对路径模块、package.json 的 dependencies。
 * 依赖 devDependencies / 传递依赖（例如 axios 只是 wait-on 的依赖）时，
 * electron-builder 不会把它打进 asar —— 打包后启动即报 Cannot find module。
 */
function auditMainProcessRequires() {
  const fs = require("node:fs");
  const path = require("node:path");
  const { builtinModules } = require("node:module");

  /**
   * 允许的可选模块：它们不在 dependencies 里（因此不会被打进 asar），
   * 但代码里是**包在 try/catch 内**的兜底查找（找不到就用 extraResources 里的内置 ffmpeg），
   * 模块本身能正常加载即证明这层兜底有效（见下面的 locate 检查）。
   */
  const OPTIONAL_MODULES = new Set(["ffmpeg-static", "ffprobe-static"]);

  const electronDir = path.join(__dirname, "..", "apps", "electron");
  // 审计对象是主进程源码，因此依赖白名单必须来自**主进程自己的 package.json**
  // （monorepo 迁移后运行时依赖声明在 apps/electron/package.json，而非工作区根）
  const pkg = JSON.parse(
    fs.readFileSync(path.join(electronDir, "package.json"), "utf8")
  );
  const allowed = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...OPTIONAL_MODULES,
    "electron",
    ...builtinModules,
    ...builtinModules.map((name) => `node:${name}`),
  ]);

  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js")) files.push(full);
    }
  };
  walk(electronDir);

  const offenders = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) {
      const request = match[1];
      if (request.startsWith(".") || request.startsWith("/")) continue;
      const bare = request.startsWith("@")
        ? request.split("/").slice(0, 2).join("/")
        : request.split("/")[0];
      if (allowed.has(bare)) continue;
      offenders.push(`${path.relative(electronDir, file)} → ${bare}`);
    }
  }

  check(
    "主进程 require 的第三方模块都在 dependencies 里（打包后不会缺模块）",
    offenders.length === 0,
    offenders.length ? offenders.join(", ") : `${files.length} 个文件检查通过`
  );
}

auditMainProcessRequires();

/**
 * 主进程与 packages/shared 的 IPC 通道表必须一一对应：
 * - 两端都有、值相同 → 通过；
 * - 任一端的值缺失于另一端 → 失败（渲染进程 invoke 一个主进程没注册的通道会静默挂起）。
 * 主进程是手写 CommonJS、运行期解析不到 @illusion-realm/shared，所以只能靠这条断言防漂移。
 */
function auditChannelConstants() {
  const fs = require("node:fs");
  const path = require("node:path");

  const readConstants = (filePath, pattern) => {
    const source = fs.readFileSync(filePath, "utf8");
    const found = new Map();
    for (const match of source.matchAll(pattern)) {
      found.set(match[1], match[2]);
    }
    return found;
  };

  const mainChannels = readConstants(
    path.join(__dirname, "..", "apps", "electron", "ipcChannels.js"),
    /^\s{2}([A-Z0-9_]+):\s*"([^"]+)"/gm
  );
  const sharedChannels = readConstants(
    path.join(__dirname, "..", "packages", "shared", "src", "ipc-channels.ts"),
    /^\s{2}([A-Z0-9_]+):\s*'([^']+)'/gm
  );

  const missingInShared = [...mainChannels.keys()].filter((key) => !sharedChannels.has(key));
  const missingInMain = [...sharedChannels.keys()].filter((key) => !mainChannels.has(key));
  const valueMismatch = [...mainChannels.entries()]
    .filter(([key, value]) => sharedChannels.has(key) && sharedChannels.get(key) !== value)
    .map(([key, value]) => `${key}: main=${value} shared=${sharedChannels.get(key)}`);

  const problems = [
    ...missingInShared.map((key) => `shared 缺少 ${key}`),
    ...missingInMain.map((key) => `主进程缺少 ${key}`),
    ...valueMismatch,
  ];

  check(
    "主进程 ipcChannels.js 与 shared/ipc-channels.ts 通道表一致",
    problems.length === 0,
    problems.length
      ? problems.join(", ")
      : `${mainChannels.size} 个通道两端一致`
  );
}

auditChannelConstants();

/**
 * Agent 默认配置两端一致。
 *
 * 与通道表同一套理由：主进程是手写 CommonJS、运行期解析不到 @illusion-realm/shared，
 * 所以 `apps/electron/agent/defaults.js` 只能保留同值副本 —— 副本漂移的症状是
 * 「界面上写 8 步、实际跑了 12 步」这类没人会联想到的偏差，必须机检。
 */
function auditAgentDefaults() {
  const fs = require("node:fs");
  const path = require("node:path");

  const mainDefaults = require(
    path.join(__dirname, "..", "apps", "electron", "agent", "defaults.js")
  ).AGENT_DEFAULTS;
  const sharedSource = fs.readFileSync(
    path.join(__dirname, "..", "packages", "shared", "src", "data", "agent.ts"),
    "utf8"
  );
  // 只取 AGENT_DEFAULTS 那一段：文件里还有 AGENT_ENV_KEYS（同样是 2 空格缩进的字符串）
  const block = sharedSource.slice(sharedSource.indexOf("export const AGENT_DEFAULTS"));

  const readSharedString = (key) => {
    const matched = block.match(new RegExp(`^ {2}${key}:\\s*"([^"]+)"`, "m"));
    return matched ? matched[1] : null;
  };
  const sharedMaxSteps = Number((block.match(/^ {2}maxSteps:\s*(\d+)/m) || [])[1]);

  const problems = [];
  for (const key of ["baseUrl", "model", "permission"]) {
    const shared = readSharedString(key);
    if (shared !== mainDefaults[key]) {
      problems.push(`${key}: main=${mainDefaults[key]} shared=${shared}`);
    }
  }
  if (!Number.isFinite(sharedMaxSteps) || sharedMaxSteps !== mainDefaults.maxSteps) {
    problems.push(`maxSteps: main=${mainDefaults.maxSteps} shared=${sharedMaxSteps}`);
  }

  check(
    "主进程 agent/defaults.js 与 shared/data/agent.ts 默认配置一致",
    problems.length === 0,
    problems.length ? problems.join(", ") : `4 个字段一致（${mainDefaults.model}）`
  );
}

auditAgentDefaults();

/**
 * Agent 密钥的存储契约（`apps/electron/agent/secret.js`）。
 *
 * 为什么值得单独断言：这里的每一条都对应一个**只有打包 / 换机器才暴露**的坑 ——
 *   · 密钥只能进主进程：状态摘要里不许出现原值（泄露一次就是永久泄露）；
 *   · 落盘要么是系统加密，要么**显式标记** plain（静默降级 = 用户以为加密了）；
 *   · 环境变量优先于存储（`.env` 是开发测试路径，临时覆盖 / CI 靠它）；
 *   · 清除要真的把文件删掉（否则"清掉密钥"只是界面上看不见）。
 * 目录可注入，所以整段跑在临时目录里，**不碰真实用户数据**。
 */
function auditAgentSecret() {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const secret = require(
    path.join(__dirname, "..", "apps", "electron", "agent", "secret.js")
  );

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-secret-test-"));
  const previousEnv = process.env.ILLUSION_AGENT_API_KEY;
  try {
    check(
      "密钥：没写过 = 未配置",
      secret.describeSecret(dir).configured === false && secret.readSecret(dir) === null
    );

    const saved = secret.writeSecret("sk-test-1234abcd", dir);
    check(
      "密钥：写入后状态是已配置（source=stored）",
      saved.configured === true && saved.source === "stored",
      JSON.stringify(saved)
    );
    check(
      "密钥：状态里只有尾 4 位，没有原值",
      saved.tail === "abcd" && !JSON.stringify(saved).includes("sk-test"),
      JSON.stringify(saved)
    );
    check(
      "密钥：主进程侧能读回原文",
      secret.readSecret(dir)?.key === "sk-test-1234abcd"
    );

    /**
     * 落盘形态：有系统加密就不许出现明文；没有加密能力则必须把 `plain` 写进文件 ——
     * 两种都算通过，但"既没加密又没标记"是失败（那是最糟的一种：谁都不知道它是明文）。
     */
    const raw = fs.readFileSync(secret.secretFilePath(dir), "utf8");
    const document = JSON.parse(raw);
    const plainMarkerOk =
      document.protection === "plain" &&
      raw.includes(Buffer.from("sk-test-1234abcd", "utf8").toString("base64"));
    const encryptedOk =
      document.protection === "safeStorage" && !raw.includes("sk-test-1234abcd");
    check(
      "密钥：加密落盘（或有 plain 标记的明文兜底）",
      plainMarkerOk || encryptedOk,
      `protection=${document.protection}`
    );

    process.env.ILLUSION_AGENT_API_KEY = "sk-from-env-0000";
    check(
      "密钥：环境变量优先于存储（.env 是开发测试路径）",
      secret.resolveApiKey(dir).source === "env" &&
        secret.describeSecret(dir).source === "env"
    );
    // 顺带钉住 runner 确实走的是这个模块，而不是自己再去读一遍环境变量
    const runner = require(
      path.join(__dirname, "..", "apps", "electron", "agent", "runner.js")
    );
    const payload = JSON.parse(runner.buildPayloadLine({ question: "hi" }));
    check(
      "密钥：runner 组装 payload 时注入的是这份密钥",
      payload.config.apiKey === "sk-from-env-0000"
    );
    check(
      "密钥：payload 里同时带着宿主工具声明（两者互不覆盖）",
      Array.isArray(payload.config.hostTools) && payload.config.hostTools.length > 0
    );
    /**
     * 清除前必须把环境变量撤掉：`describeSecret` 是**环境变量优先**的，
     * 留着它的话"清完还是已配置"——那测的是环境变量，不是清除（本断言第一版就踩了）。
     */
    delete process.env.ILLUSION_AGENT_API_KEY;
    const cleared = secret.clearSecret(dir);
    check(
      "密钥：清除后回到未配置且文件已删",
      cleared.configured === false && !fs.existsSync(secret.secretFilePath(dir))
    );
    /**
     * 「落盘形态必须等于平台事实」这条只是把上面那条钉得更紧：`plain` 分支在
     * 拿不到加密能力的机器上是**合法**的，所以不能断言"一定是密文"。
     */
    const { app, safeStorage } = require("electron");
    check(
      "密钥：落盘形态与 safeStorage 可用性一致",
      document.protection ===
        (safeStorage.isEncryptionAvailable() ? "safeStorage" : "plain")
    );
    /**
     * **这段断言必须跑在 app ready 之后**：实测 ready 前
     * `safeStorage.isEncryptionAvailable()` 恒为 false，于是"加密"这条分支永远测不到、
     * 还会让真实产品在 ready 前写入时静默落明文。这条把调用位置本身钉住。
     */
    check("密钥：断言跑在 app ready 之后", app.isReady() === true);
  } finally {
    if (previousEnv === undefined) delete process.env.ILLUSION_AGENT_API_KEY;
    else process.env.ILLUSION_AGENT_API_KEY = previousEnv;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * 打包白名单覆盖断言。
 *
 * electron-builder.yml 的 files 是**手写白名单**：首条排除表达式（感叹号 + 通配）
 * 先排除一切，再逐条把要收的收回来。于是「新增一个主进程子目录、忘了加白名单」这类遗漏
 * 在 dev 下完全正常（源码就在那儿），只在**打包后**暴露 —— 症状是双击 exe
 * 弹出 "Cannot find module './agent/env'"，而此时开发者早就忘了改过什么
 * （2026-09-27 的 agent/ 漏收就是这么来的）。
 *
 * 这里把「主进程真正 require 到的相对路径」逐个解析到磁盘文件，
 * 再拿白名单 glob 去匹配，把漏收从「用户双击才知道」提前到 check 期。
 */
function auditBuilderFileCoverage() {
  const fs = require("node:fs");
  const path = require("node:path");

  const electronDir = path.join(__dirname, "..", "apps", "electron");
  const builderConfig = fs.readFileSync(
    path.join(electronDir, "electron-builder.yml"),
    "utf8"
  );

  // files: 段里的 include 条目（丢弃 '!...' 排除项与注释）
  const filesStart = builderConfig.indexOf("\nfiles:");
  const filesBlock = builderConfig
    .slice(filesStart + 1)
    .split(/\n(?=\S)/)[0];
  const includeGlobs = filesBlock
    .split("\n")
    .map((line) => line.match(/^\s*-\s*['"]?([^'"]+?)['"]?\s*$/)?.[1])
    .filter((glob) => Boolean(glob) && !glob.startsWith("!"));

  // glob → 正则：只支持本配置实际用到的形式（*、**、/**/*）
  const globToRegExp = (pattern) => {
    let out = "";
    for (let index = 0; index < pattern.length; index += 1) {
      const char = pattern[index];
      if (char === "*" && pattern[index + 1] === "*") {
        if (pattern[index + 2] === "/") {
          out += "(?:.*/)?";
          index += 2;
        } else {
          out += ".*";
          index += 1;
        }
      } else if (char === "*") {
        out += "[^/]*";
      } else {
        out += char.replace(/[.+^${}()|[\]\\?]/, "\\$&");
      }
    }
    return new RegExp(`^${out}$`);
  };
  const inclusionMatchers = includeGlobs.map(globToRegExp);

  const RESOLVE_SUFFIXES = ["", ".js", ".json", "/index.js"];
  const resolveRelative = (fromFile, request) => {
    const base = path.resolve(path.dirname(fromFile), request);
    for (const suffix of RESOLVE_SUFFIXES) {
      const candidate = base + suffix;
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
    return null;
  };

  // 从入口出发做可达性遍历：main.js 是 package.json 的入口，preload 由窗口加载
  const entries = ["main.js", "preload.js"].map((name) => path.join(electronDir, name));
  const visited = new Set();
  const queue = [...entries];
  const unreachable = [];

  while (queue.length > 0) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    visited.add(file);

    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/require\(\s*["'](\.[^"']+)["']\s*\)/g)) {
      const resolved = resolveRelative(file, match[1]);
      if (!resolved) {
        unreachable.push(`${path.relative(electronDir, file)} → ${match[1]}`);
        continue;
      }
      if (!visited.has(resolved)) queue.push(resolved);
    }
  }

  const uncovered = [];
  for (const file of visited) {
    const relative = path.relative(electronDir, file).split(path.sep).join("/");
    // node_modules 走单独一条白名单（workspace 依赖），交给 electron-builder 自己解析
    if (relative.startsWith("node_modules/")) continue;
    if (inclusionMatchers.some((matcher) => matcher.test(relative))) continue;
    uncovered.push(relative);
  }

  const problems = [
    ...uncovered.map((file) => `${file} 不在 files 白名单内（打包后 Cannot find module）`),
    ...unreachable.map((entry) => `${entry} 解析不到磁盘文件`),
  ];
  check(
    "主进程可达模块都被 electron-builder.yml 的 files 白名单覆盖",
    problems.length === 0,
    problems.length ? problems.join(", ") : `${visited.size} 个模块全覆盖（白名单 ${includeGlobs.join(" ")}）`
  );
}

auditBuilderFileCoverage();

function loadModule(label, modulePath) {
  try {
    return require(modulePath);
  } catch (error) {
    check(`${label} 可加载`, false, error.message);
    return null;
  }
}

// ---- appProtocol ----
const appProtocol = loadModule("appProtocol", "../apps/electron/appProtocol");
if (appProtocol) {
  check("appProtocol 可加载", true);
  check(
    "appProtocol.registerAppProtocol",
    typeof appProtocol.registerAppProtocol === "function"
  );
}

// ---- comfyProxy ----
const comfyProxy = loadModule("comfyProxy", "../apps/electron/comfyProxy");
if (comfyProxy) {
  check("comfyProxy 可加载", true);
  for (const name of ["generateWithComfy", "uploadImageToComfy", "listComfyModels"]) {
    check(`comfyProxy.${name}`, typeof comfyProxy[name] === "function");
  }

  // 下载 /view 的候选参数：历史记录里的 filename/subfolder/type 不规整时的兜底
  if (typeof comfyProxy.buildViewCandidates === "function") {
    const plain = comfyProxy.buildViewCandidates({
      filename: "Anima_00001_.png",
      subfolder: "",
      type: "output",
    });
    check("下载候选：规整条目第一个即为原样参数",
      plain[0].filename === "Anima_00001_.png" && plain[0].subfolder === "" &&
        plain[0].type === "output",
      JSON.stringify(plain[0]));
    check("下载候选：覆盖 output / temp / input 三种 type",
      new Set(plain.map((item) => item.type)).size === 3,
      plain.map((item) => item.type).join(", "));

    const nested = comfyProxy.buildViewCandidates({
      filename: "sub\\dir\\Anima_00001_.png",
      subfolder: "",
      type: "output",
    });
    check("下载候选：filename 内带子目录时会拆出 subfolder",
      nested.some((item) => item.filename === "Anima_00001_.png" && item.subfolder === "sub/dir"),
      JSON.stringify(nested.slice(0, 3)));

    const backslash = comfyProxy.buildViewCandidates({
      filename: "Anima_00001_.png",
      subfolder: "SDXL\\styles",
      type: "temp",
    });
    check("下载候选：subfolder 反斜杠会被换成正斜杠，且原 type 优先",
      backslash[0].type === "temp" &&
        backslash.some((item) => item.subfolder === "SDXL/styles"),
      JSON.stringify(backslash.slice(0, 3)));

    // 历史记录解析：必须保留 ComfyUI 的文件夹类型（temp / output），否则下载必 404
    const collected = comfyProxy.collectOutputFiles({
      outputs: {
        "12": { images: [{ filename: "SDXL_00001_.png", subfolder: "", type: "output" }] },
        "13": { images: [{ filename: "SDXL_00002_.png", subfolder: "sub", type: "temp" }] },
      },
    });
    check("历史输出解析保留 type（SaveImage=output / PreviewImage=temp）",
      collected.length === 2 &&
        collected[0].type === "output" && collected[1].type === "temp",
      collected.map((item) => `${item.filename}:${item.type}`).join(", "));
    check("temp 类型的文件下载候选第一项就是 type=temp",
      comfyProxy.buildViewCandidates(collected[1])[0].type === "temp",
      JSON.stringify(comfyProxy.buildViewCandidates(collected[1])[0]));
  }
}

// ---- generatedImages ----
const generatedImages = loadModule("generatedImages", "../apps/electron/generatedImages");
if (generatedImages) {
  check("generatedImages 可加载", true);
  for (const name of [
    "listGeneratedImages",
    "listOutputFolders",
    "createHistoryFolder",
    "resolveExistingGeneratedImagePath",
    "saveImageToFile",
    "renameGeneratedImage",
    "moveImagesToFolder",
    "previewDeleteHistoryFolder",
    "deleteHistoryFolder",
    "deleteGeneratedImages",
    "legacySidecarPathForImage",
    "isImageFile",
  ]) {
    check(`generatedImages.${name}`, typeof generatedImages[name] === "function");
  }
  // 生成参数只存在于图片内嵌 Meta，主进程不再提供 readGenerationMeta
  check("generatedImages 不再导出 readGenerationMeta",
    typeof generatedImages.readGenerationMeta === "undefined");
}

// ---- modelScanner ----
const modelScanner = loadModule("modelScanner", "../apps/electron/modelScanner");
if (modelScanner) {
  check(
    "modelScanner.scanModelsInDirectory",
    typeof modelScanner.scanModelsInDirectory === "function"
  );
}

// ---- userData ----
const userData = loadModule("userData", "../apps/electron/userData");
if (userData) {
  for (const name of ["readUserData", "writeUserData", "getDefaultUserDataPath"]) {
    check(`userData.${name}`, typeof userData[name] === "function");
  }
}

// ---- outputPaths ----
const outputPaths = loadModule("outputPaths", "../apps/electron/outputPaths");
if (outputPaths) {
  for (const name of ["getDefaultOutputPath", "resolveOutputPath", "ensureDirectory", "ensureUniqueFilePath"]) {
    check(`outputPaths.${name}`, typeof outputPaths[name] === "function");
  }
}

// ---- 导出不覆盖同名文件 ----
if (outputPaths?.ensureUniqueFilePath) {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "unique-path-test-"));
  const target = path.join(dir, "导出.mp4");
  check("不存在的文件名保持不变", outputPaths.ensureUniqueFilePath(target) === target);
  fs.writeFileSync(target, "x");
  const second = outputPaths.ensureUniqueFilePath(target);
  check("同名文件自动追加 (2)", second === path.join(dir, "导出 (2).mp4"), path.basename(second));
  fs.writeFileSync(second, "x");
  const third = outputPaths.ensureUniqueFilePath(target);
  check("再次冲突追加 (3)", third === path.join(dir, "导出 (3).mp4"), path.basename(third));
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---- ffmpeg 模块 ----
const ffmpegIpc = loadModule("ffmpeg/index", "../apps/electron/ffmpeg");
if (ffmpegIpc) {
  check(
    "ffmpeg.registerVideoToolIpc",
    typeof ffmpegIpc.registerVideoToolIpc === "function"
  );
}

const locate = loadModule("ffmpeg/locate", "../apps/electron/ffmpeg/locate");
if (locate) {
  check("locate.resolveTools", typeof locate.resolveTools === "function");
}

const jobs = loadModule("ffmpeg/jobs", "../apps/electron/ffmpeg/jobs");
if (jobs) {
  check("jobs.buildEditArgs", typeof jobs.buildEditArgs === "function");
  check("jobs.buildGifArgs", typeof jobs.buildGifArgs === "function");
  check("jobs.startEditJob", typeof jobs.startEditJob === "function");

  // 渲染进程比主进程新时（未重启），必须给出明确提示而不是误报「缺少输入路径」
  let unknownModeMessage = "";
  try {
    jobs.startEditJob({
      ffmpegPath: "no-such-ffmpeg",
      job: { mode: "gif-v2", outputPath: "x.gif" },
      onError: () => {},
    });
  } catch (error) {
    unknownModeMessage = error.message;
  }
  check(
    "未知任务类型提示主进程过旧（而非缺少输入路径）",
    unknownModeMessage.includes("未知的导出类型"),
    unknownModeMessage
  );
}

const probe = loadModule("ffmpeg/probe", "../apps/electron/ffmpeg/probe");
if (probe) {
  check("probe.probeVideo", typeof probe.probeVideo === "function");
}

// ---- 角色库（animadex）主进程模块 ----
const animadex = loadModule("animadex", "../apps/electron/animadex");
if (animadex) {
  check("animadex.registerAnimadexIpc", typeof animadex.registerAnimadexIpc === "function");
  check("animadex.searchCharacters", typeof animadex.searchCharacters === "function");
  check(
    "animadex.ANIMADEX_BASE_URL 指向 animadex API",
    String(animadex.ANIMADEX_BASE_URL ?? "").includes("animadex"),
    String(animadex.ANIMADEX_BASE_URL ?? "")
  );
  check(
    "animadex 不依赖 axios（只用内置 fetch）",
    !require("node:fs")
      .readFileSync(require("node:path").join(__dirname, "..", "apps", "electron", "animadex.js"), "utf8")
      .includes('require("axios")')
  );

  // 归一化：上游多余字段不透传
  if (typeof animadex.normalizeCharacter === "function") {
    const normalized = animadex.normalizeCharacter({
      slug: "x",
      name: "Hatsune Miku",
      copyright_name: "Vocaloid",
      trigger: "hatsune miku",
      tags: ["1girl", 42],
      count: "1234",
      thumb_url: "https://a/b.webp",
      img_url: "https://a/c.webp",
      has_image: 1,
      loras: [{ name: "L", url: "u", thumb: "t" }, null],
      rating: { up: 5, down: 1 },
      fav_count: 9,
      unexpected_field: "should-not-leak",
    });
    check(
      "animadex.normalizeCharacter 过滤非法字段并归一化",
      normalized.slug === "x" && normalized.name === "Hatsune Miku" &&
        normalized.tags.length === 1 && normalized.count === 1234 &&
        normalized.loras.length === 1 && normalized.rating.up === 5 &&
        normalized.unexpected_field === undefined,
      JSON.stringify(normalized)
    );
  }
}

// ---- 真正注册 IPC，并验证 handler 存在 ----
const { ipcMain } = require("electron");
const { registerModelDownloadHandlers } = require("../apps/electron/ipc-handlers/model-download.handlers");
try { registerModelDownloadHandlers(); check("registerModelDownloadHandlers() 调用不抛错", true); }
catch (error) { check("registerModelDownloadHandlers() 调用不抛错", false, error.message); }
const { registerCivitaiHandlers } = require("../apps/electron/ipc-handlers/civitai.handlers");
const { registerPromptAssistantHandlers } = require("../apps/electron/ipc-handlers/prompt-assistant.handlers");
try { registerPromptAssistantHandlers(); check("registerPromptAssistantHandlers() registers without throwing", true); }
catch (error) { check("registerPromptAssistantHandlers() registers without throwing", false, error.message); }
try { registerCivitaiHandlers(); check("registerCivitaiHandlers() 调用不抛错", true); }
catch (error) { check("registerCivitaiHandlers() 调用不抛错", false, error.message); }

/**
 * Agent 域一并注册：`registerAllIpcHandlers` 在 main.js 里调用，这里单独跑一次，
 * 让下面那圈"通道有没有 handler"能把 agent 的 5 条也覆盖到 ——
 * 没注册的通道表现为渲染进程 `invoke` **永远挂着**（不报错、不超时），最难查。
 */
{
  const { registerAgentHandlers } = require("../apps/electron/ipc-handlers/agent.handlers.js");
  try {
    registerAgentHandlers();
    check("registerAgentHandlers() 调用不抛错", true);
  } catch (error) {
    check("registerAgentHandlers() 调用不抛错", false, error.message);
  }
}

if (ffmpegIpc?.registerVideoToolIpc) {
  try {
    ffmpegIpc.registerVideoToolIpc();
    check("registerVideoToolIpc() 调用不抛错", true);
  } catch (error) {
    check("registerVideoToolIpc() 调用不抛错", false, error.message);
  }
}

if (animadex?.registerAnimadexIpc) {
  try {
    animadex.registerAnimadexIpc(ipcMain);
    check("registerAnimadexIpc() 调用不抛错", true);
  } catch (error) {
    check("registerAnimadexIpc() 调用不抛错", false, error.message);
  }
}

{
  const channels = [
    "models:downloadTarget", "models:downloadStart", "models:downloadCancel", "models:downloadRetry", "models:downloadRemove", "models:downloadList", "models:changeLogo", "models:categoryTarget", "models:moveCategory", "models:batch",
    "civitai:keyStatus", "civitai:keySet", "civitai:keyClear",
    "prompt:transform", "prompt:secretStatus", "prompt:secretSet", "prompt:secretClear",
    "video:ffmpegStatus",
    "video:selectFfmpeg",
    "video:pickVideo",
    "video:pickOutputFolder",
    "video:probe",
    "video:run",
    "video:cancel",
    "view3d:pickModel",
    "view3d:readModelFile",
    "animadex:search",
    // Agent：run/cancel 走事件流；secret* 三条是设置页填密钥的唯一入口
    "agent:run",
    "agent:cancel",
    // 宿主工具：渲染层执行后的回执入口（请求方向 agent:hostCall 是 send，不在此列）
    "agent:hostResult",
    "agent:secretStatus",
    "agent:secretSet",
    "agent:secretClear",
  ];

  for (const channel of channels) {
    let alreadyRegistered = false;
    try {
      // 已注册时再次 handle 会抛 "second handler"，据此判断注册成功
      ipcMain.handle(channel, () => {});
    } catch (error) {
      alreadyRegistered = String(error?.message ?? "").includes("second handler");
    }
    check(`${channel} 已注册 handler`, alreadyRegistered);
  }
}

/**
 * 真实起一个假 ComfyUI，只允许 `type=temp` 下载（对应 PreviewImage 的行为）：
 * 历史里若把文件夹类型报错 / 丢失，就必须靠候选回退把图片取回来 —— 这正是
 * 「SDXL 生成完显示 404」那类问题的回归测试。
 */
void (async () => {
  const http = require("node:http");
  const { app } = require("electron");
  /**
   * 密钥那一段必须等 app ready —— ready 前 `safeStorage.isEncryptionAvailable()` 恒为 false
   * （实测），会让"加密落盘"这条分支静默走成明文兜底，等于没测。
   */
  await app.whenReady();
  auditAgentSecret();

  const TINY_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64"
  );

  if (typeof comfyProxy?.fetchFileDataUrl === "function") {
    const requested = [];
    const server = http.createServer((request, response) => {
      const url = new URL(request.url, "http://127.0.0.1");
      const type = url.searchParams.get("type") ?? "";
      const filename = url.searchParams.get("filename") ?? "";
      requested.push(`${url.searchParams.get("subfolder") || "-"}/${type}`);
      // 只认 SDXL_ 开头且 type=temp 的文件，模拟 PreviewImage 的 temp 目录
      if (url.pathname === "/view" && type === "temp" && filename.startsWith("SDXL_")) {
        response.writeHead(200, { "Content-Type": "image/png" });
        response.end(TINY_PNG);
        return;
      }
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.end("Not found");
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    const address = `127.0.0.1:${port}`;

    try {
      // 1) 类型正确（temp）：一次就命中
      const direct = await comfyProxy.fetchFileDataUrl(address, {
        filename: "SDXL_00001_.png",
        subfolder: "",
        type: "temp",
      });
      check("下载：type 正确时一次取回（不再误用 output → 404）",
        direct.startsWith("data:image/png;base64,") && requested[0] === "-/temp",
        requested.join(" → "));

      // 2) 类型报错（output，实际是 temp）：靠回退取回
      requested.length = 0;
      const fallback = await comfyProxy.fetchFileDataUrl(address, {
        filename: "SDXL_00002_.png",
        subfolder: "",
        type: "output",
      });
      check("下载：类型报错时自动回退到 temp 取回",
        fallback.startsWith("data:image/png;base64,") && requested[0] === "-/output",
        requested.join(" → "));

      // 3) 子目录用反斜杠：同样能回退取回
      requested.length = 0;
      const slashFallback = await comfyProxy.fetchFileDataUrl(address, {
        filename: "SDXL_00003_.png",
        subfolder: "SDXL\\styles",
        type: "output",
      });
      check("下载：subfolder 反斜杠 / 类型都异常时仍能取回",
        slashFallback.startsWith("data:image/png;base64,") && requested.length >= 2,
        requested.join(" → "));

      // 4) 全都 404 时给出带 URL 的可读错误
      let failure = "";
      try {
        await comfyProxy.fetchFileDataUrl(address, {
          filename: "missing.png",
          subfolder: "no-such-dir",
          type: "output",
        });
      } catch (error) {
        failure = error.message;
      }
      check("下载：彻底失败时错误信息带 404 与完整 URL",
        failure.includes("404") && failure.includes("/view?"),
        failure.slice(0, 140));
    } finally {
      server.close();
    }
  }

  const failed = results.filter((ok) => !ok).length;
  console.log(failed === 0 ? "ALL PASS ✓" : `${failed} FAILED ✗`);
  process.exit(failed === 0 ? 0 : 1);
})();
