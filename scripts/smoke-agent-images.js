/**
 * protocol：使用客户端的 app:// 与 localfile:// 协议实现。
 * register：调用完整的业务域注册表，而非只注册当前页面恰好使用的通道。
 * host-tools：复用 Agent 的宿主工具声明和渲染端回执桥。
 * icon.png：图像样本改从统一 assets 目录读取。
 * index：窗口加载迁移后的真实 preload 桥接文件。
 * protocol：Next 静态资源含绝对 URL，必须保持应用同源加载。
 * register：注册表负责汇总失败域，避免缺少能力却继续启动。
 * host-tools：宿主能力仍由已登记工具限定，不增加任意代码执行入口。
 * icon.png：二进制样本本身未改动，字节比较仍应与原图一致。
 */
/**
 * Agent 生图结果展示冒烟：假模型 + 假生图结果，不联网、不写图库。
 *
 * 覆盖链路：generate_image → tool_artifacts → Agent store → localfile:// 懒加载缩略图
 * → 点击打开大图预览。需先构建静态导出。
 */
const path = require("path");
const { app, BrowserWindow } = require("electron");
const { registerAppProtocol } = require("../apps/electron/src/main/core/protocol");
const { registerAllIpcHandlers } = require("../apps/electron/src/main/ipc/register.js");
const { HOST_TOOLS } = require("../apps/electron/src/main/modules/agent/host-tools");
const { createSmokeHarness } = require("./lib/smoke-harness");

const fixturePath = path.join(__dirname, "../apps/electron/assets/icon.png");
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
require("./lib/guest-session-fixture").installGuestDocumentFixture();

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
      preload: path.join(__dirname, "../apps/electron/src/preload/index.js"),
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
