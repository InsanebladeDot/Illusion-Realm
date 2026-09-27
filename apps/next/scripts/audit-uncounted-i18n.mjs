/**
 * 一次性人工复查脚本：找出「含中文字符串字面量、但扫描器统计为 0」的文件。
 *
 * 用途：扫描器是启发式的（见 check-i18n.mjs 头部的「已知不覆盖」），
 * 用它反查有没有整类漏检，避免「文案已全部入表」这种结论说早了。
 *
 * 已知会产生误报：注释里带引号的中文（如 // 用 "引号" 说明）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanSource, walkSourceFiles } from "./check-i18n.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(HERE, "..", "src");
const I18N_DIR = `${path.join(SRC_DIR, "i18n")}${path.sep}`;
const CJK = /[\u4e00-\u9fff\u3400-\u4dbf]/;
const LITERAL = /"[^"\n]*"|'[^'\n]*'|`[^`]*`/g;

const rows = [];
for (const file of walkSourceFiles(SRC_DIR)) {
  if (file.startsWith(I18N_DIR)) continue;
  const text = fs.readFileSync(file, "utf8");
  if (!CJK.test(text)) continue;
  const counted = scanSource(file, text).count;
  if (counted > 0) continue;
  const hits = [];
  for (const match of text.matchAll(LITERAL)) {
    const inner = match[0].slice(1, -1);
    if (CJK.test(inner)) hits.push(inner.replace(/\s+/g, " ").slice(0, 60));
  }
  if (hits.length > 0) {
    rows.push({ file: path.relative(SRC_DIR, file).replace(/\\/g, "/"), hits });
  }
}

rows.sort((a, b) => a.file.localeCompare(b.file));
for (const row of rows) {
  console.log(`${row.file}  (${row.hits.length})`);
  for (const hit of row.hits) console.log(`    ${JSON.stringify(hit)}`);
}
console.log(`\n共 ${rows.length} 个文件存在「未被统计的中文字面量」`);
