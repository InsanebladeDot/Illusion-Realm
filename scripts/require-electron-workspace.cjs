// 桌面打包前确认包还在，避免 pnpm 没找到任务却返回成功，也避免白跑前端构建。
const { existsSync } = require("node:fs");
const { join } = require("node:path");

const manifest = join(__dirname, "..", "apps", "electron", "package.json");
if (!existsSync(manifest)) {
  console.error("Missing apps/electron/package.json. Restore the Electron workspace source and run pnpm install before packaging.");
  process.exitCode = 1;
}
