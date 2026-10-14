/**
 * 角色选择弹窗（animadex）验证
 *
 * 入口：创建页提示词输入框下方、「画师」按钮右侧的「角色」按钮
 * 结构：标题 → 横向工具条（搜索 / 排序 / 单选多选 / 复制已选 / 只看已选 / 清除已选）
 *       → 主体（左侧固钉导航 + 右侧唯一滚动卡片区）→ footer（分页 + 左计数 + 右按钮组）
 *
 * 运行：npx electron scripts/smoke-characters.js   （退出码 0 = 通过）
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createSmokeHarness } = require("./lib/smoke-harness");
const { app, BrowserWindow, nativeTheme, ipcMain: realIpcMain } = require("electron");
const { registerAppProtocol } = require("../apps/electron/appProtocol");

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
nativeTheme.themeSource = "light";

/** 可观测性骨架（看门狗 124 / 单步超时 125 / 日志留档 / 进程树终止） */
const smoke = createSmokeHarness({ name: "characters" });
smoke.installConsoleTee();
const check = smoke.check;
const results = smoke.results;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "characters-smoke-"));
smoke.setWorkDir(workDir);
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
ipcMain.handle("models:downloadList", async () => []);
ipcMain.handle("paths:getDefaultOutput", async () => path.join(workDir, "output"));
ipcMain.handle("files:listGeneratedImages", async () => []);
ipcMain.handle("files:listOutputFolders", async () => []);
ipcMain.handle("changelog:read", async () => null);
/**
 * 主题 IPC：页面加载时 AppShell 会调用；样式切换段直接切 nativeTheme 验证媒体查询。
 * 不补这个空 handler，主进程会打印 `No handler registered for 'theme:setThemeSource'` ——
 * 那条日志长得像失败，会被后来的人误读（该套件只注册自己需要的那几个 handler）。
 */
ipcMain.handle("theme:setThemeSource", async () => null);

/** 名称首字母按 4 个字母轮换，便于验证「字母」筛选 */
const NAME_PREFIXES = ["Alice", "Bruno", "Cathy", "Dora"];

function buildCharacter(index, copyright = "vocaloid") {
  const prefix = NAME_PREFIXES[(index - 1) % NAME_PREFIXES.length];
  return {
    slug: `character_${index}`,
    name: `${prefix} ${index}`,
    copyright,
    copyrightName: copyright === "vocaloid" ? "Vocaloid" : "东方 Project",
    trigger: `character ${index}, ${copyright}`,
    tags: ["1girl", "long hair", `tag_${index}`],
    count: 1000 * index,
    url: `https://danbooru.donmai.us/posts?tags=character_${index}`,
    thumbUrl: "",
    imageUrl: "",
    hasImage: false,
    loras: [{ name: `LoRA for Character ${index}`, url: "https://civitai.com/models/1", thumb: "" }],
    rating: { up: index, down: 0 },
    favCount: index * 3,
  };
}

const searchCalls = [];
ipcMain.handle("animadex:search", async (_event, params) => {
  const requested = params ?? {};
  searchCalls.push(requested);
  if (requested.copyright === "touhou") {
    return {
      total: 2,
      page: 1,
      pageSize: 24,
      pages: 1,
      results: [buildCharacter(101, "touhou"), buildCharacter(102, "touhou")],
    };
  }
  const page = requested.page ?? 1;
  return {
    total: 48,
    page,
    pageSize: 24,
    pages: 2,
    results: Array.from({ length: 24 }, (_, index) => buildCharacter(page === 1 ? index + 1 : index + 25)),
  };
});

app.whenReady().then(async () => {
  smoke.installWatchdog(app);
  // 陈旧产物会伪装成代码回归，先拦掉（退出码 2）
  smoke.assertBuildFresh({ app });
  const win = new BrowserWindow({
    width: 1440,
    height: 950,
    // 必须显示窗口并置顶：隐藏 / 被遮挡的窗口下 Chromium 会暂停 CSS transition，
    // 抽屉收纳的箭头旋转与高度过渡动画就测不出真实变化
    show: true,
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // 与真实应用 main.js 一致：preload 是手写 CommonJS，需 Node 环境才能 require 本地模块
      sandbox: false,
      preload: path.join(__dirname, "..", "apps", "electron", "preload.js"),
      /**
       * 关闭后台节流：置顶也挡不住桌面上的其它窗口，一旦被盖住，Chromium 会把这个页面
       * 标记为 hidden 并停摆渲染生命周期 —— CSS 过渡停在半路、rAF 不再回调。
       * 这个前提不消除，本套件的过渡断言（中间帧 / 收起后高度归零）就是随机的。
       * 对照实验与完整根因见 `scripts/lib/known-flakes.js`。
       */
      backgroundThrottling: false,
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

  const waitFor = async (expression, timeoutMs = 20000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const ok = await run(`(() => { try { return Boolean(${expression}); } catch { return false; } })()`);
      if (ok) return true;
      await sleep(200);
    }
    return false;
  };

  const openPicker = async () => {
    await run(`document.querySelector('[data-character-picker-trigger]').click(); true`);
    return waitFor(`document.querySelectorAll('[data-character-card]').length > 0`, 20000);
  };

  const closePicker = async () => {
    await run(`(() => {
      const dialog = document.querySelector('[data-resource-dialog="character-picker-dialog-title"]');
      if (!dialog) return true;
      const cancel = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent.trim() === '取消');
      if (cancel) cancel.click();
      return true;
    })()`);
    await sleep(500);
  };

  const clickCard = async (slug) => {
    await run(`(() => {
      const card = document.querySelector('[data-character-card="${slug}"]');
      card?.querySelector('button[aria-label^="选择"]')?.click();
      return true;
    })()`);
    await sleep(350);
  };

  /** 展开抽屉式收纳段落（收藏 / 作品） */
  const expandSection = async (id) => {
    await run(`(() => {
      const toggle = document.querySelector('[data-character-section-toggle="${id}"]');
      if (toggle && toggle.getAttribute('data-character-section-open') !== 'true') toggle.click();
      return true;
    })()`);
    await sleep(600);
  };

  const collapseSection = async (id) => {
    await run(`(() => {
      const toggle = document.querySelector('[data-character-section-toggle="${id}"]');
      if (toggle && toggle.getAttribute('data-character-section-open') === 'true') toggle.click();
      return true;
    })()`);
    await sleep(600);
  };

  const readSection = (id) =>
    run(`(() => {
      const toggle = document.querySelector('[data-character-section-toggle="${id}"]');
      if (!toggle) return { exists: false };
      const arrow = toggle.querySelector('[data-character-section-arrow]');
      const body = document.querySelector('[data-character-section-body="${id}"]');
      return {
        exists: true,
        open: toggle.getAttribute('data-character-section-open'),
        arrow: arrow?.getAttribute('data-character-section-arrow') ?? '',
        arrowTransform: arrow ? getComputedStyle(arrow).transform : '',
        arrowTransition: arrow ? getComputedStyle(arrow).transitionDuration : '',
        bodyInDom: !!body,
        bodyHeight: body ? Math.round(body.getBoundingClientRect().height) : -1,
        bodyTransition: body ? getComputedStyle(body).transitionDuration : '',
      };
    })()`);

  /**
   * 点击收纳开关后**等过渡真正结束**再读，而不是拍脑袋 sleep 一个数。
   *
   * 为什么必须这样：`sleep(600)` 与 300ms 的过渡看似有 2 倍余量，但它在过渡首帧之前就读了数：
   * 读到的 74px 其实是**展开态高度**，于是表现成「收起后高度不归零」这个像真 bug 的失败。
   *
   * ## 判据的层次（别把诊断信号升级成 FAIL 条件）
   * 主判据只有一条：**高度连续两次采样不变**（配合断言处的 `bodyHeight === 0` / `gridRows: 0px`）。
   * `animations` 只作诊断（`probe.animations` 非空 → 过渡还在跑，多半是时序/环境问题），
   * 不参与「是否落定」的判定，原因有二：
   *   1. 浏览器/版本对 CSS transition 的 `getAnimations()` 支持不一致，
   *      尤其合成器加速属性（opacity/transform）；本处测的是 `grid-template-rows`，
   *      属非合成属性、走主线程布局，当前没问题，但换个属性就可能失效。
   *   2. 用户开了 `prefers-reduced-motion` 时过渡时长为 0，`animations` 恒为空 ——
   *      把「空」当判据会把「没有动画」误读成「动画跑完了」。
   */
  const settleSection = async (id, timeoutMs = 5000) => {
    const startedAt = Date.now();
    let lastHeight = null;
    let stableSamples = 0;
    let probe = null;
    // 连续两次采样高度相同即认为落定；采样间隔 60ms，最坏多花两帧
    while (Date.now() - startedAt < timeoutMs) {
      probe = await run(`(() => {
        const body = document.querySelector('[data-character-section-body="${id}"]');
        if (!body) return { exists: false };
        return {
          exists: true,
          height: Math.round(body.getBoundingClientRect().height),
          gridRows: getComputedStyle(body).gridTemplateRows,
          inlineRows: body.style.gridTemplateRows,
          visibility: document.visibilityState,
          animations: body.getAnimations().map((animation) => ({
            property: animation.transitionProperty ?? animation.animationName ?? '?',
            playState: animation.playState,
            currentTime: Math.round(Number(animation.currentTime) || 0),
            duration: animation.effect?.getTiming?.().duration ?? null,
          })),
        };
      })()`);
      stableSamples = probe.exists === true && probe.height === lastHeight ? stableSamples + 1 : 0;
      lastHeight = probe?.height ?? null;
      if (stableSamples >= 2) break;
      await sleep(60);
    }
    const section = await readSection(id);
    return {
      ...section,
      settle: {
        waitedMs: Date.now() - startedAt,
        // 「落定」= 两次采样高度一致；超时说明一直在变（真·没停下来）
        timedOut: stableSamples < 2,
        probe,
      },
    };
  };

  const footerState = () =>
    run(`(() => {
      const dialog = document.querySelector('[data-resource-dialog="character-picker-dialog-title"]');
      if (!dialog) return { open: false };
      const count = dialog.querySelector('[data-character-selected-count]');
      const applyTrigger = dialog.querySelector('[data-character-apply-trigger]');
      const applyBoth = dialog.querySelector('[data-character-apply-both]');
      const cancel = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent.trim() === '取消');
      const countRect = count?.getBoundingClientRect();
      const groupRect = cancel?.parentElement?.getBoundingClientRect();
      const rowRect = count?.parentElement?.getBoundingClientRect();
      return {
        open: true,
        text: count?.innerText?.replace(/\\s+/g, ' ').trim() ?? '',
        applyTriggerDisabled: applyTrigger ? applyTrigger.disabled : null,
        applyBothDisabled: applyBoth ? applyBoth.disabled : null,
        hasCancel: !!cancel,
        countOnLeft: rowRect && countRect ? countRect.left - rowRect.left < 2 : false,
        groupOnRight: rowRect && groupRect ? rowRect.right - groupRect.right < 2 : false,
      };
    })()`);

  try {
    await win.loadURL("app://app/create");
    await sleep(3500);

    // ---------- 入口：提示词框下方、「画师」右侧 ----------
    const trigger = await run(`(() => {
      const btn = document.querySelector('[data-character-picker-trigger]');
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
        sameRowAsPainter: Math.abs(btnRect.top - painterRect.top) < 8,
        rightOfPainter: btnRect.left >= painterRect.right - 2,
        belowEditor: btnRect.top >= editorRect.bottom - 8,
        label: btn.innerText.trim(),
      };
    })()`);
    check("创建页存在「角色」入口按钮", trigger.found === true && trigger.label.includes("角色"));
    check(
      "入口位于「画师」按钮右侧同一行且处于提示词输入框下方",
      trigger.sameRowAsPainter && trigger.rightOfPainter && trigger.belowEditor,
      JSON.stringify(trigger)
    );

    // ---------- 弹窗外壳 ----------
    check("点击后弹出角色选择弹窗并加载数据", (await openPicker()) === true);

    const dialogInfo = await run(`(() => {
      const dialog = document.querySelector('[data-resource-dialog="character-picker-dialog-title"]');
      if (!dialog) return { exists: false };
      const grid = dialog.querySelector('[data-character-grid]');
      const title = document.getElementById('character-picker-dialog-title');
      const toolbar = dialog.querySelector('[data-character-toolbar]');
      const sidebar = dialog.querySelector('[data-character-sidebar]');
      return {
        exists: true,
        hasGrid: !!grid,
        columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
        cards: dialog.querySelectorAll('[data-character-card]').length,
        toolbarBelowTitle: !!toolbar &&
          toolbar.getBoundingClientRect().top >= title.getBoundingClientRect().bottom - 2,
        toolbarAboveGrid: !!toolbar && !!grid &&
          toolbar.getBoundingClientRect().bottom <= grid.getBoundingClientRect().top + 2,
        sidebarBg: sidebar ? getComputedStyle(sidebar).backgroundColor : '',
        hasFooterCount: !!dialog.querySelector('[data-character-selected-count]'),
      };
    })()`);
    check(
      "弹窗复用创作页弹框父组件（ResourceDialogShell）",
      dialogInfo.exists === true,
      String(dialogInfo.exists)
    );
    check("渲染 24 张角色卡片，网格 4 列", dialogInfo.cards === 24 && dialogInfo.columns === 4,
      `${dialogInfo.cards} 张 / ${dialogInfo.columns} 列`);
    check("工具条位于标题下方、卡片区上方", dialogInfo.toolbarBelowTitle && dialogInfo.toolbarAboveGrid);
    check("左侧导航为白底", dialogInfo.sidebarBg === "rgb(255, 255, 255)", dialogInfo.sidebarBg);
    check("footer 含已选计数区", dialogInfo.hasFooterCount === true);

    // ---------- 工具条 ----------
    const toolbar = await run(`(() => {
      const bar = document.querySelector('[data-character-toolbar]');
      if (!bar) return { exists: false };
      const search = bar.querySelector('input[type="search"]');
      const hot = bar.querySelector('[data-character-sort="hot"]');
      const recent = bar.querySelector('[data-character-sort="recent"]');
      const mode = bar.querySelector('[data-character-mode]');
      const copy = bar.querySelector('[data-character-copy-selected]');
      const onlySelected = bar.querySelector('[data-character-only-selected]');
      const clear = bar.querySelector('[data-character-clear-selected]');
      const labels = Array.from(bar.querySelectorAll('button')).map((b) => b.textContent.trim()).filter(Boolean);
      return {
        exists: true,
        hasSearch: !!search,
        searchPlaceholder: search?.getAttribute('placeholder') ?? '',
        hotLabel: hot?.textContent.trim() ?? '',
        recentLabel: recent?.textContent.trim() ?? '',
        hotActive: hot?.getAttribute('aria-pressed') === 'true',
        horizontal: !!hot && !!recent &&
          Math.abs(hot.getBoundingClientRect().top - recent.getBoundingClientRect().top) < 4,
        mode: mode?.getAttribute('data-character-mode') ?? '',
        modeLabel: mode?.textContent.trim() ?? '',
        hasCopy: !!copy,
        hasOnlySelected: !!onlySelected,
        hasClear: !!clear,
        copyDisabled: copy ? copy.disabled : null,
        clearDisabled: clear ? clear.disabled : null,
        labels,
      };
    })()`);
    check("工具条存在搜索框（角色名 / 触发词）", toolbar.exists === true && toolbar.hasSearch === true);
    check("排序为横向排列的 热度 / 最新 两项", toolbar.horizontal === true &&
      toolbar.hotLabel.includes("热度") && toolbar.recentLabel.includes("最新"),
      `${toolbar.hotLabel} | ${toolbar.recentLabel}`);
    check("默认按热度排序（热度为激活态）", toolbar.hotActive === true);
    check("提供单选 / 多选切换，默认多选", toolbar.mode === "multi" && toolbar.modeLabel.includes("多选"),
      `${toolbar.mode} / ${toolbar.modeLabel}`);
    check("提供 复制已选 / 只看已选 / 清除已选 三个操作",
      toolbar.hasCopy && toolbar.hasOnlySelected && toolbar.hasClear === true, toolbar.labels.join(" / "));
    check("未选择时「复制已选 / 清除已选」为禁用",
      toolbar.copyDisabled === true && toolbar.clearDisabled === true);

    const toolbarLayout = await run(`(() => {
      const bar = document.querySelector('[data-character-toolbar]');
      const search = document.querySelector('[data-character-search]');
      const right = document.querySelector('[data-character-toolbar-right]');
      const barRect = bar.getBoundingClientRect();
      const searchRect = search.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return {
        width: Math.round(searchRect.width),
        searchLeft: searchRect.left - barRect.left < 2,
        rightRight: barRect.right - rightRect.right < 2,
        searchBeforeRight: searchRect.right <= rightRect.left + 1,
      };
    })()`);
    check("搜索框宽度收窄（≤ 260px）",
      toolbarLayout.width <= 260, `${toolbarLayout.width}px`);
    check("搜索框左浮动、其余控件整体右浮动",
      toolbarLayout.searchLeft === true && toolbarLayout.rightRight === true &&
        toolbarLayout.searchBeforeRight === true,
      JSON.stringify(toolbarLayout));

    // ---------- 侧栏：抽屉收纳（收藏 / 作品） ----------
    /** 未旋转（rotate(0)）在计算样式里是单位矩阵而不是 none，两种都算「原样」 */
    const isUnrotated = (transform) =>
      transform === "none" || transform === "matrix(1, 0, 0, 1, 0, 0)";

    const collapsedFav = await readSection("favorites");
    const collapsedWorks = await readSection("copyrights");
    check("「收藏」「作品」两段都提供收纳开关",
      collapsedFav.exists === true && collapsedWorks.exists === true);
    check("收起时箭头是 >（未旋转）",
      collapsedFav.arrow === "right" && collapsedWorks.arrow === "right" &&
        isUnrotated(collapsedFav.arrowTransform) && isUnrotated(collapsedWorks.arrowTransform),
      `${collapsedFav.arrow} ${collapsedFav.arrowTransform}`);
    check("收起时内容仍留在 DOM 中但高度为 0（不卸载，避免闪烁）",
      collapsedFav.bodyInDom === true && collapsedWorks.bodyInDom === true &&
        collapsedFav.bodyHeight === 0 && collapsedWorks.bodyHeight === 0,
      `${collapsedFav.bodyHeight} / ${collapsedWorks.bodyHeight}`);
    check("箭头与内容都配置了过渡动画",
      collapsedFav.arrowTransition !== "0s" && collapsedFav.bodyTransition !== "0s",
      `${collapsedFav.arrowTransition} / ${collapsedFav.bodyTransition}`);

    // 真实采样展开过程：应出现介于 0 与最终高度之间的中间帧（证明是平滑过渡而非瞬变）
    // 注意：窗口被遮挡时 Chromium 会暂停 transition，这里失败会折叠后重试一次
    const sampleExpand = () =>
      run(`(async () => {
      const toggle = document.querySelector('[data-character-section-toggle="favorites"]');
      const body = document.querySelector('[data-character-section-body="favorites"]');
      const arrow = toggle.querySelector('[data-character-section-arrow]');
      const before = Math.round(body.getBoundingClientRect().height);
      toggle.click();
      const samples = [];
      const arrowFrames = [];
      for (let i = 0; i < 14; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 45));
        samples.push(Math.round(body.getBoundingClientRect().height));
        arrowFrames.push(getComputedStyle(arrow).transform);
      }
      return {
        before,
        samples,
        arrowFrames,
        finalHeight: Math.round(body.getBoundingClientRect().height),
        finalArrow: getComputedStyle(arrow).transform,
      };
    })()`);

    let expandAnimation = await sampleExpand();
    let intermediateFrames = expandAnimation.samples.filter(
      (h) => h > 0 && h < expandAnimation.finalHeight
    );
    if (intermediateFrames.length < 2) {
      // 收起后重试（把窗口拉到最前，避免被遮挡导致过渡暂停）
      win.focus();
      await collapseSection("favorites");
      await sleep(600);
      expandAnimation = await sampleExpand();
      intermediateFrames = expandAnimation.samples.filter(
        (h) => h > 0 && h < expandAnimation.finalHeight
      );
    }
    check("展开是连续的高度动画（存在中间帧）",
      expandAnimation.before === 0 && expandAnimation.finalHeight > 20 &&
        intermediateFrames.length >= 2,
      `samples=${expandAnimation.samples.join(",")}`);
    const midRotations = expandAnimation.arrowFrames.filter(
      (t) => t !== expandAnimation.finalArrow
    );
    check("展开过程中箭头同步旋转（> 转 ↓）",
      midRotations.length >= 1 &&
        expandAnimation.finalArrow === "matrix(0, 1, -1, 0, 0, 0)",
      `mid=${midRotations.slice(0, 3).join(" ")} final=${expandAnimation.finalArrow}`);

    const expandedFav = await readSection("favorites");
    check("展开后箭头朝向为 ↓ 且内容可见",
      expandedFav.open === "true" && expandedFav.arrow === "down" &&
        !isUnrotated(expandedFav.arrowTransform) && expandedFav.bodyHeight > 20,
      `${expandedFav.arrow} / ${expandedFav.bodyHeight}px`);

    await collapseSection("favorites");
    const collapsedAgain = await settleSection("favorites");
    check("再次点击转回 > 并恢复收起",
      collapsedAgain.open === "false" && collapsedAgain.arrow === "right" &&
        isUnrotated(collapsedAgain.arrowTransform) && collapsedAgain.bodyHeight === 0,
      `${collapsedAgain.open} / ${collapsedAgain.arrow} / ${collapsedAgain.bodyHeight} · ` +
        `settle=${JSON.stringify(collapsedAgain.settle)}`);

    await expandSection("favorites");
    await expandSection("copyrights");
    const worksExpanded = await readSection("copyrights");
    check("「作品」展开后同样带 ↓ 箭头与可见内容",
      worksExpanded.arrow === "down" && worksExpanded.bodyHeight > 20,
      `${worksExpanded.arrow} / ${worksExpanded.bodyHeight}px`);

    // ---------- 侧栏：固定与滚动 ----------
    const sidebar = await run(`(() => {
      const panel = document.querySelector('[data-character-sidebar]');
      const fixed = panel.querySelector('[data-character-sidebar-fixed]');
      const copyrightList = panel.querySelector('[data-character-copyright-list]');
      const letters = Array.from(panel.querySelectorAll('[data-character-letter]')).map(
        (b) => b.textContent.trim()
      );
      const rows = Array.from(panel.querySelectorAll('button')).map((b) => b.textContent.trim()).filter(Boolean);
      return {
        letters,
        rowLabels: rows,
        panelOverflow: getComputedStyle(panel).overflow,
        panelScrollable: panel.scrollHeight > panel.clientHeight + 2,
        fixedTop: fixed.getBoundingClientRect().top,
        copyrightScrollable: copyrightList.scrollHeight > copyrightList.clientHeight + 2,
        copyrightOverflowY: getComputedStyle(copyrightList).overflowY,
      };
    })()`);
    check("侧栏含 全 + A~Z + # 共 28 个字母项",
      sidebar.letters.length === 28 && sidebar.letters[0] === "全" && sidebar.letters.includes("A") &&
        sidebar.letters.includes("Z") && sidebar.letters.includes("#"),
      `${sidebar.letters.length} 项`);
    check("侧栏含「只看收藏（N）」与「只看已选（N）」",
      sidebar.rowLabels.some((l) => l.startsWith("只看收藏（")) &&
        sidebar.rowLabels.some((l) => l.startsWith("只看已选（")),
      sidebar.rowLabels.filter((l) => l.startsWith("只看")).join(" / "));
    check("侧栏整体不滚动（面板自身无滚动条）", sidebar.panelScrollable === false, sidebar.panelOverflow);
    check("侧栏内「作品」列表为可滚动区",
      sidebar.copyrightScrollable === true && sidebar.copyrightOverflowY === "auto",
      `${sidebar.copyrightScrollable} / ${sidebar.copyrightOverflowY}`);

    // ---------- Saber 与 Main 是两个独立区域 ----------
    const layout = await run(`(() => {
      const panel = document.querySelector('[data-character-sidebar]');
      const main = document.querySelector('[data-character-main]');
      const area = document.querySelector('[data-character-scroll-area]');
      const bar = document.querySelector('[data-character-pagination-bar]');
      const footer = document.querySelector('[data-character-footer-actions]')?.parentElement?.parentElement;
      const panelRect = panel.getBoundingClientRect();
      const mainRect = main.getBoundingClientRect();
      const areaRect = area.getBoundingClientRect();
      return {
        siblings: panel.parentElement === main.parentElement,
        sideBySide: Math.abs(panelRect.top - mainRect.top) < 2 &&
          mainRect.left >= panelRect.right - 2,
        cardsInsideMain: main.contains(area),
        paginationInsideMain: !!bar && main.contains(bar),
        paginationBelowCards: !!bar && bar.getBoundingClientRect().top >= areaRect.bottom - 2,
        paginationInFooter: !!(footer && bar && footer.contains(bar)),
        paginationUnderSidebar: !!bar && bar.getBoundingClientRect().left >= panelRect.right - 2,
        hasPaginationNow: !!bar,
      };
    })()`);
    check("Saber（导航）与 Main（展示区）为同一行上的两个独立区域",
      layout.siblings === true && layout.sideBySide === true, JSON.stringify(layout));
    check("分页位于 Main 内部、卡片展示区正下方",
      layout.hasPaginationNow && layout.paginationInsideMain === true &&
        layout.paginationBelowCards === true && layout.cardsInsideMain === true);
    check("分页不在 footer 内、也不在 Saber 下方",
      layout.paginationInFooter === false && layout.paginationUnderSidebar === true);

    const scrollIsolation = await run(`(() => {
      const panel = document.querySelector('[data-character-sidebar]');
      const fixed = panel.querySelector('[data-character-sidebar-fixed]');
      const area = document.querySelector('[data-character-scroll-area]');
      const cardRect = area.querySelector('[data-character-card]').getBoundingClientRect();
      const before = {
        fixedTop: fixed.getBoundingClientRect().top,
        panelTop: panel.getBoundingClientRect().top,
        cardTop: cardRect.top,
        gridScrollTop: area.scrollTop,
      };
      area.scrollTop = 400;
      panel.scrollTop = 120;
      return {
        before,
        areaScrollTop: area.scrollTop,
        areaOverflowY: getComputedStyle(area).overflowY,
        panelScrollTop: panel.scrollTop,
        afterFixedTop: fixed.getBoundingClientRect().top,
        afterPanelTop: panel.getBoundingClientRect().top,
        afterCardTop: area.querySelector('[data-character-card]').getBoundingClientRect().top,
      };
    })()`);
    check("卡片区是唯一滚动容器（overflow-y: auto 且可滚动）",
      scrollIsolation.areaOverflowY === "auto" && scrollIsolation.areaScrollTop > 0,
      `${scrollIsolation.areaOverflowY} / scrollTop=${scrollIsolation.areaScrollTop}`);
    check("滚动卡片区时侧栏与固定区不动",
      scrollIsolation.panelScrollTop === 0 &&
        Math.abs(scrollIsolation.afterFixedTop - scrollIsolation.before.fixedTop) < 1 &&
        Math.abs(scrollIsolation.afterPanelTop - scrollIsolation.before.panelTop) < 1,
      `panelScrollTop=${scrollIsolation.panelScrollTop}`);
    check("卡片区滚动确实移动了卡片内容",
      scrollIsolation.afterCardTop < scrollIsolation.before.cardTop - 100,
      `${scrollIsolation.before.cardTop} → ${scrollIsolation.afterCardTop}`);
    await run(`document.querySelector('[data-character-scroll-area]').scrollTop = 0; true`);

    // ---------- 卡片样式 ----------
    const card = await run(`(() => {
      const first = document.querySelector('[data-character-card="character_1"]');
      const style = getComputedStyle(first);
      return {
        bg: style.backgroundColor,
        radius: style.borderRadius,
        border: style.borderTopWidth,
        hasName: first.innerText.includes('Alice 1'),
        hasCopyrightPill: first.innerText.includes('Vocaloid'),
        hasHeat: first.innerText.includes('1,000'),
        heart: !!first.querySelector('[data-character-favorite]'),
        detailBtn: !!first.querySelector('[data-character-detail]'),
      };
    })()`);
    check("卡片为白底 12px 圆角 + 1px 边框",
      card.bg === "rgb(255, 255, 255)" && card.radius === "12px" &&
        // 设备像素比不是 1 时 Chromium 会把 1px 边框报成小数（如 0.667px），这里按范围判定
        Number.parseFloat(card.border) > 0.5 && Number.parseFloat(card.border) <= 1.5,
      `${card.bg} / ${card.radius} / ${card.border}`);
    check("卡片含角色名 / 作品标签 / 热度 / 爱心",
      card.hasName && card.hasCopyrightPill && card.hasHeat && card.heart === true);
    check("卡片提供详情入口", card.detailBtn === true);

    // ---------- 多选 + footer ----------
    await clickCard("character_1");
    const oneSelected = await run(`(() => {
      const cardEl = document.querySelector('[data-character-card="character_1"]');
      return {
        selected: cardEl.getAttribute('data-character-selected'),
        checked: !!cardEl.querySelector('[data-character-checked]'),
      };
    })()`);
    check("点击卡片即选中（选中态 + 勾选标记）",
      oneSelected.selected === "true" && oneSelected.checked === true, JSON.stringify(oneSelected));

    const footer1 = await footerState();
    check("footer 左侧显示「已选择 1 个角色」", footer1.text.startsWith("已选择 1 个角色"), footer1.text);
    check("footer 右侧有 取消 / 应用触发词 / 触发词+Tags 且右对齐",
      footer1.hasCancel && footer1.groupOnRight === true, JSON.stringify(footer1));
    check("左侧计数与右侧按钮组分居两端",
      footer1.countOnLeft === true && footer1.groupOnRight === true);
    check("有选中时两个应用按钮可用",
      footer1.applyTriggerDisabled === false && footer1.applyBothDisabled === false);

    const footerIcons = await run(`(() => {
      const box = document.querySelector('[data-character-footer-actions]');
      return Array.from(box.querySelectorAll('button')).map((b) => ({
        label: b.textContent.trim(),
        svgs: b.querySelectorAll('svg').length,
      }));
    })()`);
    check("footer 按钮只保留文字（无 √ 图标）",
      footerIcons.length === 3 && footerIcons.every((b) => b.svgs === 0),
      JSON.stringify(footerIcons));

    await clickCard("character_2");
    const footer2 = await footerState();
    check("多选模式下可同时选中多个角色", footer2.text.startsWith("已选择 2 个角色"), footer2.text);

    // ---------- 复制已选 ----------
    await run(`(() => {
      window.__copiedText = null;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text) => { window.__copiedText = text; } },
      });
      return true;
    })()`);
    await run(`document.querySelector('[data-character-copy-selected]').click(); true`);
    await sleep(500);
    const copied = await run(`window.__copiedText`);
    check("「复制已选」复制所有已选角色的触发词",
      typeof copied === "string" &&
        copied.includes("character 1, vocaloid") && copied.includes("character 2, vocaloid"),
      String(copied));

    // ---------- 只看已选 ----------
    await run(`document.querySelector('[data-character-only-selected]').click(); true`);
    await sleep(500);
    const onlySelected = await run(`(() => ({
      cards: document.querySelectorAll('[data-character-card]').length,
      pressed: document.querySelector('[data-character-only-selected]').getAttribute('aria-pressed'),
      hasPagination: !!document.querySelector('[data-character-pagination]'),
    }))()`);
    check("「只看已选」只保留已选角色",
      onlySelected.cards === 2 && onlySelected.pressed === "true", JSON.stringify(onlySelected));
    await run(`document.querySelector('[data-character-only-selected]').click(); true`);
    await sleep(500);

    // ---------- 切换单选 ----------
    await run(`document.querySelector('[data-character-mode]').click(); true`);
    await sleep(300);
    const singleMode = await run(`(() => {
      const mode = document.querySelector('[data-character-mode]');
      return { mode: mode.getAttribute('data-character-mode'), label: mode.textContent.trim() };
    })()`);
    check("可切换到单选模式，且只保留最后一个已选",
      singleMode.mode === "single" && singleMode.label.includes("单选"), JSON.stringify(singleMode));
    const afterSwitch = await footerState();
    check("切到单选后已选数量收敛为 1", afterSwitch.text.startsWith("已选择 1 个角色"), afterSwitch.text);

    await clickCard("character_3");
    const singleAfter = await run(`(() => ({
      third: document.querySelector('[data-character-card="character_3"]').getAttribute('data-character-selected'),
      second: document.querySelector('[data-character-card="character_2"]').getAttribute('data-character-selected'),
    }))()`);
    const singleFooter = await footerState();
    check("单选模式下再次点击会替换上一个选择",
      singleAfter.third === "true" && singleAfter.second === "false" &&
        singleFooter.text.startsWith("已选择 1 个角色"),
      JSON.stringify(singleAfter));

    // 切回多选继续后面的用例
    await run(`document.querySelector('[data-character-mode]').click(); true`);
    await sleep(300);

    // ---------- 清除已选 ----------
    await run(`document.querySelector('[data-character-clear-selected]').click(); true`);
    await sleep(400);
    const cleared = await footerState();
    check("「清除已选」清空选择并禁用应用按钮",
      cleared.text.startsWith("已选择 0 个角色") && cleared.applyBothDisabled === true, cleared.text);

    // ---------- 应用触发词 ----------
    await clickCard("character_1");
    await run(`document.querySelector('[data-character-apply-trigger]').click(); true`);
    await sleep(800);
    const afterTrigger = await run(`(() => ({
      closed: !document.querySelector('[data-resource-dialog="character-picker-dialog-title"]'),
      prompt: document.getElementById('prompt-editor')?.textContent ?? '',
    }))()`);
    check("「应用触发词」后弹窗关闭", afterTrigger.closed === true);
    check("触发词已导入提示词区",
      afterTrigger.prompt.includes("character 1, vocaloid"), afterTrigger.prompt.slice(0, 80));
    check("「应用触发词」不携带 Tags", afterTrigger.prompt.includes("tag_1") === false);

    // ---------- 触发词 + Tags（多选、去重） ----------
    check("再次打开弹窗（重置为初始状态）", (await openPicker()) === true);
    const reopened = await run(`(() => ({
      selected: document.querySelectorAll('[data-character-card][data-character-selected="true"]').length,
      query: document.querySelector('[data-character-toolbar] input[type="search"]').value,
    }))()`);
    check("重新打开时选择与搜索被重置",
      reopened.selected === 0 && reopened.query === "", JSON.stringify(reopened));

    await clickCard("character_1");
    await clickCard("character_2");
    await run(`document.querySelector('[data-character-apply-both]').click(); true`);
    await sleep(800);
    const afterBoth = await run(`document.getElementById('prompt-editor')?.textContent ?? ''`);
    check("「触发词+Tags」同时导入触发词与标签",
      afterBoth.includes("character 2") && afterBoth.includes("1girl") &&
        afterBoth.includes("tag_1") && afterBoth.includes("tag_2"),
      afterBoth.slice(0, 140));
    check("重复标签只保留一份（1girl 出现 1 次）",
      afterBoth.split("1girl").length - 1 === 1,
      `出现 ${afterBoth.split("1girl").length - 1} 次`);
    check("连续导入为追加而不是覆盖",
      afterBoth.includes("character 1, vocaloid") && afterBoth.includes("character 2"));

    // ---------- 排序 / 分页 ----------
    check("第三次打开弹窗", (await openPicker()) === true);
    await run(`document.querySelector('[data-character-sort="recent"]').click(); true`);
    await sleep(1400);
    check("切到「最新」排序时请求带 sort=recent",
      searchCalls[searchCalls.length - 1]?.sort === "recent",
      JSON.stringify(searchCalls[searchCalls.length - 1] ?? null));

    const pagination = await run(`(() => {
      const nav = document.querySelector('[data-character-pagination]');
      const bar = document.querySelector('[data-character-pagination-bar]');
      const main = document.querySelector('[data-character-main]');
      const panel = document.querySelector('[data-character-sidebar]');
      const grid = document.querySelector('[data-character-scroll-area]');
      const footer = document.querySelector('[data-character-footer-actions]')?.parentElement?.parentElement;
      if (!nav || !bar || !main || !grid) return { exists: false };
      const info = nav.querySelector('[data-character-pagination-info]');
      const first = nav.querySelector('[data-character-page="first"]');
      const prev = nav.querySelector('[data-character-page="prev"]');
      const next = nav.querySelector('[data-character-page="next"]');
      const last = nav.querySelector('[data-character-page="last"]');
      const indicator = nav.querySelector('[data-character-page-indicator]');
      const navRect = nav.getBoundingClientRect();
      const infoRect = info.getBoundingClientRect();
      const lastRect = last.getBoundingClientRect();
      return {
        exists: true,
        info: info?.innerText.replace(/\\s+/g, ' ').trim() ?? '',
        infoLeftFloated: infoRect.left - navRect.left < 40,
        buttonsRightFloated: navRect.right - lastRect.right < 40,
        labels: [first, prev, next, last].map((b) => b?.textContent.trim() ?? ''),
        pageValue: nav.querySelector('[data-character-page-input]')?.value ?? '',
        pageSuffix: nav.querySelector('[data-character-page-suffix]')?.textContent.trim() ?? '',
        indicatorBg: indicator ? getComputedStyle(indicator).backgroundColor : '',
        indicatorBorder: indicator ? getComputedStyle(indicator).borderTopColor : '',
        buttonBorder: next ? getComputedStyle(next).borderTopColor : '',
        firstDisabled: first.disabled,
        prevDisabled: prev.disabled,
        nextDisabled: next.disabled,
        lastDisabled: last.disabled,
        inMain: main.contains(nav) && main.contains(bar),
        inSidebar: panel.contains(nav),
        inFooter: !!(footer && footer.contains(nav)),
        belowGrid: bar.getBoundingClientRect().top >= grid.getBoundingClientRect().bottom - 2,
        mainBottomAligned: Math.abs(bar.getBoundingClientRect().bottom - main.getBoundingClientRect().bottom) < 2,
      };
    })()`);
    check("分页固定在 Main 展示区底部、卡片区正下方",
      pagination.exists === true && pagination.inMain === true && pagination.belowGrid === true &&
        pagination.mainBottomAligned === true,
      JSON.stringify(pagination));
    check("分页不属于 Saber 导航、也不属于 footer",
      pagination.inSidebar === false && pagination.inFooter === false);
    check("分页左侧显示「共 N 个角色 | 显示第 X-Y 个」",
      /^共\s*48\s*个角色\s*\|\s*显示第\s*1-24\s*个$/.test(pagination.info), pagination.info);
    check("左侧信息左浮动、右侧按钮组右浮动",
      pagination.infoLeftFloated === true && pagination.buttonsRightFloated === true,
      JSON.stringify({ l: pagination.infoLeftFloated, r: pagination.buttonsRightFloated }));
    check("分页右侧为 首页 / 上一页 / 下一页 / 尾页",
      pagination.labels.join(" ") === "首页 上一页 下一页 尾页", pagination.labels.join(" "));
    check("中间为「1 / N 页」页码指示，风格与左右分页按钮一致",
      pagination.pageValue === "1" && pagination.pageSuffix === "/ 2 页" &&
        pagination.indicatorBg === "rgb(255, 255, 255)" &&
        pagination.indicatorBorder === pagination.buttonBorder,
      `${pagination.pageValue} ${pagination.pageSuffix} / ${pagination.indicatorBg} / ${pagination.indicatorBorder}`);
    check("第 1 页时「首页 / 上一页」禁用，「下一页 / 尾页」可用",
      pagination.firstDisabled === true && pagination.prevDisabled === true &&
        pagination.nextDisabled === false && pagination.lastDisabled === false);

    await run(`document.querySelector('[data-character-page="next"]')?.click(); true`);
    await sleep(1500);
    const paged = await run(`(() => ({
      cards: document.querySelectorAll('[data-character-card]').length,
      scrollTop: document.querySelector('[data-character-scroll-area]').scrollTop,
      info: document.querySelector('[data-character-pagination-info]')?.innerText.replace(/\\s+/g, ' ').trim() ?? '',
      firstDisabled: document.querySelector('[data-character-page="first"]').disabled,
    }))()`);
    check("「下一页」切到第 2 页并重新加载 24 张卡片",
      paged.cards === 24 && searchCalls[searchCalls.length - 1]?.page === 2,
      `${paged.cards} 张 / ${JSON.stringify(searchCalls[searchCalls.length - 1] ?? null)}`);
    check("第 2 页显示「显示第 25-48 个」且「首页」变为可用",
      /显示第\s*25-48\s*个/.test(paged.info) && paged.firstDisabled === false, paged.info);
    check("翻页后滚动位置回到顶部", paged.scrollTop === 0, String(paged.scrollTop));

    // ---------- 自定义页码输入 ----------
    const jumpBack = await run(`(async () => {
      const input = document.querySelector('[data-character-page-input]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, '1');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { typed: input.value };
    })()`);
    await sleep(1600);
    const jumped = await run(`(() => ({
      info: document.querySelector('[data-character-pagination-info]')?.innerText.replace(/\\s+/g, ' ').trim() ?? '',
      pageValue: document.querySelector('[data-character-page-input]')?.value ?? '',
    }))()`);
    check("页码输入框可自定义输入并回车跳页",
      jumpBack.typed === "1" && jumped.pageValue === "1" &&
        searchCalls[searchCalls.length - 1]?.page === 1 &&
        /显示第\s*1-24\s*个/.test(jumped.info),
      `${jumped.pageValue} / ${jumped.info}`);

    // ---------- 搜索（防抖） ----------
    await run(`(() => {
      const input = document.querySelector('[data-character-toolbar] input[type="search"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'miku');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(1500);
    check("搜索防抖后带上 q 参数并回到第 1 页",
      searchCalls[searchCalls.length - 1]?.q === "miku" &&
        searchCalls[searchCalls.length - 1]?.page === 1,
      JSON.stringify(searchCalls[searchCalls.length - 1] ?? null));

    // ---------- 收藏（落盘 + 只看收藏） ----------
    await run(`document.querySelector('[data-character-favorite="character_1"]')?.click(); true`);
    // 持久化是异步写入的，轮询等待避免偶发读得太早
    let favoriteSlugs = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const doc = JSON.parse(fs.readFileSync(userDataFile, "utf8"));
      favoriteSlugs = doc.characterFavorites?.slugs ?? [];
      if (favoriteSlugs.includes("character_1")) break;
      await sleep(250);
    }
    check("收藏写入用户数据文件",
      favoriteSlugs.includes("character_1"),
      JSON.stringify(favoriteSlugs));

    await expandSection("favorites");
    const favRow = await run(`(() => {
      const row = Array.from(document.querySelectorAll('[data-character-sidebar] button')).find(
        (b) => b.textContent.trim().startsWith('只看收藏（')
      );
      return row ? row.textContent.trim() : '';
    })()`);
    check("侧栏「只看收藏」计数跟随收藏数", favRow === "只看收藏（1）", favRow);

    await run(`(() => {
      const row = Array.from(document.querySelectorAll('[data-character-sidebar] button')).find(
        (b) => b.textContent.trim().startsWith('只看收藏（')
      );
      row?.click();
      return true;
    })()`);
    await sleep(500);
    const favoriteOnly = await run(`(() => ({
      cards: document.querySelectorAll('[data-character-card]').length,
      slug: document.querySelector('[data-character-card]')?.getAttribute('data-character-card') ?? '',
    }))()`);
    check("「只看收藏」只显示收藏的角色",
      favoriteOnly.cards === 1 && favoriteOnly.slug === "character_1", JSON.stringify(favoriteOnly));
    await run(`(() => {
      const row = Array.from(document.querySelectorAll('[data-character-sidebar] button')).find(
        (b) => b.textContent.trim().startsWith('只看收藏（')
      );
      row?.click();
      return true;
    })()`);
    await sleep(500);

    // ---------- 作品筛选 ----------
    await expandSection("copyrights");
    await run(`(() => {
      const btn = Array.from(document.querySelectorAll('[data-character-copyright-list] button')).find(
        (el) => el.textContent.includes('东方')
      );
      btn?.click();
      return !!btn;
    })()`);
    await sleep(1500);
    const filtered = await run(`document.querySelectorAll('[data-character-card]').length`);
    check("左侧作品筛选生效（copyright=touhou）",
      filtered === 2 && searchCalls[searchCalls.length - 1]?.copyright === "touhou",
      `${filtered} 张 / ${JSON.stringify(searchCalls[searchCalls.length - 1] ?? null)}`);

    // ---------- 字母筛选（作用于当前结果） ----------
    await run(`document.querySelector('[data-character-letter="A"]').click(); true`);
    await sleep(500);
    const letterFiltered = await run(`(() => {
      const cards = Array.from(document.querySelectorAll('[data-character-card]'));
      return {
        count: cards.length,
        names: cards.map((c) => c.querySelector('h3')?.textContent?.trim() ?? ''),
        paginationHidden: !document.querySelector('[data-character-pagination]'),
      };
    })()`);
    check("「字母」筛选按名称首字母过滤当前结果",
      letterFiltered.count === 1 && letterFiltered.names.every((n) => n.startsWith("A")),
      JSON.stringify(letterFiltered));
    check("字母筛选下隐藏分页（避免跨页语义混乱）", letterFiltered.paginationHidden === true);

    await run(`document.querySelector('[data-character-letter="全"]').click(); true`);
    await sleep(500);
    const letterReset = await run(`document.querySelectorAll('[data-character-card]').length`);
    check("点击「全」恢复全部结果", letterReset === 2, String(letterReset));

    await run(`(() => {
      const btn = Array.from(document.querySelectorAll('[data-character-copyright-list] button')).find(
        (el) => el.textContent.includes('全部作品')
      );
      btn?.click();
      return true;
    })()`);
    await sleep(1500);
    check("「全部作品」恢复默认结果",
      (await run(`document.querySelectorAll('[data-character-card]').length`)) === 24);

    // ---------- 详情浮层（同一外壳） ----------
    await run(`document.querySelector('[data-character-detail="character_1"]')?.click(); true`);
    await sleep(1200);
    const detail = await run(`(() => {
      const dialog = document.querySelector('[data-resource-dialog="character-detail-dialog-title"]');
      if (!dialog) return { exists: false };
      return {
        exists: true,
        trigger: dialog.querySelector('[data-character-trigger]')?.textContent?.trim() ?? '',
        hasLoraPill: !!dialog.querySelector('[data-character-add-lora]'),
        tags: dialog.querySelectorAll('[data-character-tags] span').length,
        hasInsert: Array.from(dialog.querySelectorAll('button')).some(
          (b) => b.textContent.trim() === '插入提示词'
        ),
      };
    })()`);
    check("详情浮层同样复用弹框父组件", detail.exists === true, String(detail.exists));
    check("详情含触发词 / + LoRA / TAGS / 插入按钮",
      detail.trigger.includes("character 1") && detail.hasLoraPill === true &&
        detail.tags === 3 && detail.hasInsert === true,
      JSON.stringify(detail));

    // 打开状态下切换主题：验证真实计算样式，覆盖列表、操作区和嵌套详情。
    await run(`document.querySelector('[data-character-add-lora]').click(); true`);
    await clickCard("character_1");
    const readThemeColors = () => run(`(() => {
      const probe = document.createElement('span');
      probe.style.backgroundColor = 'var(--background)';
      probe.style.color = 'var(--foreground)';
      document.body.append(probe);
      const expected = { bg: getComputedStyle(probe).backgroundColor, fg: getComputedStyle(probe).color };
      probe.style.backgroundColor = 'var(--muted)';
      expected.muted = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const selectors = ['[data-character-sidebar]', '[data-character-card]', '[data-character-pagination]',
        '[data-character-page-indicator]', '[data-character-lora-list]', '[data-character-apply-trigger]'];
      const regions = selectors.map(selector => {
        const element = document.querySelector(selector);
        return { selector, bg: element && getComputedStyle(element).backgroundColor };
      });
      const name = document.querySelector('[data-character-card] h3');
      const dialog = document.querySelector('[data-resource-dialog="character-detail-dialog-title"]');
      return { expected, regions, nameColor: getComputedStyle(name).color,
        dialogBg: getComputedStyle(dialog).backgroundColor,
        titleColor: getComputedStyle(document.getElementById('character-detail-dialog-title')).color,
        selected: document.querySelectorAll('[data-character-checked]').length,
        detailOpen: Boolean(document.querySelector('[data-character-trigger]')) };
    })()`);
    for (const theme of ["light", "dark", "light"]) {
      nativeTheme.themeSource = theme;
      check(`角色库 ${theme}：媒体查询切换完成`,
        await waitFor(`matchMedia('(prefers-color-scheme: dark)').matches === ${theme === "dark"}`));
      const deadline = Date.now() + 3000;
      let colors = await readThemeColors();
      while (colors.regions.some(region => region.bg !== colors.expected.bg) && Date.now() < deadline) {
        await sleep(80);
        colors = await readThemeColors();
      }
      check(`角色库 ${theme}：各区域背景和文字跟随主题`,
        colors.regions.every(region => region.bg === colors.expected.bg) && colors.nameColor === colors.expected.fg,
        JSON.stringify(colors));
      check(`角色库 ${theme}：选中标记与详情保持`, colors.selected > 0 && colors.detailOpen);
      check(`角色库 ${theme}：详情外壳和标题跟随主题`,
        colors.dialogBg === (theme === "dark" ? colors.expected.muted : colors.expected.bg) &&
          colors.titleColor === colors.expected.fg, JSON.stringify(colors));
      if (process.env.CHARACTER_THEME_SCREENSHOTS) {
        fs.mkdirSync(process.env.CHARACTER_THEME_SCREENSHOTS, { recursive: true });
        // 计算样式先于合成帧更新；截图等颜色过渡和实际绘制完成。
        await sleep(500);
        const image = await win.webContents.capturePage();
        fs.writeFileSync(path.join(process.env.CHARACTER_THEME_SCREENSHOTS, `${theme}.png`), image.toPNG());
      }
    }

    const beforeInsert = await run(`document.getElementById('prompt-editor')?.textContent ?? ''`);
    await run(`(() => {
      const dialog = document.querySelector('[data-resource-dialog="character-detail-dialog-title"]');
      const btn = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent.trim() === '插入提示词');
      btn?.click();
      return !!btn;
    })()`);
    await sleep(800);
    const afterInsert = await run(`(() => ({
      prompt: document.getElementById('prompt-editor')?.textContent ?? '',
      detailClosed: !document.querySelector('[data-resource-dialog="character-detail-dialog-title"]'),
      pickerClosed: !document.querySelector('[data-resource-dialog="character-picker-dialog-title"]'),
    }))()`);
    check("详情「插入提示词」把触发词写入提示词区并关闭弹窗",
      afterInsert.detailClosed === true && afterInsert.pickerClosed === true &&
        afterInsert.prompt.length > beforeInsert.length &&
        afterInsert.prompt.includes("character 1, vocaloid"),
      afterInsert.prompt.slice(0, 120));

    await closePicker();

    /**
     * 工具栏搜索框的尺寸（图 2 的回归网）：
     * - 宽屏：字号档 `sm` 的 `h-7`（28px）+ 固定宽度胶囊（`w-32` / `sm:w-40`）；
     * - 紧凑（< xl）：外壳抬了 `min-h-9`（≥36px），且搜索框 `flex-1` 占满整行 ——
     *   窄屏下搜索是整块面板的主操作，128px 的固定宽反而比宽屏更小。
     * 判据用**宽度**而不是「到行右边缘的距离」：工具栏是 `justify-between`，
     * 搜索框在两种形态下本来就都贴右边缘（首次实现拿 rightGap 当判据，宽屏那条直接假红）。
     * 固定宽只有 128 / 160，紧凑形态吃掉剩余宽度（实测 ~414），两条各留足余量。
     */
    const measureDialogSearch = (titleId) => run(`(() => {
      const dialog = document.querySelector('[data-resource-dialog="${titleId}"]');
      const input = dialog?.querySelector('input[type="text"]');
      if (!input) return null;
      const rect = input.getBoundingClientRect();
      return {
        height: Math.round(rect.height),
        width: Math.round(rect.width),
      };
    })()`);

    const openExtensionPicker = async () => {
      await run(`document.querySelector('[data-extension-picker-trigger]')?.click(); true`);
      return waitFor(
        `document.querySelector('[data-resource-dialog="extension-select-dialog-title"]')`,
        20000
      );
    };

    const closeResourceDialog = async (titleId) => {
      await run(`(() => {
        const dialog = document.querySelector('[data-resource-dialog="${titleId}"]');
        if (!dialog) return true;
        const back = dialog.querySelector('[data-resource-dialog-back]');
        if (back) { back.click(); return true; }
        const close = Array.from(dialog.querySelectorAll('button')).find(
          (b) => b.getAttribute('aria-label') === '关闭'
        );
        if (close) close.click();
        return true;
      })()`);
      await sleep(500);
    };

    await openExtensionPicker();
    /** 等入场动画（`motion-pop-in` 0.22s，scale 0.97）走完再量：否则量到的是缩放中的中间值 */
    await sleep(900);
    const wideSearch = await measureDialogSearch("extension-select-dialog-title");
    check(
      "宽屏（1440）：扩展弹窗搜索框维持字号档高度与固定宽度（紧凑规则不外溢）",
      wideSearch && wideSearch.height <= 30 && wideSearch.width <= 170,
      JSON.stringify(wideSearch)
    );
    await closeResourceDialog("extension-select-dialog-title");

    // ---------- 弹窗首帧：变体必须在第一帧就正确（「先满屏后缩放」的回归网） ----------

    /**
     * 为什么探针用 `MutationObserver` 而不是 rAF：
     *   · 要抓的是「元素插入的那一瞬间是什么变体」—— MutationObserver 是微任务，
     *     不依赖渲染生命周期，窗口被遮挡 / 最小化时依然会跑（rAF 会直接停摆，见 AGENTS.md）；
     *   · 记录第一帧就够：决定用户第一眼看到的是哪套版式。
     *
     * 判据刻意用**布局盒**（`offsetHeight` / `offsetWidth`）而不是 `getBoundingClientRect()`：
     * 居中变体带 `[role="dialog"]:not(.motion-none)` 的 `motion-pop-in` 入场动画
     * （scale 0.97 → 1），插入瞬间强制布局会把这个缩放算进 rect ——
     * 用它做阈值比较会随动画相位抖动，而 `offset*` 不受 transform 影响。
     */
    const installDialogFrameProbe = async () => {
      await run(`(() => {
        window.__dialogProbeStop?.();
        window.__dialogFirstFrame = null;

        window.__measureDialog = (el) => {
          const rect = el.getBoundingClientRect();
          return {
            id: el.getAttribute('data-resource-dialog'),
            motionNone: el.classList.contains('motion-none'),
            offsetWidth: el.offsetWidth,
            offsetHeight: el.offsetHeight,
            rectWidth: Math.round(rect.width),
            rectLeft: Math.round(rect.left),
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
          };
        };

        const record = (el) => {
          if (window.__dialogFirstFrame) return;
          window.__dialogFirstFrame = window.__measureDialog(el);
        };

        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
              if (!(node instanceof Element)) continue;
              const target = node.matches('[data-resource-dialog]')
                ? node
                : node.querySelector('[data-resource-dialog]');
              if (target) record(target);
            }
          }
        });
        observer.observe(document.body, { childList: true });
        window.__dialogProbeStop = () => observer.disconnect();
        return true;
      })()`);
    };

    const readDialogNow = (titleId) => run(`(() => {
      const el = document.querySelector('[data-resource-dialog="${titleId}"]');
      return el ? window.__measureDialog(el) : null;
    })()`);

    /** `h-[calc(100vh-6rem)]`：居中弹窗的上下留白，6rem = 96px */
    const CENTERED_VERTICAL_INSET = 96;
    const PICKER_TITLE_ID = "character-picker-dialog-title";

    await installDialogFrameProbe();
    await openPicker();
    const wideFirstFrame = await run(`window.__dialogFirstFrame`);
    // 稳定期用主进程计时（不受页面可见性影响），等入场动画走完再量一次
    await sleep(700);
    const wideStable = await readDialogNow(PICKER_TITLE_ID);

    check(
      "宽窗口（1440×950）：弹窗首帧就是居中弹窗，没有先渲染满屏的紧凑变体",
      Boolean(wideFirstFrame) &&
        wideFirstFrame.motionNone === false &&
        Math.abs(
          wideFirstFrame.offsetHeight -
            (wideFirstFrame.innerHeight - CENTERED_VERTICAL_INSET)
        ) <= 1,
      wideFirstFrame
        ? `首帧 motionNone=${wideFirstFrame.motionNone} 布局高=${wideFirstFrame.offsetHeight}/${wideFirstFrame.innerHeight - CENTERED_VERTICAL_INSET}`
        : "没有记录到首帧"
    );

    check(
      "宽窗口：首帧 → 稳定期没有变体翻转（没有「满屏 → 缩放」的第二帧）",
      Boolean(wideFirstFrame && wideStable) &&
        wideStable.motionNone === false &&
        Math.abs(wideStable.offsetHeight - wideFirstFrame.offsetHeight) <= 1 &&
        Math.abs(
          wideStable.rectLeft -
            Math.round((wideStable.innerWidth - wideStable.rectWidth) / 2)
        ) <= 1,
      wideFirstFrame && wideStable
        ? `首帧 布局高=${wideFirstFrame.offsetHeight} → 稳定 布局高=${wideStable.offsetHeight} 左=${wideStable.rectLeft}/${Math.round((wideStable.innerWidth - wideStable.rectWidth) / 2)}`
        : "稳定期读不到弹窗"
    );

    await closePicker();

    /**
     * 配对对照：窄窗口（< xl）下同一探针必须读到**紧凑变体**。
     * 没有这一段，上面两条断言可能是「无论如何都判居中」的恒真对照 ——
     * 这个仓库已经吃过一次恒真对照的亏（见 logs.md）。
     *
     * 刻意**另开一个 1100px 宽的窗口**，而不是 `win.setSize()`：窗口被遮挡 / 最小化时
     * 尺寸变化不一定传导到渲染进程（首次实现就是这么失败的：页面仍读到 1440，
     * 前置条件不成立、退化成 exit 2）。新窗口「生来就是 1100px」，视口没有悬念。
     */
    const narrowWin = new BrowserWindow({
      width: 1100,
      height: 950,
      show: true,
      alwaysOnTop: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        preload: path.join(__dirname, "..", "apps", "electron", "preload.js"),
        backgroundThrottling: false,
      },
    });

    try {
      smoke.attachWebContents(narrowWin.webContents);
      await narrowWin.loadURL("app://app/create");
      await sleep(3500);

      const narrowPrecondition = await run(`({
        innerWidth: window.innerWidth,
        xlMatches: window.matchMedia('(min-width: 1280px)').matches,
        triggerPresent: Boolean(document.querySelector('[data-character-picker-trigger]')),
      })`);

      if (
        !narrowPrecondition ||
        narrowPrecondition.xlMatches ||
        !narrowPrecondition.triggerPresent
      ) {
        smoke.exitEnvironment(
          "窄窗口配对对照的前置条件不成立（1100px 窗口没有落在 < xl，或创建页触发按钮不在）：" +
            JSON.stringify(narrowPrecondition),
          { app }
        );
        return;
      }

      await installDialogFrameProbe();
      await openPicker();
      const narrowFirstFrame = await run(`window.__dialogFirstFrame`);

      check(
        "配对对照（1100px 窗口）：同一探针在窄窗口首帧读到的就是紧凑变体",
        Boolean(narrowFirstFrame) &&
          narrowFirstFrame.motionNone === true &&
          Math.abs(narrowFirstFrame.offsetHeight - narrowFirstFrame.innerHeight) <= 1,
        narrowFirstFrame
          ? `首帧 motionNone=${narrowFirstFrame.motionNone} 布局高=${narrowFirstFrame.offsetHeight}/${narrowFirstFrame.innerHeight}`
          : "没有记录到首帧"
      );

      await closePicker();

      await openExtensionPicker();
      await sleep(900);
      const narrowSearch = await measureDialogSearch("extension-select-dialog-title");
      check(
        "紧凑（1100px）：扩展弹窗搜索框抬到 ≥36px 且占满剩余宽度（与上面宽屏那条配对）",
        narrowSearch && narrowSearch.height >= 36 && narrowSearch.width >= 300,
        JSON.stringify(narrowSearch)
      );
      await closeResourceDialog("extension-select-dialog-title");
    } finally {
      if (!narrowWin.isDestroyed()) narrowWin.destroy();
      smoke.attachWebContents(win.webContents);
    }

    // ---------- 控制台 ----------
    check("渲染进程无 console 错误", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

    if (consoleErrors.length > 0) {
      console.log("--- 渲染进程 console 错误 ---");
      consoleErrors.slice(0, 10).forEach((line) => console.log("  " + line));
    }

    const allPassed = smoke.allPassed();
    console.log(
      `\n${allPassed ? "CHARACTERS SMOKE OK ✓" : "CHARACTERS SMOKE FAILED ✗"}  ` +
        `${results.filter((r) => r.ok).length}/${results.length}`
    );
    await smoke.finish({ app, ok: allPassed, cleanupDir: workDir });
  } catch (error) {
    console.error("SMOKE_FAIL", error);
    await smoke.finish({ app, ok: false, error });
  }
});
