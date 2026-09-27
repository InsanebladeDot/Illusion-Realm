/**
 * 3D 视角提示词生成器验证（task/任务.md 需求一 / 需求二）
 *
 * 做法：真实渲染进程加载创建页 → 点相机图标打开 3D 弹框，
 * 逐条核对规范里的映射表（按快捷视角与距离滑块给出确定角度），
 * 最后校验「确认并插入」把提示词追加到主提示词框。
 *
 * 运行：npx electron scripts/smoke-view3d.js   （退出码 0 = 通过）
 *
 * 环境变量：
 *   SMOKE_DPR=1.25|1.5   **显示缩放维度**：Windows 缩放 ≠ 100% 时 `devicePixelRatio > 1`。
 *                        3D 画布必须仍然铺满容器、不溢出（默认 dpr=1 时这条是恒真的，
 *                        只有带值跑才算真的测到）—— 见下面「画布几何」两条断言。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createSmokeHarness } = require("./lib/smoke-harness");
const { app, BrowserWindow, dialog, ipcMain: realIpcMain } = require("electron");
const { registerAppProtocol } = require("../apps/electron/appProtocol");
const { registerVideoToolIpc } = require("../apps/electron/ffmpeg");

/**
 * 显示缩放维度：Windows 显示缩放 ≠ 100% 时 `devicePixelRatio > 1`，
 * 而画布尺寸是按 dpr 算出来的 —— 这条维度只有带值跑才有意义。
 *
 * 必须在 **app ready 之前**追加开关，所以放在模块顶层而不是断言处。
 * 注意：缩放后窗口的 **CSS 宽度 = 物理宽度 / dpr**，太小会让弹窗落到紧凑形态、
 * 变成另一个前提 —— 本机屏幕物理宽 1920，1.5 只剩约 1270 CSS px（< xl，弹窗转紧凑），
 * 所以本机用 1.25 验证；2K 屏（2560 物理宽）用 1.5 正好是真实场景。
 */
if (process.env.SMOKE_DPR) {
  app.commandLine.appendSwitch("force-device-scale-factor", process.env.SMOKE_DPR);
}

/**
 * 本脚本注册的 IPC stub 统一包装成真实的 IpcResult 形状
 * （`{ success: true, data }` / `{ success: false, error, code? }`）。
 *
 * 为什么必需：主进程第 1 轮统一了跨 IPC 边界不抛异常、一律返回 IpcResult，
 * 渲染进程侧的封装层（unwrapIpc）据此判定成败。裸返回原始值的 stub 会被判为失败、
 * 抛 IpcCallError，导致「用户数据没加载 → 写盘断言全挂」。
 */
const ipcMain = {
  handle: (channel, handler) =>
    realIpcMain.handle(channel, async (event, ...args) => {
      try {
        return { success: true, data: await handler(event, ...args) };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
};

registerAppProtocol();
// 真实注册 IPC（含 view3d:pickModel / view3d:readModelFile），仅把对话框换成固定返回
registerVideoToolIpc();

/**
 * 生成一个最小可用的 .glb 测试模型：一个 0.5 × 2.0 × 0.3 的长方体
 * （用来验证「导入 → 归一化到 1.8 高 → 脚底贴地」）。
 */
function buildTestGlb() {
  const positions = new Float32Array([
    -0.25, 0, -0.15, 0.25, 0, -0.15, 0.25, 0, 0.15, -0.25, 0, 0.15,
    -0.25, 2, -0.15, 0.25, 2, -0.15, 0.25, 2, 0.15, -0.25, 2, 0.15,
  ]);
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0,
  ]);

  const positionsBuffer = Buffer.from(positions.buffer);
  const indicesBuffer = Buffer.from(indices.buffer);
  const padding = (4 - (positionsBuffer.length % 4)) % 4;
  const binBuffer = Buffer.concat([
    positionsBuffer,
    Buffer.alloc(padding),
    indicesBuffer,
    Buffer.alloc((4 - (indicesBuffer.length % 4)) % 4),
  ]);

  const gltf = {
    asset: { version: "2.0", generator: "illusion-realm-smoke" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "fixture-character" }],
    meshes: [{ name: "fixture", primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ byteLength: binBuffer.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionsBuffer.length, target: 34962 },
      {
        buffer: 0,
        byteOffset: positionsBuffer.length + padding,
        byteLength: indicesBuffer.length,
        target: 34963,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 8,
        type: "VEC3",
        min: [-0.25, 0, -0.15],
        max: [0.25, 2, 0.15],
      },
      { bufferView: 1, componentType: 5123, count: 36, type: "SCALAR" },
    ],
  };

  const jsonBuffer = Buffer.from(JSON.stringify(gltf), "utf8");
  const jsonPadding = (4 - (jsonBuffer.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonBuffer, Buffer.alloc(jsonPadding, 0x20)]);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binBuffer.length, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4); // "JSON"

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binBuffer.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4); // "BIN\0"

  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binBuffer]);
}

/**
 * 可观测性骨架：看门狗（124）/ 单步超时（125）/ 日志留档 / 进程树终止 / 语句级标记。
 * 与 smoke-anima-workflow 共用同一实现 —— 这个套件此前也静默挂死过（600s 无输出）。
 */
const smoke = createSmokeHarness({ name: "view3d" });
smoke.installConsoleTee();
const check = smoke.check;
const results = smoke.results;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "view3d-smoke-"));
smoke.setWorkDir(workDir);
const fixtureModelPath = path.join(workDir, "fixture-character.glb");
fs.writeFileSync(fixtureModelPath, buildTestGlb());
const secondModelPath = path.join(workDir, "second-character.glb");

const userDataFile = path.join(workDir, "illusion-realm.json");
fs.writeFileSync(
  userDataFile,
  JSON.stringify(
    {
      version: 1,
      userDataPath: userDataFile,
      settings: {
        userDataPath: userDataFile,
        outputPath: path.join(workDir, "output"),
        comfyServerUrl: "http://127.0.0.1:8188",
        paths: { searchPath: "", checkpointPath: "", lorasPath: "", diffusionModelsPath: "" },
      },
    },
    null,
    2
  )
);

ipcMain.handle("userData:read", async () => ({
  filePath: userDataFile,
  data: JSON.parse(fs.readFileSync(userDataFile, "utf8")),
  isNew: false,
}));
ipcMain.handle("userData:write", async (_event, data) => {
  fs.writeFileSync(userDataFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return { filePath: userDataFile, data };
});
ipcMain.handle("userData:getDefaultPath", async () => userDataFile);
ipcMain.handle("models:scan", async () => []);
ipcMain.handle("files:listGeneratedImages", async () => []);
ipcMain.handle("files:listOutputFolders", async () => []);
ipcMain.handle("changelog:read", async () => null);

// 窗口级全屏回退：记录调用（真实实现由主进程 BrowserWindow.setFullScreen 完成）
const windowFullScreenCalls = [];
ipcMain.handle("window:setFullScreen", async (_event, flag) => {
  windowFullScreenCalls.push(Boolean(flag));
  return Boolean(flag);
});

// 选择模型对话框：依次返回两个测试模型，供验证历史顺序与去重；并记录 defaultPath
let lastOpenDialogOptions = null;
let pickCount = 0;
dialog.showOpenDialog = async (options) => {
  if (String(options?.title ?? "").includes("角色模型")) {
    lastOpenDialogOptions = options;
    pickCount += 1;
    // 第一次给 fixture，之后交替给 second（用于历史顺序/去重断言）
    const target = pickCount % 2 === 1 ? fixtureModelPath : secondModelPath;
    return { canceled: false, filePaths: [target] };
  }
  return { canceled: true, filePaths: [] };
};

app.whenReady().then(async () => {
  smoke.installWatchdog(app);
  // 陈旧产物会伪装成代码回归，先拦掉（退出码 2）
  smoke.assertBuildFresh({ app });
  const win = new BrowserWindow({
    width: 1440,
    height: 950,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // 与真实应用 main.js 一致：preload 是手写 CommonJS，需 Node 环境才能 require 本地模块
      sandbox: false,
      preload: path.join(__dirname, "..", "apps", "electron", "preload.js"),
    },
  });

  const consoleErrors = [];
  win.webContents.on("console-message", (event) => {
    if (event.level === "error") consoleErrors.push(event.message);
  });

  smoke.attachWebContents(win.webContents);
  // 窗口约定 + 可选的遮挡维度（SMOKE_OCCLUDE=1 时把整个套件跑在被遮挡条件下）
  await smoke.hardenWindow(win);
  const run = smoke.createRun();

  const waitFor = async (expression, timeoutMs = 15000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const ok = await run(`(() => { try { return Boolean(${expression}); } catch { return false; } })()`);
      if (ok) return true;
      await sleep(200);
    }
    return false;
  };

  const readPrompt = () =>
    run(`(() => document.querySelector('[data-view3d-prompt]')?.textContent?.trim() ?? '')()`);

  const clickQuick = (id) =>
    run(`(() => {
      const btn = document.querySelector('[data-view3d-quick="${id}"]');
      if (btn) btn.click();
      return !!btn;
    })()`);

  const setRadius = async (value) => {
    await run(`(() => {
      const slider = document.querySelector('[aria-label="相机距离"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(slider, '${value}');
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(500);
  };

  const switchSeries = async (series) => {
    await run(`(() => {
      const btn = document.querySelector('[data-view3d-series="${series}"]');
      if (btn) btn.click();
      return !!btn;
    })()`);
    await sleep(700);
  };

  /** 读取提示词的三个维度与当前相机参数 */
  const readParts = () =>
    run(`(() => {
      const text = (selector) => document.querySelector(selector)?.textContent?.trim() ?? '';
      const numeric = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return 0;
        const raw = el.value !== undefined && el.value !== '' ? el.value : el.textContent;
        return Number(String(raw ?? '0').replace('°', '')) || 0;
      };
      return {
        prompt: text('[data-view3d-prompt]'),
        shot: text('[data-view3d-part-shot]'),
        toward: text('[data-view3d-part-toward]'),
        angle: text('[data-view3d-part-angle]'),
        azimuth: numeric('[data-view3d-azimuth]'),
        elevation: numeric('[data-view3d-elevation]'),
        radius: numeric('[data-view3d-radius]'),
      };
    })()`);

  /**
   * 精确设定方位角 / 俯仰角（面板里的角度输入框）。
   * 说明：3D 视窗的拖拽受 OrbitControls 阻尼影响会滑一段时间，角度不可复现，
   * 所以验证权重公式一律走这两个输入框。
   */
  const setAngles = async (patch) => {
    await run(`(() => {
      const setValue = (selector, value) => {
        const el = document.querySelector(selector);
        if (!el || value === undefined) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, String(value));
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      setValue('[data-view3d-azimuth]', ${patch.azimuth === undefined ? "undefined" : patch.azimuth});
      setValue('[data-view3d-elevation]', ${patch.elevation === undefined ? "undefined" : patch.elevation});
      return true;
    })()`);
    await sleep(500);
  };


  try {
    await win.loadURL("app://app/create");
    await sleep(3500);

    // ---------- 需求二·1：入口位置（提示词框左下角，与画师按钮并排的相机图标） ----------
    const trigger = await run(`(() => {
      const btn = document.querySelector('[data-view3d-trigger]');
      const painter = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent.trim() === '画师'
      );
      const editor = document.getElementById('prompt-editor');
      if (!btn || !painter || !editor) return { found: false };
      const btnRect = btn.getBoundingClientRect();
      const painterRect = painter.getBoundingClientRect();
      const editorRect = editor.getBoundingClientRect();
      return {
        found: true,
        title: btn.getAttribute('title'),
        ariaLabel: btn.getAttribute('aria-label'),
        sameRowAsPainter: Math.abs(btnRect.top - painterRect.top) < 8,
        belowEditor: btnRect.top >= editorRect.bottom - 8,
      };
    })()`);
    check("提示词框左下角存在 3D 视角入口", trigger.found === true);
    check("入口 Tooltip 为「3D 视角」",
      trigger.title === "3D 视角" && trigger.ariaLabel === "3D 视角",
      `${trigger.title}/${trigger.ariaLabel}`);
    check("入口与画师按钮并排", trigger.sameRowAsPainter === true);
    check("入口位于提示词输入框下方", trigger.belowEditor === true);

    // ---------- 需求二·2：弹框与左右分栏 ----------
    await run(`(() => {
      const btn = document.querySelector('[data-view3d-trigger]');
      if (btn) btn.click();
      return !!btn;
    })()`);
    await sleep(2000);

    const dialogInfo = await run(`(() => {
      const dialog = document.getElementById('view3d-dialog-title')?.closest('[role="dialog"]');
      if (!dialog) return { exists: false };
      const canvasHost = dialog.querySelector('[data-view3d-canvas]');
      const canvas = canvasHost?.querySelector('canvas');
      const preview = dialog.querySelector('[data-view3d-prompt]');
      const left = canvasHost?.closest('div');
      const aside = preview?.closest('aside');
      const dialogRect = dialog.getBoundingClientRect();
      const canvasRect = canvas ? canvas.getBoundingClientRect() : null;
      return {
        exists: true,
        hasCanvas: !!canvas,
        canvasWidth: canvas ? canvas.width : 0,
        dpr: window.devicePixelRatio,
        canvasCss: canvasRect
          ? { w: Math.round(canvasRect.width), h: Math.round(canvasRect.height) }
          : null,
        /**
         * 容器也取 rect（不能用 clientWidth/clientHeight）：弹窗入场动画
         * motion-pop-in 带 scale 0.97，rect 会被缩、clientWidth 不会 ——
         * 两边混着比会得到 769 → 746 的假红（首次实现就是这么翻的车）。
         */
        hostCss: canvasHost
          ? (() => {
              const hostRect = canvasHost.getBoundingClientRect();
              return { w: Math.round(hostRect.width), h: Math.round(hostRect.height) };
            })()
          : null,
        /* 绘制缓冲 / 容器宽度：应当等于 min(dpr, 2)（画布清晰度的下限） */
        bufferRatio:
          canvas && canvasHost && canvasHost.clientWidth > 0
            ? Number((canvas.width / canvasHost.clientWidth).toFixed(2))
            : 0,
        leftRatio: left ? left.getBoundingClientRect().width / dialogRect.width : 0,
        rightRatio: aside ? aside.getBoundingClientRect().width / dialogRect.width : 0,
        hasSeriesSwitch: !!dialog.querySelector('[data-view3d-series]'),
        hasConfirm: !!dialog.querySelector('[data-view3d-confirm]'),
      };
    })()`);
    check("点击相机图标弹出 3D 视角弹框", dialogInfo.exists === true);
    check("3D 视窗已初始化 canvas（WebGL）",
      dialogInfo.hasCanvas === true && dialogInfo.canvasWidth > 0,
      `canvas=${dialogInfo.hasCanvas} width=${dialogInfo.canvasWidth}`);
    check("左右分栏比例约 70% / 30%",
      dialogInfo.leftRatio > 0.6 && dialogInfo.rightRatio > 0.2 && dialogInfo.rightRatio < 0.4,
      `left=${dialogInfo.leftRatio.toFixed(2)} right=${dialogInfo.rightRatio.toFixed(2)}`);
    /**
     * 画布几何：**铺满容器且不溢出**。
     *
     * 为什么单独钉：`renderer.setSize(w, h, false)` 只改绘制缓冲、不写 CSS 尺寸，
     * 于是 canvas 的 CSS 尺寸会变成 `容器 × dpr` —— 在 Windows 显示缩放 ≠ 100%
     * 时它比容器大一圈，直接盖住右侧控制栏（dpr=1 时两者恰好相等，
     * 所以默认跑、以及 100% 缩放的机器上永远看不到这个现象）。
     * 复现/回归：`SMOKE_DPR=1.25 npx electron scripts/smoke-view3d.js`
     */
    check("3D 画布铺满容器且不溢出（显示缩放 ≠100% 时的回归网）",
      Boolean(dialogInfo.canvasCss && dialogInfo.hostCss) &&
        Math.abs(dialogInfo.canvasCss.w - dialogInfo.hostCss.w) <= 1 &&
        Math.abs(dialogInfo.canvasCss.h - dialogInfo.hostCss.h) <= 1,
      `dpr=${dialogInfo.dpr} canvas=${JSON.stringify(dialogInfo.canvasCss)} host=${JSON.stringify(dialogInfo.hostCss)}`);
    check("3D 画布绘制缓冲仍按 dpr 放大（不能靠缩小缓冲来「修」掉溢出）",
      Math.abs(dialogInfo.bufferRatio - Math.min(dialogInfo.dpr, 2)) <= 0.05,
      `dpr=${dialogInfo.dpr} buffer/容器=${dialogInfo.bufferRatio}`);
    check("右侧含模型适配切换与确认按钮",
      dialogInfo.hasSeriesSwitch && dialogInfo.hasConfirm);

    // ---------- Z 轴：半径 → 景别（互斥，只输出 1 个，权重 1.0 不带括号） ----------
    const shotCases = [
      { radius: 1, expect: "extreme close-up" },
      { radius: 2, expect: "close-up" },
      { radius: 3.5, expect: "medium shot" },
      { radius: 4.5, expect: "cowboy shot" },
      { radius: 6, expect: "full body" },
      { radius: 8, expect: "wide shot, scenery" },
    ];
    for (const item of shotCases) {
      await setRadius(item.radius);
      const partsNow = await readParts();
      check(`Z 轴：半径 ${item.radius} → ${item.expect}`,
        partsNow.shot === item.expect, partsNow.shot);
    }

    const exclusivity = await run(`(() => {
      const prompt = document.querySelector('[data-view3d-prompt]')?.textContent?.trim() ?? '';
      const shot = document.querySelector('[data-view3d-part-shot]')?.textContent?.trim() ?? '';
      const rest = prompt.slice(shot.length);
      const others = ['extreme close-up', 'close-up', 'medium shot', 'cowboy shot', 'full body', 'wide shot'];
      return { startsWithShot: prompt.startsWith(shot), leaked: others.filter((t) => rest.includes(t)) };
    })()`);
    check("景别互斥：提示词以景别开头，其余部分不再出现别的景别词条",
      exclusivity.startsWithShot === true && exclusivity.leaked.length === 0,
      JSON.stringify(exclusivity));

    // ---------- X 轴 / Y 轴：快捷视图（对应文档第五节表格，逐条精确比对） ----------
    await setRadius(5.2); // 文档示例半径：5.0 ≤ r < 6.5 → full body
    const quickCases = [
      { quick: "front", azimuth: 0, elevation: 0, expect: "full body, (front view:3.0)" },
      { quick: "side", azimuth: 90, elevation: 0, expect: "full body, (facing left:3.0)" },
      { quick: "side-right", azimuth: 270, elevation: 0, expect: "full body, (facing right:3.0)" },
      { quick: "back", azimuth: 180, elevation: 0, expect: "full body, (from behind:3.0)" },
      { quick: "high", azimuth: 0, elevation: 45, expect: "full body, (front view:2.0), (high angle:2.0)" },
      { quick: "low", azimuth: 0, elevation: -45, expect: "full body, (front view:2.0), (low angle:2.0)" },
      { quick: "top", azimuth: 0, elevation: 90, expect: "full body, (high angle:3.0)" },
      { quick: "bottom", azimuth: 0, elevation: -90, expect: "full body, (low angle:3.0)" },
    ];
    for (const item of quickCases) {
      await clickQuick(item.quick);
      await sleep(600);
      const partsNow = await readParts();
      check(`快捷视图「${item.quick}」(${item.azimuth}°, ${item.elevation}°) → ${item.expect}`,
        partsNow.prompt === item.expect,
        `${partsNow.prompt}  [方位角 ${partsNow.azimuth}° 俯仰角 ${partsNow.elevation}°]`);
    }

    // ---------- X 轴过渡区间（面板角度输入精确设定方位角） ----------
    await clickQuick("front");
    await sleep(500);
    await setAngles({ azimuth: 45, elevation: 0 });
    let partsNow = await readParts();
    check("精确输入方位角 45° 生效",
      Math.abs(partsNow.azimuth - 45) < 1, `${partsNow.azimuth}°`);
    check("30°~60° 过渡区间：front view 2.5 与 facing left 2.0 共存（按渐变公式）",
      partsNow.toward === "(front view:2.5) (facing left:2.0)", partsNow.toward);

    await setAngles({ azimuth: 30 });
    partsNow = await readParts();
    check("30° 边界：front view 3.0（锁定正面）+ facing left 1.0（裸词条）",
      partsNow.toward === "(front view:3.0) facing left", partsNow.toward);

    await setAngles({ azimuth: 60 });
    partsNow = await readParts();
    check("60° 边界：front 消失，只剩 (facing left:3.0)",
      partsNow.toward === "(facing left:3.0)", partsNow.toward);

    await setAngles({ azimuth: 329 });
    partsNow = await readParts();
    check("另一侧 329°（= -31°）→ facing right 逐步升高",
      partsNow.toward.startsWith("(front view:") && partsNow.toward.includes("(facing right:"),
      partsNow.toward);

    await setAngles({ azimuth: 120 });
    partsNow = await readParts();
    check("120° 边界：from behind 2.0 出现，facing left 仍是 3.0",
      partsNow.toward === "(from behind:2.0) (facing left:3.0)", partsNow.toward);

    await setAngles({ azimuth: 135 });
    partsNow = await readParts();
    check("120°~150° 过渡区间：from behind 2.5 与 facing left 2.0 共存",
      partsNow.toward === "(from behind:2.5) (facing left:2.0)", partsNow.toward);

    await setAngles({ azimuth: 150 });
    partsNow = await readParts();
    check("150° 边界：facing 消失，只剩 (from behind:3.0)",
      partsNow.toward === "(from behind:3.0)", partsNow.toward);

    await setAngles({ azimuth: 151 });
    partsNow = await readParts();
    check("超过 150° 仍是 (from behind:3.0)",
      partsNow.toward === "(from behind:3.0)", partsNow.toward);

    // 水平朝向随俯仰角衰减（文档示例：斜俯视 front view 由 3.0 降到 2.0）
    await setAngles({ azimuth: 0, elevation: 45 });
    partsNow = await readParts();
    check("斜俯视（+45°）时 front view 权重衰减到 2.0",
      partsNow.toward === "(front view:2.0)", partsNow.toward);

    await setAngles({ elevation: 90 });
    partsNow = await readParts();
    check("垂直俯视（+90°）时不再输出朝向词条",
      partsNow.toward === "—", `${partsNow.toward} | ${partsNow.prompt}`);

    await setAngles({ elevation: 0 });

    // ---------- Y 轴过渡区间：用角度输入覆盖两段公式 ----------
    await setAngles({ elevation: 25 });
    partsNow = await readParts();
    check("俯仰角 25° → (high angle:1.6)（20°~45° 区间 1.5 → 2.0）",
      partsNow.angle === "(high angle:1.6)", partsNow.angle);

    await setAngles({ elevation: 45 });
    partsNow = await readParts();
    check("俯仰角 45° 边界 → (high angle:2.0)",
      partsNow.angle === "(high angle:2.0)", partsNow.angle);

    await setAngles({ elevation: 70 });
    partsNow = await readParts();
    check("俯仰角 70° → (high angle:2.6)（45°~90° 区间 2.0 → 3.0）",
      partsNow.angle === "(high angle:2.6)", partsNow.angle);

    await setAngles({ elevation: -70 });
    partsNow = await readParts();
    check("俯仰角 -70° → (low angle:2.6)",
      partsNow.angle === "(low angle:2.6)", partsNow.angle);

    await setAngles({ elevation: 15 });
    partsNow = await readParts();
    check("平视附近（|15°| ≤ 20°）不输出视角词条",
      partsNow.angle === "—（平视）", `${partsNow.angle} | ${partsNow.prompt}`);
    await setAngles({ elevation: 0 });

    // ---------- 输出格式：景别 + 朝向 + 视角 ----------
    await clickQuick("low");
    await sleep(600);
    const composed = await readPrompt();
    check("输出顺序为 [景别] + [朝向] + [视角]（文档示例：full body, (front view:2.0), (low angle:2.0)）",
      composed === "full body, (front view:2.0), (low angle:2.0)", composed);

    // ---------- 需求文档第七节：SDXL 权重上限 2.0 ----------
    await clickQuick("front");
    await sleep(500);
    await switchSeries("sdxl");
    await sleep(500);
    const sdxlDefaultRadius = (
      await run(`document.querySelector('[data-view3d-radius]')?.textContent ?? ''`)
    ).trim();
    check("切换到 SDXL 后默认半径变为 R=8", sdxlDefaultRadius === "8.0", sdxlDefaultRadius);

    await setRadius(5.2);
    const sdxlPrompt = await readPrompt();
    check("SDXL 权重上限 2.0：正面输出 (front view:2.0)",
      sdxlPrompt === "full body, (front view:2.0)", sdxlPrompt);

    await switchSeries("anima");
    await setRadius(5.2);
    // 切换系列会按该系列默认半径重新定位相机，这里再回到正面确认基准输出
    await clickQuick("front");
    await sleep(500);
    check("切回 Anima 后正面恢复 (front view:3.0)",
      (await readPrompt()) === "full body, (front view:3.0)", await readPrompt());

    // ---------- 增强权重（4 个滑块：X / Y / Z / 总系数） ----------
    const setEnhance = async (axis, value) => {
      await run(`(() => {
        const slider = document.querySelector('[data-view3d-enhance-slider="${axis}"]');
        if (!slider) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(slider, '${value}');
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`);
      await sleep(400);
    };

    const readEnhance = () =>
      run(`(() => {
        const text = (selector) => document.querySelector(selector)?.textContent?.trim() ?? '';
        const axisValue = (axis) => text('[data-view3d-enhance-value="' + axis + '"]');
        return {
          x: text('[data-view3d-enhance-tags="x"]'),
          y: text('[data-view3d-enhance-tags="y"]'),
          z: text('[data-view3d-enhance-tags="z"]'),
          prompt: text('[data-view3d-prompt]'),
          shot: text('[data-view3d-part-shot]'),
          toward: text('[data-view3d-part-toward]'),
          angle: text('[data-view3d-part-angle]'),
          values: {
            x: axisValue('x'),
            y: axisValue('y'),
            z: axisValue('z'),
            total: axisValue('total'),
          },
        };
      })()`);

    const enhanceInit = await run(`(() => {
      const axes = ['x', 'y', 'z', 'total'];
      const sliders = axes.map((axis) =>
        document.querySelector('[data-view3d-enhance-slider="' + axis + '"]')
      );
      return {
        exists: !!document.querySelector('[data-view3d-enhance]'),
        count: sliders.filter(Boolean).length,
        min: sliders.map((s) => s?.min ?? ''),
        max: sliders.map((s) => s?.max ?? ''),
        values: sliders.map((s) => s?.value ?? ''),
        hasReset: !!document.querySelector('[data-view3d-enhance-reset]'),
      };
    })()`);
    check("增强权重面板含 4 个滑块（X / Y / Z / 总系数）",
      enhanceInit.exists === true && enhanceInit.count === 4, JSON.stringify(enhanceInit));
    check("增强滑块最低 1、Anima 最高 3、默认全部为 1（强度 ×1）",
      enhanceInit.min.every((v) => v === "1") &&
        enhanceInit.max.every((v) => v === "3") &&
        enhanceInit.values.every((v) => v === "1"),
      `min=${enhanceInit.min.join(",")} max=${enhanceInit.max.join(",")} values=${enhanceInit.values.join(",")}`);

    // 基准：倍率全为 1 时输出必须与需求文档完全一致
    await setRadius(5.2);
    await clickQuick("front");
    await sleep(500);
    let enh = await readEnhance();
    check("倍率全为 1 时输出与文档基准一致（full body, (front view:3.0)）",
      enh.prompt === "full body, (front view:3.0)", enh.prompt);
    check("X / Y / Z 三个维度的面板标签与提示词一致",
      enh.toward === "(front view:3.0)" && enh.angle === "—（平视）" && enh.shot === "full body",
      `${enh.shot} | ${enh.toward} | ${enh.angle}`);

    // Z 倍率 1.5：景别从裸词条（权重 1.0）变成带权词条
    await setEnhance("z", 1.5);
    enh = await readEnhance();
    check("Z 倍率 1.5 → 景别写成带权形式 (full body:1.5)",
      enh.prompt === "(full body:1.5), (front view:3.0)" && enh.z === "(full body:1.5)",
      `${enh.z} | ${enh.prompt}`);

    // Y 倍率 1.2：斜俯视 high angle 由文档基准 2.0 提升到 2.4
    await setEnhance("z", 1);
    await clickQuick("high");
    await sleep(500);
    await setEnhance("y", 1.2);
    enh = await readEnhance();
    check("Y 倍率 1.2 → 斜俯视 high angle 由 2.0 提升到 2.4",
      enh.angle === "(high angle:2.4)", `${enh.angle} | ${enh.prompt}`);

    // 超过系列上限时收敛
    await setEnhance("y", 2);
    enh = await readEnhance();
    check("倍率放大超过系列权重上限时收敛到 3.0",
      enh.angle === "(high angle:3.0)", enh.angle);

    // 总系数：对三个维度整体缩放
    await setEnhance("y", 1);
    await clickQuick("front");
    await sleep(500);
    await setEnhance("total", 1.5);
    enh = await readEnhance();
    check("总系数 ×1.5 → 景别 1.0 → 1.5，正面已在上限保持 3.0",
      enh.prompt === "(full body:1.5), (front view:3.0)" && enh.z === "(full body:1.5)",
      `${enh.z} | ${enh.prompt}`);

    await setEnhance("total", 1);
    await run(`document.querySelector('[data-view3d-enhance-reset]')?.click(); true`);
    await sleep(500);
    const afterEnhanceReset = await readEnhance();
    check("「全部重置为 1」把四个滑块恢复为最小值，输出回到文档基准",
      afterEnhanceReset.values.x === "×1.0" && afterEnhanceReset.values.y === "×1.0" &&
        afterEnhanceReset.values.z === "×1.0" && afterEnhanceReset.values.total === "×1.0" &&
        afterEnhanceReset.prompt === "full body, (front view:3.0)",
      JSON.stringify(afterEnhanceReset.values));

    await setEnhance("x", 3);
    await switchSeries("sdxl");
    const sdxlEnhance = await run(`(() => ({
      max: document.querySelector('[data-view3d-enhance-slider="x"]')?.max ?? '',
      value: document.querySelector('[data-view3d-enhance-slider="x"]')?.value ?? '',
      prompt: document.querySelector('[data-view3d-prompt]')?.textContent?.trim() ?? '',
    }))()`);
    check("SDXL 系列增强滑块上限为 2", sdxlEnhance.max === "2", sdxlEnhance.max);
    check("切到 SDXL 后超过上限的权重被收敛到 2", sdxlEnhance.value === "2", sdxlEnhance.value);
    check("SDXL 倍率下正面权重同样受 2.0 上限约束",
      sdxlEnhance.prompt.includes("(front view:2.0)"), sdxlEnhance.prompt);

    await switchSeries("anima");
    const enhancePersisted = JSON.parse(fs.readFileSync(userDataFile, "utf8"));
    check("增强权重写入用户数据文件（view3d 段）",
      typeof enhancePersisted.view3d?.enhanceWeights?.x === "number",
      JSON.stringify(enhancePersisted.view3d?.enhanceWeights ?? null));

    await run(`document.querySelector('[data-view3d-enhance-reset]')?.click(); true`);
    await sleep(400);

    // ---------- 角色模型替换：默认模特 → 选择 glb → 归一化 → 持久化 ----------
    const defaultModel = await run(
      `document.querySelector('[data-view3d-model-name]')?.textContent?.trim() ?? ''`
    );
    check("默认使用内置模特", defaultModel === "内置模特", defaultModel);

    await run(`(() => {
      document.querySelector('[data-view3d-pick-model]')?.click();
      return true;
    })()`);
    await sleep(2500);

    const afterPick = await run(`(() => ({
      name: document.querySelector('[data-view3d-model-name]')?.textContent?.trim() ?? '',
      info: Array.from(document.querySelectorAll('p')).map((p) => p.textContent).find(
        (t) => t && t.includes('已归一化')
      ) ?? '',
    }))()`);
    check("选择 .glb 后模型被替换",
      afterPick.name === "fixture-character.glb", afterPick.name);
    check("模型自动归一化到约 1.8 高（原始高 2.0）",
      afterPick.info.includes("1.80"), afterPick.info);

    const persisted = JSON.parse(fs.readFileSync(userDataFile, "utf8"));
    check("模型路径写入用户数据文件（view3d 段）",
      persisted.view3d?.modelPath === fixtureModelPath,
      String(persisted.view3d?.modelPath));

    // 关闭再打开：应自动读回上次的模型
    await run(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent.trim() === '关闭'
      );
      if (btn) btn.click();
      return true;
    })()`);
    await sleep(600);
    await run(`(() => {
      document.querySelector('[data-view3d-trigger]')?.click();
      return true;
    })()`);
    await sleep(2200);
    const reopened = await run(
      `document.querySelector('[data-view3d-model-name]')?.textContent?.trim() ?? ''`
    );
    check("重新打开弹框自动加载上次的模型",
      reopened === "fixture-character.glb", reopened);

    // 恢复默认模特
    await run(`(() => {
      document.querySelector('[data-view3d-reset-model]')?.click();
      return true;
    })()`);
    await sleep(1200);
    const afterReset = await run(`(() => ({
      name: document.querySelector('[data-view3d-model-name]')?.textContent?.trim() ?? '',
      persisted: null,
    }))()`);
    const resetDoc = JSON.parse(fs.readFileSync(userDataFile, "utf8"));
    check("可恢复默认模特",
      afterReset.name === "内置模特" && resetDoc.view3d?.modelPath === null,
      `${afterReset.name} / ${String(resetDoc.view3d?.modelPath)}`);

    // 拖拽 .glb 到 3D 视窗（File API 路径）
    const dropped = await run(`(async () => {
      const host = document.querySelector('[data-view3d-canvas]')?.parentElement;
      if (!host) return { ok: false };
      const response = await window.electronAPI.view3dReadModelFile(${JSON.stringify(fixtureModelPath)});
      const bytes = response.data instanceof Uint8Array ? response.data : new Uint8Array(response.data);
      const file = new File([bytes], 'dropped-model.glb', { type: 'model/gltf-binary' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      host.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      host.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      return { ok: true };
    })()`);
    await sleep(2200);
    const afterDrop = await run(
      `document.querySelector('[data-view3d-model-name]')?.textContent?.trim() ?? ''`
    );
    check("拖拽 .glb 到 3D 视窗可替换模型",
      dropped.ok === true && afterDrop === "dropped-model.glb", afterDrop);

    // 朝向修正
    const facing = await run(`(() => {
      const btn = document.querySelector('[data-view3d-facing="180"]');
      if (btn) btn.click();
      return btn ? btn.getAttribute('aria-pressed') : null;
    })()`);
    await sleep(1200);
    const facingState = await run(
      `document.querySelector('[data-view3d-facing="180"]')?.getAttribute('aria-pressed')`
    );
    check("提供朝向修正并生效", facingState === "true", `before=${facing} after=${facingState}`);

    // ---------- 模型历史：记住上次位置、按时间倒序、去重 ----------
    // 再导入第二个模型（不同文件），用于验证顺序
    const secondModelPath = path.join(workDir, "second-character.glb");
    fs.writeFileSync(secondModelPath, buildTestGlb());
    await run(`(() => {
      document.querySelector('[data-view3d-pick-model]')?.click();
      return true;
    })()`);
    await sleep(2200);

    const historyAfterSecond = await run(`(() => {
      const list = document.querySelector('[data-view3d-model-history]');
      return {
        items: Array.from(list?.querySelectorAll('[data-view3d-history-item]') ?? []).map(
          (el) => el.getAttribute('data-view3d-history-item')
        ),
        labels: Array.from(list?.querySelectorAll('button') ?? []).map((el) => el.innerText.trim()),
      };
    })()`);
    check("历史列表按时间倒序（新的在最前）",
      historyAfterSecond.items[0] === secondModelPath &&
        historyAfterSecond.items[1] === fixtureModelPath,
      historyAfterSecond.items.map((p) => path.basename(p)).join(" | "));
    check("历史条目显示相对时间",
      historyAfterSecond.labels.some((l) => l.includes("刚刚")),
      historyAfterSecond.labels[0] ?? "");

    // 再去重：重新导入第一个模型，应置顶且不重复
    fs.writeFileSync(secondModelPath, buildTestGlb());
    await run(`(() => {
      document.querySelector('[data-view3d-pick-model]')?.click();
      return true;
    })()`);
    await sleep(2200);
    const dedupedHistory = await run(`(() => {
      const list = document.querySelector('[data-view3d-model-history]');
      const items = Array.from(list?.querySelectorAll('[data-view3d-history-item]') ?? []).map(
        (el) => el.getAttribute('data-view3d-history-item')
      );
      return { items, count: items.length };
    })()`);
    check("重复导入同一模型时去重并置顶",
      dedupedHistory.count === 2 && dedupedHistory.items[0] === fixtureModelPath,
      `${dedupedHistory.count} 条：${dedupedHistory.items.map((p) => path.basename(p)).join(" | ")}`);

    // 历史选择：点第二个条目应加载它
    await run(`(() => {
      const target = ${JSON.stringify(secondModelPath)};
      const item = Array.from(document.querySelectorAll('[data-view3d-history-item]')).find(
        (el) => el.getAttribute('data-view3d-history-item') === target
      );
      if (item) item.click();
      return !!item;
    })()`);
    await sleep(2000);
    const afterHistoryPick = await run(`(() => ({
      name: document.querySelector('[data-view3d-model-name]')?.textContent?.trim() ?? '',
      persisted: null,
    }))()`);
    const historyDoc = JSON.parse(fs.readFileSync(userDataFile, "utf8"));
    check("可从历史列表选择模型并加载",
      afterHistoryPick.name === "second-character.glb", afterHistoryPick.name);
    check("历史与当前模型写入用户数据文件",
      Array.isArray(historyDoc.view3d?.modelHistory) &&
        historyDoc.view3d.modelHistory[0]?.path === secondModelPath &&
        historyDoc.view3d.modelPath === secondModelPath,
      `${historyDoc.view3d?.modelHistory?.length} 条`);

    // 记忆上次导入位置：再次打开选择框时应带上目录
    lastOpenDialogOptions = null;
    await run(`(() => {
      document.querySelector('[data-view3d-pick-model]')?.click();
      return true;
    })()`);
    await sleep(1500);
    check("选择文件时自动定位到上次导入的位置",
      typeof lastOpenDialogOptions?.defaultPath === "string" &&
        lastOpenDialogOptions.defaultPath === path.dirname(secondModelPath),
      String(lastOpenDialogOptions?.defaultPath ?? "null"));

    // ---------- 3D 区域全屏：两种方案 + 快捷键 + 提示 ----------
    const fullscreenUi = await run(`(() => {
      const viewport = document.querySelector('[data-view3d-viewport]');
      const hint = document.querySelector('[data-view3d-fullscreen-hint]');
      return {
        mode: viewport?.getAttribute('data-view3d-fullscreen') ?? '',
        hasWindowBtn: !!document.querySelector('[data-view3d-fullscreen-window]'),
        hasBorderlessBtn: !!document.querySelector('[data-view3d-fullscreen-borderless]'),
        hint: hint?.textContent ?? '',
      };
    })()`);
    check("提供两种全屏入口按钮",
      fullscreenUi.hasWindowBtn && fullscreenUi.hasBorderlessBtn);
    check("提示文本包含快捷键说明",
      fullscreenUi.hint.includes("F 窗口化全屏") && fullscreenUi.hint.includes("Shift + F"),
      fullscreenUi.hint);
    check("初始不在全屏状态", fullscreenUi.mode === "none", fullscreenUi.mode);

    // 窗口化全屏：3D 视窗铺满应用窗口，右侧面板隐藏
    await run(`(() => {
      document.querySelector('[data-view3d-fullscreen-window]')?.click();
      return true;
    })()`);
    await sleep(700);
    const windowMode = await run(`(() => {
      const viewport = document.querySelector('[data-view3d-viewport]');
      const aside = document.querySelector('aside');
      const rect = viewport?.getBoundingClientRect();
      return {
        mode: viewport?.getAttribute('data-view3d-fullscreen'),
        dialogFullscreen: document.querySelector('[data-view3d-dialog-fullscreen]')?.getAttribute('data-view3d-dialog-fullscreen'),
        coversWindow: !!rect && rect.width >= window.innerWidth - 2 && rect.height >= window.innerHeight - 2,
        asideHidden: aside ? getComputedStyle(aside).display === "none" : true,
        hint: document.querySelector('[data-view3d-fullscreen-hint]')?.textContent ?? '',
      };
    })()`);
    check("窗口化全屏：3D 区域铺满应用窗口",
      windowMode.mode === "window" && windowMode.coversWindow,
      `${windowMode.mode}/covers=${windowMode.coversWindow}`);
    check("窗口化全屏时隐藏右侧面板", windowMode.asideHidden === true);
    check("窗口化全屏提示可退出", windowMode.hint.includes("已进入窗口化全屏"), windowMode.hint);

    // 快捷键 F 退出
    await run(`(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));
      return true;
    })()`);
    await sleep(600);
    check("快捷键 F 可切换窗口化全屏",
      (await run(`document.querySelector('[data-view3d-viewport]')?.getAttribute('data-view3d-fullscreen')`)) === "none");

    // 快捷键 F 进入，Esc 退出
    await run(`(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));
      return true;
    })()`);
    await sleep(600);
    const enteredByKey = await run(
      `document.querySelector('[data-view3d-viewport]')?.getAttribute('data-view3d-fullscreen')`
    );
    await run(`(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return true;
    })()`);
    await sleep(600);
    const afterEsc = await run(`(() => ({
      mode: document.querySelector('[data-view3d-viewport]')?.getAttribute('data-view3d-fullscreen'),
      dialogOpen: !!document.getElementById('view3d-dialog-title'),
    }))()`);
    check("快捷键 F 进入窗口化全屏", enteredByKey === "window", String(enteredByKey));
    check("Esc 优先退出全屏且不关闭弹框",
      afterEsc.mode === "none" && afterEsc.dialogOpen === true, JSON.stringify(afterEsc));

    // 无边框全屏：DOM Fullscreen 不可用时回退到 Electron 窗口全屏
    await run(`(() => {
      document.querySelector('[data-view3d-fullscreen-borderless]')?.click();
      return true;
    })()`);
    await sleep(1200);
    const borderless = await run(`(() => ({
      mode: document.querySelector('[data-view3d-viewport]')?.getAttribute('data-view3d-fullscreen'),
      asideHidden: (() => {
        const aside = document.querySelector('aside');
        return aside ? getComputedStyle(aside).display === "none" : true;
      })(),
      hint: document.querySelector('[data-view3d-fullscreen-hint]')?.textContent ?? '',
    }))()`);
    check("无边框全屏进入成功（或回退为窗口化全屏）",
      borderless.mode === "borderless" || borderless.mode === "window",
      `${borderless.mode} | ${borderless.hint}`);
    check("无边框全屏时同样隐藏右侧面板", borderless.asideHidden === true);
    check("无边框全屏调用了窗口级全屏回退",
      windowFullScreenCalls.length >= 1 || borderless.mode === "borderless",
      `calls=${windowFullScreenCalls.length}`);

    await run(`(() => {
      document.querySelector('[data-view3d-fullscreen-exit]')?.click();
      return true;
    })()`);
    await sleep(900);
    const exited = await run(`(() => {
      const dialog = document.getElementById('view3d-dialog-title')?.closest('[role="dialog"]');
      const viewport = document.querySelector('[data-view3d-viewport]');
      const aside = document.querySelector('aside');
      const dialogRect = dialog?.getBoundingClientRect();
      const viewportRect = viewport?.getBoundingClientRect();
      const asideRect = aside?.getBoundingClientRect();
      return {
        mode: viewport?.getAttribute('data-view3d-fullscreen'),
        dialogMode: dialog?.getAttribute('data-view3d-dialog-fullscreen'),
        asideVisible: aside ? getComputedStyle(aside).display !== "none" : false,
        // 弹框回到居中、约 1100×720（不是铺满窗口）
        dialogCentered: !!dialogRect &&
          Math.abs(dialogRect.left + dialogRect.width / 2 - window.innerWidth / 2) < 4 &&
          dialogRect.width <= window.innerWidth - 8,
        leftRatio: dialogRect && viewportRect ? viewportRect.width / dialogRect.width : 0,
        rightRatio: dialogRect && asideRect ? asideRect.width / dialogRect.width : 0,
        headerVisible: !!document.querySelector('#view3d-dialog-title')?.closest('header'),
      };
    })()`);
    check("退出全屏后回到初始（左 3D / 右输出框）布局",
      exited.mode === "none" && exited.dialogMode === "none" &&
        exited.asideVisible && exited.dialogCentered && exited.headerVisible,
      JSON.stringify(exited));
    check("退出后左右分栏比例恢复约 70% / 30%",
      exited.leftRatio > 0.6 && exited.rightRatio > 0.2 && exited.rightRatio < 0.4,
      `left=${exited.leftRatio.toFixed(2)} right=${exited.rightRatio.toFixed(2)}`);

    // 快捷键进入无边框全屏后再退出，同样要恢复初始布局
    await run(`(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F', shiftKey: true, bubbles: true }));
      return true;
    })()`);
    await sleep(1200);
    const borderlessByKey = await run(
      `document.querySelector('[data-view3d-viewport]')?.getAttribute('data-view3d-fullscreen')`
    );
    await run(`(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return true;
    })()`);
    await sleep(900);
    const afterBorderlessExit = await run(`(() => {
      const dialog = document.getElementById('view3d-dialog-title')?.closest('[role="dialog"]');
      const viewport = document.querySelector('[data-view3d-viewport]');
      const aside = document.querySelector('aside');
      const dialogRect = dialog?.getBoundingClientRect();
      const viewportRect = viewport?.getBoundingClientRect();
      const asideRect = aside?.getBoundingClientRect();
      return {
        mode: viewport?.getAttribute('data-view3d-fullscreen'),
        asideVisible: aside ? getComputedStyle(aside).display !== "none" : false,
        leftRatio: dialogRect && viewportRect ? viewportRect.width / dialogRect.width : 0,
        rightRatio: dialogRect && asideRect ? asideRect.width / dialogRect.width : 0,
        fullscreenCalls: null,
      };
    })()`);
    check("无边框全屏 Esc 退出后同样恢复初始布局",
      borderlessByKey !== "none" && afterBorderlessExit.mode === "none" &&
        afterBorderlessExit.asideVisible === true &&
        afterBorderlessExit.rightRatio > 0.2,
      `${borderlessByKey} -> ${afterBorderlessExit.mode} right=${afterBorderlessExit.rightRatio.toFixed(2)}`);
    check("退出全屏时还原窗口级全屏",
      windowFullScreenCalls.includes(false),
      JSON.stringify(windowFullScreenCalls));

    // 关闭弹框再打开：仍是初始分栏
    await run(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent.trim() === '关闭'
      );
      if (btn) btn.click();
      return true;
    })()`);
    await sleep(600);
    await run(`(() => {
      document.querySelector('[data-view3d-trigger]')?.click();
      return true;
    })()`);
    await sleep(1800);
    const reopenedLayout = await run(`(() => {
      const dialog = document.getElementById('view3d-dialog-title')?.closest('[role="dialog"]');
      const viewport = document.querySelector('[data-view3d-viewport]');
      const aside = document.querySelector('aside');
      const dialogRect = dialog?.getBoundingClientRect();
      return {
        mode: viewport?.getAttribute('data-view3d-fullscreen'),
        asideVisible: aside ? getComputedStyle(aside).display !== "none" : false,
        rightRatio: dialogRect && aside ? aside.getBoundingClientRect().width / dialogRect.width : 0,
      };
    })()`);
    check("重新打开弹框仍是最初的左右分栏",
      reopenedLayout.mode === "none" && reopenedLayout.asideVisible === true &&
        reopenedLayout.rightRatio > 0.2,
      JSON.stringify(reopenedLayout));

    // ---------- 需求五：附加词条（可选，默认空 = 文档原值） ----------
    /**
     * 基础词表是「相机行为词」（`facing left` / `high angle`），附加词条补的是
     * 「观察方位词」（`from side` / `from above` / `from below`）。
     * 这里钉住三件事：① 默认不写入（预览逐字等于文档原值）；
     * ② 建议词与角度同源（正面不重复建议 `front view`，正侧视建议 `from side`）；
     * ③ 建议词是可开关的，且确认时会被一起带走。
     */
    const readExtra = () =>
      run(`(() => ({
        input: document.querySelector('[data-view3d-extra]')?.value ?? null,
        prompt: document.querySelector('[data-view3d-prompt]')?.textContent?.trim() ?? '',
        suggestions: Array.from(document.querySelectorAll('[data-view3d-extra-suggest]'))
          .map((el) => el.getAttribute('data-view3d-extra-suggest')),
        clearButton: Boolean(document.querySelector('[data-view3d-extra-clear]')),
      }))()`);

    /**
     * 先把相机参数归一化到 Anima 默认（R=5、四个倍率全 1）：
     * 本段测的是附加词条，不该被前面「SDXL 权重上限 / 增强倍率」那几段留下的状态影响。
     */
    await switchSeries("anima");
    await run(`document.querySelector('[data-view3d-enhance-reset]')?.click(); true`);
    await sleep(400);
    await setRadius(5);

    await clickQuick("front");
    await sleep(400);
    const extraAtFront = await readExtra();
    check("正面视角不重复建议观察方位词（front view 已在基础词条里）",
      extraAtFront.input === "" && extraAtFront.suggestions.length === 0 &&
        extraAtFront.prompt === "full body, (front view:3.0)",
      JSON.stringify(extraAtFront));

    await clickQuick("side");
    await sleep(400);
    const extraAtSide = await readExtra();
    check("正侧视（90°）建议补 from side，但默认不写入（预览仍是文档原值）",
      extraAtSide.suggestions.join(",") === "from side" && extraAtSide.input === "" &&
        extraAtSide.prompt === "full body, (facing left:3.0)",
      JSON.stringify(extraAtSide));

    await run(`document.querySelector('[data-view3d-extra-suggest="from side"]')?.click(); true`);
    await sleep(300);
    const extraApplied = await readExtra();
    const sideSuggestActive = await run(
      `document.querySelector('[data-view3d-extra-suggest="from side"]')?.getAttribute('data-view3d-extra-active') ?? ''`
    );
    check("点建议词追加进附加词条，预览同步变成「基础词条 + 附加词条」",
      extraApplied.input === "from side" &&
        extraApplied.prompt === "full body, (facing left:3.0), from side" &&
        sideSuggestActive === "true",
      `${JSON.stringify(extraApplied)} | active=${sideSuggestActive}`);

    await run(`document.querySelector('[data-view3d-extra-clear]')?.click(); true`);
    await sleep(300);
    const extraCleared = await readExtra();
    check("清空附加词条后预览逐字回到文档原值（清空按钮也随之消失）",
      extraCleared.input === "" && extraCleared.clearButton === false &&
        extraCleared.prompt === "full body, (facing left:3.0)",
      JSON.stringify(extraCleared));

    // 再补回来：下面「确认并插入」那一步要顺带证明附加词条会一起被带走
    await run(`document.querySelector('[data-view3d-extra-suggest="from side"]')?.click(); true`);
    await sleep(300);

    // ---------- 需求二·3：确认并插入 ----------
    await run(`(() => {
      const editor = document.getElementById('prompt-editor');
      if (editor) editor.textContent = 'masterpiece, 1girl';
      return true;
    })()`);
    await sleep(300);

    const promptBeforeInsert = await readPrompt();
    check("插入前提示词含带权标签", promptBeforeInsert.includes("("), promptBeforeInsert);
    const confirmLabel = await run(
      `document.querySelector('[data-view3d-confirm]')?.textContent?.trim() ?? ''`
    );
    check("普通模式：确认按钮文案是「确认并插入」，与真实写入方式一致",
      confirmLabel === "确认并插入", confirmLabel);
    await run(`(() => {
      const btn = document.querySelector('[data-view3d-confirm]');
      if (btn) btn.click();
      return !!btn;
    })()`);
    await sleep(700);

    const afterInsert = await run(`(() => ({
      dialogClosed: !document.getElementById('view3d-dialog-title'),
      text: document.getElementById('prompt-editor')?.textContent ?? '',
    }))()`);
    check("点击确认后弹框关闭", afterInsert.dialogClosed === true);
    check("提示词已追加到主输入框末尾",
      afterInsert.text.startsWith("masterpiece, 1girl, ") &&
        afterInsert.text.includes(promptBeforeInsert),
      afterInsert.text.slice(0, 120));
    check("插入内容包含带权标签（景别 + 朝向 + 视角）",
      afterInsert.text.includes(promptBeforeInsert) &&
        /\([\w' -]+:\d\.\d\)/.test(afterInsert.text),
      afterInsert.text.slice(0, 160));
    check("插入内容包含附加词条 from side（附加词条随确认一起写入）",
      afterInsert.text.includes("from side"), afterInsert.text.slice(0, 160));

    if (consoleErrors.length > 0) {
      console.log("--- 渲染进程 console 错误 ---");
      consoleErrors.slice(0, 10).forEach((line) => console.log("  " + line));
    }

    const allPassed = smoke.allPassed();
    console.log(allPassed ? "VIEW3D SMOKE OK ✓" : "VIEW3D SMOKE FAILED ✗");
    await smoke.finish({ app, ok: allPassed, cleanupDir: workDir });
  } catch (error) {
    console.error("SMOKE_FAIL", error);
    await smoke.finish({ app, ok: false, error });
  }
});
