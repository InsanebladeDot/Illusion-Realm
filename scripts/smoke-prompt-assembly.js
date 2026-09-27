/**
 * 高级提示词组装验证（任务规范 v2.1 · 方案 A：右侧面板联动）
 *
 * 覆盖：
 *  1. 全局开关默认关闭（单一输入框、不占额外空间），开启后右侧面板切换为组装面板
 *  2. 8 大分类 Tab + 已填角标 + 自定义分类（新增 / 删除）
 *  3. 逗号自动拼接（结尾已有英文逗号则不重复补）
 *  4. 只读合并预览 + 复制，并实时同步回中间提示词框
 *  5. 快捷插入词、模板保存 / 加载 / 删除、自定义分类落盘
 *  6. 生成时使用拼接结果；窄屏就地展开
 *
 * 运行：npx electron scripts/smoke-prompt-assembly.js   （退出码 0 = 通过）
 *
 * 退出码：0 通过 / 1 断言失败或异常 / 124 看门狗超时 / 125 进程内单步超时 /
 *         2 构建产物过期（`apps/next/out` 不是当前源码构建的，见 smoke-harness）
 *
 * 环境变量：
 *   SMOKE_OCCLUDE=1  额外开一个盖住被测窗口的置顶窗口，复现「窗口被遮挡」这一环境条件
 *                    （窄屏变体断言的抖动根因，见 webPreferences.backgroundThrottling 注释）
 *   SMOKE_SWALLOW_MEDIA_EVENT=change|all
 *                    在页面脚本执行前装 shim，吞掉 matchMedia 的 change 事件，
 *                    验证 useMediaQuery 的冗余触发（resize / visibilitychange）能否纠正变体；
 *                    `all` 连冗余触发一起掐断，作为负向对照（应失败，证明正向那条有区分度）
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, ipcMain: realIpcMain } = require("electron");
const { registerAppProtocol } = require("../apps/electron/appProtocol");
const { scanModelsInDirectory } = require("../apps/electron/modelScanner");
/**
 * 深浅色走的是**真实**主进程 handler（不是桩）：它只依赖 `nativeTheme`，
 * 没有外部副作用，装进来之后这条断言覆盖的是「IPC 契约 + 主进程行为 + 渲染进程接线 + 媒体查询真的翻」
 * 整条链路。若在这里写一个自己的桩，测试会在「主进程 handler 没注册」时依然绿 ——
 * 那正是这类开关最容易坏的方式。
 */
const {
  registerThemeHandlers,
} = require("../apps/electron/ipc-handlers/window.handlers");
const { createSmokeHarness } = require("./lib/smoke-harness");

const smoke = createSmokeHarness({ name: "prompt-assembly" });
smoke.installConsoleTee();
const check = smoke.check;

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
registerThemeHandlers();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-assembly-smoke-"));
smoke.setWorkDir(workDir);
const modelsRoot = path.join(workDir, "models");
const outputDir = path.join(workDir, "output");
fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(path.join(modelsRoot, "diffusion_models", "Anima"), { recursive: true });
fs.writeFileSync(
  path.join(modelsRoot, "diffusion_models", "Anima", "anima_aestheticV11.safetensors"),
  Buffer.alloc(64, 7)
);

const userDataFile = path.join(workDir, "illusion-realm.json");
fs.writeFileSync(
  userDataFile,
  JSON.stringify(
    {
      version: 1,
      userDataPath: userDataFile,
      settings: {
        userDataPath: userDataFile,
        outputPath: outputDir,
        comfyServerUrl: "http://127.0.0.1:8188",
        paths: {
          searchPath: modelsRoot,
          checkpointPath: "",
          lorasPath: "",
          diffusionModelsPath: "",
        },
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
ipcMain.handle("models:scan", async (_event, dirPath) => scanModelsInDirectory(dirPath));
/**
 * 图库的两个列表**故意慢 250ms**：骨架屏只在「读盘进行中」存在，
 * 桩要是瞬时返回，那条断言就永远看不到它（等于没测）。250ms 足够 MutationObserver 抓到，
 * 又不至于让整套冒烟明显变慢。
 */
ipcMain.handle("files:listGeneratedImages", async () => {
  await sleep(250);
  return [];
});
ipcMain.handle("files:listOutputFolders", async () => {
  await sleep(250);
  return [];
});
ipcMain.handle("files:readImageDataUrl", async () => null);
ipcMain.handle("changelog:read", async () => null);
ipcMain.handle("comfy:listModels", async () => ({ checkpoints: [], loras: [] }));

const capturedPrompts = [];
ipcMain.handle("comfy:generate", async (_event, prompt) => {
  capturedPrompts.push(JSON.parse(JSON.stringify(prompt)));
  return { promptId: `assembly-${capturedPrompts.length}`, images: [], videos: [] };
});

/** 角色库：给角色选择器提供 stub 数据 */
ipcMain.handle("animadex:search", async () => ({
  total: 1,
  page: 1,
  pageSize: 24,
  pages: 1,
  results: [
    {
      slug: "character_1",
      name: "Alice 1",
      copyright: "vocaloid",
      copyrightName: "Vocaloid",
      trigger: "hatsune miku, vocaloid",
      tags: ["1girl", "aqua eyes"],
      count: 12000,
      url: "",
      thumbUrl: "",
      imageUrl: "",
      hasImage: false,
      loras: [],
      rating: { up: 3, down: 0 },
      favCount: 9,
    },
  ],
}));

app.whenReady().then(async () => {
  smoke.installWatchdog(app);
  // 陈旧产物会伪装成代码回归，先拦掉（退出码 2）
  smoke.assertBuildFresh({ app });
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    // 显示且置顶：隐藏窗口下 Chromium 会暂停 CSS 过渡，面板/角标测不到真实状态
    show: true,
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // 与真实应用 main.js 一致：preload 是手写 CommonJS，需 Node 环境才能 require 本地模块
      sandbox: false,
      preload: path.join(__dirname, "..", "apps", "electron", "preload.js"),
      /**
       * 关闭后台节流。这一条不是「保险」，是**本套件窄屏断言的正确性前提**：
       *
       * 窗口被桌面上的其它窗口盖住时，Chromium 把页面标记为 hidden（`document.visibilityState`），
       * 渲染生命周期随之停摆。此时 `matchMedia()` 的**查询结果仍会重算**（读 `matches`、
       * `innerWidth` 都对），但 **change 事件永不派发** —— 于是 `useMediaQuery` 的 React state
       * 停在旧值，`data-prompt-assembly-variant` 永远不翻。
       *
       * 实验室复现（同一遮挡条件下对照，见 `scripts/lib/known-flakes.js`）：
       *   默认节流 → visibilityState=hidden, rAF 增长 0, change 事件 0 次, 变体停在 panel
       *   关闭节流 → visibilityState=visible, rAF 正常,  change 事件 1 次, 变体翻到 inline
       *
       * 因此**加长轮询时间救不了这条断言**（事件根本不派发），必须消除遮挡这个前提。
       */
      backgroundThrottling: false,
    },
  });

  const consoleErrors = [];
  win.webContents.on("console-message", (event) => {
    if (event.level === "error") consoleErrors.push(event.message);
  });

  smoke.attachWebContents(win.webContents);
  // 窗口约定 + 遮挡维度：遮挡是这套件历史上抖动的环境前提，见 hardenWindow 的注释
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

  /** 读取组装面板状态 */
  const readAssembly = () =>
    run(`(() => {
      const text = (selector) => document.querySelector(selector)?.textContent?.trim() ?? '';
      const panel = document.querySelector('[data-prompt-assembly]');
      return {
        panelExists: !!panel,
        variant: panel?.getAttribute('data-prompt-assembly-variant') ?? '',
        galleryExists: !!document.querySelector('[data-history-sidebar]'),
        badges: Array.from(document.querySelectorAll('[data-prompt-tab-badge]')).map(
          (el) => el.getAttribute('data-prompt-tab-badge')
        ),
        tabIds: Array.from(document.querySelectorAll('[data-prompt-tab]')).map(
          (el) => el.getAttribute('data-prompt-tab')
        ),
        tabLabels: Array.from(document.querySelectorAll('[data-prompt-tab]')).map(
          (el) => el.textContent.trim()
        ),
        removeButtons: Array.from(document.querySelectorAll('[data-prompt-tab-remove]')).map(
          (el) => el.getAttribute('data-prompt-tab-remove')
        ),
        merged: text('[data-prompt-merged]'),
        filled: text('[data-prompt-assembly-filled]'),
        activeInput: document.querySelector('[data-prompt-tab-input]')?.value ?? '',
        editorText: document.getElementById('prompt-editor')?.textContent?.trim() ?? '',
        editorEditable: document.getElementById('prompt-editor')?.getAttribute('contenteditable') ?? '',
        toggleChecked: document.querySelector('[data-advanced-prompt-toggle]')?.getAttribute('aria-checked') ?? '',
        templateOptions: Array.from(document.querySelectorAll('[data-prompt-template-select] option')).map(
          (el) => el.textContent.trim()
        ),
      };
    })()`);

  /** 读视口诊断：区分「媒体查询没重算」与「重算了但事件没派发」 */
  const readViewportDiag = () =>
    run(`({
      innerWidth: window.innerWidth,
      matches: window.matchMedia('(min-width: 1280px)').matches,
      visibility: document.visibilityState,
      hidden: document.hidden,
      occluded: typeof document.hasFocus === 'function' ? !document.hasFocus() : null,
    })`);

  /**
   * 轮询等待组装面板落到指定变体，**并把「等了多久 / 是否超时」返回给调用方**。
   *
   * 为什么不能沿用 `await waitFor(...)` 丢弃返回值：那条断言的失败细节只有
   * `variant=panel innerWidth=1000`，看门狗看不出「超时」还是「值不对」，
   * 排查只能靠猜。返回值让两种情形在输出里可区分。
   *
   * 轮询在主进程用 setTimeout —— 页面侧 rAF 会被后台节流（窗口最小化时甚至完全停摆），
   * 主进程计时器不受页面可见性影响，这正是这里不采用 rAF 节拍的原因。
   */
  const waitForVariant = async (expected, timeoutMs) => {
    const startedAt = Date.now();
    const variantNow = () =>
      run(`document.querySelector('[data-prompt-assembly]')?.getAttribute('data-prompt-assembly-variant') ?? ''`);
    while (Date.now() - startedAt < timeoutMs) {
      const variant = await variantNow();
      if (variant === expected) {
        return { ok: true, waitedMs: Date.now() - startedAt, variant };
      }
      await sleep(100);
    }
    return { ok: false, waitedMs: Date.now() - startedAt, variant: await variantNow() };
  };

  const selectTab = async (tabId) => {
    await run(`document.querySelector('[data-prompt-tab="${tabId}"]')?.click(); true`);
    await sleep(300);
  };

  const setTabContent = async (content) => {
    await run(`(() => {
      const el = document.querySelector('[data-prompt-tab-input]');
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(content)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(300);
  };

  const setInputValue = async (selector, value) => {
    await run(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      const prototype =
        el.tagName === 'SELECT'
          ? window.HTMLSelectElement.prototype
          : el.tagName === 'TEXTAREA'
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      return true;
    })()`);
    await sleep(250);
  };

  const clickSelector = async (selector) => {
    const clicked = await run(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (el) el.click(); return !!el; })()`
    );
    await sleep(400);
    return clicked;
  };

  try {
    await win.loadURL("app://app/create");
    await sleep(4000);

    check("创作页加载完成", (await run(`Boolean(document.getElementById('prompt-editor'))`)) === true);

    /**
     * 语言信号（AppShell H5–H8）：`data-locale` / `lang` / `data-locale-ready` 三者在
     * **首帧 DOM** 里就该同时出现，且挂在同一个节点 `<html>` 上。
     *
     * 本套件的窗口不带 `additionalArguments` ⇒ 走 **missing 档** ⇒ 决议为 zh-CN。
     * 断言用同一个 helper 一次取三值（不分开断，避免「同源」这条约束被断言写法悄悄放松）。
     */
    const localeSignals = () =>
      run(`(() => {
        const root = document.documentElement;
        return {
          locale: root.getAttribute('data-locale'),
          lang: root.getAttribute('lang'),
          hasReady: root.hasAttribute('data-locale-ready'),
        };
      })()`);
    const signals = await localeSignals();
    check("首帧即在 <html> 上带齐语言三信号（data-locale / lang / ready）",
      signals.locale === "zh-CN" && signals.lang === "zh-CN" && signals.hasReady === true,
      JSON.stringify(signals));
    check("三信号同源：data-locale 与 lang 取值一致（lang 派生自决议结果）",
      signals.locale === signals.lang, `locale=${signals.locale} lang=${signals.lang}`);

    /**
     * ---------- 语言切换：弹框路径（真实用户路径，**同进程**） ----------
     *
     * 与注入三档（`self-test-locale-injection.js`）刻意不共用 spawn 逻辑：
     * 那条测的是 `additionalArguments`，每档必须独立进程（H1）；
     * 这条测的是真实点击路径，同进程同实例才对 —— 混用的后果是要么把弹框路径误判成需要新进程，
     * 要么让三档复用进程而静默测不到东西。
     *
     * 另外：**必须轮询而不是立刻断言**。React 的文本重渲染在 commit 期，
     * `applyLocaleSignals` 是副作用、必然晚于 commit，于是存在一帧
     * 「nav 已变英文、`<html>` 还是 zh-CN」—— 立刻读会得到假红，且与真正的接线故障长得一样。
     */
    await clickSelector("[data-language-trigger]");
    const languageDialog = await run(`(() => {
      const root = document.querySelector('[data-language-dialog]');
      const labels = Array.from(document.querySelectorAll('[data-language-option]'))
        .map((el) => el.textContent.trim());
      return { open: Boolean(root), labels };
    })()`);
    check("语言弹框可打开，且每个选项都有非空自称（漏填自名会被守卫跳过）",
      languageDialog.open === true && languageDialog.labels.length >= 2 &&
        languageDialog.labels.every((label) => label.length > 0),
      JSON.stringify(languageDialog.labels));

    /**
     * 定位断言：弹框必须**锚定在触发按钮上方**（popover），而不是屏幕居中（modal）。
     * 这一格治的是「按钮在侧栏最底部、弹框出现在屏幕中央 → 视线跨半屏、不知道框从哪来」。
     * 判据取几何关系而不是类名：`dialog.bottom <= trigger.top`（在其上方）、
     * 间距 0–24px（当前 `mb-2`＝8px）、左边对齐。改回居中时这三条必然红。
     */
    const popoverGeometry = await run(`(() => {
      const trigger = document.querySelector('[data-language-trigger]');
      const dialog = document.querySelector('[data-language-dialog]');
      if (!trigger || !dialog) return { missing: true };
      const t = trigger.getBoundingClientRect();
      const d = dialog.getBoundingClientRect();
      return {
        gap: Math.round(t.top - d.bottom),
        above: d.bottom <= t.top,
        leftAligned: Math.abs(t.left - d.left) < 2,
      };
    })()`);
    check("语言弹框锚定在按钮上方（popover 定位，不是屏幕居中）",
      popoverGeometry.missing !== true && popoverGeometry.above === true &&
        popoverGeometry.gap >= 0 && popoverGeometry.gap <= 24 &&
        popoverGeometry.leftAligned === true,
      JSON.stringify(popoverGeometry));

    await clickSelector('[data-language-option="en"]');
    const switchedToEn = await waitFor(
      `document.documentElement.getAttribute('data-locale') === 'en' && ` +
        `document.documentElement.getAttribute('lang') === 'en' && ` +
        `document.body.innerText.includes('Home')`,
      8000
    );
    const enDump = await run(`({
      locale: document.documentElement.getAttribute('data-locale'),
      lang: document.documentElement.getAttribute('lang'),
      hasHome: document.body.innerText.includes('Home'),
    })`);
    check("选 en 后界面文案与 DOM 信号同步变英文（有界轮询，避免 commit/副作用时序假红）",
      switchedToEn === true, `${switchedToEn ? "轮询命中" : "轮询超时"} ${JSON.stringify(enDump)}`);

    await clickSelector("[data-language-trigger]");
    await clickSelector('[data-language-option="zh-CN"]');
    const switchedBack = await waitFor(
      `document.documentElement.getAttribute('data-locale') === 'zh-CN' && ` +
        `document.documentElement.getAttribute('lang') === 'zh-CN' && ` +
        `document.body.innerText.includes('首页')`,
      8000
    );
    const zhDump = await run(`({
      locale: document.documentElement.getAttribute('data-locale'),
      lang: document.documentElement.getAttribute('lang'),
      hasHome: document.body.innerText.includes('首页'),
    })`);
    check("切回 zh-CN 后同样双向同步（反向对照：能切出去也必须能切回来）",
      switchedBack === true, `${switchedBack ? "轮询命中" : "轮询超时"} ${JSON.stringify(zhDump)}`);

    /**
     * ---------- 深浅色开关（侧边栏左下角） ----------
     *
     * 判据取**媒体查询本身**而不是某个 class：本项目的深色 token 与所有 `dark:` 工具类
     * 都由 `prefers-color-scheme` 驱动，开关走的是 Electron 的 `nativeTheme.themeSource`
     * （应用级覆盖同一媒体查询）。因此「`matchMedia` 真的翻了」才是「界面真的变了」的证据 ——
     * 只看我们自己写的 `data-theme` 属性等于自己证明自己。
     * 两步构成配对：选深色必须翻到 true，选回浅色必须翻回 false（否则可能只是单向生效）。
     */
    const readThemeState = () => run(`({
      preference: document.documentElement.getAttribute('data-theme-preference'),
      applied: document.documentElement.getAttribute('data-theme'),
      prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
    })`);

    /**
     * 波纹的记录器：用 MutationObserver 抓「类出现的那一刻」的 CSS 变量，而不是点击后去采样 ——
     * 动画只有 560ms，采样点踩不中就只能得到「没看见」这种既非通过也非失败的结论。
     */
    const installRippleRecorder = () =>
      run(`(() => {
        window.__rippleProbe = { seen: false, x: null, y: null, radius: null };
        const root = document.documentElement;
        if (window.__rippleObserver) window.__rippleObserver.disconnect();
        window.__rippleObserver = new MutationObserver(() => {
          if (!root.classList.contains('theme-ripple') || window.__rippleProbe.seen) return;
          window.__rippleProbe = {
            seen: true,
            x: parseFloat(root.style.getPropertyValue('--theme-ripple-x')),
            y: parseFloat(root.style.getPropertyValue('--theme-ripple-y')),
            radius: parseFloat(root.style.getPropertyValue('--theme-ripple-radius')),
          };
        });
        window.__rippleObserver.observe(root, {
          attributes: true,
          attributeFilter: ['class'],
        });
      })()`);

    await clickSelector("[data-theme-trigger]");
    const themeOptions = await run(`({
      dialog: Boolean(document.querySelector('[data-theme-dialog]')),
      options: Array.from(document.querySelectorAll('[data-theme-option]')).map(
        (el) => el.getAttribute('data-theme-option')
      ),
    })`);
    check("侧边栏左下角「主题」入口可用，弹框给出 system / light / dark 三态",
      themeOptions.dialog === true &&
        JSON.stringify(themeOptions.options) === JSON.stringify(["system", "light", "dark"]),
      JSON.stringify(themeOptions));

    await installRippleRecorder();
    await clickSelector('[data-theme-option="dark"]');
    const switchedToDark = await waitFor(
      `document.documentElement.getAttribute('data-theme') === 'dark' && ` +
        `window.matchMedia('(prefers-color-scheme: dark)').matches === true`,
      8000
    );
    check("选「深色」后界面真的变深（prefers-color-scheme 由主进程 themeSource 覆盖）",
      switchedToDark === true,
      `${switchedToDark ? "轮询命中" : "轮询超时"} ${JSON.stringify(await readThemeState())}`);

    /**
     * 波纹换肤：圆心必须在**左下角那个按钮**上、半径必须够覆盖到最远角，
     * 且动画结束后类要摘干净（否则下次换肤会带着上一次的圆心与半径）。
     */
    const ripple = await run(`(() => {
      const probe = window.__rippleProbe ?? { seen: false };
      return {
        ...probe,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        supported: typeof document.startViewTransition === 'function',
      };
    })()`);
    /** 清理要等动画播完（560ms）再问，不能跟几何一起当场读 —— 那一刻它本来就该还在 */
    const rippleCleaned = await waitFor(
      `!document.documentElement.classList.contains('theme-ripple')`,
      4000
    );
    const rippleFromBottomLeft =
      ripple.seen === true &&
      ripple.x <= 260 &&
      ripple.y >= ripple.viewportHeight - 260 &&
      ripple.radius >=
        Math.hypot(ripple.viewportWidth, ripple.viewportHeight) * 0.9 &&
      rippleCleaned === true;
    check("换主题走「波纹」：圆心在侧边栏左下角、半径覆盖到最远角、结束后清理干净",
      rippleFromBottomLeft,
      `${JSON.stringify(ripple)} cleaned=${rippleCleaned}`);

    /**
     * 负向对照 + 回退：把 View Transitions API 摘掉之后，主题**仍然要能切**，
     * 而且不该留下波纹的痕迹。这条守的是「动效是锦上添花，不是切换的前提」。
     */
    await run(`(() => {
      window.__startViewTransitionBackup = Document.prototype.startViewTransition;
      delete Document.prototype.startViewTransition;
      return true;
    })()`);
    await installRippleRecorder();
    await clickSelector("[data-theme-trigger]");
    await clickSelector('[data-theme-option="light"]');
    const switchedToLight = await waitFor(
      `document.documentElement.getAttribute('data-theme') === 'light' && ` +
        `window.matchMedia('(prefers-color-scheme: dark)').matches === false`,
      8000
    );
    const fallbackRipple = await run(`window.__rippleProbe ?? { seen: false }`);
    check("选「浅色」照样翻回来，且去掉 View Transitions API 时不留波纹痕迹（回退路径）",
      switchedToLight === true && fallbackRipple.seen === false,
      `${switchedToLight ? "轮询命中" : "轮询超时"} ${JSON.stringify(await readThemeState())} ripple=${JSON.stringify(fallbackRipple)}`);
    await run(`(() => {
      Document.prototype.startViewTransition = window.__startViewTransitionBackup;
      return true;
    })()`);

    /**
     * ---------- 侧边栏「收边态」下的弹出物（回归：被容器 overflow 裁掉） ----------
     *
     * 症状（用户实测）：收边后点「语言」「主题」没反应。真相是弹框**已经渲染**，
     * 但它是按钮右侧的 absolute 子元素，被侧栏容器的 `overflow-hidden` 裁成 0 可见。
     * 判据刻意用 IntersectionObserver 的可见比例（它把祖先裁剪算进去）而不是几何：
     * 被裁掉时 `getBoundingClientRect()` 一切正常，只有可见比例看得出来。
     */
    const popoverVisibleRatio = (selector) =>
      run(`(async () => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return -1;
        const ratio = await new Promise((resolve) => {
          const observer = new IntersectionObserver((entries) => {
            resolve(entries[0]?.intersectionRatio ?? 0);
            observer.disconnect();
          });
          observer.observe(el);
        });
        return Math.round(ratio * 100) / 100;
      })()`);

    await clickSelector('[aria-label="收起侧栏"]');
    await waitFor(
      `document.querySelector('nav[aria-expanded]').getBoundingClientRect().width < 80`
    );
    await clickSelector("[data-theme-trigger]");
    const collapsedThemeRatio = await popoverVisibleRatio("[data-theme-dialog]");
    check("收边后「主题」弹框真的弹得出来（不被侧栏容器裁掉）",
      collapsedThemeRatio === 1,
      `可见比例=${collapsedThemeRatio}（被裁掉时是 0）`);
    await clickSelector('[data-sidebar-popover-backdrop="theme"]');

    await clickSelector("[data-language-trigger]");
    const collapsedLanguageRatio = await popoverVisibleRatio("[data-language-dialog]");
    check("收边后「语言」弹框同样弹得出来",
      collapsedLanguageRatio === 1,
      `可见比例=${collapsedLanguageRatio}（被裁掉时是 0）`);
    await clickSelector('[data-sidebar-popover-backdrop="language"]');

    /** 恢复展开态：后面几步的断言都按展开态写的 */
    await clickSelector('[aria-label="展开侧栏"]');
    await waitFor(
      `document.querySelector('nav[aria-expanded]').getBoundingClientRect().width > 200`
    );

    /** 收尾：恢复「跟随系统」，别把后面几步的环境留在强制浅色上 */
    await clickSelector("[data-theme-trigger]");
    await clickSelector('[data-theme-option="system"]');
    const restoredTheme = await waitFor(
      `document.documentElement.getAttribute('data-theme-preference') === 'system'`,
      8000
    );
    check("选「跟随系统」后偏好回到 system（交还系统偏好，不影响后续步骤）",
      restoredTheme === true,
      `${restoredTheme ? "轮询命中" : "轮询超时"} ${JSON.stringify(await readThemeState())}`);

    /**
     * 页面切换的结构约定（动画本体在最后一条断言里测）：
     *   · 内容区按 pathname 重挂，且 **自己不带入场动画** —— 早先这里挂着 `motion-fade-in`，
     *     配合「过渡期间 animation: none」的开关，会在过渡结束、类被摘掉的那一刻**重新起一次淡入**，
     *     用户看到的正是「白底 → 内容浮现」；
     *   · `view-transition-name` 平时必须是 `none`（只在过渡期间挂，否则主题波纹的 root 裁剪会盖不到它）；
     *   · 左侧导航不在包裹层里（第一版用 `app/template.tsx` 时它包住了整个 AppShell，导航跟着闪）。
     */
    const pageTransition = await run(`(() => {
      const wrapper = document.querySelector('[data-page-transition]');
      if (!wrapper) return { found: false };
      const style = getComputedStyle(wrapper);
      const nav = document.querySelector('nav[aria-expanded]');
      return {
        found: true,
        path: wrapper.getAttribute('data-page-transition'),
        animation: style.animationName,
        viewTransitionName: style.viewTransitionName,
        navInsideWrapper: nav ? wrapper.contains(nav) : null,
      };
    })()`);
    check("内容区不带自己的入场动画（否则过渡结束会再淡入一次），导航也不在包裹层里",
      pageTransition.found === true &&
        pageTransition.animation === "none" &&
        pageTransition.viewTransitionName === "none" &&
        pageTransition.navInsideWrapper === false,
      JSON.stringify(pageTransition));

    // ---------- 0. 动作库数据集抽样检查（随机 20 条，不必全量） ----------
    const poseAudit = await run(`(() => {
      const list = Array.isArray(window.poseData) ? window.poseData : [];
      const total = list.length;
      if (total === 0) return { total: 0 };

      const ids = new Set(list.map((item) => item.id));
      const categories = new Set();
      for (const item of list) {
        for (const category of item.categories ?? []) categories.add(category);
      }
      const invalid = list.filter(
        (item) =>
          !String(item.id ?? '').trim() ||
          !String(item.name ?? '').trim() ||
          !String(item.name_zh ?? '').trim() ||
          !String(item.tags ?? '').trim() ||
          !String(item.preview ?? '').startsWith('https://') ||
          (item.categories ?? []).length === 0
      ).length;

      // 随机抽样 20 条逐条检查
      const pool = [...list];
      const samples = [];
      for (let index = 0; index < 20 && pool.length > 0; index += 1) {
        samples.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      }
      const problems = [];
      for (const item of samples) {
        const tags = String(item.tags).split(',').map((t) => t.trim()).filter(Boolean);
        if (tags.length === 0) problems.push(item.id + ':空 tags');
        if (String(item.tags).trim().endsWith(',')) {
          // 数据集统一带结尾逗号：拼接时必须先剥掉，否则会出双逗号
          const joined = tags.join(', ');
          if (joined.includes(',,')) problems.push(item.id + ':双逗号');
        }
        if (!String(item.preview).includes('/images/pose/')) {
          problems.push(item.id + ':preview 路径异常');
        }
      }
      return {
        total,
        uniqueIds: ids.size,
        categoryCount: categories.size,
        invalid,
        sampleCount: samples.length,
        problems,
        sampleNames: samples.slice(0, 5).map((item) => item.name_zh + '/' + item.name),
      };
    })()`);
    check("动作库数据集可读取且结构完整（297 条 / 8 分类 / id 唯一）",
      poseAudit.total === 297 && poseAudit.uniqueIds === 297 &&
        poseAudit.categoryCount === 8 && poseAudit.invalid === 0,
      JSON.stringify(poseAudit));
    check("随机抽样 20 条逐条检查无问题（tags / preview / 分类）",
      poseAudit.sampleCount === 20 && poseAudit.problems.length === 0,
      poseAudit.problems.length
        ? poseAudit.problems.join(" | ")
        : `抽样 ${poseAudit.sampleCount} 条：${poseAudit.sampleNames.join("、")}`);

    // ---------- 1. 默认关闭：单一输入框、右侧仍是图库 ----------
    const initial = await readAssembly();
    check("默认关闭高级组装（Toggle aria-checked=false）",
      initial.toggleChecked === "false", initial.toggleChecked);
    check("默认不显示组装面板，中间仍是单一可编辑输入框",
      initial.panelExists === false && initial.editorEditable === "true" &&
        initial.galleryExists === true,
      `panel=${initial.panelExists} editable=${initial.editorEditable} gallery=${initial.galleryExists}`);

    // ---------- 1b. 提示词下方按钮行：画师 | 角色 | 动作库 | 背景库 | 表情库 | 3D 视角 ----------
    const toolRow = await run(`(() => {
      const row = document.querySelector('[data-pose-library-trigger]')?.parentElement;
      if (!row) return { found: false };
      const buttons = Array.from(row.querySelectorAll('button'));
      const labels = buttons.map((b) => b.textContent.trim());
      const rect = (el) => el.getBoundingClientRect();
      const character = document.querySelector('[data-character-picker-trigger]');
      const pose = document.querySelector('[data-pose-library-trigger]');
      const background = document.querySelector('[data-background-library-trigger]');
      const expression = document.querySelector('[data-expression-library-trigger]');
      const view3d = document.querySelector('[data-view3d-trigger]');
      const negativeLabel = Array.from(document.querySelectorAll('label')).find(
        (l) => l.textContent.trim() === '反向提示词'
      );
      return {
        found: true,
        labels,
        sameRow: Math.abs(rect(pose).top - rect(character).top) < 8 &&
          Math.abs(rect(background).top - rect(character).top) < 8 &&
          Math.abs(rect(expression).top - rect(character).top) < 8 &&
          Math.abs(rect(view3d).top - rect(character).top) < 8,
        rightOfCharacter: rect(pose).left >= rect(character).right - 2 &&
          rect(background).left >= rect(pose).right - 2 &&
          rect(expression).left >= rect(background).right - 2 &&
          rect(view3d).left >= rect(expression).right - 2,
        aboveNegative: negativeLabel
          ? rect(pose).top < rect(negativeLabel).top
          : false,
        view3dText: view3d?.textContent.trim() ?? '',
        view3dHasIcon: !!view3d?.querySelector('svg'),
      };
    })()`);
    check("提示词下方按钮行含 画师 / 角色 / 动作库 / 背景库 / 表情库 / 3D 视角",
      toolRow.found === true &&
        ["画师", "角色", "动作库", "背景库", "表情库", "3D 视角"].every((label, index) =>
          (toolRow.labels[index] ?? "").includes(label)
        ),
      toolRow.labels.join(" | "));
    check("动作库 / 背景库 / 表情库按钮依次在「角色」右侧、与其它按钮同一行，且位于反向提示词上方",
      toolRow.sameRow === true && toolRow.rightOfCharacter === true &&
        toolRow.aboveNegative === true,
      JSON.stringify({
        sameRow: toolRow.sameRow,
        rightOfCharacter: toolRow.rightOfCharacter,
        aboveNegative: toolRow.aboveNegative,
      }));
    check("摄像机按钮带中文「3D 视角」文字（并保留图标）",
      toolRow.view3dText === "3D 视角" && toolRow.view3dHasIcon === true,
      `${toolRow.view3dText} / icon=${toolRow.view3dHasIcon}`);

    // 普通模式：从按钮行打开动作库 → 应用后「插入」到单一输入框
    await clickSelector("[data-pose-library-trigger]");
    const poseFromRow = await waitFor(
      `document.querySelector('[data-resource-dialog="pose-library-dialog-title"]')`
    );
    check("普通模式下按钮行的「动作库」可打开弹窗", poseFromRow === true);
    const poseStacking = await run(`(() => {
      const dialog = document.querySelector('[data-resource-dialog="pose-library-dialog-title"]');
      if (!dialog) return { exists: false };
      /**
       * 显式结束入场动画再采样。
       *
       * 为什么不 sleep：冒烟窗口可能处于后台/不可见，CSS 动画会被节流，
       * 实测 350ms 后 opacity 仍是 0，elementFromPoint 会落到 html（假红）。
       * finish() 不依赖时钟推进，headless 下也能稳定得到最终帧。
       */
      try {
        dialog.getAnimations().forEach((animation) => animation.finish());
      } catch {}
      const rect = dialog.getBoundingClientRect();
      const sampleX = Math.round(rect.left + rect.width / 2);
      const sampleY = Math.round(rect.top + rect.height / 2);
      const top = document.elementFromPoint(sampleX, sampleY);
      const style = getComputedStyle(dialog);
      return {
        exists: true,
        parentIsBody: dialog.parentElement === document.body,
        zIndex: Number.parseInt(style.zIndex, 10),
        widthRatio: Number((rect.width / window.innerWidth).toFixed(3)),
        rightEdgeRatio: Number((rect.right / window.innerWidth).toFixed(3)),
        topIsInsideDialog: !!top && dialog.contains(top),
        dialogStyle: {
          zIndex: style.zIndex,
          position: style.position,
          opacity: style.opacity,
        },
        topInfo: top
          ? {
              tag: top.tagName,
              role: top.getAttribute('role'),
              className: String(top.className).slice(0, 160),
              resourceDialog: top.getAttribute('data-resource-dialog'),
            }
          : null,
        sample: { x: sampleX, y: sampleY },
      };
    })()`);
    check("动作库弹窗在 body 顶层、覆盖主区，且没有被图片显示区/图库压住",
      poseStacking.exists === true && poseStacking.parentIsBody === true &&
        poseStacking.zIndex >= 90 &&
        poseStacking.widthRatio >= 0.8 &&
        poseStacking.rightEdgeRatio >= 0.9,
      JSON.stringify(poseStacking));
    await run(`(() => {
      const dialog = document.querySelector('[data-resource-dialog="pose-library-dialog-title"]');
      dialog?.querySelector('[data-pose-card] button[aria-label^="选择"]')?.click();
      return true;
    })()`);
    await sleep(400);
    await clickSelector("[data-pose-apply]");
    await sleep(600);
    const normalInsert = await run(`(() => {
      const editor = document.getElementById('prompt-editor');
      if (editor) editor.textContent = 'keep-me';
      return true;
    })()`);
    void normalInsert;
    await clickSelector("[data-pose-library-trigger]");
    await waitFor(`document.querySelector('[data-resource-dialog="pose-library-dialog-title"]')`);
    await run(`(() => {
      const dialog = document.querySelector('[data-resource-dialog="pose-library-dialog-title"]');
      dialog?.querySelector('[data-pose-card] button[aria-label^="选择"]')?.click();
      return true;
    })()`);
    await sleep(400);
    await clickSelector("[data-pose-apply]");
    await sleep(600);
    const inserted = await run(
      `document.getElementById('prompt-editor')?.textContent ?? ''`
    );
    check("普通模式下动作库是「插入」（保留原有内容并以逗号追加）",
      inserted.startsWith("keep-me, ") && inserted.length > "keep-me, ".length,
      inserted.slice(0, 80));
    await run(`(() => {
      const editor = document.getElementById('prompt-editor');
      if (editor) editor.textContent = '';
      return true;
    })()`);

    // ---------- 2. 开启后右侧面板切换为组装面板 ----------
    await clickSelector("[data-advanced-prompt-toggle]");
    await waitFor(`document.querySelector('[data-prompt-assembly]')`);
    const opened = await readAssembly();
    check("开启后右侧面板切换为提示词组装面板（图库暂时让位）",
      opened.panelExists === true && opened.variant === "panel" &&
        opened.galleryExists === false,
      `variant=${opened.variant} gallery=${opened.galleryExists}`);
    check("开启后中间提示词框变为只读（内容由分类拼接）",
      opened.editorEditable === "false", opened.editorEditable);

    const expectedTabs = [
      ["quality", "质量词"],
      ["shot", "镜头视图"],
      ["style", "画师风格"],
      ["character", "角色"],
      ["outfit", "服饰"],
      ["pose", "姿势"],
      ["expression", "表情"],
      ["background", "背景"],
    ];
    check("顶部为 8 大分类 Tab（质量词/镜头/画师风格/角色/服饰/姿势/表情/背景）",
      expectedTabs.every(
        ([id, label], index) =>
          opened.tabIds[index] === id && opened.tabLabels[index].startsWith(label)
      ),
      opened.tabLabels.join(" | "));
    check("默认 8 个分类不可删除（没有删除按钮）",
      opened.removeButtons.length === 0, opened.removeButtons.join(", "));

    // ---------- 3. 快捷插入词 ----------
    await selectTab("quality");
    await clickSelector('[data-prompt-quick-word="masterpiece"]');
    let state = await readAssembly();
    check("点击快捷插入词即写入当前分类",
      state.activeInput === "masterpiece", state.activeInput);
    await clickSelector('[data-prompt-quick-word="best quality"]');
    state = await readAssembly();
    check("连续点击快捷词按逗号拼接",
      state.activeInput === "masterpiece, best quality", state.activeInput);

    // ---------- 4. 逗号自动拼接（核心算法） ----------
    await selectTab("character");
    await setTabContent("1girl,");
    await selectTab("quality");
    await setTabContent("masterpiece");
    state = await readAssembly();
    check("分类内容按顺序用逗号拼接",
      state.merged === "masterpiece, 1girl,", state.merged);
    check("结尾已有逗号的分类不会产生双逗号（直接拼接）",
      state.merged.includes(",,") === false, state.merged);
    check("空分类不参与拼接（服饰/姿势/表情/背景留空）",
      state.filled.startsWith("2/8"), state.filled);

    await selectTab("outfit");
    await setTabContent("school uniform");
    state = await readAssembly();
    check("填入第三个分类后拼接结果追加在后面",
      state.merged === "masterpiece, 1girl, school uniform", state.merged);
    check("合并结果实时同步到中间提示词框",
      state.editorText === state.merged, `${state.editorText} | ${state.merged}`);
    check("已填分类显示角标",
      ["quality", "character", "outfit"].every((id) => state.badges.includes(id)) &&
        !state.badges.includes("pose"),
      state.badges.join(", "));

    // ---------- 5. 既有功能入口：镜头 → 3D 视角 / 角色 → 角色选择器 ----------
    await selectTab("shot");
    const shotTools = await run(`(() => ({
      tools: !!document.querySelector('[data-prompt-tab-tools="shot"]'),
      has3d: !!document.querySelector('[data-prompt-tool="3d"]'),
      hasCharacter: !!document.querySelector('[data-prompt-tool="character"]'),
    }))()`);
    check("镜头视图分类里有「3D 视角」入口（且不串到别的工具）",
      shotTools.tools === true && shotTools.has3d === true &&
        shotTools.hasCharacter === false,
      JSON.stringify(shotTools));

    await selectTab("shot");
    await setTabContent("old shot marker");
    await clickSelector('[data-prompt-tool="3d"]');
    const view3dOpen = await waitFor(`document.getElementById('view3d-dialog-title')`);
    check("点击后打开既有的 3D 视角生成器", view3dOpen === true);
    /**
     * 按钮文案必须如实反映**实际写入方式**：高级模式下这次确认是**覆盖**「镜头视图」，
     * 旧文案却写着「确认并插入」—— 用户按「插入」理解，结果分类内容被换掉。
     * （写入方式由 `resolveToolWriteMode` 单点推导，普通模式那条断言在 smoke-view3d。）
     */
    const view3dConfirmLabel = await run(
      `document.querySelector('[data-view3d-confirm]')?.textContent?.trim() ?? ''`
    );
    check("高级模式：3D 弹窗确认按钮如实写「确认并覆盖「镜头视图」」",
      view3dConfirmLabel === "确认并覆盖「镜头视图」", view3dConfirmLabel);
    await run(`(() => {
      document.querySelector('[data-view3d-quick="side"]')?.click();
      return true;
    })()`);
    await sleep(700);
    await clickSelector("[data-view3d-confirm]");
    await sleep(800);
    state = await readAssembly();
    check("3D 视角确认后**覆盖**「镜头视图」分类（旧内容被替换）",
      state.activeInput === "full body, (facing left:3.0)" &&
        state.merged.includes("(facing left:3.0)") &&
        !state.merged.includes("old shot marker"),
      `${state.activeInput} | ${state.merged}`);
    check("3D 视角弹框确认后自动关闭",
      (await run(`!document.getElementById('view3d-dialog-title')`)) === true);

    await selectTab("character");
    const characterTools = await run(`(() => ({
      tools: !!document.querySelector('[data-prompt-tab-tools="character"]'),
      hasCharacter: !!document.querySelector('[data-prompt-tool="character"]'),
      has3d: !!document.querySelector('[data-prompt-tool="3d"]'),
    }))()`);
    check("角色分类里有「角色库」入口（且不串到别的工具）",
      characterTools.tools === true && characterTools.hasCharacter === true &&
        characterTools.has3d === false,
      JSON.stringify(characterTools));

    await clickSelector('[data-prompt-tool="character"]');
    const pickerOpen = await waitFor(
      `document.querySelector('[data-resource-dialog="character-picker-dialog-title"]')`
    );
    check("点击后打开既有的角色选择器", pickerOpen === true);
    // 预置旧内容：应用后应当被「替换」而不是追加
    await setTabContent("old character marker");
    await waitFor(`document.querySelectorAll('[data-character-card]').length > 0`);
    await run(`(() => {
      const card = document.querySelector('[data-character-card="character_1"]');
      card?.querySelector('button[aria-label^="选择"]')?.click();
      return true;
    })()`);
    await sleep(500);
    await clickSelector("[data-character-apply-trigger]");
    await sleep(800);
    state = await readAssembly();
    check("角色选择器确认后**覆盖**「角色」分类（高级模式为替换而非插入）",
      state.activeInput === "hatsune miku, vocaloid" &&
        state.merged.includes("hatsune miku, vocaloid") &&
        !state.merged.includes("old character marker"),
      `${state.activeInput} | ${state.merged}`);

    // ---------- 5b. 姿势 → 动作库（静态数据集，复用角色选择器 UI） ----------
    await selectTab("pose");
    await setTabContent("old pose marker");
    const poseTools = await run(`(() => ({
      tools: !!document.querySelector('[data-prompt-tab-tools="pose"]'),
      hasPose: !!document.querySelector('[data-prompt-tool="pose"]'),
      has3d: !!document.querySelector('[data-prompt-tool="3d"]'),
      hasCharacter: !!document.querySelector('[data-prompt-tool="character"]'),
    }))()`);
    check("姿势分类里有「动作库」入口（且不串到别的工具）",
      poseTools.tools === true && poseTools.hasPose === true &&
        poseTools.has3d === false && poseTools.hasCharacter === false,
      JSON.stringify(poseTools));

    await clickSelector('[data-prompt-tool="pose"]');
    const poseLibraryOpen = await waitFor(
      `document.querySelector('[data-resource-dialog="pose-library-dialog-title"]')`
    );
    check("点击后打开动作库弹窗（复用角色选择器外壳）", poseLibraryOpen === true);

    const poseInfo = await run(`(() => {
      const dialog = document.querySelector('[data-resource-dialog="pose-library-dialog-title"]');
      if (!dialog) return { exists: false };
      const grid = dialog.querySelector('[data-pose-grid]');
      return {
        exists: true,
        cards: dialog.querySelectorAll('[data-pose-card]').length,
        columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
        hasToolbar: !!dialog.querySelector('[data-pose-toolbar]'),
        hasSidebar: !!dialog.querySelector('[data-pose-sidebar]'),
        hasPagination: !!dialog.querySelector('[data-pose-pagination]'),
        paginationInfo: dialog.querySelector('[data-pose-pagination-info]')?.innerText.replace(/\\s+/g, ' ').trim() ?? '',
        categories: Array.from(dialog.querySelectorAll('[data-pose-category]')).map((el) => el.textContent.trim()),
        hasSelectedFilter: !!dialog.querySelector('[data-pose-filter-selected]'),
        footerButtons: Array.from(dialog.querySelectorAll('[data-pose-footer-actions] button')).map((el) => el.textContent.trim()),
        applyDisabled: dialog.querySelector('[data-pose-apply]')?.disabled ?? null,
      };
    })()`);
    check("动作库渲染 24 张卡片 / 4 列网格 / 工具条 / 分类栏 / 分页（同一套排版）",
      poseInfo.exists === true && poseInfo.cards === 24 && poseInfo.columns === 4 &&
        poseInfo.hasToolbar === true && poseInfo.hasSidebar === true &&
        poseInfo.hasPagination === true,
      `${poseInfo.cards} 张 / ${poseInfo.columns} 列`);
    check("分页按动作计数（共 297 个动作）",
      poseInfo.paginationInfo.includes("297") && poseInfo.paginationInfo.includes("个动作"),
      poseInfo.paginationInfo);
    check("左侧为 8 个分类 + 全部分类 + 只看已选",
      poseInfo.categories.length === 9 &&
        poseInfo.categories.some((label) => label.startsWith("全部分类")) &&
        poseInfo.hasSelectedFilter === true,
      `${poseInfo.categories.join(" | ")} | 只看已选=${poseInfo.hasSelectedFilter}`);
    check("footer 为 取消 / 应用 Tags，未选择时禁用",
      poseInfo.footerButtons.includes("取消") &&
        poseInfo.footerButtons.includes("应用 Tags") &&
        poseInfo.applyDisabled === true,
      `${poseInfo.footerButtons.join(" / ")} disabled=${poseInfo.applyDisabled}`);

    await run(`(() => {
      const btn = Array.from(document.querySelectorAll('[data-pose-category]')).find(
        (el) => el.textContent.trim() === '坐姿'
      );
      btn?.click();
      return !!btn;
    })()`);
    await sleep(500);
    const sittingOnly = await run(`(() => {
      const dialog = document.querySelector('[data-resource-dialog="pose-library-dialog-title"]');
      return {
        cards: dialog.querySelectorAll('[data-pose-card]').length,
        names: Array.from(dialog.querySelectorAll('[data-pose-card]')).map(
          (el) => el.innerText.split('\\n')[0].trim()
        ),
        info: dialog.querySelector('[data-pose-pagination-info]')?.innerText.replace(/\\s+/g, ' ').trim() ?? '',
      };
    })()`);
    check("左侧分类筛选生效（坐姿共 12 个动作）",
      sittingOnly.cards === 12, `${sittingOnly.cards} 张 | ${sittingOnly.names.slice(0, 3).join(", ")}`);

    await run(`(() => {
      const btn = Array.from(document.querySelectorAll('[data-pose-category]')).find(
        (el) => el.textContent.trim().startsWith('全部分类')
      );
      btn?.click();
      return !!btn;
    })()`);
    await sleep(400);
    await run(`(() => {
      const input = document.querySelector('[data-pose-toolbar] input[type="search"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'running');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(500);
    const searched = await run(`(() => {
      const dialog = document.querySelector('[data-resource-dialog="pose-library-dialog-title"]');
      return {
        names: Array.from(dialog.querySelectorAll('[data-pose-card]')).map(
          (el) => el.innerText.split('\\n')[0].trim()
        ),
      };
    })()`);
    check("搜索动作名 / 标签生效（running → 奔跑）",
      searched.names.length >= 1 && searched.names.some((name) => name.includes("奔跑")),
      searched.names.join(" | "));

    await run(`(() => {
      const dialog = document.querySelector('[data-resource-dialog="pose-library-dialog-title"]');
      const card = Array.from(dialog.querySelectorAll('[data-pose-card]')).find(
        (el) => el.innerText.includes("奔跑")
      );
      card?.querySelector('button[aria-label^="选择"]')?.click();
      return !!card;
    })()`);
    await sleep(500);
    const poseSelected = await run(`(() => {
      const dialog = document.querySelector('[data-resource-dialog="pose-library-dialog-title"]');
      return {
        count: dialog.querySelector('[data-pose-selected-count]')?.innerText.replace(/\\s+/g, ' ').trim() ?? '',
        applyDisabled: dialog.querySelector('[data-pose-apply]')?.disabled ?? null,
      };
    })()`);
    check("选中动作后 footer 显示已选数量且可应用",
      poseSelected.count.startsWith("已选择 1 个动作") && poseSelected.applyDisabled === false,
      `${poseSelected.count} disabled=${poseSelected.applyDisabled}`);

    await clickSelector("[data-pose-apply]");
    await sleep(700);
    state = await readAssembly();
    check("动作库确认后**覆盖**「姿势」分类（Tags 去重、去掉结尾逗号）",
      state.activeInput === "running, run" && state.merged.includes("running, run") &&
        !state.merged.includes("old pose marker"),
      `${state.activeInput} | ${state.merged}`);
    check("动作库弹窗应用后关闭",
      (await run(`!document.querySelector('[data-resource-dialog="pose-library-dialog-title"]')`)) === true);

    // 清掉 3D / 角色 / 姿势写入的内容，恢复到后续用例需要的内容
    await selectTab("shot");
    await setTabContent("");
    await selectTab("pose");
    await setTabContent("");
    await selectTab("character");
    await setTabContent("1girl");
    state = await readAssembly();
    check("清空「镜头视图」「姿势」后拼接结果只保留其余分类",
      state.merged === "masterpiece, 1girl, school uniform", state.merged);

    // ---------- 5c. 背景 → 背景库（静态数据集，同一套 UI） ----------
    await selectTab("background");
    await setTabContent("old background marker");
    const bgTools = await run(`(() => ({
      tools: !!document.querySelector('[data-prompt-tab-tools="background"]'),
      hasBackground: !!document.querySelector('[data-prompt-tool="background"]'),
      hasPose: !!document.querySelector('[data-prompt-tool="pose"]'),
    }))()`);
    check("背景分类里有「背景库」入口（且不串到别的工具）",
      bgTools.tools === true && bgTools.hasBackground === true &&
        bgTools.hasPose === false,
      JSON.stringify(bgTools));

    await clickSelector('[data-prompt-tool="background"]');
    const bgOpen = await waitFor(
      `document.querySelector('[data-resource-dialog="background-library-dialog-title"]')`
    );
    check("点击后打开背景库弹窗（复用同一套外壳与卡片排版）", bgOpen === true);

    const bgInfo = await run(`(() => {
      const dialog = document.querySelector('[data-resource-dialog="background-library-dialog-title"]');
      if (!dialog) return { exists: false };
      const raw = Array.isArray(window.backgroundData) ? window.backgroundData : [];
      const usable = raw.filter(
        (item) => item.duplicate !== true && String(item.tags ?? '').trim() &&
          String(item.preview ?? '').trim()
      ).length;
      return {
        exists: true,
        cards: dialog.querySelectorAll('[data-background-card]').length,
        usable,
        rawTotal: raw.length,
        info: dialog.querySelector('[data-background-pagination-info]')?.innerText.replace(/\\s+/g, ' ').trim() ?? '',
        categories: Array.from(dialog.querySelectorAll('[data-background-category]')).map((el) => el.textContent.trim()),
      };
    })()`);
    check("背景库过滤掉重复 / 占位 / 空条目（原始 1087 → 可用 1056）",
      bgInfo.usable === 1056 && bgInfo.rawTotal === 1087,
      `可用 ${bgInfo.usable} / 原始 ${bgInfo.rawTotal}`);
    check("背景库分页按背景计数",
      bgInfo.info.includes("1,056") && bgInfo.info.includes("个背景"),
      bgInfo.info);
    check("背景库渲染 24 张卡片、4 个分类 + 全部分类",
      bgInfo.cards === 24 && bgInfo.categories.length === 5 &&
        bgInfo.categories.some((label) => label.startsWith("全部分类")),
      `${bgInfo.cards} 张 | ${bgInfo.categories.join(" | ")}`);

    await run(`(() => {
      const btn = Array.from(document.querySelectorAll('[data-background-category]')).find(
        (el) => el.textContent.trim() === '自然与户外'
      );
      btn?.click();
      return !!btn;
    })()`);
    await sleep(500);
    const natureOnly = await run(`(() => {
      const dialog = document.querySelector('[data-resource-dialog="background-library-dialog-title"]');
      return {
        cards: dialog.querySelectorAll('[data-background-card]').length,
        info: dialog.querySelector('[data-background-pagination-info]')?.innerText.replace(/\\s+/g, ' ').trim() ?? '',
      };
    })()`);
    check("背景库分类筛选生效（自然与户外 265 条）",
      natureOnly.info.includes("265"), `${natureOnly.cards} 张 | ${natureOnly.info}`);

    await run(`(() => {
      const input = document.querySelector('[data-background-toolbar] input[type="search"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'campfire');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(500);
    await run(`(() => {
      const dialog = document.querySelector('[data-resource-dialog="background-library-dialog-title"]');
      const card = Array.from(dialog.querySelectorAll('[data-background-card]')).find(
        (el) => el.innerText.includes('篝火')
      );
      card?.querySelector('button[aria-label^="选择"]')?.click();
      return !!card;
    })()`);
    await sleep(500);
    const bgSelected = await run(`(() => {
      const dialog = document.querySelector('[data-resource-dialog="background-library-dialog-title"]');
      return {
        count: dialog.querySelector('[data-background-selected-count]')?.innerText.replace(/\\s+/g, ' ').trim() ?? '',
      };
    })()`);
    check("背景库选中后 footer 显示已选数量",
      bgSelected.count.startsWith("已选择 1 个背景"), bgSelected.count);

    await clickSelector("[data-background-apply]");
    await sleep(700);
    state = await readAssembly();
    check("背景库确认后**覆盖**「背景」分类（Tags 去重、无多余逗号）",
      state.activeInput.includes("camping") && state.activeInput.includes("winter") &&
        !state.activeInput.includes(",,") &&
        !state.activeInput.endsWith(",") &&
        !state.merged.includes("old background marker"),
      `${state.activeInput} | ${state.merged}`);

    await selectTab("background");
    await setTabContent("");
    state = await readAssembly();
    check("清空「背景」后拼接结果回到三个分类",
      state.merged === "masterpiece, 1girl, school uniform", state.merged);

    // ---------- 5d. 表情 → 表情库（**外部 JSON 格式 + 适配器**，与动作 / 背景同一套 UI） ----------
    const expressionAudit = await run(`(() => {
      const list = Array.isArray(window.expressionData) ? window.expressionData : [];
      const attributes = new Set(list.map((item) => item.attribute));
      const objects = new Set(list.map((item) => item.object));
      const invalid = list.filter(
        (item) =>
          !String(item.displayName ?? '').trim() ||
          !String(item.langName ?? '').trim() ||
          !String(item.attribute ?? '').trim() ||
          !String(item.preview ?? '').startsWith('https://')
      ).length;
      return {
        total: list.length,
        attributeCount: attributes.size,
        objects: [...objects],
        invalid,
      };
    })()`);
    check("表情数据集可读取且结构完整（124 条 / 9 个 attribute / 单一 object / 字段齐全）",
      expressionAudit.total === 124 && expressionAudit.attributeCount === 9 &&
        expressionAudit.objects.length === 1 && expressionAudit.invalid === 0,
      JSON.stringify(expressionAudit));

    /** 普通模式：按钮行的「表情库」也能打开（与动作 / 背景库走同一条渲染路径） */
    await clickSelector("[data-expression-library-trigger]");
    const expressionFromRow = await waitFor(
      `document.querySelector('[data-resource-dialog="expression-library-dialog-title"]')`
    );
    check("普通模式下按钮行的「表情库」可打开弹窗", expressionFromRow === true);
    await run(`(() => {
      const dialog = document.querySelector('[data-resource-dialog="expression-library-dialog-title"]');
      Array.from(dialog?.querySelectorAll('button') ?? [])
        .find((button) => button.textContent.trim() === '取消')
        ?.click();
      return true;
    })()`);
    await sleep(300);
    check("表情库弹窗可关闭（取消按钮）",
      (await run(`!document.querySelector('[data-resource-dialog="expression-library-dialog-title"]')`)) === true);

    await selectTab("expression");
    await setTabContent("old expression marker");
    const expressionTools = await run(`(() => ({
      tools: !!document.querySelector('[data-prompt-tab-tools="expression"]'),
      hasExpression: !!document.querySelector('[data-prompt-tool="expression"]'),
      hasPose: !!document.querySelector('[data-prompt-tool="pose"]'),
    }))()`);
    check("表情分类里有「表情库」入口（且不串到别的工具）",
      expressionTools.tools === true && expressionTools.hasExpression === true &&
        expressionTools.hasPose === false,
      JSON.stringify(expressionTools));

    await clickSelector('[data-prompt-tool="expression"]');
    const expressionOpen = await waitFor(
      `document.querySelector('[data-resource-dialog="expression-library-dialog-title"]')`
    );
    check("点击后打开表情库弹窗（复用同一套外壳与卡片排版）", expressionOpen === true);

    const expressionInfo = await run(`(() => {
      const dialog = document.querySelector('[data-resource-dialog="expression-library-dialog-title"]');
      if (!dialog) return { exists: false };
      return {
        exists: true,
        cards: dialog.querySelectorAll('[data-expression-card]').length,
        hasGrid: !!dialog.querySelector('[data-expression-grid]'),
        hasSidebar: !!dialog.querySelector('[data-expression-sidebar]'),
        info: dialog.querySelector('[data-expression-pagination-info]')?.innerText.replace(/\\s+/g, ' ').trim() ?? '',
        categories: Array.from(dialog.querySelectorAll('[data-expression-category]')).map((el) => el.textContent.trim()),
      };
    })()`);
    check("表情库按适配器结果渲染（attribute→分类：124 条 / 24 张卡片 / 9 个分类 + 全部分类）",
      expressionInfo.cards === 24 && expressionInfo.categories.length === 10 &&
        expressionInfo.info.includes("124") && expressionInfo.info.includes("个表情") &&
        expressionInfo.hasGrid === true && expressionInfo.hasSidebar === true,
      `${expressionInfo.cards} 张 | ${expressionInfo.info} | ${expressionInfo.categories.join(" | ")}`);

    await run(`(() => {
      const btn = Array.from(document.querySelectorAll('[data-expression-category]')).find(
        (el) => el.textContent.trim() === '笑'
      );
      btn?.click();
      return !!btn;
    })()`);
    await sleep(500);
    const smileOnly = await run(`(() => {
      const dialog = document.querySelector('[data-resource-dialog="expression-library-dialog-title"]');
      return {
        cards: dialog.querySelectorAll('[data-expression-card]').length,
        selected: dialog.querySelector('[data-expression-selected-count]')?.innerText.replace(/\\s+/g, ' ').trim() ?? '',
      };
    })()`);
    check("表情库分类筛选生效（attribute=笑 共 15 条，不足一页故无分页条）",
      smileOnly.cards === 15, `${smileOnly.cards} 张`);

    /** 选第一张（数据顺序里 attribute=笑 的第一条是「微笑 → smile」）并应用 */
    await run(`(() => {
      const dialog = document.querySelector('[data-resource-dialog="expression-library-dialog-title"]');
      dialog.querySelector('[data-expression-card] button[aria-label^="选择"]')?.click();
      return true;
    })()`);
    await sleep(400);
    const expressionSelected = await run(`(() => {
      const dialog = document.querySelector('[data-resource-dialog="expression-library-dialog-title"]');
      return {
        selected: dialog.querySelector('[data-expression-selected-count]')?.innerText.replace(/\\s+/g, ' ').trim() ?? '',
      };
    })()`);
    check("表情库选中后 footer 显示已选数量（单位是「表情」）",
      expressionSelected.selected.startsWith("已选择 1 个表情"), expressionSelected.selected);

    await clickSelector("[data-expression-apply]");
    await sleep(700);
    state = await readAssembly();
    check("表情库确认后**覆盖**「表情」分类（写入英文标签、旧内容被替换）",
      state.activeInput === "smile" && state.merged.includes(", smile") &&
        !state.merged.includes("old expression marker"),
      `${state.activeInput} | ${state.merged}`);
    check("表情库弹窗应用后关闭",
      (await run(`!document.querySelector('[data-resource-dialog="expression-library-dialog-title"]')`)) === true);

    await selectTab("expression");
    await setTabContent("");
    state = await readAssembly();
    check("清空「表情」后拼接结果回到三个分类",
      state.merged === "masterpiece, 1girl, school uniform", state.merged);

    // ---------- 6. 自定义分类 ----------
    await setInputValue("[data-prompt-new-tab]", "光效");
    await clickSelector("[data-prompt-add-tab]");
    state = await readAssembly();
    const customId = state.tabIds[state.tabIds.length - 1];
    check("可新增自定义分类 Tab（如 光效）",
      state.tabLabels[state.tabLabels.length - 1].startsWith("光效") &&
        state.removeButtons.includes(customId),
      `${customId} / ${state.tabLabels.join(" | ")}`);

    await setTabContent("rim lighting");
    state = await readAssembly();
    check("自定义分类参与拼接",
      state.merged.endsWith("rim lighting"), state.merged);

    /**
     * ---------- 6b. 自定义分类可挂载既有工具（可多个），结果**写进本分类** ----------
     *
     * 需求原话：「新增分类为 1，可以为其添加所存在的功能，可以添加复数个」。
     * 判据分三步：① 五个既有工具都能挂（角色 / 动作库 / 背景库 / 表情库 / 3D 视角）；
     * ② 能同时挂多个（角色 + 动作库）；
     * ③ 从该分类调用角色库后，结果落进**这个自定义分类**（且默认「角色」分类一字未动）。
     */
    await selectTab(customId);
    const customToolToggles = await run(`(() => ({
      panel: !!document.querySelector('[data-prompt-tab-tools="${customId}"]'),
      toggles: Array.from(
        document.querySelectorAll('[data-prompt-tab-tool-toggle]')
      ).map((el) => el.getAttribute('data-prompt-tab-tool-toggle')),
    }))()`);
    check("自定义分类里有「工具挂载」入口，五个既有工具都可挂",
      customToolToggles.panel === true &&
        JSON.stringify(customToolToggles.toggles) ===
          JSON.stringify(["character", "pose", "background", "expression", "view3d"]),
      JSON.stringify(customToolToggles));

    await clickSelector('[data-prompt-tab-tool-toggle="character"]');
    await clickSelector('[data-prompt-tab-tool-toggle="pose"]');
    const attachedTools = await run(`(() => ({
      pressed: Array.from(document.querySelectorAll('[data-prompt-tab-tool-toggle]'))
        .filter((el) => el.getAttribute('aria-pressed') === 'true')
        .map((el) => el.getAttribute('data-prompt-tab-tool-toggle')),
      callable: Array.from(
        document.querySelectorAll('[data-prompt-tab-tools="${customId}"] [data-prompt-tool]')
      ).map((el) => el.getAttribute('data-prompt-tool')),
    }))()`);
    check("同一个自定义分类可以挂多个工具（角色 + 动作库）",
      JSON.stringify(attachedTools.pressed) === JSON.stringify(["character", "pose"]) &&
        JSON.stringify(attachedTools.callable) === JSON.stringify(["character", "pose"]),
      JSON.stringify(attachedTools));

    /** 记下默认「角色」分类的现值：调用后它必须一字未动 */
    const readTabContent = async (tabId) => {
      await run(`document.querySelector('[data-prompt-tab="${tabId}"]').click()`);
      /** 点完要等 React 提交：同一 tick 里读输入框拿到的还是**上一个**分类的值 */
      await sleep(150);
      return run(`document.querySelector('[data-prompt-tab-input]').value`);
    };
    const builtinCharacterBefore = await readTabContent("character");
    await selectTab(customId);
    await clickSelector(`[data-prompt-tab-tools="${customId}"] [data-prompt-tool="character"]`);
    await waitFor(`document.querySelector('[data-resource-dialog="character-picker-dialog-title"]')`);
    await waitFor(`document.querySelectorAll('[data-character-card]').length > 0`);
    await run(`(() => {
      const card = document.querySelector('[data-character-card="character_1"]');
      card?.querySelector('button[aria-label^="选择"]')?.click();
      return true;
    })()`);
    await sleep(500);
    await clickSelector("[data-character-apply-trigger]");
    await sleep(800);
    state = await readAssembly();
    const builtinCharacterAfter = await readTabContent("character");
    check("从自定义分类调用角色库：结果**追加进该分类**，默认「角色」分类不受影响",
      state.merged.includes("rim lighting") &&
        state.merged.includes("hatsune miku, vocaloid") &&
        builtinCharacterAfter === builtinCharacterBefore,
      `merged=${state.merged} | 角色分类 ${JSON.stringify(builtinCharacterBefore)} → ${JSON.stringify(builtinCharacterAfter)}`);

    await clickSelector(`[data-prompt-tab-remove="${customId}"]`);
    state = await readAssembly();
    check("可删除自定义分类，且其内容随之移出拼接结果",
      !state.tabIds.includes(customId) && !state.merged.includes("rim lighting"),
      state.tabIds.join(", "));

    // ---------- 6. 模板保存 / 加载 / 删除 ----------
    await setInputValue("[data-prompt-template-name]", "SDXL 完美人像模板");
    await clickSelector("[data-prompt-template-save]");
    state = await readAssembly();
    check("保存模板后出现在下拉列表",
      state.templateOptions.includes("SDXL 完美人像模板"),
      state.templateOptions.join(" | "));

    const templateId = await run(
      `(() => Array.from(document.querySelectorAll('[data-prompt-template-select] option')).find((o) => o.value)?.value ?? '')()`
    );
    await selectTab("quality");
    await setTabContent("");
    await selectTab("character");
    await setTabContent("");
    await selectTab("outfit");
    await setTabContent("");
    state = await readAssembly();
    check("清空所有分类后拼接结果同步清空",
      state.editorText === "" &&
        (state.merged === "" || state.merged.includes("各分类都为空")),
      `${state.merged} | editor=${state.editorText}`);

    await setInputValue("[data-prompt-template-select]", templateId);
    await clickSelector("[data-prompt-template-apply]");
    state = await readAssembly();
    check("加载模板恢复各分类填写状态",
      state.merged === "masterpiece, 1girl, school uniform", state.merged);

    await setInputValue("[data-prompt-template-select]", templateId);
    await clickSelector("[data-prompt-template-delete]");
    state = await readAssembly();
    check("删除模板后下拉列表不再包含它",
      !state.templateOptions.includes("SDXL 完美人像模板"),
      state.templateOptions.join(" | "));

    // ---------- 7. 落盘 ----------
    let persistedDoc = {};
    for (let attempt = 0; attempt < 12; attempt += 1) {
      persistedDoc = JSON.parse(fs.readFileSync(userDataFile, "utf8"));
      const form = persistedDoc.createForm ?? {};
      if (form.advancedPrompt === true && Array.isArray(form.promptTabs) &&
        form.promptTabs.some((tab) => tab.id === "quality" && tab.content === "masterpiece")) {
        break;
      }
      await sleep(250);
    }
    const savedForm = persistedDoc.createForm ?? {};
    check("高级开关与分类内容写入用户数据文件（createForm 段）",
      savedForm.advancedPrompt === true &&
        Array.isArray(savedForm.promptTabs) &&
        savedForm.promptTabs.some(
          (tab) => tab.id === "quality" && tab.content === "masterpiece"
        ),
      JSON.stringify(savedForm.promptTabs?.map((tab) => `${tab.id}:${tab.content}`) ?? []));
    check("模板列表写入用户数据文件",
      Array.isArray(savedForm.promptTemplates),
      JSON.stringify(savedForm.promptTemplates?.map((item) => item.name) ?? []));

    // ---------- 8. 生成使用拼接结果 ----------
    const generateButton = await clickSelector("[data-generate-button]");
    check("找到并点击生成按钮", generateButton === true);
    await sleep(2500);

    const captured = capturedPrompts[0];
    const positiveText = captured
      ? String(captured["6"]?.inputs?.text ?? "")
      : "";
    check("生成时使用「分类拼接结果」作为正面提示词",
      positiveText === "masterpiece, 1girl, school uniform",
      positiveText || "(未截获)");

    // ---------- 9. 关闭开关恢复单一输入框 ----------
    await clickSelector("[data-advanced-prompt-toggle]");
    await waitFor(`document.querySelector('[data-history-sidebar]')`);
    state = await readAssembly();
    check("关闭高级组装后右侧恢复图库，输入框恢复可编辑",
      state.panelExists === false && state.galleryExists === true &&
        state.editorEditable === "true" &&
        state.toggleChecked === "false",
      `${state.panelExists}/${state.galleryExists}/${state.editorEditable}`);
    check("关闭后提示词框保留拼接好的内容，可继续手动编辑",
      state.editorText === "masterpiece, 1girl, school uniform", state.editorText);

    // ---------- 10. 窄屏就地展开（用 DevTools 设备度量覆盖，稳定可复现） ----------
    await clickSelector("[data-advanced-prompt-toggle]");
    await waitFor(`document.querySelector('[data-prompt-assembly]')`);

    /**
     * 遮挡维度由 `smoke.hardenWindow(win)` 在开跑时统一处理
     * （`SMOKE_OCCLUDE=1` 会额外开一个盖住被测窗口的置顶窗口）——
     * 它复现的是「窗口被压住 → 页面被标记 hidden」这一**环境条件**，
     * 是这条断言历史上抖动的根因（见 webPreferences 注释与 scripts/lib/known-flakes.js）。
     */
    win.webContents.debugger.attach("1.3");
    await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", {
      width: 1000,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const narrowWait = await waitForVariant("inline", 8000);
    const narrow = await readAssembly();
    const narrowDiag = await readViewportDiag();
    check("窄屏（右栏隐藏）时组装面板就地展开，不会没有入口",
      narrowWait.ok && narrow.panelExists === true && narrow.variant === "inline",
      `${narrowWait.ok ? "轮询命中" : "轮询超时"}[${narrowWait.waitedMs}ms] ` +
        `variant=${narrow.variant} innerWidth=${narrowDiag.innerWidth} ` +
        `matches=${narrowDiag.matches} visibility=${narrowDiag.visibility}`);

    /**
     * 窄屏功能库必须满屏：右栏的显隐断点也是 xl，因此 1000px 视口下不应再出现
     * sm/md 的四边留白。采样前显式 finish() 入场动画，避免后台节流造成假红。
     */
    const narrowToolRow = await run(`(() => {
      const trigger = document.querySelector('[data-pose-library-trigger]');
      const assembly = document.querySelector('[data-prompt-assembly]');
      if (!trigger || !assembly) return { exists: false };
      const triggerRect = trigger.getBoundingClientRect();
      const assemblyRect = assembly.getBoundingClientRect();
      return {
        exists: true,
        triggerTop: Math.round(triggerRect.top),
        triggerBottom: Math.round(triggerRect.bottom),
        assemblyTop: Math.round(assemblyRect.top),
        viewportHeight: window.innerHeight,
      };
    })()`);
    check("窄屏高级模式下工具行仍显示在组装面板上方（不需先关闭高级）",
      narrowToolRow.exists === true &&
        narrowToolRow.triggerTop >= 0 &&
        narrowToolRow.triggerBottom <= narrowToolRow.viewportHeight &&
        narrowToolRow.triggerBottom <= narrowToolRow.assemblyTop,
      JSON.stringify(narrowToolRow));

    await clickSelector("[data-pose-library-trigger]");
    const narrowPoseOpened = await waitFor(
      `document.querySelector('[data-resource-dialog="pose-library-dialog-title"]')`,
      10000
    );
    const narrowPoseRect = await run(`(() => {
      const dialog = document.querySelector('[data-resource-dialog="pose-library-dialog-title"]');
      if (!dialog) return { exists: false };
      try {
        dialog.getAnimations().forEach((animation) => animation.finish());
      } catch {}
      const rect = dialog.getBoundingClientRect();
      const nav = document.querySelector('nav[aria-expanded]');
      const navWidth = nav ? Math.round(nav.getBoundingClientRect().width) : 0;
      return {
        exists: true,
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(window.innerWidth - rect.right),
        bottom: Math.round(window.innerHeight - rect.bottom),
        navWidth,
        hasBackButton: Boolean(dialog.querySelector('[data-resource-dialog-back]')),
        widthRatio: Number((rect.width / window.innerWidth).toFixed(3)),
        heightRatio: Number((rect.height / window.innerHeight).toFixed(3)),
      };
    })()`);
    check("窄屏（<xl）功能库占据右侧主区：保留左导航、用返回箭头退出",
      narrowPoseOpened === true &&
        narrowPoseRect.exists === true &&
        narrowPoseRect.navWidth > 0 &&
        narrowPoseRect.left === narrowPoseRect.navWidth &&
        narrowPoseRect.top <= 1 &&
        narrowPoseRect.right <= 1 &&
        narrowPoseRect.bottom <= 1 &&
        narrowPoseRect.hasBackButton === true &&
        narrowPoseRect.heightRatio >= 0.99,
      JSON.stringify(narrowPoseRect));
    await run(`(() => {
      const dialog = document.querySelector('[data-resource-dialog="pose-library-dialog-title"]');
      const cancel = Array.from(dialog?.querySelectorAll('button') ?? []).find(
        (button) => button.textContent.trim() === '取消'
      );
      cancel?.click();
      return true;
    })()`);
    await sleep(300);

    await win.webContents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
    const wideWait = await waitForVariant("panel", 8000);
    const wideAgain = await readAssembly();
    const wideDiag = await readViewportDiag();
    check("恢复宽屏后组装面板回到右侧栏",
      narrowWait.ok && wideWait.ok && wideAgain.variant === "panel",
      `${wideWait.ok ? "轮询命中" : "轮询超时"}[${wideWait.waitedMs}ms] ` +
        `variant=${wideAgain.variant} innerWidth=${wideDiag.innerWidth} ` +
        `matches=${wideDiag.matches} visibility=${wideDiag.visibility} ` +
        `窄屏那一步=${narrowWait.ok ? "已翻到 inline" : "未翻（本次变体本来就没离开 panel）"}`);

    /**
     * 负向对照 + 正向验证的顺序刻意如此：
     * 先确认**宽屏下没有**这个入口（否则它就不是「窄屏降级」而是一个多余按钮），
     * 再回到窄屏验证入口存在且能打开抽屉。
     */
    check("宽屏时不存在窄屏专用的图库入口（负向对照）",
      (await run(`!document.querySelector('[data-history-pin-option]')`)) === true);

    /**
     * P1 回归：窄屏时右栏整栏是 `hidden xl:flex`，图库会跟着一起消失。
     * 这条断言存在的意义：此前从未有人测过这一格 —— 组装面板有窄屏降级、图库没有，
     * 于是「窄屏下完全看不到已生成图片」一路绿灯。
     */
    /**
     * 注意这里必须**轮询**而不是单次采样：组装面板的变体来自 PromptSection 自己的
     * useMediaQuery 实例，而入口按钮依赖 CreatePage 的实例 —— 两个实例、两次渲染，
     * 单次查询会早一帧。
     */
    await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", {
      width: 1000, height: 900, deviceScaleFactor: 1, mobile: false,
    });
    await waitForVariant("inline", 8000);
    const drawerTriggerAppeared = await waitFor(
      `document.querySelector('[data-history-pin-option]')`,
      8000
    );
    const drawerTrigger = drawerTriggerAppeared === true;
    /**
     * 固钉本身：必须在**主区右上角**（近右边缘、近顶边），且就是三档视图切换；
     * 同时确认提示词框下那枚旧 chip 已经移除（同一件事不留两个入口）。
     */
    const pin = await run(`(() => {
      const el = document.querySelector('[data-history-pin]');
      if (!el) return { found: false };
      const rect = el.getBoundingClientRect();
      return {
        found: true,
        options: Array.from(el.querySelectorAll('[data-history-pin-option]')).map(
          (button) => button.getAttribute('data-history-pin-option')
        ),
        right: Math.round(window.innerWidth - rect.right),
        top: Math.round(rect.top),
        legacyChip: Boolean(document.querySelector('[data-history-drawer-trigger]')),
      };
    })()`);
    check("窄屏入口是主区右上角的固钉（三档视图切换），提示词框下那枚已移除",
      pin.found === true &&
        JSON.stringify(pin.options) === JSON.stringify(["grid", "stack", "bookmark"]) &&
        pin.right <= 20 &&
        pin.top <= 20 &&
        pin.legacyChip === false,
      JSON.stringify(pin));
    const triggerDiag = await run(`(() => {
      const assemblies = Array.from(document.querySelectorAll('[data-prompt-assembly]'))
        .map((el) => el.getAttribute('data-prompt-assembly-variant'));
      const rightSection = document.querySelector('[data-history-sidebar]');
      return {
        innerWidth: window.innerWidth,
        assemblies,
        galleryInDom: Boolean(rightSection),
        buttonCount: document.querySelectorAll('button').length,
      };
    })()`);
    /**
     * 入口现在是主区右上角的**固钉**：三枚方钮对应三个视图档位，
     * 点任意一档 = 打开图库页并停在该档（旧的提示词框下那枚 chip 已删除）。
     */
    /** 骨架屏探针：加载态只在读盘进行中存在（桩故意慢 250ms），必须在点击**之前**装上 */
    await run(`(() => {
      window.__skeletonProbe = { seen: false };
      /** 同一个探针顺带记录「这次替换走了页面切换那套动画」（图库页与路由共用同一实现） */
      window.__subpageProbe = { transitioned: false, direction: null };
      const root = document.documentElement;
      const rootObserver = new MutationObserver(() => {
        if (root.classList.contains('page-transition')) {
          window.__subpageProbe.transitioned = true;
        }
        const direction = root.getAttribute('data-page-direction');
        if (direction) window.__subpageProbe.direction = direction;
      });
      rootObserver.observe(root, {
        attributes: true,
        attributeFilter: ['class', 'data-page-direction'],
      });
      const observer = new MutationObserver(() => {
        if (document.querySelector('[data-gallery-skeleton]')) {
          window.__skeletonProbe.seen = true;
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    })()`);
    await clickSelector('[data-history-pin-option="grid"]');
    const skeletonSeen = await waitFor(
      `window.__skeletonProbe && window.__skeletonProbe.seen === true`,
      4000
    );
    check("图库加载中显示骨架屏（不再是「正在加载…」纯文字，内容到位后自动消失）",
      skeletonSeen === true,
      `探针命中=${skeletonSeen}`);
    const subpageTransition = await run(`window.__subpageProbe`);
    check("进入「已生成图片」走的是和切页面同一套动画（不是另一套淡入）",
      subpageTransition.transitioned === true && subpageTransition.direction === "forward",
      JSON.stringify(subpageTransition));
    const enteredGrid = await waitFor(
      `document.querySelector('[data-history-pin-option="grid"]').getAttribute('aria-pressed') === 'true'`,
      8000
    );
    await clickSelector('[data-history-pin-option="stack"]');
    const switchedToStack = await waitFor(
      `document.querySelector('[data-history-pin-option="stack"]').getAttribute('aria-pressed') === 'true'`,
      8000
    );
    check("固钉切档即生效（三个入口共用同一份视图档位：右栏 / 换页 / 固钉）",
      enteredGrid === true && switchedToStack === true,
      `进入时 grid 按下=${enteredGrid} 点 stack 后 stack 按下=${switchedToStack}`);
    await clickSelector('[data-history-pin-option="grid"]');
    /**
     * 断言「主显示区换页」，判据取**几何**而不是类名。三件事一起断言，因为它们是同一个决定：
     *   · 左导航（`nav[aria-expanded]`）仍在、且没被盖住 —— 页面是「左导航 + 右主区」两栏，
     *     盖住整屏会让用户既回不去别的页、也失去「我在哪一层」的上下文；
     *   · 换页占满**主区**（左边缘贴住导航右边缘、右边缘贴住视口右边）——
     *     占用整屏（left=0）与旧的 300px 抽屉（width=300）都会在这两条上红；
     *   · 页面是不透明的（不是原来 `bg-black/40` 那层暗遮罩），里面装的还是同一个图库。
     */
    const readSubpage = () => run(`(() => {
      const page = document.querySelector('[data-create-subpage="history"]');
      if (!page) return { open: false };
      const rect = page.getBoundingClientRect();
      const style = getComputedStyle(page);
      const nav = document.querySelector('nav[aria-expanded]');
      const navRect = nav ? nav.getBoundingClientRect() : null;
      /**
       * 导航命中采样：只作诊断，不作判据（这里是页面侧字符串，注释里别出现反引号）。
       *
       * 起因：这一条最初拿它当判据（要求采样点落在导航里），结果在冒烟里红了 ——
       * 命中的是首启的更新公告弹窗（fixed inset-0 z-[88] bg-black/50）。
       * 冒烟是全新 userData 启动，公告一直盖在最上层，任何「导航可命中」的断言都在测公告、
       * 而不是在测这次改动。故：几何（left/right/width/position）当判据，命中采样留在
       * 详情串里供排查。
       */
      const navSamples = navRect
        ? [120, 300, 600].map((y) => {
            const hit = document.elementFromPoint(
              navRect.left + navRect.width / 2,
              y
            );
            return {
              y,
              insideNav: Boolean(hit && nav && (hit === nav || nav.contains(hit))),
              insidePage: Boolean(hit && page.contains(hit)),
              tag: hit ? hit.tagName + "|" + String(hit.className).slice(0, 40) : "NULL",
            };
          })
        : [];
      const navHit = {
        sampled: navSamples.length,
        insideNav: navSamples.filter((sample) => sample.insideNav).length,
        insidePage: navSamples.filter((sample) => sample.insidePage).length,
        tags: navSamples.map((sample) => sample.y + ":" + sample.tag),
      };
      return {
        open: true,
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        viewportWidth: window.innerWidth,
        background: style.backgroundColor,
        position: style.position,
        navWidth: navRect ? Math.round(navRect.width) : 0,
        navRight: navRect ? Math.round(navRect.right) : null,
        navHit,
        galleryInside: Boolean(page.querySelector('[data-history-sidebar]')),
        hasBack: Boolean(page.querySelector('[data-subpage-back]')),
      };
    })()`);
    const subpage = await readSubpage();
    /** 导航「还在」的判据取几何 + 可量测：命中测试见上（公告弹窗挡着，不能当判据） */
    const navPreserved = subpage.navWidth > 0 && subpage.navRight !== null;
    const subpageFillsMainArea =
      subpage.open === true &&
      navPreserved &&
      subpage.left >= subpage.navRight - 2 &&
      subpage.right >= subpage.viewportWidth - 2 &&
      subpage.width >= subpage.viewportWidth - subpage.navWidth - 2 &&
      subpage.galleryInside === true &&
      subpage.hasBack === true &&
      // 不透明：任何含 alpha<1 的 rgba 都说明还在用暗遮罩盖主区
      !/rgba\\(.*,\\s*0?\\.\\d+\\)/.test(String(subpage.background));
    check("窄屏进入「已生成图片」= 主显示区换页（左导航保留、不覆盖整屏）",
      subpageFillsMainArea,
      `trigger=${drawerTrigger} ${JSON.stringify(subpage)}`);

    /**
     * 版式断言：换页走的是 `page` 版式（有上限的居中列 + 卡片行），不是把 25% 宽的右栏横向拉满。
     *
     * 为什么要一条**几何/属性**判据：换页里是同一个 CreateHistorySidebar 的第二个实例，
     * 「拉满」不会报错、不会崩、也过得了上面那条主区断言 —— 症状只是文件夹行变成整条、
     * 中间大片空白（用户截图里就是这个形态）。**区分度最强的是 `data-history-variant`**：
     * 出问题的形态用的是 `sidebar` 版式。
     *
     * 列宽上限跟着实现走（现在是 `max-w-[1000px]`）。注意本套件只有 1000px 视口、
     * 且图库桩数据是空的：**缩略图密度（一行几张 / 单张多大）在截图与实测里验**
     * （5 张/行、161px），这里不断言它 —— 要断言就得给冒烟喂图片桩，
     * 而那会扰动本套件其它与图库相关的断言。
     */
    const pageLayout = await run(`(() => {
      const page = document.querySelector('[data-create-subpage="history"]');
      const sidebar = page?.querySelector('[data-history-sidebar]');
      const column = sidebar?.firstElementChild;
      if (!page || !sidebar || !column) return { found: false };
      const rect = column.getBoundingClientRect();
      const pageRect = page.getBoundingClientRect();
      return {
        found: true,
        variant: sidebar.getAttribute('data-history-variant'),
        columnWidth: Math.round(rect.width),
        columnLeft: Math.round(rect.left),
        pageLeft: Math.round(pageRect.left),
        pageWidth: Math.round(pageRect.width),
      };
    })()`);
    const columnCentered =
      Math.abs(
        pageLayout.columnLeft -
          (pageLayout.pageLeft + (pageLayout.pageWidth - pageLayout.columnWidth) / 2)
      ) <= 2;
    check("窄屏子页是 page 版式：居中列而不是把右栏拉满",
      pageLayout.found === true &&
        pageLayout.variant === "page" &&
        pageLayout.columnWidth <= 1000 &&
        columnCentered,
      JSON.stringify(pageLayout));
    await clickSelector("[data-subpage-back]");
    const backToCreate = await waitFor(
      `!document.querySelector('[data-create-subpage="history"]') && ` +
        `Boolean(document.getElementById('prompt-editor'))`,
      8000
    );
    check("子页顶部 ◀ 返回可回到创建页原状态（动线闭环）",
      backToCreate === true,
      `${backToCreate ? "轮询命中" : "轮询超时"} diag=${JSON.stringify(triggerDiag)}`);

    /**
     * ---------- 动效基线（本套件里唯一与动画面相关的两条） ----------
     *
     * ① 模态入场按 `role="dialog"` **一次性覆盖**（项目里 19 个弹窗，逐个加类迟早漏）。
     *    判据取 computed `animationName`：它在动画播完后依然保留（`both` 填充），
     *    所以这条断言与「采样时机」无关 —— 不引入时序抖动。
     *    **自带探针**（临时插一个 `role=dialog` 再读样式）：早先这条读的是当场的弹窗，
     *    而那取决于「更新公告此刻还在不在」—— 套件里前面一步点过遮罩就会把它关掉，
     *    于是断言变成了环境依赖（实测红过）。规则本身对所有 `role=dialog` 生效，
     *    所以探针等价且稳定。
     * ② `prefers-reduced-motion` 全局兜底：用 CDP 模拟系统设置，动画/过渡时长必须被压到 1ms。
     *    这条守的是无障碍要求：任何一个组件漏写 `motion-safe:` 都不该让用户被动画困住。
     */
    const dialogAnimation = await run(`(() => {
      const probe = document.createElement('div');
      probe.setAttribute('role', 'dialog');
      document.body.appendChild(probe);
      const style = getComputedStyle(probe);
      const result = { name: style.animationName, duration: style.animationDuration };
      probe.remove();
      return result;
    })()`);
    check("弹窗统一入场动画（按 role 覆盖，不靠逐个组件加类）",
      dialogAnimation !== null &&
        dialogAnimation.name === "motion-pop-in" &&
        dialogAnimation.duration === "0.22s",
      JSON.stringify(dialogAnimation));

    await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await sleep(200);
    const reducedMotion = await run(`(() => {
      const probe = document.createElement('div');
      probe.setAttribute('role', 'dialog');
      document.body.appendChild(probe);
      const probeAnimation = getComputedStyle(probe).animationDuration;
      probe.remove();
      const transitioned = document.querySelector('[data-history-pin-option]');
      return {
        dialogAnimation: probeAnimation,
        buttonTransition: transitioned
          ? getComputedStyle(transitioned).transitionDuration
          : null,
      };
    })()`);
    check("系统开启「减少动效」时，动画与过渡被全局压到 1ms（无障碍兜底）",
      reducedMotion.dialogAnimation === "0.001s" &&
        reducedMotion.buttonTransition === "0.001s",
      JSON.stringify(reducedMotion));
    await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", {
      features: [],
    });

    win.webContents.debugger.detach();

    /**
     * ---------- 11. 事件通道失效时，变体还能不能纠正回来（产品侧加固的验伪） ----------
     *
     * 背景：窗口被遮挡/最小化时 Chromium 不派发 matchMedia 的 change 事件
     * （查询结果仍会重算）。实测恢复可见时 Blink 会补发，所以「永久停在旧变体」没有被复现；
     * 但 useMediaQuery 现在额外把 resize / visibilitychange 当触发信号，
     * 不把正确性押在「会补发」这个非规范行为上。
     *
     * 这一段就是那条加固的**验伪测试**，两种模式构成配对对照：
     *   SMOKE_SWALLOW_MEDIA_EVENT=change → 只吞 change，冗余触发仍在 → 变体应被纠正（正向）
     *   SMOKE_SWALLOW_MEDIA_EVENT=all    → 连 resize / visibilitychange 也掐断
     *                                      → 变体应**不再**纠正（负向对照，证明上一条有区分度）
     * 两种模式都不需要重新构建：负向对照是在页面侧模拟「旧的纯事件驱动实现」。
     * 同时断言 shim 真的生效过（`__swallowedMediaChanges > 0`），
     * 否则事件照常送达，正向那条会**因为错误的理由**通过。
     */
    const swallowMode = process.env.SMOKE_SWALLOW_MEDIA_EVENT;
    if (swallowMode) {
      const dropExtraTriggers = swallowMode === "all";
      const SHIM = `(() => {
        const original = window.matchMedia.bind(window);
        const dropExtraTriggers = ${dropExtraTriggers};
        window.__swallowedMediaChanges = 0;
        window.__droppedExtraTriggers = 0;
        /**
         * 事件时间线：既能回答「谁救的场」，也是断言失败时的证据。
         * 只记三类到达事件 + 变体翻转本身；用捕获阶段监听，避免被应用层的 stopPropagation 影响。
         */
        window.__eventLog = [];
        const note = (label) => window.__eventLog.push(label + '@' + Math.round(performance.now()));
        window.addEventListener('resize', () => note('resize'), true);
        document.addEventListener('visibilitychange', () => note('visibilitychange:' + document.visibilityState), true);
        window.matchMedia = (query) => {
          const media = original(query);
          return {
            media: media.media,
            get matches() { return media.matches; },
            onchange: null,
            addEventListener: (type, listener, options) => {
              if (type !== 'change') { media.addEventListener(type, listener, options); return; }
              // 只记数、不转给页面：模拟「change 没有派发」
              media.addEventListener('change', () => { window.__swallowedMediaChanges += 1; note('change(swallowed)'); });
            },
            removeEventListener: (type, listener, options) => media.removeEventListener(type, listener, options),
            addListener: () => {},
            removeListener: () => {},
            dispatchEvent: () => false,
          };
        };
        if (dropExtraTriggers) {
          // 把 useMediaQuery 的冗余触发也掐掉 = 还原成「纯事件驱动」的旧实现
          for (const [target, type] of [[window, 'resize'], [document, 'visibilitychange']]) {
            const originalAdd = target.addEventListener.bind(target);
            target.addEventListener = (eventType, listener, options) => {
              if (eventType === type) { window.__droppedExtraTriggers += 1; return; }
              originalAdd(eventType, listener, options);
            };
          }
        }
        /**
         * 变体翻转打点：翻转前最后一条事件就是「救场的那条」。
         * 两个坑都踩过：① 本 shim 在页面脚本之前执行，那时 documentElement 还是 null，
         * 只能 observe(document)；② 变体翻转是**换挂载点**（宽屏挂右栏、窄屏就地展开），
         * 不是改属性 —— 只监听 attributes 会完全收不到，必须连 childList 一起听，再去重记录。
         */
        let lastVariant = null;
        const recordVariant = () => {
          const panel = document.querySelector('[data-prompt-assembly]');
          const variant = panel ? panel.getAttribute('data-prompt-assembly-variant') : null;
          if (variant && variant !== lastVariant) {
            lastVariant = variant;
            note('variant=' + variant);
          }
        };
        new MutationObserver(recordVariant).observe(document, {
          attributes: true, childList: true, subtree: true,
        });
      })();`;

      await win.webContents.debugger.attach("1.3");
      await win.webContents.debugger.sendCommand("Page.enable");
      await win.webContents.debugger.sendCommand("Page.addScriptToEvaluateOnNewDocument", {
        source: SHIM,
      });
      await win.reload();
      await waitFor(`document.getElementById('prompt-editor') !== null`, 20000);
      await sleep(1500);

      // 重载后回到默认关闭态；需要重新打开高级组装让面板挂上
      if ((await readAssembly()).panelExists === false) {
        await clickSelector("[data-advanced-prompt-toggle]");
        await waitFor(`document.querySelector('[data-prompt-assembly]')`, 10000);
      }
      const shimInstalled = await run(
        `typeof window.__swallowedMediaChanges === 'number' && ` +
          `(!${dropExtraTriggers} || typeof window.__droppedExtraTriggers === 'number')`
      );
      check("事件通道失效场景：shim 已在页面脚本之前装好", shimInstalled === true);

      await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", {
        width: 1000, height: 900, deviceScaleFactor: 1, mobile: false,
      });
      const shimWait = await waitForVariant("inline", 8000);
      const shimState = await readAssembly();
      const swallowed = await run(`window.__swallowedMediaChanges ?? -1`);
      const dropped = await run(`window.__droppedExtraTriggers ?? 0`);
      const timeline = await run(`Array.isArray(window.__eventLog) ? window.__eventLog : []`);
      /**
       * 归因：翻转成 inline 之前的最后一条**非被吞**事件，才是「救场的那条」。
       * 不能简单取前一条 —— 被吞掉的 change 会在同一毫秒紧挨着 resize 出现（实测时间线：
       * resize@1639 → change(swallowed)@1639 ×2 → variant=inline@1657），
       * 简单取前一条会把「被吞掉的 change」误报成救场者。
       */
      const flipIndex = timeline.map((line) => line.startsWith("variant=inline")).lastIndexOf(true);
      const beforeFlip = flipIndex > 0 ? timeline.slice(0, flipIndex) : [];
      const responsible =
        [...beforeFlip].reverse().find((line) => !line.startsWith("change(swallowed)")) ??
        "（无前置事件）";
      const shimDetail =
        `${shimWait.ok ? "轮询命中" : "轮询超时"}[${shimWait.waitedMs}ms] ` +
        `variant=${shimState.variant} 被吞掉的 change=${swallowed} 被掐断的冗余触发=${dropped} ` +
        `救场事件=${responsible} 时间线=${JSON.stringify(timeline.slice(-8))}`;

      if (dropExtraTriggers) {
        check("负向对照：连 resize / visibilitychange 也掐断时，变体不再被纠正（证明上一条有区分度）",
          shimWait.ok === false && shimState.variant === "panel" && swallowed > 0 && dropped > 0,
          shimDetail);
      } else {
        check("change 事件被吞掉后仍能纠正到窄屏变体（读为准，不靠事件载荷）",
          shimWait.ok && shimState.variant === "inline" && swallowed > 0 &&
            responsible !== "（无前置事件）",
          shimDetail);
      }
      if (swallowed === 0) {
        console.log("[诊断] shim 没有吞到任何 change —— 事件通道没被真正掐断，本段结论不成立");
      }

      await win.webContents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
      await waitForVariant("panel", 8000);
      win.webContents.debugger.detach();
    }

    check("渲染进程无 console 错误", consoleErrors.length === 0,
      consoleErrors.slice(0, 3).join(" | "));

    /**
     * ---------- 12. 页面切换的方向滑动（最后一步：它会离开创建页） ----------
     *
     * 判据分两层：
     *   ① 静态约定：`page-transition` 与 `view-transition-name` **只在过渡期间挂**
     *      —— 名字常驻会让主题波纹那条「裁剪 root 新快照」的动画盖不到内容区与导航；
     *   ② 动态事实：点一次侧栏导航，`html` 上出现过 `page-transition` + 方向，
     *      由 MutationObserver 记录（路由切换是异步的，采样点踩不中就只剩「没看见」这一种结论）。
     *
     * 放最后一步是因为它会重挂页面：跑在前面的话，后面那些「创建页现场」的断言都得重做。
     */
    const beforePageNav = await run(`(() => ({
      hasViewTransition: typeof document.startViewTransition === 'function',
      directionBefore: document.documentElement.getAttribute('data-page-direction'),
      nameBefore: getComputedStyle(
        document.querySelector('[data-page-transition]')
      ).viewTransitionName,
    }))()`);
    await run(`(() => {
      window.__pageNavProbe = { phases: [], direction: null };
      const root = document.documentElement;
      const observer = new MutationObserver(() => {
        const on = root.classList.contains('page-transition');
        const last = window.__pageNavProbe.phases.at(-1);
        if (!last || last.on !== on) window.__pageNavProbe.phases.push({ on });
        const direction = root.getAttribute('data-page-direction');
        if (direction) window.__pageNavProbe.direction = direction;
      });
      observer.observe(root, {
        attributes: true,
        attributeFilter: ['class', 'data-page-direction'],
      });
      const link = Array.from(document.querySelectorAll('nav[aria-expanded] a')).find(
        (a) => a.textContent.trim() === '首页'
      );
      if (link) link.click();
      return Boolean(link);
    })()`);
    const navigatedToHome = await waitFor(`window.location.pathname === '/'`, 8000);
    /** 清理要等动画播完（抽出 + 移入 ≈ 370ms），此刻它本来就还挂着 */
    const pageNavCleaned = await waitFor(
      `!document.documentElement.classList.contains('page-transition') && ` +
        `document.documentElement.getAttribute('data-page-direction') === null`,
      5000
    );
    const pageNavProbe = await run(`(() => {
      const probe = window.__pageNavProbe ?? { phases: [], direction: null };
      return {
        phases: probe.phases,
        direction: probe.direction,
        transitioned: probe.phases.some((phase) => phase.on === true),
      };
    })()`);
    check("页面切换是「旧内容抽出 + 新内容从同侧移入」（标记只在过渡期间挂、用完即清）",
      beforePageNav.hasViewTransition === true &&
        beforePageNav.directionBefore === null &&
        beforePageNav.nameBefore === "none" &&
        navigatedToHome === true &&
        pageNavProbe.transitioned === true &&
        pageNavProbe.direction === "backward" &&
        pageNavCleaned === true,
      `${JSON.stringify({ beforePageNav, navigatedToHome, pageNavProbe })} cleaned=${pageNavCleaned}`);

    if (consoleErrors.length > 0) {
      console.log("--- 渲染进程 console 错误 ---");
      consoleErrors.slice(0, 10).forEach((line) => console.log("  " + line));
    }

    const allPassed = smoke.allPassed();
    console.log(
      `\n${allPassed ? "PROMPT ASSEMBLY SMOKE OK ✓" : "PROMPT ASSEMBLY SMOKE FAILED ✗"}  ` +
        `${smoke.results.filter((r) => r.ok).length}/${smoke.results.length}`
    );
    await smoke.finish({ app, ok: allPassed, cleanupDir: workDir });
  } catch (error) {
    console.error("SMOKE_FAIL", error);
    await smoke.finish({ app, ok: false, error });
  }
});
