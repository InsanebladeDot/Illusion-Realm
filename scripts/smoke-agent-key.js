/**
 * 没有 API Key 时的拦截与引导（用户可见行为）验证。
 *
 * 断言的是这条**完整链路**，而不是某个组件单独渲染成什么样：
 *   ① 刚进 Agent 页**不**提示（没按发送就别打扰）；
 *   ② 输入后按发送 → 拦在拉起 sidecar 之前（对话里不出现助手消息）、
 *      输入区上方出现提示条，链接指向 `/settings#agent`；
 *   ③ 点链接跳到设置页，且 `#agent` 锚点真的在（否则链接会落到页面顶部）；
 *   ④ 在设置页填一把 → 状态点变绿；清除 → 回到未配置；
 *   ⑤ 回到 Agent 页再发一次，提示**再次**出现（证明这条路可重复，不是一次性的）。
 *
 * 密钥写在临时目录（`ILLUSION_AGENT_SECRET_DIR` 重定向）：
 * 既不会冲掉用户本机正在用的 key，也不受"本机配没配"影响 —— 否则这套断言在
 * 已经配好的机器上会静默变成 SKIP。
 *
 * 运行：`pnpm exec electron scripts/smoke-agent-key.js`（需先构建静态导出）
 * 退出码：0 通过 / 1 断言失败 / 2 构建产物过期 / 124 看门狗 / 125 单步超时
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createSmokeHarness } = require("./lib/smoke-harness");
const { app, BrowserWindow } = require("electron");
const { registerAppProtocol } = require("../apps/electron/appProtocol");
const { registerAllIpcHandlers } = require("../apps/electron/ipc-handlers");

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-key-smoke-"));
/** 必须在注册 handler 之前设好：`secret.js` 在**调用时**才读这个变量 */
process.env.ILLUSION_AGENT_SECRET_DIR = path.join(workDir, "secret");
/** 环境变量优先级最高，留着它这里就永远测不到"未配置"那一支 */
delete process.env.ILLUSION_AGENT_API_KEY;

registerAppProtocol();
registerAllIpcHandlers();

const smoke = createSmokeHarness({ name: "agent-key" });
smoke.installConsoleTee();
const check = smoke.check;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 受控输入：React 只认原生 setter + input 事件，直接改 .value 会被它覆盖回去 */
const TYPE_INTO = (selector, value) => `(() => {
  const element = document.querySelector(${JSON.stringify(selector)});
  if (!element) return false;
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, ${JSON.stringify(value)});
  element.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
})()`;

app.whenReady().then(async () => {
  smoke.installWatchdog(app);
  smoke.assertBuildFresh({ app });

  const win = new BrowserWindow({
    width: 1440,
    height: 950,
    show: true,
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, "..", "apps", "electron", "preload.js"),
      /** 与真实应用一致：被遮挡时渲染生命周期会停摆，过渡与轮询都会假死 */
      backgroundThrottling: false,
    },
  });

  const consoleErrors = [];
  win.webContents.on("console-message", (event) => {
    if (event.level === "error") consoleErrors.push(event.message);
  });

  smoke.attachWebContents(win.webContents);
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

  /** 发送一条消息（输入框填好 → 点发送按钮） */
  /**
   * 输入一条消息并点发送。
   *
   * **点击是"重试直到有反应"**，不是点一次就完：hydrate 之前 React 还没挂上事件处理器，
   * 那时 `.click()` 什么都不会发生、也不报错（本套件首轮就是这样红的：点击落空、
   * 提示自然不出现）。重试让这一层时序不再是断言的前置条件。
   * @returns {Promise<boolean>} 是否观察到反应（提示条或任意消息）
   */
  const sendMessage = async (text) => {
    check("输入框接受输入", (await run(TYPE_INTO("[data-agent-input]", text))) === true);
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      await run(`document.querySelector('[data-agent-send]')?.click(); true`);
      const reacted = await waitFor(
        `document.querySelector('[data-agent-key-notice]') || document.querySelector('[data-agent-message]')`,
        1200
      );
      if (reacted) return true;
    }
    return false;
  };

  try {
    await win.loadURL("app://app/agent");
    check("Agent 页加载出输入框", await waitFor(`document.querySelector('[data-agent-input]')`));
    /**
     * 等 React 接管：`__reactProps$*` 是 hydrate 时挂到 DOM 节点上的。
     * `SMOKE_AGENT_KEY_SKIP_HYDRATION_WAIT=1` 跳过它 —— 用来验证上面那层"重试点击"
     * 确实兜得住"还没 hydrate 就点"。
     */
    if (process.env.SMOKE_AGENT_KEY_SKIP_HYDRATION_WAIT) {
      console.log("注意：SMOKE_AGENT_KEY_SKIP_HYDRATION_WAIT=1，跳过 hydrate 等待（故障注入）");
    } else {
      check(
        "React 已接管页面",
        await waitFor(
          `Object.keys(document.querySelector('[data-agent-input]') ?? {})
             .some((key) => key.startsWith('__reactProps$'))`
        )
      );
    }

    // ① 首帧不该提示
    check(
      "刚进页面不提示（只有按过发送才提示）",
      (await run(`!document.querySelector('[data-agent-key-notice]')`)) === true
    );

    // ② 未配置时发送 → 拦下 + 提示
    const blocked = await sendMessage("算一下 (26+18)*3-7");
    check("没配密钥时按发送 → 出现「去设置里填写」提示", blocked);
    check(
      "被拦下的那次没有生成助手消息（说明没拉起 sidecar）",
      (await run(
        `document.querySelectorAll('[data-agent-message][data-agent-role="agent"]').length === 0`
      )) === true
    );
    const href = await run(
      `document.querySelector('[data-agent-key-notice-link]')?.getAttribute('href') ?? ''`
    );
    check("提示里的链接指向设置页的 Agent 区块", href === "/settings#agent", href);

    // ③ 点链接 → 设置页（且锚点在）
    check(
      "提示里的链接可点击",
      (await run(
        `(() => { const link = document.querySelector('[data-agent-key-notice-link]'); if (!link) return false; link.click(); return true; })()`
      )) === true
    );
    check("点链接跳到设置页", await waitFor(`location.pathname === "/settings"`));
    check(
      "设置页里有 Agent 区块（链接落点不是页面顶部）",
      await waitFor(`Boolean(document.getElementById("agent"))`)
    );

    // ④ 填一把 → 已配置；清除 → 回到未配置
    check(
      "设置里能输入密钥",
      (await run(TYPE_INTO("#agent-api-key", "sk-smoke-1234abcd"))) === true
    );
    await run(`document.querySelector('[data-agent-key-save]').click(); true`);
    check(
      "保存后状态显示已配置",
      await waitFor(`document.querySelector('[data-agent-key-status="configured"]')`)
    );
    await run(`document.querySelector('[data-agent-key-clear]').click(); true`);
    check(
      "清除后状态回到未配置",
      await waitFor(`document.querySelector('[data-agent-key-status="missing"]')`)
    );

    // ⑤ 回 Agent 页：提示应能再次出现（可重复，不是一次性）
    await win.loadURL("app://app/agent");
    check("回到 Agent 页", await waitFor(`document.querySelector('[data-agent-input]')`));
    await sendMessage("再试一次");
    check(
      "清除后再发送会再次提示",
      await waitFor(`document.querySelector('[data-agent-key-notice]')`)
    );

    check("渲染进程无 console 错误", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
    consoleErrors.slice(0, 5).forEach((line) => console.log("  ! " + line));

    const passed = smoke.allPassed();
    console.log(`\n${passed ? "AGENT KEY SMOKE OK ✓" : "AGENT KEY SMOKE FAILED ✗"}`);
    await smoke.finish({ app, ok: passed, cleanupDir: workDir });
  } catch (error) {
    console.error("SMOKE_FAIL", error);
    await smoke.finish({ app, ok: false, error });
  }
});
