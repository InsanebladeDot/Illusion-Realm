/**
 * 检查：词条表里有没有「登记了但没人用」的 key。
 *
 * 背景：各批迁移都单独声明过「0 unused」，但词条表被十几批 + 手工改动反复追加过，
 * 需要一次全局复核。用法：node scripts/find-unused-keys.mjs
 *
 * 判定方式：把叶子的点分路径拼成**带命名空间前缀**的完整 key
 * （如 `cartoon.page.title`），再在 src（除 i18n 自身）里搜带引号的同名字符串。
 * 注意：数据文件里存 MessageKey 的写法也算引用（key 会以字符串形式出现在那里）。
 * 局限：不覆盖运行期拼出来的 key；结论需人工眼看一遍。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..");
const SRC = path.join(APP, "src");
const CATALOG_DIR = path.join(SRC, "i18n", "locales", "zh-CN");

function walk(dir, out = [], filter = () => true) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out, filter);
    else if (filter(entry.name)) out.push(full);
  }
  return out;
}

/**
 * 收集一段词条表源码里的叶子 key（带命名空间前缀）—— **纯函数**，便于自检。
 * 只认「属性名是标识符、初值是字符串字面量」的叶子；
 * 嵌套对象递归自己的属性（避免同一节点在通用递归里被记两次）。
 */
export function collectKeysFromSource(sourceText, ns) {
  const keys = [];
  const sf = ts.createSourceFile(
    `${ns}.ts`,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  const visit = (node, trail) => {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
      const next = [...trail, node.name.text];
      if (ts.isObjectLiteralExpression(node.initializer)) {
        for (const child of node.initializer.properties) visit(child, next);
      } else if (ts.isStringLiteral(node.initializer)) {
        keys.push({ ns, key: `${ns}.${next.join(".")}` });
      }
      return;
    }
    ts.forEachChild(node, (child) => visit(child, trail));
  };
  visit(sf, []);
  return keys;
}

/** 收集词条表叶子的完整 key（带命名空间前缀） */
function collectKeys() {
  const keys = [];
  for (const file of walk(CATALOG_DIR, [], (n) => n.endsWith(".ts") && n !== "index.ts")) {
    const ns = path.basename(file, ".ts");
    keys.push(...collectKeysFromSource(fs.readFileSync(file, "utf8"), ns));
  }
  return keys;
}

/** 收集 src 里出现的所有带引号字符串（作为「被引用」的证据） */
function collectUsages() {
  const used = new Set();
  const files = walk(
    SRC,
    [],
    (n) => /\.tsx?$/.test(n)
  ).filter((f) => !f.includes(`${path.sep}i18n${path.sep}`));

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(/["'`]([a-zA-Z][\w.]*)["'`]/g)) used.add(m[1]);
  }
  return used;
}

/** 主流程：被 import 时只导出工具函数，不自作主张跑一遍 */
export function findUnusedKeys() {
  const keys = collectKeys();
  const used = collectUsages();
  const seen = new Set();
  const unused = keys.filter(({ key }) => {
    if (seen.has(key)) return false;
    seen.add(key);
    return !used.has(key);
  });
  return { total: seen.size, unused };
}

function main() {
  const { total, unused } = findUnusedKeys();

  const byNs = new Map();
  for (const item of unused) {
    if (!byNs.has(item.ns)) byNs.set(item.ns, []);
    byNs.get(item.ns).push(item.key);
  }

  console.log(`词条叶子 ${total} 个，未被引用的 ${unused.length} 个`);
  for (const [ns, list] of [...byNs].sort()) {
    console.log(`\n  ${ns} (${list.length})`);
    for (const key of list) console.log(`      ${key}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
