/**
 * 冒烟脚本的**可观测性骨架**：看门狗 / 单步超时 / 日志留档 / 进程树终止 / 语句级标记。
 *
 * 为什么需要共享：这套东西最初只在 `smoke-anima-workflow.js` 里长出来（那一次我们
 * 花了很久才把「静默挂死」定位到某一步的某一条 await）。其余冒烟套件跑的是同一种
 * 长链路，同样会挂 —— 但**一个不产生信号的测试比没有测试更坏**：
 * 挂住时你分不清是卡死、失败还是环境问题，也就无法判断某天红灯是不是自己的改动造成的。
 *
 * 抽出骨架后，新套件只要四处接入：
 *   1. `const smoke = createSmokeHarness({ name })`，并用 `smoke.check` 替换本地 check
 *   2. `smoke.createRun()` 替换本地 `run`（获得单步超时 + 步骤名 + 页面侧标记读取）
 *   3. `smoke.assertBuildFresh({ app })` 在跑断言前调用一次（陈旧产物 → 退出码 2）
 *   4. 结尾 `smoke.finish({ app, ok })` 替换 `app.exit(...)`
 *
 * 退出码约定（与 AGENTS.md 一致）：
 *   0 通过 / 1 断言失败或异常 / 2 构建产物过期 / 124 看门狗超时 / 125 进程内单步超时
 *
 * 写轮询的两条硬规矩（都由真实的坑换来）：
 *   1. **不要用页面侧 `requestAnimationFrame` 当节拍。** 窗口被遮挡 / 最小化时 Chromium 会
 *      暂停渲染生命周期，rAF 回调可能**永远不执行**（`smoke-anima-workflow` 就静默挂死在这里）。
 *      轮询要么跑在主进程（`setTimeout` 不受页面可见性影响），要么在页面侧显式退化成
 *      `setTimeout`：`window.requestAnimationFrame ? ... : setTimeout(...)` 还不够 ——
 *      更稳的写法是 `Promise.race([rAF, setTimeout])`，让计时器兜底。
 *      同理，页面被标记 hidden 时 `matchMedia` 的 change 事件也不再派发（见 known-flakes）。
 *   2. **轮询必须把结果返回给调用方**（是否命中、等了多久）。丢弃返回值会让「超时」与
 *      「值不对」在输出里长得一模一样，排查只能靠猜 —— 这正是 prompt-assembly 那次抖动的
 *      教训。
 */
const fs = require("fs");
const path = require("path");
const { findKnownFlake, formatKnownFlake } = require("./known-flakes");
const { checkBuildFreshness } = require("./build-freshness");

const LOG_DIR = path.join(__dirname, "..", "..", "logs");
const LOG_RING_LIMIT = 400;
/** 每次运行的摘要追加到这里：stdout 可能被截断（见 finish 的注释），这份不会 */
const RUN_SUMMARY_FILE = path.join(LOG_DIR, "smoke-runs.log");

function createSmokeHarness({
  name,
  timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 300000),
  stepTimeoutMs = Number(process.env.SMOKE_STEP_TIMEOUT_MS ?? 60000),
}) {
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`;
  const logFile = path.join(LOG_DIR, `smoke-${name}-${runId}.log`);

  const results = [];
  const ring = [];
  const knownFlakeHits = [];
  let overriddenExitCode = null;
  let lastCheckName = "(启动阶段，尚无断言)";
  let workDir = "(未设置)";
  let webContents = null;
  let watchdogTimer = null;

  const originalLog = console.log.bind(console);
  const originalError = console.error.bind(console);

  /**
   * 全程镜像 console 到环形缓冲：挂死时外壳可能拿不到完整输出，
   * 而失败/超时都要能把「最后发生了什么」落盘。
   */
  function installConsoleTee() {
    const tee = (level, args) => {
      const text = args
        .map((arg) =>
          typeof arg === "string"
            ? arg
            : arg instanceof Error
              ? `${arg.name}: ${arg.message}`
              : JSON.stringify(arg)
        )
        .join(" ");
      ring.push(`[${level}] ${text}`);
      if (ring.length > LOG_RING_LIMIT) ring.shift();
    };
    console.log = (...args) => {
      tee("log", args);
      originalLog(...args);
    };
    console.error = (...args) => {
      tee("err", args);
      originalError(...args);
    };
  }

  function check(checkName, ok, detail = "") {
    results.push({ name: checkName, ok, detail });
    lastCheckName = checkName;
    console.log(`${ok ? "PASS" : "FAIL"}  ${checkName}${detail ? `  (${detail})` : ""}`);

    /**
     * 失败时自动带出台账：让「这条断言以前抖过、根因是什么、怎么按需复现」
     * 出现在当次输出里，而不是靠人记得。
     */
    if (!ok) {
      const record = findKnownFlake(checkName);
      if (record && !knownFlakeHits.some((hit) => hit.id === record.id)) {
        knownFlakeHits.push(record);
        for (const line of formatKnownFlake(record)) console.log(line);
      }
    }
  }

  function setWorkDir(dir) {
    workDir = dir;
  }

  function attachWebContents(contents) {
    webContents = contents;
  }

  /**
   * 遮挡维度（`SMOKE_OCCLUDE=1`）：把「窗口被遮挡」从潜伏变量变成**受测维度**。
   *
   * 为什么用「页面保持 visible」当断言，而不是断言 `backgroundThrottling === false`：
   *   `webContents.getLastWebPreferences()` 在 Electron 43 上读不到这个字段（实测 undefined），
   *   断言它只会得到一个永远无意义的检查。而 `backgroundThrottling: false`
   *   的**可观测后果**就是「被盖住时页面不再被标记 hidden」—— 直接断言后果更诚实。
   *   谁把那一行删掉，这条会立刻红，而不是等某个时序断言偶然红一次。
   *
   * 时机很关键：**必须在页面加载完成之后再盖上**。若在 loadURL 之前就盖住，
   * 页面会「生来就是 hidden」（实测 visibilityState=hidden、变体永远不翻）——
   * 那是另一个环境前提，不是我们要复现的「跑到一半被盖住」。
   * 因此这里注册 `did-finish-load`，由它来盖 + 延迟断言，调用方无需关心时机。
   *
   * @returns {{dispose: () => void}}
   */
  function hardenWindow(win) {
    let occluder = null;
    const dispose = () => {
      if (occluder && !occluder.isDestroyed()) occluder.destroy();
    };
    if (process.env.SMOKE_OCCLUDE !== "1" || !win) return { dispose };

    const { BrowserWindow } = require("electron");
    const cover = async () => {
      if (win.isDestroyed() || (occluder && !occluder.isDestroyed())) return;
      const [x, y] = win.getPosition();
      const [width, height] = win.getSize();
      occluder = new BrowserWindow({
        x, y, width, height,
        show: true, alwaysOnTop: true, frame: false, backgroundColor: "#111111",
        webPreferences: { contextIsolation: true, nodeIntegration: false },
      });
      await occluder.loadURL("data:text/html,<body style='background:%23111'></body>");
      occluder.setAlwaysOnTop(true, "screen-saver");
      occluder.focus();
      originalLog("[遮挡维度] 页面加载完成后已用置顶窗口盖住被测窗口（SMOKE_OCCLUDE=1）");

      // 等遮挡判定生效，再看页面有没有被标记为 hidden
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (win.isDestroyed()) return;

      /**
       * 前置条件：窗口必须真的在屏幕上可见。
       * 纯 headless（无桌面会话）时窗口根本没显示，遮挡维度测不出任何东西 ——
       * 此时**显式跳过并打印原因**，而不是让它悄悄通过：静默通过和假红一样坏，
       * 会让人以为这个维度被覆盖了。
       */
      if (!win.isVisible()) {
        originalLog(
          "[遮挡维度] SKIP：被测窗口不可见（headless / 无桌面会话），" +
            "遮挡维度需要真实窗口才能判定 —— 本维度未执行，不计入覆盖。" +
            "纯 headless 上请改用 SMOKE_SWALLOW_MEDIA_EVENT=all 覆盖「事件丢失时的存活性」。"
        );
        return;
      }

      let visibility = "UNKNOWN";
      try {
        visibility = await win.webContents.executeJavaScript("document.visibilityState");
      } catch (error) {
        visibility = `读取失败：${String(error)}`;
      }

      /**
       * 前置条件失败 → 退出码 2（环境/前置条件问题，不是代码问题），并给出诊断。
       * 触发场景：遮挡在导航之前就生效，页面「生来 hidden」——那时 matchMedia 的 change
       * 永远不派发、变体永远不翻，会把维度测成一条需要推理的假红。踩过一次，不该让人再踩。
       */
      if (visibility !== "visible") {
        originalError(
          "\n[遮挡维度] 前置条件不成立：遮挡在导航前生效，页面初始状态异常" +
            `（document.visibilityState=${visibility}）`
        );
        originalError(
          "[遮挡维度] 遮挡窗口必须在**页面加载完成之后**才盖上（hardenWindow 依赖 did-finish-load）；" +
            "否则页面生来就是 hidden，本维度不成立。退出码 2 = 环境/前置条件问题，不是代码回归。"
        );
        dumpLog(`OCCLUSION PRECONDITION FAILED：visibilityState=${visibility}`);
        markExitCode(2);
        try {
          if (app && app.isReady()) {
            app.exit(2);
            return;
          }
        } catch {
          /* 落到强杀 */
        }
        killProcessTree();
        process.exit(2);
        return;
      }

      check(
        "遮挡维度：被盖住时页面仍为 visible（backgroundThrottling: false 在生效）",
        true,
        "visibilityState=visible（hidden 说明后台节流没关掉：rAF/过渡会停摆、matchMedia 的 change 也不再派发）"
      );
    };

    if (win.webContents.isLoading()) {
      win.webContents.once("did-finish-load", () => setTimeout(cover, 800));
    } else {
      setTimeout(cover, 800);
    }
    return { dispose };
  }

  /**
   * 造一个带单步超时的求值函数。
   * 未显式给 step 时回落到「上一条通过的断言名」—— 这样不必改造几十处调用点
   * 也能把挂住的位置报到「哪一步」。
   */
  function createRun() {
    return (expression, options = {}) => {
      if (!webContents) throw new Error("先调用 attachWebContents(win.webContents)");
      const timeout = options.timeoutMs ?? stepTimeoutMs;
      const label = options.step ?? `上一条通过：${lastCheckName}`;

      let timer = null;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(
            `step "${label}" timed out after ${timeout}ms（渲染进程未返回）`
          );
          error.code = "SMOKE_STEP_TIMEOUT";
          error.step = label;
          reject(error);
        }, timeout);
        if (typeof timer.unref === "function") timer.unref();
      });

      return Promise.race([
        webContents.executeJavaScript(expression),
        timeoutPromise,
      ]).finally(() => {
        if (timer) clearTimeout(timer);
      });
    };
  }

  /**
   * 读页面侧步骤标记（`window.__marks`）。
   * 挂住时 IIFE 内部的日志回不来（executeJavaScript 要等 promise settle），
   * 只能写进页面再用**另一次独立调用**取。
   * 同时这条读取本身是诊断信号：读不回来说明渲染线程被占死，读得回来说明只是 promise 挂着。
   */
  async function readPageMarks(timeout = 3000) {
    if (!webContents) return { marks: null, note: "没有 webContents，无法读取标记" };
    let timer = null;
    try {
      const marks = await Promise.race([
        webContents.executeJavaScript("window.__marks ?? null"),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve("READ_TIMEOUT"), timeout);
          if (typeof timer.unref === "function") timer.unref();
        }),
      ]);
      if (marks === "READ_TIMEOUT") {
        return { marks: null, note: `读取标记也超时（${timeout}ms）——渲染线程可能被占死` };
      }
      return { marks: Array.isArray(marks) ? marks : null, note: "渲染线程仍可响应" };
    } catch (error) {
      return { marks: null, note: `读取标记失败：${String(error)}` };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * 构建产物新鲜度自检：**必须在跑断言之前调用一次**。
   *
   * 陈旧产物会伪装成代码回归（AGENTS.md 里记着那次「高度过渡没有中间帧」），
   * 所以用一个独立退出码 2 把它与真正的代码问题区分开。
   */
  function assertBuildFresh({ app, exitCode = 2 } = {}) {
    const status = checkBuildFreshness();
    if (status.ok) {
      originalLog(`[构建自检] ${status.mode}：${status.detail}`);
      return true;
    }
    originalError("\n[构建自检] 构建产物过期，请先 pnpm build（或 pnpm --filter @illusion-realm/next build）");
    originalError(`[构建自检] 判定依据（${status.mode}）：${status.detail}`);
    if (status.changed.length > 0) {
      originalError(`[构建自检] 变化的源码（共 ${status.changed.length} 个，最多列 8 个）：`);
      for (const file of status.changed.slice(0, 8)) originalError(`  · ${file}`);
    }
    originalError(
      "[构建自检] 提示：本套件跑的是静态导出 apps/next/out，不是源码；" +
        "若你刚刚 git checkout/stash 过（只改了 mtime），重建一次即可消除告警。"
    );
    dumpLog(`BUILD STALE（${status.mode}）：${status.detail}`);
    markExitCode(exitCode);
    try {
      if (app && app.isReady()) {
        app.exit(exitCode);
        return false;
      }
    } catch {
      /* 落到强杀 */
    }
    killProcessTree();
    process.exit(exitCode);
    return false;
  }

  /** 把「结果清单 + 尾部日志」落盘，作为失败/超时后的第一手证据 */
  function dumpLog(reason) {
    try {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      const lines = [
        `# ${reason}`,
        `smoke: ${name}`,
        `run-id: ${runId}`,
        `time: ${new Date().toISOString()}`,
        `timeout: ${timeoutMs}ms（看门狗）/ ${stepTimeoutMs}ms（单步）`,
        `workDir: ${workDir}`,
        "",
        `== 结果（${results.filter((r) => r.ok).length}/${results.length} 通过）==`,
        ...results.map(
          (r) => `${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`
        ),
        "",
        ...(knownFlakeHits.length > 0
          ? [
              "== 命中已知 flake 台账 ==",
              ...knownFlakeHits.flatMap((entry) => formatKnownFlake(entry)),
              "",
            ]
          : []),
        `== 尾部日志（最后 ${ring.length} 行）==`,
        ...ring,
      ];
      fs.writeFileSync(logFile, lines.join("\n"), "utf8");
      originalLog(`日志已留档：${logFile}`);
      return logFile;
    } catch (error) {
      originalError("日志留档失败", error);
      return null;
    }
  }

  /** 终止整棵进程树（Windows 上 taskkill /T 是唯一可靠做法） */
  function killProcessTree() {
    try {
      if (process.platform === "win32") {
        require("child_process").execFileSync(
          "taskkill",
          ["/PID", String(process.pid), "/T", "/F"],
          { stdio: "ignore" }
        );
      } else {
        process.kill(process.pid, "SIGKILL");
      }
    } catch {
      /* 进程可能已退出 */
    }
  }

  /**
   * 看门狗：超过阈值即判定卡死。
   *
   * 退出顺序刻意设计：优先 `app.exit(124)` —— Electron 会自行回收渲染/GPU 子进程，
   * 而且**保住 124 这个「超时」信号**；若直接 taskkill 掉自己，进程会以强杀码结束，
   * 「卡死」与「被杀」就区分不开了。仅在 app 未就绪时退化为强杀。
   */
  function installWatchdog(app) {
    guardExit(app);
    watchdogTimer = setTimeout(() => {
      originalError(
        `\n[watchdog] 超过 ${timeoutMs}ms 无进展，判定为卡死 —— 打印尾部日志并终止`
      );
      dumpLog(`TIMEOUT after ${timeoutMs}ms`);
      for (const line of ring.slice(-40)) originalError(line);
      originalError(`工作目录（保留以便排查）：${workDir}`);
      try {
        if (app && app.isReady()) {
          app.exit(124);
          setTimeout(() => {
            killProcessTree();
            process.exit(124);
          }, 5000).unref?.();
          return;
        }
      } catch {
        /* 落到下面的强杀 */
      }
      killProcessTree();
      process.exit(124);
    }, timeoutMs);
    if (typeof watchdogTimer.unref === "function") watchdogTimer.unref();
    return watchdogTimer;
  }

  function clearWatchdog() {
    if (watchdogTimer) clearTimeout(watchdogTimer);
  }

  /**
   * 收尾：通过则清临时目录、失败则留档并保留目录，最后按约定给退出码。
   * `error` 为步骤超时错误时用 125，其余异常/失败用 1。
   *
   * 无论成败，都把一行摘要**追加到 `logs/smoke-runs.log`**：
   * stdout 是管道时是异步写的，`app.exit()` 有可能在排空前就结束进程
   * （本仓库遇到过整段结论丢失）。文件写是同步的，读性不受影响 ——
   * 这是与「stdout 截断」这个问题正交的、零成本的兜底。
   */
  function finish({ app, ok, error, cleanupDir }) {
    clearWatchdog();
    const stepTimedOut =
      error instanceof Error && error.code === "SMOKE_STEP_TIMEOUT";

    const exitCode = stepTimedOut ? 125 : ok && !error ? 0 : 1;
    appendRunSummary(ok && !error ? "OK" : stepTimedOut ? "STEP_TIMEOUT" : "FAILED", exitCode);

    if (!ok || error) {
      if (stepTimedOut) {
        // 单步超时时把页面侧标记取回来 —— 那是「挂在哪个语句」唯一的一手证据
        return readPageMarks().then(({ marks, note }) => {
          originalError(`[诊断] ${note}`);
          if (marks && marks.length > 0) {
            originalError(`[诊断] 页面侧步骤标记（共 ${marks.length} 条，最后 10 条）：`);
            for (const mark of marks.slice(-10)) originalError(`  · ${mark}`);
          } else {
            originalError("[诊断] 页面侧没有标记（IIFE 可能在该标记之前就没进入）");
          }
          dumpLog(
            error
              ? `SMOKE EXCEPTION: ${error.message}`
              : "SMOKE FAILED（有断言未通过）"
          );
          originalLog(`工作目录（保留以便排查）：${workDir}`);
          app.exit(125);
        });
      }
      dumpLog(
        error ? `SMOKE EXCEPTION: ${error.message}` : "SMOKE FAILED（有断言未通过）"
      );
      originalLog(`工作目录（保留以便排查）：${workDir}`);
      app.exit(1);
      return Promise.resolve();
    }

    if (cleanupDir) {
      try {
        fs.rmSync(cleanupDir, { recursive: true, force: true });
      } catch {
        /* 清理失败不影响结论 */
      }
    }
    originalLog(`${name} SMOKE OK ✓  ${results.filter((r) => r.ok).length}/${results.length}`);
    app.exit(0);
    return Promise.resolve();
  }

  /**
   * 退出码护栏：装一次，管住两条会「把红灯变绿灯」的路径。
   *
   * 1. **有失败时禁止 `app.quit()`**：实测它**无视 `process.exitCode`**（`process.exitCode = 7;
   *    app.quit()` 的退出码是 0）。只要本次运行已有失败断言（或已被判定为构建/前置条件问题），
   *    就把 quit 拦下来改成对应的非零退出码 —— 这防的是「失败被当成成功」。
   *    **干净路径放行**：没有任何失败时 `app.quit()` 原样执行（退出码 0 本来就是正确答案），
   *    无条件拦截会误伤正常的收尾写法。
   * 2. **摘要与退出码一致**：`app.exit(0)` 时若已有断言失败，强制改成 1 并报出来。
   *    正常路径由 `finish()` 计算退出码，这条护栏防的是「绕过 finish 直接退出」。
   */
  function guardExit(app) {
    if (!app || app.__smokeGuardInstalled) return;
    app.__smokeGuardInstalled = true;

    const originalQuit = app.quit.bind(app);
    app.quit = () => {
      const failed = results.filter((result) => !result.ok);
      const intended = overriddenExitCode ?? (failed.length > 0 ? 1 : 0);
      if (intended === 0) {
        originalQuit();
        return;
      }
      originalError(
        `\n[退出码护栏] app.quit() 被拦截：本次运行已有 ${failed.length} 条断言失败` +
          (overriddenExitCode !== null ? `、且已判定为 ${overriddenExitCode}（构建/前置条件问题）` : "") +
          `。app.quit() 会丢弃 process.exitCode（实测退出码 0），把失败变成成功 —— ` +
          `本仓库统一用 app.exit(code)，已改为 app.exit(${intended})。`
      );
      app.exit(intended);
    };

    const originalExit = app.exit.bind(app);
    app.exit = (code) => {
      const codeNumber = typeof code === "number" ? code : 0;
      const failed = results.filter((result) => !result.ok);
      if (codeNumber === 0 && failed.length > 0) {
        originalError(
          `\n[退出码护栏] 退出码 0 与摘要不一致：已有 ${failed.length} 条断言失败` +
            `（${failed.slice(0, 3).map((result) => result.name).join(" / ")}…），` +
            "已强制改为退出码 1。"
        );
        return originalExit(1);
      }
      if (codeNumber === 0) {
        const overridden = overriddenExitCode;
        if (overridden !== null && overridden !== 0) {
          originalError(
            `[退出码护栏] 本次运行已判定为 ${overridden}（构建/前置条件问题），` +
              "却有人用 0 退出 —— 已按判定结果退出。"
          );
          return originalExit(overridden);
        }
      }
      return originalExit(codeNumber);
    };
  }

  /** 把「不是代码问题」的判定结果（2=构建/前置条件）记下来，供退出码护栏使用 */
  function markExitCode(code) {
    overriddenExitCode = code;
  }

  /**
   * 环境/前置条件不成立时的统一出口（退出码 2）。
   * 与 `assertBuildFresh`、遮挡前置断言同一条语义：**不是代码问题**。
   * 套件里不要再自己写 `app.exit(2)` —— 出口收口在一处，护栏才有唯一语义
   * （`scripts/check-smoke-rules.js` 会拦散落的调用点）。
   */
  function exitEnvironment(reason, { app } = {}) {
    originalError(`\n[环境/前置条件] ${reason}`);
    originalError("退出码 2 = 环境或前置条件问题，不是代码回归；按其提示修环境后重跑。");
    markExitCode(2);
    dumpLog(`ENVIRONMENT: ${reason}`);
    appendRunSummary("ENV_FAILED", 2);
    try {
      if (app && app.isReady()) {
        app.exit(2);
        return;
      }
    } catch {
      /* 落到强杀 */
    }
    killProcessTree();
    process.exit(2);
  }

  /** 追加一行运行摘要（同步写，不受 stdout 截断影响） */
  function appendRunSummary(verdict, exitCode) {
    try {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      const passed = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok).map((r) => r.name);
      fs.appendFileSync(
        RUN_SUMMARY_FILE,
        [
          new Date().toISOString(),
          name,
          verdict,
          `${passed}/${results.length}`,
          `exit=${exitCode}`,
          `occlude=${process.env.SMOKE_OCCLUDE === "1" ? "yes" : "no"}`,
          failed.length > 0 ? `failed=${failed.join(" / ")}` : "",
          runId,
        ]
          .filter(Boolean)
          .join(" | ") + "\n",
        "utf8"
      );
    } catch {
      /* 摘要写不进去不能影响结论 */
    }
  }

  return {
    name,
    results,
    timeoutMs,
    stepTimeoutMs,
    logFile,
    installConsoleTee,
    check,
    setWorkDir,
    attachWebContents,
    hardenWindow,
    createRun,
    readPageMarks,
    installWatchdog,
    assertBuildFresh,
    guardExit,
    markExitCode,
    exitEnvironment,
    clearWatchdog,
    dumpLog,
    killProcessTree,
    finish,
    allPassed: () => results.every((r) => r.ok),
    getLastCheckName: () => lastCheckName,
  };
}

module.exports = { createSmokeHarness };
