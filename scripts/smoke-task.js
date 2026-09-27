/**
 * 任务功能冒烟测试（task/任务.md + task/任务1.md）
 * 运行：npx electron scripts/smoke-task.js （退出码 0 = 通过）
 *
 * ## 为什么不接入共享 harness（显式声明，不是遗漏）
 * 与 `smoke-app.js` 同因：窗口 `show: false`、只做静态导出页的文本/结构断言，
 * 不依赖 rAF / CSS 过渡 / matchMedia，也就不受「遮挡 → 渲染生命周期停摆」与
 * 「matchMedia 事件丢失」影响；harness 的三项收益（单步超时 / 页面侧标记 /
 * 构建新鲜度）在此没有落点。若将来它开始断言渲染时序或媒体查询，重新评估并接入。
 */
const { app, BrowserWindow } = require("electron");
const { registerAppProtocol } = require("../apps/electron/appProtocol");

registerAppProtocol();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  const consoleErrors = [];
  win.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2) consoleErrors.push(message);
  });

  const results = [];
  const check = (name, ok, detail = "") => {
    results.push({ name, ok });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** 关闭首次加载弹出的「更新公告」弹窗（其 changelog 文本会污染 innerText 断言） */
  const dismissAnnouncement = async () => {
    for (let i = 0; i < 5; i += 1) {
      await sleep(600);
      const done = await win.webContents.executeJavaScript(`(() => {
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
    // ---------- 设置页 ----------
    await win.loadURL("app://app/settings");
    await sleep(2500);
    await dismissAnnouncement();
    const settingsText = await win.webContents.executeJavaScript(
      "document.body.innerText"
    );
    check("设置页出现 Diffusion 模型地址", settingsText.includes("Diffusion 模型地址"));
    check("设置页出现「新建自定义分类」", settingsText.includes("新建自定义分类"));
    check("设置页已移除「整理文件夹」功能", !settingsText.includes("整理文件夹"));

    // ---------- 创建页：Anima 模型弹窗 ----------
    await win.loadURL("app://app/create");
    await sleep(4000);
    await dismissAnnouncement();
    const createProbe = await win.webContents.executeJavaScript(`(() => {
      const card = document.querySelector('section [role="button"][tabindex="0"]');
      const seriesLabel = document.body.innerText.includes('模型系列');
      return { hasCard: !!card, seriesLabel };
    })()`);
    check("创建页渲染完成（模型系列存在）", createProbe.seriesLabel);
    check("找到模型选择卡片", createProbe.hasCard);

    if (createProbe.hasCard) {
      await win.webContents.executeJavaScript(
        `document.querySelector('section [role="button"][tabindex="0"]').click(); true`
      );
      await sleep(1000);
      const dialog = await win.webContents.executeJavaScript(`(() => {
        const title = document.querySelector('#model-select-dialog-title');
        const body = document.body.innerText;
        return {
          title: title ? title.textContent : null,
          hint: body.includes('仅加载 diffusion_models/Anima') && body.includes('VAE 与 CLIP 已固定绑定'),
          emptyHint: body.includes('请先在设置页配置 Diffusion 模型地址'),
        };
      })()`);
      check("Anima 系列弹窗标题", dialog.title === "选择 Anima 模型", dialog.title ?? "null");
      check("弹窗含 Anima 目录/VAE-CLIP 固定说明", dialog.hint === true);
      check("未配置时给出引导提示", dialog.emptyHint === true);

      await win.webContents.executeJavaScript(
        `document.querySelector('[aria-label="关闭"]')?.click(); true`
      );
      await sleep(500);
    }

    // ---------- 视频面板 ----------
    const videoState = await win.webContents.executeJavaScript(`(() => {
      const tab = Array.from(document.querySelectorAll('button')).find(
        (btn) => btn.textContent.trim() === '视频'
      );
      if (!tab) return { clicked: false };
      tab.click();
      return { clicked: true };
    })()`);
    await sleep(1000);
    const video = await win.webContents.executeJavaScript(`(() => {
      const text = document.body.innerText;
      return {
        hasWorkflow: text.includes('工作流'),
        hasPrompt: text.includes('提示词'),
        hasStartImage: text.includes('起始图片'),
        minimaxNoDuration: !text.includes('时长必须 ≤'),
        noResolution: !text.includes('分辨率') && !text.includes('480 x 480'),
        noSeed: !text.includes('种子') && !text.includes('高级设置'),
      };
    })()`);
    check("视频面板切换成功", videoState.clicked === true);
    check("视频面板含工作流选择", video.hasWorkflow);
    check("视频面板含提示词", video.hasPrompt);
    check("视频面板含起始图片（图生视频必需）", video.hasStartImage);
    check("MiniMax 工作流不要求时长", video.minimaxNoDuration);
    check("视频面板无分辨率参数", video.noResolution);
    check("无种子/高级设置（仅保留最少参数）", video.noSeed);

    // 切到需要时长的工作流（wan2.2）：应出现时长滑块与上限提示
    await win.webContents.executeJavaScript(`(() => {
      const trigger = document.querySelector('button[aria-haspopup="listbox"]');
      if (trigger) trigger.click();
      return !!trigger;
    })()`);
    await sleep(400);
    const categoryClicked = await win.webContents.executeJavaScript(`(() => {
      const btn = Array.from(document.querySelectorAll('[role="listbox"] button')).find(
        (b) => b.textContent.trim().startsWith('wan2.2')
      );
      if (btn) btn.click();
      return !!btn;
    })()`);
    await sleep(400);
    const optionClicked = await win.webContents.executeJavaScript(`(() => {
      const option = Array.from(document.querySelectorAll('[role="option"]')).find(
        (o) => o.textContent.includes('Wan2.2')
      );
      if (option) option.click();
      return !!option;
    })()`);
    await sleep(600);
    const wanPanel = await win.webContents.executeJavaScript(`(() => {
      const text = document.body.innerText;
      return {
        duration: text.includes('时长'),
        limit: text.includes('时长必须 ≤ 5 秒'),
        startImage: text.includes('起始图片'),
      };
    })()`);
    check("工作流下拉可展开大分类", categoryClicked === true);
    check("可选择 wan2.2 工作流", optionClicked === true);
    check("wan2.2 出现时长参数", wanPanel.duration === true);
    check("时长上限提示 ≤ 5 秒", wanPanel.limit === true);
    check("切换工作流后仍保留起始图片", wanPanel.startImage === true);

    if (consoleErrors.length > 0) {
      console.log("--- 渲染进程 console 错误 ---");
      consoleErrors.slice(0, 10).forEach((line) => console.log("  " + line));
    }

    const allPassed = results.every((r) => r.ok);
    console.log(allPassed ? "TASK SMOKE OK ✓" : "TASK SMOKE FAILED ✗");
    app.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error("SMOKE_FAIL", error);
    app.exit(1);
  }
});
