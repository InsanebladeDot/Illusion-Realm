/**
 * GIF 转换器 UI 冒烟测试（真实 Electron 渲染进程 + 真实 ffmpeg）
 *
 * 覆盖：
 *  1. 复用视频剪辑台的导入 → 片段卡片 → PR 时间轴剪切
 *  2. 帧率组合框：点击输入框自定义（1–120，超出自动夹取） + 点箭头展开预设（推荐 20）
 *  3. 分辨率等比缩放滑块（≤ 源分辨率）
 *  4. 导出路径三种情况：
 *     a) 未选文件夹 → 点击开始处理弹出「保存文件」对话框，写到指定文件
 *     b) 选择文件夹 → 只需改**前缀名**（.gif 为固定后缀），写入该文件夹
 *     c) 更换文件夹 → 可再次选择，新文件写进新目录；同名文件追加序号不覆盖
 *  5. 回归：导出完成后「开始处理」按钮不再转圈
 *
 * 运行：npx electron scripts/smoke-gif-editor.js   （退出码 0 = 通过）
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
const smoke = createSmokeHarness({ name: "gif-editor" });
smoke.installConsoleTee();
const check = smoke.check;
const results = smoke.results;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseHms(text) {
  const match = String(text).match(/(\d+):(\d+)(?:\.(\d+))?/);
  if (!match) return Number.NaN;
  const [, a, b, ms] = match;
  return Number(a) * 60 + Number(b) + (ms ? Number(`0.${ms}`) : 0);
}

const tools = resolveTools();
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "gif-editor-smoke-"));
smoke.setWorkDir(workDir);
const clipDir = path.join(workDir, "clips");
const outDirA = path.join(workDir, "out-a");
const outDirB = path.join(workDir, "out-b");
const savedFilePath = path.join(workDir, "另存为动图.gif");
for (const dir of [clipDir, outDirA, outDirB]) fs.mkdirSync(dir, { recursive: true });

const clipA = path.join(clipDir, "clip-a.mp4");
const clipB = path.join(clipDir, "clip-b.mp4");

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

function makeClip(target, { pattern, size, duration }) {
  const args = [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", `${pattern}=size=${size}:rate=25`,
    "-f", "lavfi", "-i", "sine=frequency=440",
    "-t", String(duration), "-pix_fmt", "yuv420p", "-c:v", "libx264",
    "-c:a", "aac", "-shortest", target,
  ];
  const result = spawnSync(tools.ffmpegPath, args, { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`生成测试片段失败：${result.stderr}`);
}

function probeGif(file) {
  const out = spawnSync(
    tools.ffprobePath,
    ["-v", "error", "-show_entries", "stream=codec_type,width,height,nb_frames,avg_frame_rate",
     "-of", "json", file],
    { encoding: "utf8", windowsHide: true }
  );
  const data = JSON.parse(String(out.stdout));
  const video = (data.streams || []).find((s) => s.codec_type === "video");
  const [num, den] = String(video?.avg_frame_rate ?? "0/1").split("/").map(Number);
  return {
    width: Number(video?.width ?? 0),
    height: Number(video?.height ?? 0),
    frames: Number(video?.nb_frames ?? 0),
    fps: den ? num / den : 0,
  };
}

function listGifs(dir) {
  return fs
    .readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".gif"))
    .map((name) => path.join(dir, name));
}

app.whenReady().then(async () => {
  smoke.installWatchdog(app);
  // 陈旧产物会伪装成代码回归，先拦掉（退出码 2）
  smoke.assertBuildFresh({ app });
  if (!tools.ffmpegPath || !tools.ffprobePath) {
    console.error("未找到 ffmpeg/ffprobe，无法运行 GIF 冒烟测试");
    smoke.exitEnvironment("未找到 ffmpeg/ffprobe（内置二进制缺失？见 apps/electron/bin/ffmpeg）", { app });
    return;
    return;
  }

  makeClip(clipA, { pattern: "testsrc", size: "320x240", duration: 3 });
  makeClip(clipB, { pattern: "testsrc2", size: "640x360", duration: 2 });

  // 文件夹选择按调用顺序依次返回 A、B 两个目录，用于验证「可再次选择」
  const folderQueue = [outDirA, outDirB];
  const openDialogLog = [];
  const saveDialogLog = [];

  dialog.showOpenDialog = async (options) => {
    const title = String(options?.title ?? "");
    openDialogLog.push({ title, properties: options?.properties });
    if (title.includes("视频文件")) {
      return { canceled: false, filePaths: [clipA, clipB] };
    }
    if (title.includes("输出文件夹")) {
      check(
        "输出选择使用文件夹对话框（openDirectory）",
        Array.isArray(options?.properties) && options.properties.includes("openDirectory"),
        JSON.stringify(options?.properties ?? [])
      );
      const next = folderQueue.shift();
      if (!next) return { canceled: true, filePaths: [] };
      return { canceled: false, filePaths: [next] };
    }
    return { canceled: true, filePaths: [] };
  };

  dialog.showSaveDialog = async (options) => {
    saveDialogLog.push({ title: String(options?.title ?? ""), defaultPath: options?.defaultPath });
    return { canceled: false, filePath: savedFilePath };
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

  /** 等待导出文件真实落盘 */
  const waitForFile = async (file, timeoutMs = 90000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (fs.existsSync(file) && fs.statSync(file).size > 0) {
        await sleep(500);
        return true;
      }
      await sleep(250);
    }
    return false;
  };

  const clickByText = (text) =>
    run(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent.trim() === ${JSON.stringify(text)}
      );
      if (btn) btn.click();
      return !!btn;
    })()`);

  const clickStart = () =>
    run(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent.includes('开始处理')
      );
      if (btn) btn.click();
      return !!btn;
    })()`);

  const openFpsList = () =>
    run(`(() => {
      document.querySelector('[aria-label="展开预设帧率"]').click();
      return true;
    })()`);

  const pickFpsPreset = (value) =>
    run(`(() => {
      const option = Array.from(document.querySelectorAll('[role="option"]')).find(
        (o) => Number(o.querySelector('span')?.textContent?.trim()) === ${value}
      );
      if (option) option.click();
      return !!option;
    })()`);

  /** 在帧率输入框中键入并提交（受控组件：原生 setter + input 事件 + React 监听的 focusout） */
  const typeFps = async (raw) => {
    await run(`(() => {
      const input = document.querySelector('#gif-fps');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(raw)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      return true;
    })()`);
    await sleep(400);
    return run(`(() => { const i = document.querySelector('#gif-fps'); return i ? i.value : ''; })()`);
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
    await win.loadURL("app://app/toolBox/gif");
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
      return { title: text.includes('GIF 转换器'), importZone: !!btn };
    })()`);
    check("GIF 页渲染完成", initial.title === true);
    check("空态复用视频导入区", initial.importZone === true);

    const imported = await waitFor(
      `document.querySelectorAll('[aria-label="拖拽排序"]').length === 2`,
      20000
    );
    const listInfo = await run(`(() => {
      const text = document.body.innerText;
      return {
        handles: document.querySelectorAll('[aria-label="拖拽排序"]').length,
        hasTrim: text.includes('剪切区间'),
        hasTimeline: !!document.querySelector('[aria-label="拖动设置起点"]'),
      };
    })()`);
    check("两个片段进入卡片列表", imported && listInfo.handles === 2, `handles=${listInfo.handles}`);
    check("复用 PR 风格时间轴", listInfo.hasTrim && listInfo.hasTimeline);

    // ---------- 帧率：可输入 + 可下拉 ----------
    const fpsPanel = await run(`(() => {
      const input = document.querySelector('#gif-fps');
      const text = document.body.innerText;
      return {
        exists: !!input,
        tag: input ? input.tagName.toLowerCase() : '',
        role: input ? input.getAttribute('role') : '',
        value: input ? input.value : null,
        hasChevron: !!document.querySelector('[aria-label="展开预设帧率"]'),
        unitShown: text.includes('帧/秒'),
        limitNote: text.includes('上限 120'),
      };
    })()`);
    check("帧率控件为可输入组合框",
      fpsPanel.exists && fpsPanel.tag === "input" && fpsPanel.role === "combobox",
      `${fpsPanel.tag}/${fpsPanel.role}`);
    check("默认 20 帧/秒", fpsPanel.value === "20", String(fpsPanel.value));
    check("右侧有展开下拉的箭头按钮", fpsPanel.hasChevron === true);
    check("显示单位与 120 上限说明", fpsPanel.unitShown && fpsPanel.limitNote);

    await openFpsList();
    await sleep(400);
    const optionList = await run(`(() => {
      const options = Array.from(document.querySelectorAll('[role="option"]'));
      const selected = options.filter((o) => o.getAttribute('aria-selected') === 'true');
      return {
        values: options.map((o) => Number(o.querySelector('span')?.textContent?.trim())),
        recommendedMarked: options.some((o) => o.textContent.includes('推荐')),
        selectedValue: selected.length === 1
          ? Number(selected[0].querySelector('span')?.textContent?.trim())
          : null,
      };
    })()`);
    check(
      "下拉提供 1/5/10/20/30/60/120",
      JSON.stringify(optionList.values) === JSON.stringify([1, 5, 10, 20, 30, 60, 120]),
      JSON.stringify(optionList.values)
    );
    check("20 标注为推荐", optionList.recommendedMarked === true);
    check("当前值在下拉中高亮", optionList.selectedValue === 20, String(optionList.selectedValue));

    await pickFpsPreset(10);
    await sleep(400);
    const afterPick = await run(`(() => {
      const input = document.querySelector('#gif-fps');
      return {
        value: input ? input.value : '',
        panelClosed: document.querySelectorAll('[role="option"]').length === 0,
      };
    })()`);
    check("点选预设后生效并收起下拉", afterPick.value === "10" && afterPick.panelClosed === true,
      afterPick.value);

    const clampedHigh = await typeFps("300");
    check("自定义超过 120 自动夹取到 120", clampedHigh === "120", clampedHigh);
    const clampedLow = await typeFps("0");
    check("自定义小于 1 自动夹取到 1", clampedLow === "1", clampedLow);

    const customFps = await typeFps("45");
    const customHint = await run(`(() => document.body.innerText.includes('45 FPS'))()`);
    check("自定义帧率生效（45）", customFps === "45" && customHint === true, customFps);

    // 回到 10fps 继续后面的导出用例
    await openFpsList();
    await sleep(400);
    await pickFpsPreset(10);
    await sleep(400);

    // ---------- 分辨率滑块 ----------
    const sliderInfo = await run(`(() => {
      const slider = document.querySelector('[aria-label="GIF 输出宽度"]');
      return {
        exists: !!slider,
        max: slider ? Number(slider.max) : 0,
        value: slider ? Number(slider.value) : 0,
      };
    })()`);
    check("存在分辨率滑块", sliderInfo.exists === true);
    check("滑块上限 = 源分辨率 320", sliderInfo.max === 320, String(sliderInfo.max));
    check("默认宽度取源分辨率", sliderInfo.value === 320, String(sliderInfo.value));

    await run(`(() => {
      const slider = document.querySelector('[aria-label="GIF 输出宽度"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(slider, '160');
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(400);
    const afterSlider = await run(`(() => {
      const text = document.body.innerText;
      return { panel: text.includes('160 × 120'), hint: text.includes('10 FPS · 160×120') };
    })()`);
    check("缩放后等比高度正确（160×120）", afterSlider.panel === true);
    check("导出说明同步参数", afterSlider.hint === true);

    // ---------- 拖动 ] 缩短选区 ----------
    await run(`(() => {
      const marker = '[aria-label="拖动设置终点"]';
      const track = document.querySelector(marker).parentElement;
      const rect = track.getBoundingClientRect();
      window.__trackRect = { left: rect.left, width: rect.width, top: rect.top, height: rect.height };
      document.querySelector(marker).dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true, cancelable: true, composed: true,
          clientX: rect.left + rect.width - 1, clientY: rect.top + rect.height / 2,
          pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1,
        })
      );
      return true;
    })()`);
    await sleep(250);
    await run(`(() => {
      const track = document.querySelector('[aria-label="拖动设置终点"]').parentElement;
      const rect = window.__trackRect;
      track.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, cancelable: true, composed: true,
        clientX: rect.left + rect.width * 0.5, clientY: rect.top + rect.height / 2,
        pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1,
      }));
      return true;
    })()`);
    await sleep(400);
    await run(`(() => {
      const track = document.querySelector('[aria-label="拖动设置终点"]').parentElement;
      const rect = window.__trackRect;
      track.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, composed: true,
        clientX: rect.left + rect.width * 0.5, clientY: rect.top + rect.height / 2,
        pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 0,
      }));
      return true;
    })()`);
    await sleep(300);

    const trimmed = await run(`(() => {
      const text = document.body.innerText;
      const video = document.querySelector('video');
      return {
        end: (text.match(/终点 (\\d+:\\d+(?:\\.\\d+)?)/) || [])[1] || '',
        frameNote: (text.match(/约 (\\d+) 帧/) || [])[1] || '',
        currentTime: video ? video.currentTime : -1,
      };
    })()`);
    const trimmedEnd = parseHms(trimmed.end);
    check("拖动 ] 后终点 ≈ 50% 时长（3 秒源 → 1.5 秒）",
      Math.abs(trimmedEnd - 1.5) < 0.2, trimmed.end);
    check("拖动时预览跳到对应帧",
      Math.abs(trimmed.currentTime - trimmedEnd) < 0.3,
      `currentTime=${trimmed.currentTime.toFixed(3)}`);
    check("帧数按 10fps × 两段选区（3.5s → 35 帧）估算",
      Math.abs(Number(trimmed.frameNote) - 35) <= 1, trimmed.frameNote);

    // ---------- a) 未选择文件夹 → 保存文件对话框 ----------
    const idlePanel = await run(`(() => {
      const text = document.body.innerText;
      return {
        hasFolderLabel: text.includes('输出文件夹'),
        pickLabel: Array.from(document.querySelectorAll('button')).some(
          (b) => b.textContent.trim() === '选择文件夹'
        ),
        hasNameInput: !!document.querySelector('#export-file-name'),
        fallbackHint: text.includes('会弹出保存文件对话框'),
      };
    })()`);
    check("导出区显示「输出文件夹」", idlePanel.hasFolderLabel === true);
    check("初始按钮为「选择文件夹」", idlePanel.pickLabel === true);
    check("提供可编辑的文件名输入框", idlePanel.hasNameInput === true);
    check("提示未选文件夹时会弹出保存对话框", idlePanel.fallbackHint === true);

    await clickStart();
    await waitForFile(savedFilePath);
    check("未选文件夹时点击开始处理弹出保存文件对话框", saveDialogLog.length === 1,
      JSON.stringify(saveDialogLog[0] ?? null));
    check("保存对话框默认文件名按参数生成",
      String(saveDialogLog[0]?.defaultPath ?? "").endsWith("clip-a_x2_10fps_160px.gif"),
      String(saveDialogLog[0]?.defaultPath ?? ""));
    check("导出到保存对话框指定的文件", fs.existsSync(savedFilePath), savedFilePath);
    check("该流程未使用文件夹对话框",
      openDialogLog.filter((entry) => entry.title.includes("输出文件夹")).length === 0);

    // ---------- b) 选择文件夹 + 只改前缀名 ----------
    await clickByText("选择文件夹");
    await sleep(700);
    const folderAChosen = await run(`(() => {
      const text = document.body.innerText;
      return {
        showsFolder: text.includes(${JSON.stringify(outDirA)}),
        renameLabel: Array.from(document.querySelectorAll('button')).some(
          (b) => b.textContent.trim() === '更换文件夹'
        ),
      };
    })()`);
    check("界面显示已选择的输出文件夹", folderAChosen.showsFolder === true);
    check("按钮变为「更换文件夹」（允许再次选择）", folderAChosen.renameLabel === true);

    const suffixInfo = await run(`(() => {
      const input = document.querySelector('#export-file-name');
      const suffix = Array.from(document.querySelectorAll('span')).find(
        (s) => s.textContent.trim() === '.gif'
      );
      return { value: input ? input.value : '', suffixShown: !!suffix };
    })()`);
    check("输入框只填前缀（自动名不带扩展名）",
      suffixInfo.value === "clip-a_x2_10fps_160px", suffixInfo.value);
    check(".gif 以固定后缀展示（无需手写扩展名）", suffixInfo.suffixShown === true);

    const CUSTOM_PREFIX = "我的动图";
    await run(`(() => {
      const input = document.querySelector('#export-file-name');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(CUSTOM_PREFIX)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(300);
    const nameEdited = await run(`(() => {
      const input = document.querySelector('#export-file-name');
      return {
        value: input ? input.value : '',
        resetVisible: Array.from(document.querySelectorAll('button')).some(
          (b) => b.textContent.trim() === '恢复自动命名'
        ),
      };
    })()`);
    check("输入框保留原始输入（不打断输入）", nameEdited.value === CUSTOM_PREFIX, nameEdited.value);
    check("出现「恢复自动命名」按钮", nameEdited.resetVisible === true);

    await clickStart();
    const customExported = await waitForFile(path.join(outDirA, `${CUSTOM_PREFIX}.gif`));
    check("自定义前缀名导出成功", customExported,
      listGifs(outDirA).map((f) => path.basename(f)).join(", "));
    if (customExported) {
      const customFile = path.join(outDirA, `${CUSTOM_PREFIX}.gif`);
      const gif = probeGif(customFile);
      const header = fs.readFileSync(customFile).subarray(0, 6).toString("ascii");
      check("输出是合法 GIF", /^GIF8[79]a$/.test(header), header);
      check("输出尺寸 160×120", gif.width === 160 && gif.height === 120, `${gif.width}x${gif.height}`);
      check("输出帧率 = 下拉设定 10", Math.abs(gif.fps - 10) < 0.6, `${gif.fps.toFixed(2)}fps`);
      check("帧数 ≈ 两段选区 3.5 秒 × 10fps", Math.abs(gif.frames - 35) <= 3, `${gif.frames} 帧`);
    }

    // ---------- c) 更换文件夹：再次选择并写入新目录 ----------
    await clickByText("更换文件夹");
    await sleep(700);
    const folderBChosen = await run(`(() => document.body.innerText.includes(${JSON.stringify(outDirB)}))()`);
    check("可以再次选择文件夹（更换为新目录）", folderBChosen === true, outDirB);

    await clickStart();
    const secondExported = await waitForFile(path.join(outDirB, `${CUSTOM_PREFIX}.gif`));
    check("新文件夹导出成功（沿用自定义前缀）", secondExported,
      listGifs(outDirB).map((f) => path.basename(f)).join(", "));

    await clickStart();
    const thirdExported = await waitForFile(path.join(outDirB, `${CUSTOM_PREFIX} (2).gif`));
    check("同名文件自动追加序号，不覆盖",
      thirdExported, listGifs(outDirB).map((f) => path.basename(f)).join(", "));

    // ---------- 回归：完成后按钮不再转圈 ----------
    const buttonState = await run(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent.includes('开始处理')
      );
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

    if (consoleErrors.length > 0) {
      console.log("--- 渲染进程 console 错误 ---");
      consoleErrors.slice(0, 10).forEach((line) => console.log("  " + line));
    }

    const allPassed = smoke.allPassed();
    console.log(allPassed ? "GIF EDITOR SMOKE OK ✓" : "GIF EDITOR SMOKE FAILED ✗");
    await smoke.finish({ app, ok: allPassed, cleanupDir: workDir });
  } catch (error) {
    console.error("SMOKE_FAIL", error);
    await smoke.finish({ app, ok: false, error });
  }
});
