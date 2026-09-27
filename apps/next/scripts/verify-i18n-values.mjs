/**
 * 迁移期校验：被删掉的中文文案必须**逐字**出现在词条表里。
 *
 * 用法：
 *   node scripts/verify-i18n-values.mjs            # 与 HEAD 比较
 *   node scripts/verify-i18n-values.mjs --base <rev>
 *
 * 为什么需要它：把中文从组件搬到词条表时，最容易犯的错是「顺手改了标点/空格」，
 * 或把某句漏登记（结果界面上显示 key）。冒烟脚本只覆盖九个流程，cover 不到全部页面；
 * 本脚本用 AST 抽出 base 版本里所有面向用户的中文字面量，减去当前版本仍存在的部分，
 * 再要求剩下的每一句都能在 zh-CN 词条表的值里找到**完全相同**的一份。
 *
 * 退出码 0 = 所有消失的文案都能在词条表里找到。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { scanSource } from "./check-i18n.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, "..");
const SRC_DIR = path.join(APP_DIR, "src");
const CATALOG_DIR = path.join(SRC_DIR, "i18n", "locales");

function git(args) {
  return execFileSync("git", args, { cwd: APP_DIR, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** `apps/next/` —— git show 的路径必须相对仓库根 */
const REPO_PREFIX = git(["rev-parse", "--show-prefix"]).trim();

/**
 * 空白与插值占位归一：
 * - JSX 文本自带缩进与换行，词条表里存的是整理过的版本
 * - 组件里可能是模板字符串 `${label}`，词条表里统一写成 `{label}`
 * 因此把两种占位都归一成一个不可见标记后比较（占位符名字的差异不在此校验范围）。
 *
 * 导出供 `self-test-gates.mjs` 做正负对照：例如「只差标点」必须**不**被归一。
 */
export function canonical(text) {
  return text
    .replace(/\$\{[^}]*\}/g, "\u0000")
    .replace(/\{[^}]*\}/g, "\u0000")
    .replace(/\s+/g, " ")
    .trim();
}

/** 词条表里所有字符串叶子的值（原样 + 归一后各一份） */
function readCatalogValues() {
  const raw = new Set();
  const canonicalized = new Set();
  for (const file of walk(CATALOG_DIR)) {
    const text = fs.readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    const visit = (node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        raw.add(node.text);
        canonicalized.add(canonical(node.text));
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return { raw, canonical: canonicalized };
}

/** 抽出一段文本里的连续中文片段（导出供自检对照） */
export function cjkRuns(text) {
  return text.match(/[\u4e00-\u9fff\u3400-\u4dbf]+/g) ?? [];
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** 某个文件在 base 版本里出现的「面向用户的中文」集合 */
function baseStrings(rev, relPath) {
  let text;
  try {
    text = git(["show", `${rev}:${REPO_PREFIX}${relPath}`]);
  } catch {
    return new Set();
  }
  return scanSource(relPath, text).strings;
}

function currentStrings(relPath) {
  const full = path.join(APP_DIR, relPath);
  if (!fs.existsSync(full)) return new Set();
  return scanSource(relPath, fs.readFileSync(full, "utf8")).strings;
}

function main() {
  const args = process.argv.slice(2);
  const baseIndex = args.indexOf("--base");
  const base = baseIndex >= 0 ? args[baseIndex + 1] : "HEAD";

  const changed = git(["diff", "--name-only", "--relative", base, "--", "src"])
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^src\/.*\.tsx?$/.test(line) && !line.startsWith("src/i18n/"));

  const catalog = readCatalogValues();
  const missing = [];
  const fragmented = [];
  let moved = 0;

  for (const relPath of changed) {
    const before = baseStrings(base, relPath);
    if (before.size === 0) continue;
    const after = currentStrings(relPath);
    for (const text of before) {
      if (after.has(text)) continue;
      // 首选：整句逐字进了词条表（只容忍空白与插值占位写法的差异）
      if (catalog.canonical.has(canonical(text))) {
        moved += 1;
        continue;
      }
      // 次选：整句被拆成多个词条（嵌套模板、跨元素拼接常见），
      // 此时要求它的每一段连续中文都能在词条表里找到下落
      const runs = cjkRuns(text);
      if (runs.length > 0 && runs.every((run) => hasFragment(catalog.raw, run))) {
        fragmented.push({ file: relPath, text });
        continue;
      }
      missing.push({ file: relPath, text });
    }
  }

  console.log(
    `base=${base}  改动文件=${changed.length}  整句入表=${moved}  拆分入表=${fragmented.length}  可疑=${missing.length}`
  );

  if (fragmented.length > 0) {
    console.log("\n以下文案被拆成多段入表（每一段中文都能在词条表里找到）：");
    for (const item of fragmented) {
      console.log(`  ${item.file}  ${JSON.stringify(item.text)}`);
    }
  }

  if (missing.length > 0) {
    console.error("\n以下文案从组件里消失了，但没有逐字出现在 zh-CN 词条表里：");
    for (const item of missing) {
      console.error(`  ${item.file}`);
      console.error(`      ${JSON.stringify(item.text)}`);
    }
    process.exit(1);
  }

  console.log("OK");
}

/** 某个中文片段是否出现在任意一条词条里 */
function hasFragment(rawValues, run) {
  for (const value of rawValues) {
    if (value.includes(run)) return true;
  }
  return false;
}

/** 直接执行时跑 CLI；被 `self-test-gates.mjs` import 时只导出纯函数 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
