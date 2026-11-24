// Node 直接运行正式 TypeScript 算法，只隔离依赖桌面状态的翻译读取。
// 不替换骨架、插值、迁移或校验；用户文档永远不会被当作脚本执行。
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const nextRequire = createRequire(path.resolve(__dirname, "../../apps/next/package.json"));
const sharedRequire = createRequire(path.resolve(__dirname, "../../packages/shared/package.json"));
const ts = nextRequire("typescript"), cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  if (file.endsWith(".json")) return JSON.parse(fs.readFileSync(file, "utf8"));
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function("exports", "require", code)(exports, name => resolve(file, name));
  return exports;
}
function resolve(file, name) {
  if (name === "zod") return sharedRequire(name);
  if (name === "@/i18n") return { t: translate };
  // 测试媒体地址与保存适配时也加载正式纯逻辑，不为路径转换伪造返回值。
  if (name.startsWith("@/utils/")) return load(path.resolve(__dirname, "../../apps/next/src/utils", name.slice(8) + ".ts"));
  if (name.startsWith("@illusion-realm/shared/")) return load(path.resolve(__dirname, "../../packages/shared/src", name.slice(23) + ".ts"));
  if (name.startsWith(".")) {
    const target = path.resolve(path.dirname(file), name);
    if (fs.existsSync(target + ".js")) return require(target + ".js");
    return load(target.endsWith(".json") || target.endsWith(".ts") ? target : target + ".ts");
  }
  return nextRequire(name);
}
function translate(key, params = {}) {
  const dictionary = load(path.resolve(__dirname, "../../apps/next/src/i18n/locales/zh-CN/director.ts")).director;
  return Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), dictionary[key.slice(9)] ?? key);
}
module.exports = { load, nextRequire };
