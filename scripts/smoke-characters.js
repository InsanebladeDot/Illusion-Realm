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
const { registerAppProtocol } = require("../apps/electron/src/main/core/protocol");

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
    data: require("./lib/guest-session-fixture").withGuestSession(JSON.parse(fs.readFileSync(userDataFile, "utf8"))),
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
  // 本地分支调用正式资料读取器，不能用线上 mock 假装八千条数据已接通。
  // 在线分支保留旧替身，既有二十四张卡片与分页断言继续验证原功能。
  // 所有本地请求走同一主进程实现，不会访问远端站点。
  if (requested.source === "local") return require("../apps/electron/src/main/modules/animadex").searchCharacters(requested);
  // 这份人工在线详情只用于验证本地角色与远端展示合并，不访问真实站点。
  // q 的角色名与作品要同时一致，才能在正式 mergeCharacterDetails 中得到封面。
  // 头像用内存 data URL，避免 UI 冒烟依赖第三方 CDN 或图片服务状态。
  // LoRA 仍是资料推荐，不触发真实下载或模型加载。
  // 列表依然来自八千条本地 JSON，只有用户点击的一个详情使用此 HTTP 替身。
  // 其他在线浏览保留原 Alice 卡片基准，防止破坏旧功能的对照数据。
  // 模拟不能说明公网接口正常；断网/无匹配由保留本地资料的路径负责。
  if (requested.source === "online" && requested.q === "princess zelda") return {total:1,page:1,pageSize:8,pages:1,results:[{...buildCharacter(1),name:"princess zelda",copyright:"the legend of zelda",copyrightName:"The Legend of Zelda",thumbUrl:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII="}]};
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
      preload: path.join(__dirname, "../apps/electron/src/preload/index.js"),
      /**
       * 关闭后台节流：置顶也挡不住桌面上的其它窗口，一旦被盖住，Chromium 会把这个页面
       * 标记为 hidden 并停摆渲染生命周期 —— CSS 过渡停在半路、rAF 不再回调。
       * 这个前提不消除，本套件的过渡断言（中间帧 / 收起后高度归零）就是随机的。
       * 对照实验与完整根因见 `scripts/lib/known-flakes.js`。
       */
      backgroundThrottling: false,
    },
  });

  // 封面测试仅拦截固定 CDN，不修改本地目录查询和正式预览地址。
  // React 仍收到正式主进程生成的 URL，图片请求由 Chromium 自己发起。
  // 替身在请求层回传本地夹具，能验证图片真正解码而非仅出现 img 标签。
  // princess zelda 刻意返回损坏数据，覆盖 CDN 缺图时的 onError 分支。
  // 其他封面使用项目已有测试图片，不将公网波动当成布局回归。
  // 字节替身只存在测试会话，不写入产品角色资料或用户收藏。
  // requests 记录真实图片请求，后续同时检查是否绕开逐卡搜索 API。
  // 本专项不验证站点是否收录所有角色，也不宣称夹具内容是角色官方图。
  // 仅替换 blobs 封面响应，其他 HTTPS 请求仍交给 Chromium 原有网络能力。
  // 图片文件已存在于 scripts/fixtures，不新增产品依赖和缓存存储。
  // 协议处理器属于测试 session，进程退出后一起释放，不改变产品协议。
  // 直接回应图片字节，避开浏览器禁止 HTTPS 重定向到 data URL 的限制。
  // 兜底网络失败返回受控 502，避免协议回调产生未处理的 Promise 拒绝。
  // URL 保持不变时 onError 应只隐藏图片，不启动组件内部无限重试。
  const previewRequests = [];
  const previewFixture = fs.readFileSync(path.join(__dirname,'fixtures/create-layout/hero.webp'));
  win.webContents.session.protocol.handle('https',request => {
    if (!request.url.startsWith('https://blobs.animadex.net/Outputs/thumbs/')) return require('electron').net.fetch(request,{bypassCustomProtocolHandlers:true}).catch(()=>new Response(null,{status:502}));
    previewRequests.push(request.url);
    return new Response(request.url.includes('princess%20zelda%2C') ? 'broken' : new Uint8Array(previewFixture),{headers:{'Content-Type':'image/webp'}});
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

  /**
   * 原有断言专测在线库，显式切回 online 以保持旧 mock 的意义。
   * 新增 local 分支不切来源，验证产品默认确实能直接显示离线资料。
   * 选择器菜单由真实点击展开，不篡改 React state 或直接调用组件函数。
   * 来源切换会清空旧卡片，等待指定来源卡片可排除迟到结果误通过。
   * 此辅助也用于窄窗口首帧探针，首帧仍由真实默认 local 绘制。
   * 首帧布局与来源无关，切 online 只为后续既有功能断言准备资料。
   * UI 文案使用固定中文测试环境，不模拟浏览器原生 select。
   * 等待是主进程轮询，不依赖可能因窗口遮挡暂停的 rAF。
   */
  const openPicker = async (source = "online") => {
    await run(`document.querySelector('[data-character-picker-trigger]').click(); true`);
    await waitFor(`document.querySelector('[aria-label="角色库来源"]')`);
    if (source === "online") await selectReference("角色库来源", "在线角色库");
    return waitFor(`Array.from(document.querySelectorAll('[data-character-card]')).some(card => card.getAttribute('data-character-card').startsWith('${source === "local" ? "local:" : "character_"}'))`, 20000);
  };

  /**
   * 来源仍是复用菜单，属性改为左侧展开列表，不能再点击已移除的顶部下拉。
   * 测试按真实分类标题展开，查找当前属性对应的原始值按钮。
   * 发色与瞳色可能同为 blue，必须同时限定 field，不能取第一个同色项。
   * 点击前让目标进入侧栏滚动视口，模拟列表实际可达操作。
   * 来源菜单保留真实 portal 选项，不直接篡改 React 内部状态。
   * 作品原名保留英文，界面标题中文只是测试入口标签，不参与后端匹配。
   * 本地列表与线上作品旧段落互不覆盖，旧套件继续验证在线作品逻辑。
   * 找不到选项会明确抛错，不能用可选链跳过后冒充筛选成功。
   * 后续仍检查请求参数与实际卡片，不能只证明点击动作没有报错。
   * selectReference 用于本地四属性与来源，其他原有卡片动作保持原实现。
   * 这里的固定 field 映射只服务测试点击，不复制任何真实分类或计数数据。
   * 等待通过主进程轮询完成，不要求页面 rAF 一定正在推进。
   */
  const selectReference = async (label, value) => {
    const field = {"作品":"copyright","性别":"gender","发色":"hair","瞳色":"eye"}[label];
    if (field) {
      // 热门作品只默认显示三十项，先搜索完整作品集合再定位目标。
      // 通过原生输入事件驱动真实状态，不注入 facets 或修改 React 内部对象。
      // 这样可验证低热度作品仍可选，不把菜单截断误当成数据丢失。
      // 性别、发色和瞳色不走这个入口，保持精确字段定位。
      if (field === "copyright") await run(`(() => { const input=document.querySelector('[data-character-reference-section="copyright"] input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
      await run(`(() => { const toggle=document.querySelector('[data-character-reference-toggle="${field}"]'); if(toggle.getAttribute('aria-expanded')!=='true')toggle.click(); return true; })()`);
      await run(`(() => { const option=Array.from(document.querySelectorAll('[data-character-reference-field="${field}"]')).find(item=>item.getAttribute('data-character-reference-value')===${JSON.stringify(value)}); option.scrollIntoView({block:'nearest'}); option.click(); return true; })()`);
      return;
    }
    await run(`document.querySelector('[data-character-reference-filters] [aria-label='+CSS.escape(${JSON.stringify(label)})+']').click(); true`);
    await waitFor(`document.querySelector('[data-simple-select-panel] [role="option"]')`);
    await run(`Array.from(document.querySelectorAll('[data-simple-select-panel] [role="option"]')).find(item=>item.textContent.trim()===${JSON.stringify(value)}).click(); true`);
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
    // 临时用户目录没有已读公告记录，首次启动可能弹出真实更新通知。
    // 用实际“知道了”按钮关闭，不能让程序化点击穿过遮罩而假装用户可操作。
    // 公告不属于角色库受测内容，但必须清除才能审查真实侧栏截图。
    // 不删除 DOM 或修改产品状态，保留公告自己的持久化与关闭逻辑。
    // 按文案限定按钮，避免误点角色选择器或其他正在加载的入口。
    await run(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='知道了')?.click(); true`);
    await sleep(400);

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

    /**
     * 默认离线库正向验证：数据来自 shared JSON，UI 不靠网络图片补齐角色。
     * 按四属性筛选后再输入原名，验证条件确实组合提交。
     * 不能只检查四个菜单存在；卡片和请求必须反映用户选择。
     * 多选、收藏、详情仍复用原卡片，下方旧套件继续覆盖在线行为。
     * 先验证空关键词的属性浏览，再验证姓名精确查找，避免只测单一路径。
     * 资料原名是 princess zelda，不把简称 zelda 假装成唯一身份。
     * 蓝眼与金发各自放在正确字段，防止两个颜色菜单串值。
     * 原提示词后续仍可追加旧在线角色，证明接入没有替换应用契约。
     * 反向过滤给 black 发色，精确姓名也不能绕过筛选偷偷返回角色。
     * 测试不声称真实模型按这些属性生成，只确认提示词准备和显示行为。
     * 本地关联封面独立加载，CDN 缺图的角色也不应从列表消失。
     * 所有资料请求保留 source 标记，能判定默认加载实际走了哪条路径。
     */
    // 点击实际创建页入口后应先看到 local 卡片，而不是来自旧在线替身的 Alice。
    // 不只观察文字“本地参考库”，因为标签正确并不能证明请求真的选择了 local。
    // openPicker 通过 slug 前缀与实际卡片数量等待后端和 React 完成。
    // 浏览四属性应命中五个角色（包括 tetra），不能只数名字含 zelda 的记录。
    // 四个菜单依次点击，最终一条请求需同时含有全部字段。
    // 请求参数断言和显示条数断言配对，避免只测 UI 文案而未测实际过滤。
    // 不人为写 state，不直接调用 IPC 搜索函数作为“点击”替身。
    // label/value 是受控测试常量，不执行用户提供的 JavaScript。
    check("默认打开本地参考库并加载真实角色", await openPicker("local"));
    // 默认第一页初音封面应有真实解码尺寸，而不是只有非空 src 属性。
    // src 仍指向按姓名与作品生成的正式 CDN 地址，夹具只负责替代图片字节。
    // 关联图片不应调用角色搜索 API；用户尚未点击任何详情。
    // 第一次打开前尚无其他 online 请求，使这条负向断言有明确前提。
    // 这验证了本地索引和远端图片分工，不把整个列表改成网络搜索。
    // shared LibraryCard 仍是唯一卡片表面，选中和收藏在后续旧用例继续验证。
    // loading 属性必须保留 lazy，不能因补封面就强制八千张图片预加载。
    // fixture 能证明渲染链路，真实公网可用性在交付中单独说明。
    check("本地角色复用共享卡片懒加载网络封面",await waitFor(`Array.from(document.querySelectorAll('[data-character-card] img')).some(img=>img.src.includes('hatsune%20miku%2C%20vocaloid.webp')&&img.complete&&img.naturalWidth>0&&img.loading==='lazy')`));
    check("浏览本地封面不逐卡查询线上搜索",previewRequests.length>0 && !searchCalls.some(args=>args.source==='online'));
    // 可选截图只记录真实窗口，不改页面 DOM 或给组件注入模拟的外观状态。
    // 首次本地列表已加载，数量与作品来自真实 JSON，图片字节由上述 CDN 夹具提供。
    // 截图写入本轮指定的临时目录，不覆盖用户图片或生产输出目录。
    // 左侧默认展开性别和作品，便于核对标题、图标、徽标和滚动区域的排列。
    // 图像仅作为布局复核，筛选是否正确仍依赖后面的请求与卡片断言。
    // 无截图环境变量时不写文件，CI 不需要保存大量二进制产物。
    // capturePage 属于测试主进程，产品 renderer 不因此得到新的截图权限。
    // 等一小段主进程时间让弹窗入场完成，避免保存动画缩放中间态。
    // 没有图片加载前置条件，本地缺封面时依然必须能观察分类与记录数量。
    // 截图后仍从当前同一弹窗继续筛选，避免另开静态样例页面冒充产品验证。
    if (process.env.CHARACTER_REFERENCE_SCREENSHOTS) {
      fs.mkdirSync(process.env.CHARACTER_REFERENCE_SCREENSHOTS,{recursive:true}); await sleep(400);
      fs.writeFileSync(path.join(process.env.CHARACTER_REFERENCE_SCREENSHOTS,"sidebar-local.png"),(await win.webContents.capturePage()).toPNG());
    }
    // 分类必须实际位于 nav 侧栏，工具条上方不再留第二套四属性选择器。
    // 性别数字来自真实 JSON，不能照抄截图的统计或拿热度作数量。
    // 数字断言与后续筛选结果配对，排除仅搬了静态 UI 没接真实查询。
    // 计数不会因在线详情替身存在就改变来源，本地 JSON 才是这项断言的分母。
    const sidebarClassifications = await run(`(() => { const panel=document.querySelector('[data-character-reference-filters]'); const female=panel.querySelector('[data-character-reference-field="gender"][data-character-reference-value="1girl"]'); return {inSidebar:!!panel.closest('[data-character-sidebar]'),inToolbar:!!panel.closest('[data-character-toolbar]'),count:Number(female.querySelector('[data-character-reference-count]').textContent)}; })()`);
    check("四属性分类位于侧栏且数量来自真实本地记录",sidebarClassifications.inSidebar && !sidebarClassifications.inToolbar && sidebarClassifications.count===require("../packages/shared/src/data/character-reference.json").filter(row=>row.gender==="1girl").length,JSON.stringify(sidebarClassifications));
    // 默认作品菜单按参考工具限制为热门30项，角色总数仍为8000。
    // 菜单截断不能等同于只保留30个作品的数据，后续会搜索完整集合。
    // 这里读取真实分类按钮，不把“全部”清除行算成一个作品。
    // 使用已加载的本地数据计数，网络替身不会改变分类分母。
    check("角色默认只展示热门30个作品", await run(`document.querySelectorAll('[data-character-reference-field="copyright"]').length===30`));
    for (const [label,value] of [["作品","the legend of zelda"],["性别","1girl"],["发色","blonde"],["瞳色","blue"]]) await selectReference(label,value);
    check("四属性联合查询实际传到主进程", await waitFor(`document.querySelectorAll('[data-character-card]').length===5`) && searchCalls.some(args=>args.source==="local" && args.copyright==="the legend of zelda" && args.gender==="1girl" && args.hair==="blonde" && args.eye==="blue"));
    // 清除四属性后要恢复第一页全部结果，不能只擦掉颜色高亮。
    // 原搜索尚为空，24张卡片和8000总量能排除残留隐藏条件。
    // 再次选择四属性，随后姓名与详情旧断言继续验证数据传递。
    // 清除按钮属于侧栏分类，不应顺便清掉用户已选草稿。
    await run(`document.querySelector('[data-character-reference-clear]').click(); true`);
    check("角色清除分类恢复完整本地库", await waitFor(`document.querySelectorAll('[data-character-card]').length===24 && document.querySelector('[data-character-pagination-info]')?.textContent.includes('8,000')`));
    for (const [label,value] of [["作品","the legend of zelda"],["性别","1girl"],["发色","blonde"],["瞳色","blue"]]) await selectReference(label,value);
    await waitFor(`document.querySelectorAll('[data-character-card]').length===5`);
    await run(`(() => { const input=document.querySelector('[data-character-toolbar] input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'princess zelda'); input.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
    // 输入通过原生 value setter 触发 React onChange，保留产品真实防抖过程。
    // 等唯一角色卡出现，避免把初始四个候选误认为姓名查询已完成。
    // princess zelda 必须来自卡片正文，不能仅因搜索框含此名字就通过。
    // 应用按钮等待解除禁用，确认点击卡片确实改变选择状态。
    // 选择动作复用现有角色卡按钮，验证新数据兼容原多选契约。
    // 应用“触发词+Tags”后检查三个字段共同存在，而不只检查弹窗关闭。
    // 没有预览图仍能选中，这与原数据不含封面链接的事实相符。
    // 此操作只改临时用户目录的提示词，不访问生产账户或真实模型。
    check("原名结合分类得到唯一角色卡", await waitFor(`document.querySelectorAll('[data-character-card]').length===1 && document.querySelector('[data-character-card]')?.textContent.includes('princess zelda')`));
    // princess 的图片由请求夹具返回坏字节，必须由浏览器实际触发解码失败。
    // 非空 URL 的坏图与没有 URL 不同，只有前者能检测 onError 是否真正接通。
    // 缺图后仍有共享卡片和选择按钮，不能把角色从分类结果删除。
    // 不手动派发 error 或改组件状态，确保测试覆盖真实 Image.onError 接线。
    // 之后仍打开详情并插入标签，证明坏图没有阻断原有操作流程。
    // 搜索词已收敛到唯一角色，不能误把其他成功卡片当作缺图对象。
    check("网络封面损坏后显示占位且角色仍可选择",await waitFor(`!document.querySelector('[data-character-card] img')&&document.querySelector('[data-character-card]')?.textContent.includes('无预览图')&&Boolean(document.querySelector('[data-character-card] button[aria-label^="选择"]'))`));
    // 点击真实本地详情入口，线上请求应按原名发出并完成身份一致的媒体补全。
    // 标签仍保留本地颜色，封面与 LoRA 资料则来自上方确定性的线上替身。
    // 不只断言发过网络请求，还要求详情图片节点真正显示远端返回内容。
    // 关闭嵌套详情后继续应用原卡片，检查本地 slug 和选择流程未被线上替换。
    // 此处不检查站点真实可用性，fixture 在同一 IPC 契约下响应。
    await run(`document.querySelector('[data-character-card] [data-character-detail]').click(); true`);
    check("本地分类角色按名称与作品合并线上封面和LoRA资料",await waitFor(`Boolean(document.querySelector('[data-resource-dialog="character-detail-dialog-title"] img')) && !document.querySelector('[data-character-online-status]') && document.querySelector('[data-character-add-lora]')?.textContent.includes('1')`) && searchCalls.some(args=>args.source==="online"&&args.q==="princess zelda"));
    await run(`document.querySelector('[data-resource-dialog="character-detail-dialog-title"] button[aria-label="关闭"]').click(); true`);
    await run(`document.querySelector('[data-character-card] button[aria-label^="选择"]').click(); true`);
    await waitFor(`document.querySelector('[data-character-apply-both]:not(:disabled)')`);
    await run(`document.querySelector('[data-character-apply-both]').click(); true`);
    check("本地角色应用真实姓名和外观标签", await waitFor(`['princess zelda','blonde hair','blue eyes'].every(tag=>document.getElementById('prompt-editor')?.textContent.includes(tag))`));
    // 本地用例完成后清空实际 contentEditable，隔离旧在线断言的初始提示词。
    // 必须派发 input 让受控状态同步，不能只改 DOM 留下旧文本等待恢复。
    // 此处不修改去重算法；旧套件仍验证单次应用中重复 tag 只出现一次。
    await run(`(() => { const editor=document.getElementById('prompt-editor'); editor.textContent=''; editor.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
    // 第二次打开先恢复默认空条件，再制造与已知姓名矛盾的发色。
    // 如果代码用姓名精确项跳过外观条件，这个反向对照必须失败。
    // 预期是空网格和明确空结果文案，不是红色请求错误或一直 loading。
    // 原作品菜单已清空，避免旧条件碰巧导致零项而掩盖发色逻辑错误。
    // 关闭后重新运行旧在线套件，检验保留功能而非只测新入口。
    // 旧套件仍使用独立人工角色资料，不能被本地热门角色顺序影响。
    // 来源切换的异步回执有取消边界，后续在线卡片不能被本地迟到结果覆盖。
    // 前向与反向对照均经过真实组件，未从 DOM 注入伪造角色卡。
    // 反向用例不触发生成按钮，只验证准备阶段，避免消耗显存或生成队列。
    await openPicker("local");
    await run(`(() => { const input=document.querySelector('[data-character-toolbar] input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'princess zelda'); input.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
    await selectReference("发色","black");
    check("不匹配属性显示空结果且不伪造角色", await waitFor(`document.querySelectorAll('[data-character-card]').length===0 && document.querySelector('[data-character-main]')?.textContent.includes('没有找到匹配的角色')`));
    await closePicker();

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
    // 保存起跑前的可见性与动画，失败时区分过渡未开始与渲染被暂停。
    // 诊断不改变等待时长或断言，也不把采样失败自动当作通过。
    // getAnimations 只观察浏览器状态，真实通过仍要求高度中间帧。
    // visibility=visible 本身不足以证明 compositor 的时间线正在推进。
    // open 读取 DOM 提交值，区分 React 未响应和已响应但过渡停滞。
    // animations 为空时可能是尚未起跑或已经结束，须结合前后高度判断。
    // running 且 time=0 持续不变则记录为时间线停滞，不能说动画没创建。
    // currentTime 保留原始值，不将 null 伪装成已经播放零毫秒。
    // 只收集受测 body 的动画，不被全局加载旋转图标污染诊断。
    // 起跑前快照确认是否残留上次收起动画，避免把回程当作展开帧。
    // 结束快照与最终高度同次返回，便于定位状态与几何不一致。
    // 箭头仍单独采样 transform，高度正常也不能掩盖箭头停摆。
    // 页面侧 setTimeout 只是采样节拍，不会主动推进 CSS 动画。
    // 一次诊断只含公开 UI 状态，不收集账户信息或用户目录。
    // 这些证据追加到原冒烟日志，失败退出码由既有护栏维持。
    const sampleExpand = () =>
      run(`(async () => {
      const toggle = document.querySelector('[data-character-section-toggle="favorites"]');
      const body = document.querySelector('[data-character-section-body="favorites"]');
      const arrow = toggle.querySelector('[data-character-section-arrow]');
      const before = Math.round(body.getBoundingClientRect().height);
      const probe = () => ({visibility:document.visibilityState,open:toggle.getAttribute('aria-expanded'),animations:body.getAnimations().map(animation=>({state:animation.playState,time:animation.currentTime}))});
      const initialProbe = probe();
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
        initialProbe, finalProbe:probe(),
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
      // 首次失败留档，重试不会抹掉这一份原始动画诊断。
      // 只有完整的独立复跑与实际断言可以形成最终验证结论。
      console.log("[收藏展开诊断]", JSON.stringify(expandAnimation));
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
    // 主题切换有两层信号：系统媒体查询先变化，React 主题提交随后到达。
    // 只等 matchMedia 会在旧 data-theme 上读到自洽的旧颜色，产生假通过。
    // 详情还带颜色过渡，列表背景就绪不代表嵌套标题和面板也已落定。
    // 同时轮询实际详情颜色，避免把动画中的 rgb(252,252,252) 误报为产品回归。
    // 期限仍固定三秒，不能无限等到通过或用长 sleep 掩盖真正的主题失败。
    // 最后保持原来的精确颜色比较，不放宽成“差不多接近”新配色。
    // light-dark-light 是配对对照，防止探针永远返回深色也被误判通过。
    // 当前测试只改等待前提，不修改主题信号或产品的切换动画。
    // 未打开详情时此用例不会运行，详情存在已在上方单独确认。
    // readThemeColors 仍读取正式计算样式，没有将 expected 直接写进被测节点。
    // 等待在主进程定时，页面不可见时也能正常超时并报告失败。
    // 若最终颜色未一致，下面保留完整实际值便于区别请求失败和过渡未结束。
    for (const theme of ["light", "dark", "light"]) {
      nativeTheme.themeSource = theme;
      check(`角色库 ${theme}：媒体查询切换完成`,
        await waitFor(`matchMedia('(prefers-color-scheme: dark)').matches === ${theme === "dark"} && document.documentElement.dataset.theme === '${theme}'`));
      const deadline = Date.now() + 3000;
      let colors = await readThemeColors();
      while ((colors.regions.some(region => region.bg !== colors.expected.bg) || colors.dialogBg !== (theme === "dark" ? colors.expected.muted : colors.expected.bg) || colors.titleColor !== colors.expected.fg) && Date.now() < deadline) {
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
            // 新创建页的单栏替换是宿主内的正常流，不再铺满整个窗口。
            // 必须观察宿主尺寸，不能拿含 head/footer 的窗口高度作基准。
            // 记录归属证明紧凑层确实进入 main，而非只盖住表单的浮动层。
            mainPage: el.hasAttribute('data-resource-main-page'), parentHeight: el.parentElement.clientHeight,
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
        // 宿主模式的插入发生在 body 子孙，subtree 覆盖新旧两种挂载位置。
        // 仍只记录首次真正出现的对话框，不改成稳定后才采样蒙混首帧问题。
        // MutationObserver 不依赖 rAF，窗口遮挡时也能记录结构变化。
        observer.observe(document.body, { childList: true, subtree: true });
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
     * 配对对照：主区小于 760px 时同一探针必须读到**宿主内紧凑变体**。
     * 没有这一段，上面两条断言可能是「无论如何都判居中」的恒真对照 ——
     * 这个仓库已经吃过一次恒真对照的亏（见 logs.md）。
     *
     * 创建页现在按父 main 的 760px 能力判断，1100px 窗口通常已能放两栏。
     * 旧例使用视口 <1280px 与产品实现分叉，因此改为真正小于主区阈值的窗口。
     * 首帧不应覆盖 head/nav/footer，而是完全填充创建页常驻宿主。
     * 同时断言 mainPage 和父高度，不能只靠 motion-none 猜测它是否替换主区。
     * body 子树观察覆盖宿主 portal，避免只有 body 直接子节点时漏掉新路径。
     * 这些改变只修正测试命题，不把产品重新改回基于视口的旧规则。
     * 失败仍视为失败，前置条件不成立按仓库约定退环境码二。
     * 两个窗口按顺序运行，不能把同时开两套 Electron 冒烟造成的抢占当布局问题。
     * 窄窗口销毁后恢复旧 webContents，后续断言不会误读已关闭的页面。
     * 之前的背景节流保护保留，测试不会通过隐藏窗口制造事件不来的假红。
     * 窗口宽度不同是正反对照的必要输入，其他业务数据和选择器实现保持一致。
     * 角色库本地来源缺封面，探针不能依赖图片 load 才记录首帧。
     * 在线来源的人工图片也为空，正反对照不会被网络图片加载时序干扰。
     * 居中弹窗的 transform 会影响 rect，首次高度继续使用 offsetHeight。
     * 宿主内父高度在正常流中确定，量它可排除标题栏或状态栏被错误覆盖。
     * 窄窗口仍使用与生产一致的 contextIsolation 与 preload，不能直接调用 Node。
     * 页面加载后再读主区，避免把加载前的零宽误认成合法单栏。
     * 弹窗关闭后再打开扩展，防止两个页面层争用同一宿主污染宽度结果。
     * 刻意**另开一个 800px 宽的窗口**，而不是 `win.setSize()`：窗口被遮挡 / 最小化时
     * 尺寸变化不一定传导到渲染进程（首次实现就是这么失败的：页面仍读到 1440，
     * 前置条件不成立、退化成 exit 2）。新窗口「生来就是 800px」，视口没有悬念。
     */
    const narrowWin = new BrowserWindow({
      width: 800,
      height: 950,
      show: true,
      alwaysOnTop: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        preload: path.join(__dirname, "../apps/electron/src/preload/index.js"),
        backgroundThrottling: false,
      },
    });

    try {
      smoke.attachWebContents(narrowWin.webContents);
      await narrowWin.loadURL("app://app/create");
      await sleep(3500);

      const narrowPrecondition = await run(`({
        innerWidth: window.innerWidth,
        // 视口宽度不是创建页分栏阈值，读正常流父 main 的实际宽度。
        // 隐藏的 workspace 会返回零宽，所以必须读常驻 main-area。
        // 若环境没有进入单栏，先退环境问题而非把居中弹窗误报代码回归。
        singleMain: document.querySelector('[data-create-main-area]')?.getBoundingClientRect().width < 760,
        triggerPresent: Boolean(document.querySelector('[data-character-picker-trigger]')),
      })`);

      if (
        !narrowPrecondition ||
        !narrowPrecondition.singleMain ||
        !narrowPrecondition.triggerPresent
      ) {
        smoke.exitEnvironment(
          "窄窗口配对对照的前置条件不成立（800px 窗口主区没有落在 < 760px，或创建页触发按钮不在）：" +
            JSON.stringify(narrowPrecondition),
          { app }
        );
        return;
      }

      await installDialogFrameProbe();
      await openPicker();
      const narrowFirstFrame = await run(`window.__dialogFirstFrame`);

      check(
        "配对对照（800px 窗口）：同一探针在窄窗口首帧读到的就是紧凑变体",
        Boolean(narrowFirstFrame) &&
          narrowFirstFrame.motionNone === true && narrowFirstFrame.mainPage === true &&
          Math.abs(narrowFirstFrame.offsetHeight - narrowFirstFrame.parentHeight) <= 1,
        narrowFirstFrame
          ? `首帧 motionNone=${narrowFirstFrame.motionNone} 布局高=${narrowFirstFrame.offsetHeight}/${narrowFirstFrame.parentHeight}`
          : "没有记录到首帧"
      );

      await closePicker();

      await openExtensionPicker();
      await sleep(900);
      const narrowSearch = await measureDialogSearch("extension-select-dialog-title");
      check(
        // 窗口变窄到真正单栏后，剩余搜索宽度会小于旧 1100px 用例的 300px。
      // 用同一轮实测宽屏固定宽度作对照，验证紧凑搜索确实伸展而非只保留 w-40。
      // 高度仍必须达到 36px，不因窗口变窄就降低点击区域的要求。
      // 这里比较的是行为差异，不把某台机器的剩余宽度硬编码成产品最低宽度。
      // 更改布局阈值后若两端都变成固定宽，这条与宽屏断言会形成失败对照。
      // 宽屏测量发生在同一套组件和主题中，不依赖另一个历史截图的像素。
      // 数值留在报告里，能看到 28/160 与紧凑实际尺寸的区别。
      // 这条不重新定义产品断点，断点是否进入单栏已由前置条件直接读 main。
      "紧凑（800px）：扩展搜索框达到36px且宽于宽屏固定搜索框",
        narrowSearch && narrowSearch.height >= 36 && narrowSearch.width > wideSearch.width + 60,
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
