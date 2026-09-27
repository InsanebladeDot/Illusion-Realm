/**
 * 构建收尾：记录当前源码指纹，供冒烟脚本的「产物过期」自检做内容比对。
 *
 * 由 `apps/next/package.json` 的 build 脚本在 `next build` 之后调用 ——
 * 必须是**构建之后**：指纹代表的是「这份产物是用哪份源码构建的」。
 *
 * 手动补记（产物已经是最新的，只是想消掉告警）：
 *   node scripts/record-build-fingerprint.js
 *
 * ## 反向对照：构建指纹本身是不是确定性的
 * `--compare` 会把这次算出的指纹与**上一次记录**比对，列出差异文件并在不同时 `exit 1`。
 * 用途（CI 上跑一次即可，本地不必每次跑）：
 *
 *   源码不变 → 连续两次 build → 指纹应当完全相同
 *
 * 为什么需要它：如果指纹里混进了非确定性输入（构建期生成的带时间戳的文件、遍历顺序不稳定等），
 * 自检就会**每次都说产物过期** —— 而这种报警最容易被人直接关掉或忽略，等于把这道防线拆了。
 *
 * 注意指纹只覆盖**源码**（不含 `out/`），所以这里的失败只会来自
 * 「源码树里被构建过程写脏的文件」，而不是 Next 产物里的构建时间戳 / 随机 BUILD_ID。
 */
const fs = require("fs");
const path = require("path");
const {
  EXPORT_DIR,
  RECORD_FILE,
  computeFingerprint,
  recordBuildFingerprint,
} = require("./lib/build-freshness");

/** 读上一次记录：必须在写入之前读，否则拿到的就是刚写进去的 */
function readPreviousRecord() {
  try {
    return JSON.parse(fs.readFileSync(RECORD_FILE, "utf8"));
  } catch {
    return null;
  }
}

const compare = process.argv.includes("--compare");
const previous = compare ? readPreviousRecord() : null;
const current = computeFingerprint();

if (compare && previous && previous.files) {
  const changed = [];
  for (const [file, hash] of Object.entries(current.files)) {
    if (!(file in previous.files)) changed.push(`${file}（新增）`);
    else if (previous.files[file] !== hash) changed.push(`${file}（内容已变）`);
  }
  for (const file of Object.keys(previous.files)) {
    if (!(file in current.files)) changed.push(`${file}（已删除）`);
  }
  if (changed.length > 0) {
    console.error(
      `[build-fingerprint] --compare：**构建产物非确定性** —— 源码没动，但有 ${changed.length} 个文件进入指纹且内容不同：`
    );
    for (const file of changed.slice(0, 20)) console.error(`  · ${file}`);
    console.error(
      "  处理方向：把这些文件移出指纹范围（若属构建期生成物），或在生成阶段去掉时间戳 / 随机量。"
    );
    console.error("  注意：对照失败时**不覆盖基准记录**（否则基准就不再对应任何一次构建）。");
    process.exit(1);
  }
  console.log(
    `[build-fingerprint] --compare：与上一次构建的源码指纹完全一致` +
      `（${Object.keys(current.files).length} 个文件）→ 构建指纹是确定性的`
  );
} else if (compare) {
  console.log("[build-fingerprint] --compare：没有上一次记录，本次作为基准（再跑一次才有对照）");
}

const fingerprint = recordBuildFingerprint({ fingerprint: current });

if (!fs.existsSync(path.join(EXPORT_DIR, "index.html"))) {
  console.error(
    `[build-fingerprint] 已记录指纹，但未找到静态导出产物：${EXPORT_DIR}\n` +
      "  若你要跑冒烟脚本，请确认导出步骤（next build，output: export）真的执行成功。"
  );
  process.exit(1);
}

console.log(`[build-fingerprint] 产物目录：${EXPORT_DIR}`);
console.log(`[build-fingerprint] 摘要：${fingerprint.summary}`);
