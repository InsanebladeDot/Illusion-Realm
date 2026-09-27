/**
 * 运行期验证：
 * 1) appProtocol 具名导出可用（主进程 require 解构不再为 undefined）
 * 2) ffmpeg/ffprobe 自动探测（手动 → PATH → 常见位置 → 内置）
 * 运行：npx electron scripts/verify-video-runtime.js
 */
const { app, protocol } = require("electron");
const { registerAppProtocol } = require("../apps/electron/appProtocol");
const { resolveTools } = require("../apps/electron/ffmpeg/locate");

let schemeOk = false;
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

check("appProtocol.registerAppProtocol 为函数（具名导出可用）", typeof registerAppProtocol === "function");
check("registerAppProtocol() 调用不抛错", (() => {
  try {
    registerAppProtocol();
    return true;
  } catch {
    return false;
  }
})());

app.whenReady().then(() => {
  const tools = resolveTools(null);
  console.log("resolveTools →", JSON.stringify(tools, null, 2));

  check("检测到 ffmpeg", Boolean(tools.ffmpegPath), tools.ffmpegPath ?? "未找到");
  check("检测到 ffprobe", Boolean(tools.ffprobePath), tools.ffprobePath ?? "未找到");
  check(
    "来源标记合法",
    ["manual", "path", "common", "bundled", null].includes(tools.source),
    String(tools.source)
  );

  const failed = results.filter((ok) => !ok).length;
  console.log(failed === 0 ? "ALL PASS ✓" : `${failed} FAILED ✗`);
  app.exit(failed === 0 ? 0 : 1);
});
