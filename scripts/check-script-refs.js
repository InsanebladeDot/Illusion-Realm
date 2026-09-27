/**
 * 「门禁不自毁」检查（纯 Node，进 `pnpm check`）：**package.json 里 scripts 引用的 JS 文件必须存在**。
 *
 * 为什么需要：本项目已经踩过一次 —— 用 shell 补丁给 `check` 链条加了 `pnpm check:locale`，
 * 但对应的 scripts 条目因为补丁没匹配上而**没加进去**，结果是「引用了一个不存在的脚本」，
 * 靠一次偶然的红屏才发现。这类错误的特点是：**门禁自己坏了，而它坏的方式看起来像代码问题**。
 *
 * 口径刻意保守（目标是「不自毁」，不是「校验脚本语法」）：
 *   · 只检查以 `.js` / `.mjs` / `.cjs` 结尾、且含 `/` 的 token（即明确的仓库内文件引用）；
 *   · 不做命令语法解析，因此复合命令（`a && b`）、带引号或 flag 的串都不会被误杀；
 *   · 扫根 + apps/* + packages/* 的 package.json（补丁往往加在子包里）。
 * 宁可漏（保守），不要误杀 —— 误杀会让这条门禁被关掉。
 */
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..");
// 允许被引号/空白/行尾收住（`node "scripts/c.cjs" --flag` 也要抽得到；
// 用 `$` 锚尾会漏掉带引号的写法 —— 这一条是被配对对照抓出来的）
const JS_FILE_PATTERN = /[\w./@-]+\.(?:js|mjs|cjs)(?=["'\s]|$)/g;

function packageJsonFiles() {
  const files = [path.join(REPO_ROOT, "package.json")];
  for (const group of ["apps", "packages"]) {
    const dir = path.join(REPO_ROOT, group);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(dir, entry.name, "package.json");
      if (fs.existsSync(candidate)) files.push(candidate);
    }
  }
  return files;
}

/** 抽出脚本值里引用的 JS 文件（保守口径，见文件头） */
function jsFileReferences(scriptValue) {
  if (typeof scriptValue !== "string") return [];
  const matches = scriptValue.match(JS_FILE_PATTERN) ?? [];
  // 过滤掉明明不是路径引用的情况（例如 `--inspect-brk=src/x.js` 里被连带的片段）
  return matches.filter((token) => token.includes("/") || token.startsWith("."));
}

function main() {
  const problems = [];
  /** 含 BOM 的 package.json：**warn 而非 error** —— BOM 本身是该修的脏东西，但不属于本检查要抓的缺陷 */
  const bomFiles = [];
  let checkedRefs = 0;
  const checkedFiles = [];

  for (const file of packageJsonFiles()) {
    let pkg;
    try {
      /**
       * 先剥 BOM 再 parse。为什么：Windows PowerShell 的 `-Encoding utf8` 会给文件写 BOM，
       * 而 `JSON.parse` 不容忍它（`require()` 容忍，所以整个生态跑得下去、只有这里会炸）。
       * 这类假红灯最危险 —— 它报的错误类别（解析失败）与它要抓的缺陷（悬空引用）完全不同，
       * 人会本能地往错的方向排查。所以：**剥掉它继续查真正的缺陷，同时单独 warn 出来**。
       */
      const rawWithBom = fs.readFileSync(file, "utf8");
      if (rawWithBom.startsWith("\uFEFF")) {
        bomFiles.push(path.relative(REPO_ROOT, file));
      }
      pkg = JSON.parse(rawWithBom.replace(/^\uFEFF/, ""));
    } catch (error) {
      problems.push(`${path.relative(REPO_ROOT, file)} 解析失败：${String(error)}`);
      continue;
    }
    checkedFiles.push(path.relative(REPO_ROOT, file));

    for (const [name, value] of Object.entries(pkg.scripts ?? {})) {
      for (const reference of jsFileReferences(value)) {
        checkedRefs += 1;
        const resolved = path.resolve(path.dirname(file), reference);
        if (!fs.existsSync(resolved)) {
          problems.push(
            `${path.relative(REPO_ROOT, file)} 的 scripts["${name}"] 引用了不存在的文件：${reference}`
          );
        }
      }
    }
  }

  // ---- 配对对照：证明抽取逻辑既不漏也不误杀 ----
  const controls = [
    ["抽出 node 脚本引用", jsFileReferences("node scripts/a.js").length, 1],
    ["抽出含 && 的复合命令里的引用", jsFileReferences("pnpm x && node scripts/b.mjs").length, 1],
    ["抽出带引号的引用", jsFileReferences('node "scripts/c.cjs" --flag').length, 1],
    ["不把裸命令当文件（next build）", jsFileReferences("next build").length, 0],
    ["不把 tsc 的配置当脚本引用", jsFileReferences("tsc --noEmit -p tsconfig.json").length, 0],
    ["不误杀 pnpm 子脚本（含冒号）", jsFileReferences("pnpm --filter x run check:i18n").length, 0],
  ];
  const controlFailures = [];
  for (const [label, actual, expected] of controls) {
    if (actual !== expected) controlFailures.push(`${label}（实际 ${actual}，期望 ${expected}）`);
  }

  if (controlFailures.length > 0) {
    console.error("scripts 存在性检查的配对对照失败（说明抽取逻辑本身有问题）：");
    for (const line of controlFailures) console.error(`  · ${line}`);
    process.exit(1);
  }

  if (problems.length > 0) {
    console.error("scripts 引用的文件缺失（门禁自毁风险）：");
    for (const line of problems) console.error(`  · ${line}`);
    console.error(
      "\n  修法：补上缺失的文件，或修掉 scripts 里的悬空引用。" +
        "典型来源是用补丁改 package.json 时只改了一半（改过 `check` 链但没加脚本条目）。"
    );
    process.exit(1);
  }

  console.log(
    `OK  scripts 引用检查：${checkedFiles.length} 个 package.json / ${checkedRefs} 处 JS 引用均存在` +
      `（对照 ${controls.length} 条）`
  );
  if (bomFiles.length > 0) {
    // warn 而非 error：BOM 是脏东西，但拦不住「引用不存在」这个本检查的目标。
    // 带计数并单独成行 —— 不带计数的 warn 在 CI 输出里三个月后就是背景噪声，等于没写。
    console.warn(
      `\n[警告] BOM 文件: ${bomFiles.length} 个 —— ${bomFiles.join(" / ")}\n` +
        "  `require()` 容忍 BOM、`JSON.parse` 不容忍 —— 某些工具读取时会炸，且报错指向「解析失败」，" +
        "与真正缺陷无关。修法：以无 BOM 的 UTF-8 重写（PowerShell 的 `-Encoding utf8` 会写 BOM，别用它改 JSON）。"
    );
  }
}

main();
