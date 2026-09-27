/**
 * 逃逸断言：主进程里还剩多少文件带着 // @ts-nocheck。
 *
 * 规则：数量只能减少，不能增加。新增逃逸会让本地 `pnpm check` 直接失败。
 *
 * 判定方式：只认**文件第一行的 `// @ts-nocheck`**（与 tsc 的生效条件一致）。
 * 不用 `content.includes()` —— 那会把注释、字符串、模板字面量里提到该词的文本也算进来。
 */
const fs = require("fs");
const path = require("path");

const TARGET_DIR = path.resolve(__dirname, "..");
const BASELINE = 0; // 随文件转正逐步递减，最终为 0

const SKIP_DIRS = new Set(["node_modules", "dist", "release", "bin", "scripts"]);

/**
 * 递归收集目标目录下的 .js 文件
 * @param {string} dir 起始目录
 * @param {string[]} [acc] 累加器
 * @returns {string[]} 绝对路径列表
 */
function findJsFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) findJsFiles(path.join(dir, entry.name), acc);
    } else if (entry.name.endsWith(".js")) {
      acc.push(path.join(dir, entry.name));
    }
  }
  return acc;
}

/**
 * 文件第一行（去掉 BOM 与行尾 CR）是否为 // @ts-nocheck
 * @param {string} filePath
 * @returns {boolean}
 */
function startsWithNoCheck(filePath) {
  const firstLine = fs.readFileSync(filePath, "utf8").split("\n", 1)[0];
  return firstLine.replace(/^\uFEFF/, "").trim() === "// @ts-nocheck";
}

const allFiles = findJsFiles(TARGET_DIR);
const offending = allFiles
  .filter(startsWithNoCheck)
  .map((file) => path.relative(TARGET_DIR, file).replace(/\\/g, "/"))
  .sort();

console.log(
  `[nocheck] 带 @ts-nocheck 的文件: ${offending.length} / ${allFiles.length}（baseline: ${BASELINE}）`
);

if (offending.length > BASELINE) {
  console.error("[nocheck] ❌ 出现新增逃逸：");
  for (const file of offending) console.error(`  - ${file}`);
  process.exit(1);
}

if (offending.length === 0) {
  console.log("[nocheck] ✅ 主进程 26 个文件全部纳入类型检查");
} else {
  console.log("[nocheck] 剩余待转正：");
  for (const file of offending) console.log(`  - ${file}`);
  if (offending.length < BASELINE) {
    console.log(
      `[nocheck] 已减少 ${BASELINE - offending.length} 个，请把 BASELINE 下调为 ${offending.length}`
    );
  }
}
