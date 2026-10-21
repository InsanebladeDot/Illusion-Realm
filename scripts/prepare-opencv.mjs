// 从锁定的 npm 包复制 OpenCV 单文件运行时及许可证，开发和打包都不需要访问 CDN。
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(join(root, "apps/next/package.json"));
const runtime = require.resolve("@techstark/opencv-js");
const target = join(root, "apps/next/public/vendor/opencv");
const workers = join(root, "apps/next/public/workers");
try {
  await mkdir(target, { recursive: true });
  await copyFile(runtime, join(target, "opencv.js"));
  await copyFile(join(dirname(runtime), "../LICENSE"), join(target, "LICENSE"));
  // 生成经典 Worker，避免开发 webpack 与构建 Turbopack 对 Worker 入口打包方式不同。
  const ts = require("typescript"), worker = join(root, "apps/next/src/workers/canny.worker.ts");
  const compiled = ts.transpileModule(await readFile(worker, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } });
  await mkdir(workers, { recursive: true });
  await writeFile(join(workers, "canny.js"), compiled.outputText);
  console.log("[prepare-opencv] Local OpenCV runtime and license ready");
} catch (error) {
  console.error("[prepare-opencv] Unable to prepare OpenCV", error instanceof Error ? error.message : "unknown error");
  process.exit(1);
}
