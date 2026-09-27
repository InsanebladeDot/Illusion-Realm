/**
 * 摸底脚本（一次性）：统计真实历史图片的内嵌 Meta 分布。
 *
 * 用法：
 *   node scripts/survey-image-meta.mjs "<输出目录1>" "<输出目录2>" ...
 *
 * 判定口径严格对齐线上的读取路径，不另立标准：
 *   - 文本块：PNG 的 tEXt/iTXt 块（keyword + text），JPEG 走 EXIF UserComment 不在本脚本范围
 *   - 「能找到工作流」= 存在关键字属于 {prompt, workflow, Comment} 的文本块，
 *     且其 JSON 通过 isComfyApiPrompt 校验（与 utils/sdImageInspector/parseComfyWorkflow.ts 同判据）
 *   - 「WebUI 路径」= 存在关键字为 parameters 的文本块（A1111 内嵌参数）
 *
 * 分档：
 *   A 无任何文本块                     → 不可二创（外部导入 / 未经处理）
 *   B 有文本块但无可识别关键字          → 不可二创（别的工具写的块）
 *   C 有 Comfy 关键字但 JSON 校验不过   → 不可二创（UI 显示「非本生成器生成」）
 *   D 能校验出 Comfy API prompt 图      → 可二创
 *   E 有 parameters（A1111）           → 走 WebUI 回退路径，可二创
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const extractChunks = require("png-chunks-extract");
const pngChunkText = require("png-chunk-text");

const WORKFLOW_KEYS = new Set(["Comment", "workflow", "prompt"]);

function isComfyApiPrompt(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (entries.length === 0) return false;
  return entries.some(([, node]) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return false;
    return (
      typeof node.class_type === "string" &&
      node.inputs != null &&
      typeof node.inputs === "object" &&
      !Array.isArray(node.inputs)
    );
  });
}

function unwrapComfyApiPrompt(value) {
  if (isComfyApiPrompt(value)) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  for (const key of ["prompt", "workflow"]) {
    if (isComfyApiPrompt(value[key])) return value[key];
  }
  return null;
}

/** 读出 PNG 的文本块（tEXt + iTXt），返回 [{keyword, text}] */
function readTextChunks(file) {
  const buffer = fs.readFileSync(file);
  const isPng =
    buffer.length >= 8 &&
    buffer.readUInt32BE(0) === 0x89504e47 &&
    buffer.readUInt32BE(4) === 0x0d0a1a0a;
  if (!isPng) return null;

  const out = [];
  for (const chunk of extractChunks(new Uint8Array(buffer))) {
    if (chunk.name !== "tEXt" && chunk.name !== "iTXt") continue;
    try {
      const decoded = pngChunkText.decode(chunk.data);
      out.push({ keyword: decoded.keyword, text: decoded.text });
    } catch {
      out.push({ keyword: "", text: "" });
    }
  }
  return out;
}

function classify(file) {
  const chunks = readTextChunks(file);
  if (chunks === null) return { bucket: "非 PNG", keywords: [] };
  const keywords = chunks.map((c) => c.keyword);

  if (chunks.length === 0) return { bucket: "A 无任何文本块", keywords };

  const hasParameters = chunks.some((c) => c.keyword === "parameters");
  let comfy = null;
  let sawComfyKey = false;
  for (const chunk of chunks) {
    if (!WORKFLOW_KEYS.has(chunk.keyword)) continue;
    sawComfyKey = true;
    try {
      const parsed = unwrapComfyApiPrompt(JSON.parse(chunk.text));
      if (parsed) comfy = { keyword: chunk.keyword, nodes: Object.keys(parsed).length };
    } catch {
      /* 解析失败即视为校验不过 */
    }
  }

  if (comfy) return { bucket: "D 有可解析的 Comfy 图", keywords, comfy };
  if (sawComfyKey) return { bucket: "C 有 Comfy 关键字但校验不过", keywords };
  if (hasParameters) return { bucket: "E 有 A1111 parameters", keywords };
  return { bucket: "B 有文本块但无可识别关键字", keywords };
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(png|jpe?g|webp)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

/** 扫描时跳过的重目录 / 构建产物：它们里的图片是素材，不是用户语料 */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "out",
  "release",
  "dist",
  ".turbo",
  "build",
]);

/**
 * `--discover <根>`：在根下找「含本生成器产出图（`IR_<日期>_...`）」的目录，
 * 作为真实输出目录。这样分母只算用户能看到的那批图，
 * 不会把 node_modules / src/assets 里的图标算进「无内嵌 Meta」那一档。
 */
function discoverOutputDirs(root) {
  const found = new Set();
  (function scan(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        scan(full);
      } else if (/^IR_\d{4}-\d{2}-\d{2}.*\.(png|jpe?g)$/i.test(entry.name)) {
        found.add(dir);
      }
    }
  })(root);
  return [...found].sort();
}

const rawArgs = process.argv.slice(2);
const roots = rawArgs.filter((a) => !a.startsWith("--"));

if (rawArgs.includes("--discover")) {
  const root = roots[0] ?? ".";
  const dirs = discoverOutputDirs(root);
  console.log(`在 ${root} 下发现 ${dirs.length} 个输出目录（含本生成器产出的图）：`);
  for (const dir of dirs) console.log(`  ${dir}`);
  console.log("\n请把上面这些目录作为参数再次运行本脚本以取得分档统计。\n");
  process.exit(dirs.length === 0 ? 1 : 0);
}

if (roots.length === 0) {
  console.error(
    "用法: node scripts/survey-image-meta.mjs <目录> [目录...] [--detail]\n" +
      "      node scripts/survey-image-meta.mjs --discover <根目录>"
  );
  process.exit(1);
}

const files = roots.flatMap((r) => (fs.existsSync(r) ? walk(r) : []));
const tally = new Map();
const keywordTally = new Map();
const detail = [];

for (const file of files) {
  const { bucket, keywords, comfy } = classify(file);
  tally.set(bucket, (tally.get(bucket) ?? 0) + 1);
  for (const k of new Set(keywords)) keywordTally.set(k, (keywordTally.get(k) ?? 0) + 1);
  detail.push({ file, bucket, keywords: [...new Set(keywords)].join("+"), comfy: comfy ? `${comfy.keyword}/${comfy.nodes}节点` : "" });
}

console.log(`扫描目录: ${roots.join("  |  ")}`);
console.log(`扫描时间: ${new Date().toISOString()}`);
console.log(`分母 N（实际能列出的图片总数） = ${files.length}\n`);

console.log("== 分档统计 ==");
for (const [bucket, count] of [...tally].sort()) {
  const pct = files.length ? ((count / files.length) * 100).toFixed(1) : "0.0";
  console.log(`  ${bucket.padEnd(28)} ${String(count).padStart(4)}  ${pct}%`);
}

console.log("\n== 出现过的文本块关键字 ==");
for (const [keyword, count] of [...keywordTally].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${(keyword || "(空)").padEnd(20)} ${count}`);
}

if (rawArgs.includes("--detail")) {
  console.log("\n== 逐文件 ==");
  for (const row of detail) {
    console.log(`  ${row.bucket.padEnd(28)} [${row.keywords}] ${row.comfy}  ${path.basename(row.file)}`);
  }
}
