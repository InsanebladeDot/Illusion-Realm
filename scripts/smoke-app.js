/**
 * app:// 协议冒烟测试：
 * 以 app://app/index.html 加载静态导出首页，验证 CSS/脚本是否真实生效。
 * 运行：npx electron scripts/smoke-app.js
 * 退出码 0 = 样式正常；1 = 样式丢失。
 *
 * ## 为什么不接入共享 harness（显式声明，不是遗漏）
 * 本脚本**不加载真实渲染进程页面**（只取 `app://` 首页的样式计算结果，`show: false`），
 * 因此不涉及「遮挡 → 渲染生命周期停摆」与「matchMedia 事件丢失」这两条前提：
 *   · 无断言依赖 rAF / CSS 过渡 / matchMedia；
 *   · 无窗口被遮挡的场景（窗口根本不显示）。
 * 所以它既不需要 `backgroundThrottling: false`，也不需要遮挡/事件丢失维度。
 * 结论：harness 的三项收益（单步超时 / 页面侧标记 / 构建新鲜度）在这里没有落点，
 * 接入只会增加耦合。若将来它开始断言渲染时序或媒体查询，必须重新评估并接入。
 *
 * 例外（已重估，故点名豁免）：本文件用 `getComputedStyle` 读**静态样式**
 * （协议加载后 nav / body 的颜色、display 等），不涉及过渡中间态 ——
 * 遮挡下 `getComputedStyle` 会强制同步样式重算，读到的是当前值，因此上述结论仍成立。
 * smoke-rules-allow: getComputedStyle（仅静态样式断言，不涉及过渡中间态）
 */
const { app, BrowserWindow } = require("electron");
const { registerAppProtocol } = require("../apps/electron/appProtocol");

registerAppProtocol();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    await win.loadURL("app://app/index.html");
    // 等待脚本执行与样式应用
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const result = await win.webContents.executeJavaScript(`(() => {
      const nav = document.querySelector('nav');
      const navStyle = nav ? getComputedStyle(nav) : null;
      const bodyStyle = getComputedStyle(document.body);
      return {
        title: document.title,
        stylesheetCount: document.styleSheets.length,
        // Tailwind preflight：未加载 CSS 时 body 默认 margin=8px；加载后为 0
        bodyMarginTop: bodyStyle.marginTop,
        // nav 的 fixed 定位与背景色只可能来自 Tailwind 工具类
        navPosition: navStyle ? navStyle.position : 'no-nav',
        navBg: navStyle ? navStyle.backgroundColor : 'no-nav',
        bodyBg: bodyStyle.backgroundColor,
        hasLogo: !!document.querySelector('img[alt="Illusion Realm"]'),
      };
    })()`);

    console.log("SMOKE_RESULT", JSON.stringify(result, null, 2));

    const styled =
      result.stylesheetCount > 0 &&
      result.bodyMarginTop === "0px" &&
      result.navPosition === "fixed" &&
      result.navBg &&
      result.navBg !== "rgba(0, 0, 0, 0)" &&
      result.navBg !== "transparent";

    console.log(styled ? "STYLES OK ✓" : "STYLES BROKEN ✗");
    app.exit(styled ? 0 : 1);
  } catch (error) {
    console.error("SMOKE_FAIL", error);
    app.exit(1);
  }
});
