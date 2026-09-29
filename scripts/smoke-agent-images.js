/**
 * Agent 生图结果展示冒烟：假模型 + 假生图结果，不联网、不写图库。
 *
 * 覆盖链路：generate_image → tool_artifacts → Agent store → localfile:// 懒加载缩略图
 * → 点击打开大图预览。需先构建静态导出。
 */
const path = require("path");
const { app, BrowserWindow } = require("electron");
const { registerAppProtocol } = require("../apps/electron/appProtocol");
const { registerAllIpcHandlers } = require("../apps/electron/ipc-handlers");
const { HOST_TOOLS } = require("../apps/electron/agent/host-tools");
const { createSmokeHarness } = require("./lib/smoke-harness");

const fixturePath = path.join(__dirname, "..", "apps", "electron", "icon.png");
process.env.ILLUSION_AGENT_API_KEY = "agent-image-smoke-key";
process.env.ILLUSION_AGENT_FAKE_LLM = "1";

const imageTool = HOST_TOOLS.find((tool) => tool.name === "generate_image");
if (imageTool) {
  imageTool.run = async () => ({
    result: `已生成 1 张图片，保存路径：${fixturePath}`,
    images: [fixturePath],
  });
}

registerAppProtocol();
registerAllIpcHandlers();

const smoke = createSmokeHarness({ name: "agent-images" });
smoke.installConsoleTee();
const check = smoke.check;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const TYPE_INTO = (selector, value) => `(() => {
  const element = document.querySelector(${JSON.stringify(selector)});
  if (!element) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
  setter.call(element, ${JSON.stringify(value)});
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
      backgroundThrottling: false,
    },
  });
  smoke.attachWebContents(win.webContents);
  await smoke.hardenWindow(win);
  const run = smoke.createRun();

  const waitFor = async (expression, timeoutMs = 30000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const ok = await run(`(() => { try { return Boolean(${expression}); } catch { return false; } })()`);
      if (ok) return true;
      await sleep(200);
    }
    return false;
  };

  try {
    await win.loadURL("app://app/agent");
    check("Agent 页加载", await waitFor(`document.querySelector('[data-agent-input]')`));
    check(
      "React 已接管页面",
      await waitFor(
        `Object.keys(document.querySelector('[data-agent-input]') ?? {})
          .some((key) => key.startsWith('__reactProps$'))`
      )
    );
    check("输入生图请求", (await run(TYPE_INTO("[data-agent-input]", "请生成图片"))) === true);
    const sendDeadline = Date.now() + 15000;
    while (
      Date.now() < sendDeadline &&
      !(await run(`document.querySelector('[data-agent-message][data-agent-role="user"]')`))
    ) {
      await run(`document.querySelector('[data-agent-send]')?.click(); true`);
      await sleep(250);
    }
    check(
      "生图请求已发送",
      Boolean(await run(`document.querySelector('[data-agent-message][data-agent-role="user"]')`))
    );

    check(
      "生成图片缩略图完成懒加载",
      await waitFor(`(() => {
        const image = document.querySelector('[data-agent-generated-images] img');
        return image?.complete && image.naturalWidth > 0 && image.loading === 'lazy';
      })()`)
    );
    const imageSrc = await run(
      `document.querySelector('[data-agent-generated-images] img')?.getAttribute('src') ?? ''`
    );
    check("缩略图通过 localfile:// 读取本地文件", imageSrc.startsWith("localfile://"), imageSrc);
    await run(`document.querySelector('[data-agent-generated-images] button')?.click(); true`);
    check("点击缩略图打开大图预览", await waitFor(`document.querySelector('[data-image-preview-overlay]')`));

    const passed = smoke.allPassed();
    console.log(`\n${passed ? "AGENT IMAGES SMOKE OK ✓" : "AGENT IMAGES SMOKE FAILED ✗"}`);
    await smoke.finish({ app, ok: passed });
  } catch (error) {
    console.error("SMOKE_FAIL", error);
    await smoke.finish({ app, ok: false, error });
  }
});
