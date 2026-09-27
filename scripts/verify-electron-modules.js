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
