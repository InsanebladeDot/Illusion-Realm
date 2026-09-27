const { app, BrowserWindow } = require("electron");
const { registerAppProtocol } = require("../apps/electron/appProtocol");
registerAppProtocol();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 800, show: false });
  await win.loadURL("app://app/create");
  await sleep(4000);
  const img = await win.webContents.executeJavaScript(`document.body.innerText`);
  const has = (s) => img.includes(s);
  console.log("IMAGE MODE 工作流:", has("工作流"), "高级设置:", has("高级设置"), "种子:", has("种子"));
  await win.webContents.executeJavaScript(`(() => {
    const t = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '视频');
    if (t) t.click();
    return !!t;
  })()`);
  await sleep(1200);
  const vid = await win.webContents.executeJavaScript(`document.body.innerText`);
  const h = (s) => vid.includes(s);
  console.log("VIDEO MODE 工作流:", h("工作流"), "高级设置:", h("高级设置"), "种子:", h("种子"), "分辨率:", h("分辨率（宽 x 高）"));
  app.exit(0);
});
