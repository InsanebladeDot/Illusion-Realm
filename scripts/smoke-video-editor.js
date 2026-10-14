/**
 * 视频剪辑台 UI 冒烟测试（真实 Electron 渲染进程 + 真实 ffmpeg）
 *
 * 覆盖用户要求的交互：
 *  1. 一次多选导入 → 片段卡片列表（拖拽手柄存在，顺序即拼接顺序）
 *  2. PR 风格时间轴：拖动 ] 标记划定终点，视频画面同步跳到对应帧
 *  3. 切换片段后各自保留独立剪切区间；走带按钮 + 设为起点/终点
 *  4. 多片段拼接导出（真实执行 ffmpeg），校验输出时长/分辨率/音轨
 *
 * 运行：npx electron scripts/smoke-video-editor.js   （退出码 0 = 通过）
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { createSmokeHarness } = require("./lib/smoke-harness");
const { app, BrowserWindow, dialog, ipcMain: realIpcMain } = require("electron");
const { registerAppProtocol } = require("../apps/electron/appProtocol");
const { registerVideoToolIpc } = require("../apps/electron/ffmpeg");
const { resolveTools } = require("../apps/electron/ffmpeg/locate");

/**
 * 本脚本注册的 IPC stub 统一包装成真实的 IpcResult 形状
 * （`{ success: true, data }` / `{ success: false, error, code? }`）。
 *
 * 为什么必需：主进程第 1 轮统一了跨 IPC 边界不抛异常、一律返回 IpcResult，
 * 渲染进程侧的封装层（unwrapIpc）据此判定成败。裸返回原始值的 stub 会被判为失败、
 * 抛 IpcCallError，导致「用户数据没加载 → 写盘断言全挂」。
 *
 * 注意：apps/electron 的 registerHandle 用的是它自己 require 的 ipcMain，
 * 不受这里的遮蔽影响，因此真实 handler 不会被二次包装。
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
registerVideoToolIpc();

/** 可观测性骨架（看门狗 124 / 单步超时 125 / 日志留档 / 进程树终止）——
 *  这个套件会真的拉起 ffmpeg，挂死时孤儿进程才是真正占资源的那个 */
const smoke = createSmokeHarness({ name: "video-editor" });
smoke.installConsoleTee();
const check = smoke.check;
const results = smoke.results;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** "MM:SS.mmm" / "HH:MM:SS.mmm" → 秒 */
function parseHms(text) {
  const match = String(text).match(/(\d+):(\d+)(?:\.(\d+))?/);
  if (!match) return Number.NaN;
  const [, a, b, ms] = match;
  return Number(a) * 60 + Number(b) + (ms ? Number(`0.${ms}`) : 0);
}

const tools = resolveTools();
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "video-editor-smoke-"));
smoke.setWorkDir(workDir);
const clipDir = path.join(workDir, "clips");
const outDir = path.join(workDir, "out");
fs.mkdirSync(clipDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });
const clipA = path.join(clipDir, "clip-a.mp4");
const clipB = path.join(clipDir, "clip-b.mp4");

/** 输出文件夹下的导出文件（按修改时间取最新） */
function listExports() {
  return fs
    .readdirSync(outDir)
    .filter((name) => name.toLowerCase().endsWith(".mp4"))
    .map((name) => path.join(outDir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}


/**
 * 用临时文件充当「用户数据」文档：既能走通真实的持久化链路，
 * 又不会覆盖用户自己的 illusion-realm.json。
 */
const userDataFile = path.join(workDir, "illusion-realm.json");
fs.writeFileSync(
  userDataFile,
  JSON.stringify(
    { version: 1, userDataPath: userDataFile, settings: { userDataPath: userDataFile } },
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

function makeClip(target, { pattern, duration, withAudio, size = "320x240" }) {
  const args = [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", `${pattern}=size=${size}:rate=25`,
  ];
  if (withAudio) args.push("-f", "lavfi", "-i", "sine=frequency=440");
  args.push("-t", String(duration), "-pix_fmt", "yuv420p", "-c:v", "libx264");
  args.push(...(withAudio ? ["-c:a", "aac", "-shortest"] : ["-an"]), target);
  const result = spawnSync(tools.ffmpegPath, args, { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`生成测试片段失败：${result.stderr}`);
}

function probeOutput(file) {
  const out = spawnSync(
    tools.ffprobePath,
    ["-v", "error", "-show_entries", "format=duration",
     "-show_entries", "stream=codec_type,width,height", "-of", "json", file],
    { encoding: "utf8", windowsHide: true }
  );
  const data = JSON.parse(String(out.stdout));
  const video = (data.streams || []).find((s) => s.codec_type === "video");
  const audio = (data.streams || []).find((s) => s.codec_type === "audio");
  return {
    duration: Number(data.format?.duration ?? 0),
    width: Number(video?.width ?? 0),
    height: Number(video?.height ?? 0),
    hasAudio: Boolean(audio),
  };
}

app.whenReady().then(async () => {
  smoke.installWatchdog(app);
  // 陈旧产物会伪装成代码回归，先拦掉（退出码 2）
  smoke.assertBuildFresh({ app });
  if (!tools.ffmpegPath || !tools.ffprobePath) {
    console.error("未找到 ffmpeg/ffprobe，无法运行视频冒烟测试");
    smoke.exitEnvironment("未找到 ffmpeg/ffprobe（内置二进制缺失？见 apps/electron/bin/ffmpeg）", { app });
    return;
    return;
  }

  // 两段不同分辨率：拼接目标尺寸取首段，便于验证「拖拽调整顺序」确实生效
  makeClip(clipA, { pattern: "testsrc", duration: 4, withAudio: true, size: "320x240" });
  makeClip(clipB, { pattern: "testsrc2", duration: 3, withAudio: true, size: "640x360" });

    // 用真实的导入/导出对话框路径驱动 UI，不改动渲染进程代码
  let folderDialogCalls = 0;
  dialog.showOpenDialog = async (options) => {
    const title = String(options?.title ?? "");
    if (title.includes("视频文件")) return { canceled: false, filePaths: [clipA, clipB] };
    // 「选择输出文件夹」必须返回目录而不是文件
    if (title.includes("输出文件夹")) {
      folderDialogCalls += 1;
      check(
        "输出选择使用文件夹对话框（非保存文件）",
        Array.isArray(options?.properties) && options.properties.includes("openDirectory"),
        JSON.stringify(options?.properties ?? [])
      );
      return { canceled: false, filePaths: [outDir] };
    }
    return { canceled: true, filePaths: [] };
  };
  dialog.showSaveDialog = async () => {
    check("已选择文件夹时不再弹出「保存文件」对话框", false, "showSaveDialog 被调用");
    return { canceled: true, filePath: undefined };
  };

  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // 与真实应用 main.js 一致：preload 是手写 CommonJS，需 Node 环境才能 require 本地模块
      sandbox: false,
      // 必须加载 preload，否则渲染进程拿不到 window.electronAPI
      preload: path.join(__dirname, "..", "apps", "electron", "preload.js"),
    },
  });

  const consoleErrors = [];
  win.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2) consoleErrors.push(message);
  });

  smoke.attachWebContents(win.webContents);
  // 窗口约定 + 可选的遮挡维度（SMOKE_OCCLUDE=1 时把整个套件跑在被遮挡条件下）
  await smoke.hardenWindow(win);
  const run = smoke.createRun();

  /** 轮询等待渲染进程内的条件成立 */
  const waitFor = async (expression, timeoutMs = 8000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const ok = await run(`(() => { try { return Boolean(${expression}); } catch { return false; } })()`);
      if (ok) return true;
      await sleep(200);
    }
    return false;
  };

  const dismissAnnouncement = async () => {
    for (let i = 0; i < 5; i += 1) {
      await sleep(500);
      const done = await run(`(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(
          (b) => b.textContent.trim() === '知道了'
        );
        if (btn) { btn.click(); return true; }
        return false;
      })()`);
      if (done) { await sleep(300); return; }
    }
  };

  try {
    // ---------- 1. 打开页面并导入两个片段 ----------
    await win.loadURL("app://app/toolBox/video");
    await sleep(2500);
    await dismissAnnouncement();

    const hasApi = await run(`Boolean(window.electronAPI && window.electronAPI.videoPickFile)`);
    check("preload 已注入 window.electronAPI", hasApi === true);
    if (!hasApi) throw new Error("window.electronAPI 缺失，无法继续 UI 冒烟测试");

    const initial = await run(`(() => {
      const text = document.body.innerText;
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent.includes('点击添加视频片段')
      );
      if (btn) btn.click();
      return { title: text.includes('视频剪辑'), importZone: !!btn };
    })()`);
    check("视频剪辑页渲染完成", initial.title === true);
    check("空态显示导入区", initial.importZone === true);

    const imported = await waitFor(
      `Array.from(document.querySelectorAll('[aria-label="拖拽排序"]')).length === 2`,
      20000
    );
    const listInfo = await run(`(() => {
      const text = document.body.innerText;
      return {
        handles: document.querySelectorAll('[aria-label="拖拽排序"]').length,
        hasSummary: text.includes('已添加 2 个片段'),
        hasClipA: text.includes('clip-a.mp4'),
        hasClipB: text.includes('clip-b.mp4'),
        hasContinue: text.includes('继续添加'),
        concatNote: text.includes('将按列表顺序拼接 2 个片段'),
        noAccurateCut: !text.includes('精确剪切'),
      };
    })()`);
    check("两个片段进入卡片列表", imported && listInfo.handles === 2, `handles=${listInfo.handles}`);
    check("导入区切换为「已添加 2 个片段」", listInfo.hasSummary && listInfo.hasContinue);
    check("卡片显示两段文件名", listInfo.hasClipA && listInfo.hasClipB);
    check("导出区提示按列表顺序拼接", listInfo.concatNote);
    check("多片段时隐藏无损剪切选项", listInfo.noAccurateCut);

    // ---------- 2. 时间轴：拖动 ] 标记，检查画面同步跳帧 ----------
    await waitFor(
      `(() => { const v = document.querySelector('video'); return v && v.readyState >= 1; })()`,
      15000
    );
    const timeline = await run(`(() => {
      const inMarker = document.querySelector('[aria-label="拖动设置起点"]');
      const outMarker = document.querySelector('[aria-label="拖动设置终点"]');
      const video = document.querySelector('video');
      return {
        hasIn: !!inMarker,
        hasOut: !!outMarker,
        hasVideo: !!video,
        duration: video ? video.duration : 0,
        nativeControls: video ? video.hasAttribute('controls') : true,
      };
    })()`);
    check("时间轴存在起点/终点 | 标记", timeline.hasIn && timeline.hasOut);
    check("预览为 4 秒的片段 A", Math.abs(timeline.duration - 4) < 0.3, `${timeline.duration.toFixed(2)}s`);
    check("预览未使用原生播放条", timeline.nativeControls === false);

    // ---------- 2a. 连续拖动：画面必须随拖动不断刷新（不能只在松手时跳一次） ----------
    await run(`(() => {
      const video = document.querySelector('video');
      window.__seekLog = { started: 0, completed: 0, times: [] };
      video.addEventListener('seeking', () => { window.__seekLog.started += 1; });
      video.addEventListener('seeked', () => {
        window.__seekLog.completed += 1;
        window.__seekLog.times.push(Number(video.currentTime.toFixed(3)));
      });
      return true;
    })()`);

    const dragSteps = 8;
    await run(`(() => {
      const marker = '[aria-label="拖动设置起点"]';
      const track = document.querySelector(marker).parentElement;
      const rect = track.getBoundingClientRect();
      window.__dragTrack = { left: rect.left, width: rect.width, top: rect.top, height: rect.height };
      const mk = (type, x, buttons) => new PointerEvent(type, {
        bubbles: true, cancelable: true, composed: true,
        clientX: x, clientY: rect.top + rect.height / 2,
        pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons,
      });
      document.querySelector(marker).dispatchEvent(mk('pointerdown', rect.left + 1, 1));
      return true;
    })()`);
    await sleep(200);

    for (let step = 1; step <= dragSteps; step += 1) {
      await run(`(() => {
        const track = document.querySelector('[aria-label="拖动设置起点"]').parentElement;
        const rect = window.__dragTrack;
        const x = rect.left + (rect.width * 0.7 * ${step}) / ${dragSteps};
        track.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true, cancelable: true, composed: true,
          clientX: x, clientY: rect.top + rect.height / 2,
          pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1,
        }));
        return true;
      })()`);
      // 150ms 一步：比 seek 完成更快，正是过去画面卡住的节奏
      await sleep(150);
    }

    await run(`(() => {
      const track = document.querySelector('[aria-label="拖动设置起点"]').parentElement;
      const rect = window.__dragTrack;
      track.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, composed: true,
        clientX: rect.left + rect.width * 0.7, clientY: rect.top + rect.height / 2,
        pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 0,
      }));
      return true;
    })()`);
    await sleep(1200);

    const continuous = await run(`(() => {
      const log = window.__seekLog || { started: 0, completed: 0, times: [] };
      const video = document.querySelector('video');
      const distinct = Array.from(new Set(log.times.map((t) => t.toFixed(1))));
      return {
        started: log.started,
        completed: log.completed,
        distinct: distinct.length,
        times: log.times,
        currentTime: video ? video.currentTime : -1,
      };
    })()`);
    check(
      "快速连续拖动时 seek 能逐个完成（画面持续刷新）",
      continuous.completed >= 4,
      `completed=${continuous.completed} times=${JSON.stringify(continuous.times)}`
    );
    check(
      "拖动过程中画面到达多个不同位置（非只跳最后一帧）",
      continuous.distinct >= 3,
      `distinct=${continuous.distinct} times=${JSON.stringify(continuous.times)}`
    );
    check(
      "预览位置随拖动单调推进到终点",
      continuous.times.length >= 2 &&
        continuous.times[continuous.times.length - 1] >
          continuous.times[0],
      JSON.stringify(continuous.times)
    );
    check(
      "松手后停在起点标记对应位置（约 2.8 秒）",
      Math.abs(continuous.currentTime - 2.8) < 0.45,
      `${continuous.currentTime.toFixed(3)}s`
    );

    // 复位：起点回到 0，后面的用例按原始区间继续
    await run(`(() => {
      const marker = '[aria-label="拖动设置起点"]';
      const track = document.querySelector(marker).parentElement;
      const rect = window.__dragTrack;
      const mk = (type, x, buttons) => new PointerEvent(type, {
        bubbles: true, cancelable: true, composed: true,
        clientX: x, clientY: rect.top + rect.height / 2,
        pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons,
      });
      document.querySelector(marker).dispatchEvent(mk('pointerdown', rect.left + rect.width * 0.7, 1));
      return true;
    })()`);
    await sleep(150);
    await run(`(() => {
      const track = document.querySelector('[aria-label="拖动设置起点"]').parentElement;
      const rect = window.__dragTrack;
      track.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, cancelable: true, composed: true,
        clientX: rect.left + 1, clientY: rect.top + rect.height / 2,
        pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1,
      }));
      track.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, composed: true,
        clientX: rect.left + 1, clientY: rect.top + rect.height / 2,
        pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 0,
      }));
      return true;
    })()`);
    await sleep(600);
    const resetStart = await run(`(() => {
      const text = document.body.innerText;
      return (text.match(/起点 (\\d+:\\d+(?:\\.\\d+)?)/) || [])[1] || '';
    })()`);
    check("拖动结束后起点可复位到 0", parseHms(resetStart) < 0.1, resetStart);


    // 分三步派发原生指针事件（中间留出 React 提交状态的时间），模拟真实拖动
    const pointerDown = await run(`(() => {
      const track = document.querySelector('[aria-label="拖动设置终点"]').parentElement;
      const rect = track.getBoundingClientRect();
      window.__trackRect = { left: rect.left, width: rect.width, top: rect.top, height: rect.height };
      const mk = (type, x) => new PointerEvent(type, {
        bubbles: true, cancelable: true, composed: true,
        clientX: x, clientY: rect.top + rect.height / 2,
        pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1,
      });
      document.querySelector('[aria-label="拖动设置终点"]')
        .dispatchEvent(mk('pointerdown', rect.left + rect.width - 1));
      return { width: rect.width, height: rect.height };
    })()`);
    check("时间轴可测量（存在真实布局）", pointerDown.width > 50, `${pointerDown.width}x${pointerDown.height}`);

    await sleep(250);
    const pointerMove = await run(`(() => {
      const track = document.querySelector('[aria-label="拖动设置终点"]').parentElement;
      const rect = window.__trackRect;
      track.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, cancelable: true, composed: true,
        clientX: rect.left + rect.width * 0.4, clientY: rect.top + rect.height / 2,
        pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1,
      }));
      return true;
    })()`);
    check("已派发拖动中的 pointermove", pointerMove === true);

    await sleep(400);
    await run(`(() => {
      const track = document.querySelector('[aria-label="拖动设置终点"]').parentElement;
      const rect = window.__trackRect;
      track.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, composed: true,
        clientX: rect.left + rect.width * 0.4, clientY: rect.top + rect.height / 2,
        pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 0,
      }));
      return true;
    })()`);
    await sleep(300);
    const afterDrag = await run(`(() => {
      const text = document.body.innerText;
      const video = document.querySelector('video');
      return {
        end: (text.match(/终点 (\\d+:\\d+(?:\\.\\d+)?)/) || [])[1] || '',
        selection: (text.match(/选取 (\\d+:\\d+(?:\\.\\d+)?)/) || [])[1] || '',
        currentTime: video ? video.currentTime : -1,
      };
    })()`);
    const draggedEnd = parseHms(afterDrag.end);
    check("拖动 ] 后终点约等于 40% 时长", Math.abs(draggedEnd - 1.6) < 0.25, afterDrag.end || "未解析");
    check(
      "拖动时视频画面同步跳到对应帧",
      Math.abs(afterDrag.currentTime - draggedEnd) < 0.3,
      `currentTime=${afterDrag.currentTime.toFixed(3)} 终点=${afterDrag.end}`
    );
    const clipASelection = parseHms(afterDrag.selection);
    check("片段 A 选区时长为 0 → 终点", Math.abs(clipASelection - draggedEnd) < 0.25, afterDrag.selection);

    // ---------- 3. 切到片段 B：走带 + 设为起点 ----------
    const switched = await run(`(() => {
      const cards = Array.from(document.querySelectorAll('[aria-label="拖拽排序"]'));
      const buttons = Array.from(document.querySelectorAll('button'));
      const clipBButton = buttons.find((b) => b.textContent.includes('clip-b.mp4'));
      if (clipBButton) clipBButton.click();
      return { cards: cards.length, clicked: !!clipBButton };
    })()`);
    await sleep(1200);
    const clipBState = await run(`(() => {
      const text = document.body.innerText;
      const video = document.querySelector('video');
      return {
        header: text.includes('第 2 段'),
        duration: video ? video.duration : 0,
        end: (text.match(/终点 (\\d+:\\d+(?:\\.\\d+)?)/) || [])[1] || '',
      };
    })()`);
    check("点击卡片切换到片段 B", switched.clicked && clipBState.header);
    check("片段 B 时长为 3 秒（独立状态）", Math.abs(clipBState.duration - 3) < 0.3, `${clipBState.duration.toFixed(2)}s`);
    check("片段 B 默认终点为自身时长", Math.abs(parseHms(clipBState.end) - 3) < 0.3, clipBState.end);

    await run(`(() => {
      document.querySelector('[aria-label="前进 1 秒"]').click();
      return true;
    })()`);
    await sleep(500);
    await run(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent.includes('设为起点')
      );
      btn.click();
      return true;
    })()`);
    await sleep(400);
    const clipBTrimmed = await run(`(() => {
      const text = document.body.innerText;
      return {
        start: (text.match(/起点 (\\d+:\\d+(?:\\.\\d+)?)/) || [])[1] || '',
        selection: (text.match(/选取 (\\d+:\\d+(?:\\.\\d+)?)/) || [])[1] || '',
      };
    })()`);
    const clipBStart = parseHms(clipBTrimmed.start);
    const clipBSelection = parseHms(clipBTrimmed.selection);
    check("走带 1 秒后「设为起点」生效", Math.abs(clipBStart - 1) < 0.3, clipBTrimmed.start);
    check("片段 B 选区时长为 2 秒", Math.abs(clipBSelection - 2) < 0.35, clipBTrimmed.selection);

    // ---------- 4. 选择输出文件夹 + 拼接导出（真实 ffmpeg） ----------
    const folderPanel = await run(`(() => {
      const text = document.body.innerText;
      return {
        hasFolderLabel: text.includes('输出文件夹'),
        pickLabel: Array.from(document.querySelectorAll('button')).some(
          (b) => b.textContent.trim() === '选择文件夹'
        ),
        fallbackHint: text.includes('会弹出保存文件对话框'),
      };
    })()`);
    check("导出区标题为「输出文件夹」", folderPanel.hasFolderLabel === true);
    check("按钮为「选择文件夹」（而非保存文件）", folderPanel.pickLabel === true);
    check("提示未选文件夹时会弹出保存对话框", folderPanel.fallbackHint === true);

    await run(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent.trim() === '选择文件夹'
      );
      btn.click();
      return true;
    })()`);
    await sleep(800);

    const folderChosen = await run(`(() => {
      const text = document.body.innerText;
      const input = document.querySelector('#export-file-name');
      return {
        showsFolder: text.includes(${JSON.stringify(outDir)}),
        autoName: input ? input.value : '',
      };
    })()`);
    check("界面显示已选择的输出文件夹", folderChosen.showsFolder === true);
    check("自动生成的文件名出现在输入框（clip-a_x2.mp4）",
      folderChosen.autoName === "clip-a_x2.mp4", folderChosen.autoName);

    await run(`(() => {
      const btn = document.querySelector('[data-testid="video-export-run"]');
      btn.click();
      return true;
    })()`);

    const exported = await waitFor(`document.body.innerText.includes('导出完成')`, 90000);
    check("拼接导出在界面报告完成", exported === true);

    const exportedFiles = listExports();
    check("导出文件落在所选文件夹中", exportedFiles.length === 1, exportedFiles.join(", "));
    const output = exportedFiles.length > 0 ? probeOutput(exportedFiles[0]) : null;
    const expected = clipASelection + clipBSelection;
    check("输出文件已生成", Boolean(output));
    if (output) {
      check(
        "输出时长 = 两段选区之和",
        Math.abs(output.duration - expected) < 0.4,
        `${output.duration.toFixed(3)}s vs ${expected.toFixed(3)}s`
      );
      check("输出分辨率对齐首段 320x240", output.width === 320 && output.height === 240,
        `${output.width}x${output.height}`);
      check("输出保留音轨", output.hasAudio === true);
      check("文件名为自动生成", path.basename(exportedFiles[0]) === "clip-a_x2.mp4",
        path.basename(exportedFiles[0]));
    }

    // ---------- 4b. 自定义文件名 + 更换文件夹 ----------
    const renameVisible = await run(`(() => {
      const text = document.body.innerText;
      return {
        canRename: Array.from(document.querySelectorAll('button')).some(
          (b) => b.textContent.trim() === '更换文件夹'
        ),
        hasInput: !!document.querySelector('#export-file-name'),
        hint: text.includes('同名文件会自动追加序号'),
      };
    })()`);
    check("已选文件夹后按钮为「更换文件夹」", renameVisible.canRename === true);
    check("提供可编辑的文件名输入框", renameVisible.hasInput === true);
    check("说明同名文件不会覆盖", renameVisible.hint === true);

    await run(`(() => {
      const input = document.querySelector('#export-file-name');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, '拼接成品');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(300);
    const renamed = await run(`(() => {
      const input = document.querySelector('#export-file-name');
      return {
        value: input ? input.value : '',
        hint: /实际导出为：拼接成品\\.mp4/.test(document.body.innerText),
      };
    })()`);
    check("输入框保留原始输入（不打断输入）", renamed.value === "拼接成品", renamed.value);
    check("提示实际导出文件名（自动补 .mp4）", renamed.hint === true);

    await run(`(() => {
      const btn = document.querySelector('[data-testid="video-export-run"]');
      btn.click();
      return true;
    })()`);
    const renamedExported = await (async () => {
      const target = path.join(outDir, "拼接成品.mp4");
      const deadline = Date.now() + 90000;
      while (Date.now() < deadline) {
        if (fs.existsSync(target) && fs.statSync(target).size > 0) {
          await sleep(600);
          return true;
        }
        await sleep(300);
      }
      return false;
    })();
    check("自定义文件名导出成功", renamedExported,
      listExports().map((f) => path.basename(f)).join(", "));

    // 恢复自动命名
    await run(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent.trim() === '恢复自动命名'
      );
      btn.click();
      return true;
    })()`);
    await sleep(300);
    const afterReset = await run(`(() => {
      const input = document.querySelector('#export-file-name');
      return input ? input.value : '';
    })()`);
    check("「恢复自动命名」还原为参数化文件名",
      afterReset === "clip-a_x2.mp4", afterReset);

    // 更换文件夹：可以再次选择
    const callsBefore = folderDialogCalls;
    await run(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent.trim() === '更换文件夹'
      );
      btn.click();
      return true;
    })()`);
    await sleep(700);
    check("可以再次选择输出文件夹", folderDialogCalls === callsBefore + 1,
      `calls=${folderDialogCalls}`);

    // 回归：导出完成后「开始处理」按钮必须停止转圈
    const buttonState = await run(`(() => {
      const btn = document.querySelector('[data-testid="video-export-run"]');
      if (!btn) return { found: false };
      return {
        found: true,
        spinning: !!btn.querySelector('.animate-spin'),
        hasCancel: Array.from(document.querySelectorAll('button')).some(
          (b) => b.textContent.trim() === '取消'
        ),
      };
    })()`);
    check("导出完成后不再显示转圈图标（bug 回归）",
      buttonState.found === true && buttonState.spinning === false,
      `spinning=${buttonState.spinning}`);
    check("导出完成后回到可再次处理状态", buttonState.hasCancel === false);

    // ---------- 5. 拖拽卡片调整拼接顺序（dnd-kit） ----------
    const orderBefore = await run(`(() => {
      const cards = Array.from(document.querySelectorAll('[aria-label="拖拽排序"]'))
        .map((handle) => handle.parentElement);
      return {
        first: cards[0] ? cards[0].innerText.replace(/\\s+/g, ' ').trim() : '',
        count: cards.length,
      };
    })()`);
    check("初始顺序为 A 在前", orderBefore.first.includes("clip-a.mp4"), orderBefore.first.slice(0, 60));

    await run(`(() => {
      const handles = document.querySelectorAll('[aria-label="拖拽排序"]');
      const cards = Array.from(handles).map((handle) => handle.parentElement);
      const from = cards[0].getBoundingClientRect();
      const to = cards[1].getBoundingClientRect();
      window.__dragStart = { x: from.left + 20, y: from.top + from.height / 2 };
      window.__dragEnd = { x: to.left + 20, y: to.bottom - 6 };
      handles[0].dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, composed: true,
        clientX: window.__dragStart.x, clientY: window.__dragStart.y,
        pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1,
      }));
      return { from, to: { top: to.top, bottom: to.bottom } };
    })()`);
    await sleep(250);
    for (const step of [0.25, 0.6, 1]) {
      await run(`(() => {
        const start = window.__dragStart;
        const end = window.__dragEnd;
        const x = start.x + (end.x - start.x) * ${step};
        const y = start.y + (end.y - start.y) * ${step};
        document.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true, cancelable: true, composed: true,
          clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1,
        }));
        return true;
      })()`);
      await sleep(180);
    }
    await run(`(() => {
      const end = window.__dragEnd;
      document.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, composed: true,
        clientX: end.x, clientY: end.y, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 0,
      }));
      return true;
    })()`);
    await sleep(600);

    const orderAfter = await run(`(() => {
      const cards = Array.from(document.querySelectorAll('[aria-label="拖拽排序"]'))
        .map((handle) => handle.parentElement);
      const text = document.body.innerText;
      return {
        first: cards[0] ? cards[0].innerText.replace(/\\s+/g, ' ').trim() : '',
        count: cards.length,
        orderNote: text.includes('对齐首段 640×360'),
      };
    })()`);
    check("拖拽后 B 排到最前（顺序即拼接顺序）",
      orderAfter.count === 2 && orderAfter.first.includes("clip-b.mp4"),
      orderAfter.first.slice(0, 60));
    check("界面同步到新首段尺寸 640×360", orderAfter.orderNote === true);

    // ---------- 6. 按新顺序再次导出：目标尺寸应随首段变化，文件名随之更新 ----------
    await run(`(() => {
      const btn = document.querySelector('[data-testid="video-export-run"]');
      btn.click();
      return true;
    })()`);

    const reExported = await (async () => {
      const deadline = Date.now() + 90000;
      while (Date.now() < deadline) {
        if (listExports().length >= 3) {
          await sleep(800);
          return true;
        }
        await sleep(300);
      }
      return false;
    })();
    check("按新顺序重新导出完成", reExported === true);
    if (reExported) {
      const files = listExports();
      const newest = files[0];
      check("新首段生成新文件名（clip-b_x2.mp4）",
        path.basename(newest) === "clip-b_x2.mp4", path.basename(newest));
      check("历史导出文件均未被覆盖", files.length === 3,
        files.map((f) => path.basename(f)).join(", "));
      const second = probeOutput(newest);
      check("重新拼接后尺寸对齐新首段 640x360",
        second.width === 640 && second.height === 360, `${second.width}x${second.height}`);
      check("重新拼接后时长仍为两段选区之和",
        Math.abs(second.duration - expected) < 0.4, `${second.duration.toFixed(3)}s`);
    }

    if (consoleErrors.length > 0) {
      console.log("--- 渲染进程 console 错误 ---");
      consoleErrors.slice(0, 10).forEach((line) => console.log("  " + line));
    }

    const allPassed = smoke.allPassed();
    console.log(allPassed ? "VIDEO EDITOR SMOKE OK ✓" : "VIDEO EDITOR SMOKE FAILED ✗");
    await smoke.finish({ app, ok: allPassed, cleanupDir: workDir });
  } catch (error) {
    console.error("SMOKE_FAIL", error);
    await smoke.finish({ app, ok: false, error });
  }
});
