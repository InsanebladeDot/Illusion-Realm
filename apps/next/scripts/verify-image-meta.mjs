/**
 * 图片内嵌 Meta 的**格式契约**校验 —— 失败即 exit 1，已接进 `pnpm check`。
 *
 * 为什么需要它：落盘格式的改动（多一个块、少一个字段、版本号变了）在本项目里
 * 没有任何自动断言兜着，症状只会在用户点「二创」时才暴露。本脚本把格式约定
 * 变成可机检的三类断言：
 *
 *   1. 静态一致性：源码里的约定没有被改坏（标记关键字、版本常量、遗留版本推理）
 *   2. 夹具往返：合成 PNG（无标记 / v1 标记 / 未来版本标记）→ 读取判定符合预期
 *   3. 真实语料 golden baseline：对真实输出目录里的图断言可解析（语料不存在时跳过）
 *
 * 覆盖边界（如实记录）：
 * - 断言 2、3 用的是**本脚本独立实现**的读取器（判据与 `parseComfyWorkflow.ts` 一致），
 *   因此它验证的是**格式约定**，不执行渲染进程的 TS 读取代码。渲染侧的端到端覆盖
 *   依赖 `scripts/smoke-anima-workflow.js`（它生成图片后从内嵌 Meta 反解参数）。
 * - 断言 3 在 CI/无输出目录的机器上会跳过，不算失败。
 *
 * 用法：
 *   node apps/next/scripts/verify-image-meta.mjs                 # 全部
 *   node apps/next/scripts/verify-image-meta.mjs --corpus <目录> # 指定语料目录
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const extractChunks = require("png-chunks-extract");
const pngChunkText = require("png-chunk-text");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, "..");
const MARKER_KEYWORD = "illusionRealmMeta";
const WORKFLOW_KEYS = new Set(["Comment", "workflow", "prompt"]);

const failures = [];
const notes = [];
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures.push(name);
}

/* ---------------------------------- 独立读取器 ---------------------------------- */

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

function hasPngSignature(buffer) {
  return (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  );
}

/**
 * 读文本块。**不是可解析的 PNG 时返回 null**，而不是抛出去 ——
 * 输出目录里出现 JPEG、或改名的损坏文件是常态，
 * 校验器不该因此崩在 `Invalid .png file header` 上（这正是它修前的行为）。
 */
function readTextChunks(buffer) {
  if (!hasPngSignature(buffer)) return null;
  const out = [];
  try {
    for (const chunk of extractChunks(new Uint8Array(buffer))) {
      if (chunk.name !== "tEXt" && chunk.name !== "iTXt") continue;
      out.push(pngChunkText.decode(chunk.data));
    }
  } catch {
    return null;
  }
  return out;
}

/** 与 metaMarker.ts 同语义的读取判定（含「无标记 = 遗留版本」推理） */
function readMetaState(buffer, legacyVersion) {
  const chunks = readTextChunks(buffer);
  if (chunks === null) {
    return {
      notPng: true,
      keywords: [],
      marker: null,
      metaVersion: null,
      workflow: null,
    };
  }

  const markerChunk = chunks.find((c) => c.keyword === MARKER_KEYWORD);
  let marker = null;
  if (markerChunk) {
    try {
      const parsed = JSON.parse(markerChunk.text);
      if (parsed && typeof parsed === "object" && typeof parsed.version === "number") {
        marker = parsed;
      }
    } catch {
      marker = null;
    }
  }

  let workflow = null;
  for (const chunk of chunks) {
    if (!WORKFLOW_KEYS.has(chunk.keyword)) continue;
    try {
      const parsed = unwrapComfyApiPrompt(JSON.parse(chunk.text));
      if (parsed) workflow = { keyword: chunk.keyword, json: chunk.text, nodes: parsed };
    } catch {
      /* 解析不了就继续看下一块 */
    }
  }

  return {
    notPng: false,
    keywords: chunks.map((c) => c.keyword),
    marker,
    metaVersion: marker?.version ?? legacyVersion,
    workflow,
  };
}

/* ------------------------------- 1. 静态一致性 ------------------------------- */

function readSource(relPath) {
  return fs.readFileSync(path.join(APP_DIR, relPath), "utf8");
}

function assertStaticConsistency() {
  const markerSrc = readSource("src/utils/sdImageInspector/metaMarker.ts");
  const typeSrc = readSource("../../packages/shared/src/types/generatedImageMeta.ts");
  const embedSrc = readSource("src/utils/sdImageInspector/embedComfyPrompt.ts");
  const saveSrc = readSource("src/utils/saveGeneratedImages.ts");
  const inspectSrc = readSource("src/utils/sdImageInspector/inspectSdImage.ts");

  const versionMatch = typeSrc.match(/GENERATED_IMAGE_META_VERSION\s*=\s*(\d+)/);
  const currentVersion = versionMatch ? Number(versionMatch[1]) : null;
  check("能从源码读出 GENERATED_IMAGE_META_VERSION", currentVersion != null, String(currentVersion));

  check(
    "标记关键字与校验脚本一致",
    markerSrc.includes(`"${MARKER_KEYWORD}"`),
    MARKER_KEYWORD
  );
  check(
    "遗留版本推理等于当前版本（无标记的图按当前版本处理）",
    /LEGACY_META_VERSION\s*=\s*GENERATED_IMAGE_META_VERSION/.test(markerSrc),
    `v${currentVersion}`
  );
  check(
    "版本标记写进独立块，不改动 prompt 块",
    embedSrc.includes("META_MARKER_KEYWORD") &&
      embedSrc.includes('new Set(["prompt", META_MARKER_KEYWORD])'),
    "EMBED_KEYWORDS"
  );
  check(
    "生成保存时带上版本标记",
    /embedComfyPromptInPngBlob\(blob,\s*metaDocument\.workflow,\s*\{/.test(saveSrc),
    "saveGeneratedImages"
  );
  check(
    "读取侧把标记块排除出展示字段",
    inspectSrc.includes("NON_PARAM_CHUNK_TYPES") &&
      inspectSrc.includes("!NON_PARAM_CHUNK_TYPES.has(chunk.keyword)") &&
      inspectSrc.includes("metaVersion"),
    "inspectSdImage"
  );
  check(
    "自管理块清单存在且包含标记块（新增块必须登记，否则会改变分档）",
    /NON_PARAM_CHUNK_TYPES[^=]*=\s*new Set<string>\(\[\s*META_MARKER_KEYWORD/.test(
      inspectSrc
    ),
    "NON_PARAM_CHUNK_TYPES"
  );

  // 采集阶段留下的坑：这 3 个文件里不能再出现中文字面量（标识与文案已分离）
  const cjk = /[\u4e00-\u9fff]/;
  for (const rel of [
    "src/utils/sdImageInspector/inspectSdImage.ts",
    "src/utils/remixFromInspect.ts",
    "src/view/inspect/MetaFieldRow.tsx",
  ]) {
    const src = readSource(rel);
    const offenders = src
      .split(/\r?\n/)
      .filter((line) => cjk.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line));
    check(`字段标识已与文案分离（无中文字面量）: ${path.basename(rel)}`, offenders.length === 0,
      offenders.length ? offenders[0].trim().slice(0, 40) : "");
  }

  return currentVersion;
}

/* -------------------------------- 2. 夹具往返 -------------------------------- */

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(name, data) {
  const type = Buffer.from(name, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([len, type, data, crc]);
}

/** 合成一张最小 PNG：1×1 灰度，附加给定文本块 */
function buildPng(textChunks) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  // 1×1 灰度、zlib 压缩的空扫描行（IDAT 只要合法即可，本脚本不解码像素）
  const idatBody = Buffer.from([0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01]);

  const parts = [PNG_SIGNATURE, chunk("IHDR", ihdr)];
  for (const [keyword, text] of textChunks) {
    // png-chunk-text 的 encode 返回 { name, data }，不是 Buffer
    const encoded = pngChunkText.encode(keyword, text);
    parts.push(chunk("tEXt", Buffer.from(encoded.data)));
  }
  parts.push(chunk("IDAT", idatBody), chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(parts);
}

function assertFixtures(currentVersion) {
  const workflow = {
    "3": { class_type: "KSampler", inputs: { seed: 1, steps: 20 } },
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "a.safetensors" } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: "masterpiece" } },
  };
  const workflowJson = JSON.stringify(workflow);

  // 2a. 当前格式：prompt + 标记
  const current = buildPng([
    ["prompt", workflowJson],
    [MARKER_KEYWORD, JSON.stringify({ version: currentVersion, promptId: "abc123" })],
  ]);
  const currentState = readMetaState(current, currentVersion);
  check("当前格式：标记块可解析出版本", currentState.marker?.version === currentVersion,
    `v${currentState.marker?.version}`);
  check("当前格式：能读出 promptId", currentState.marker?.promptId === "abc123");
  check("当前格式：工作流图仍可解析", currentState.workflow != null,
    `${currentState.workflow?.nodes != null ? Object.keys(currentState.workflow.nodes).length + " 节点" : ""}`);

  // 2b. 遗留格式：只有 prompt，没有标记（标记机制落地前产出的图）
  const legacy = buildPng([["prompt", workflowJson]]);
  const legacyState = readMetaState(legacy, currentVersion);
  check("遗留格式：没有标记块", legacyState.marker === null && !legacyState.keywords.includes(MARKER_KEYWORD));
  check("遗留格式：版本按当前版本推理（旧图仍可二创）", legacyState.metaVersion === currentVersion,
    `v${legacyState.metaVersion}`);
  check("遗留格式：工作流图仍可解析", legacyState.workflow != null);

  // 2c. 未来格式：版本高于当前 → 必须能被识别为「读不了」，不能伪装成普通外来图
  const future = buildPng([
    ["prompt", workflowJson],
    [MARKER_KEYWORD, JSON.stringify({ version: currentVersion + 1, promptId: "future" })],
  ]);
  const futureState = readMetaState(future, currentVersion);
  check("未来格式：版本号高于当前可识别", futureState.metaVersion === currentVersion + 1,
    `v${futureState.metaVersion} > v${currentVersion}`);
  check(
    "未来格式：会被版本闸门拦下（不做二创）",
    !(futureState.metaVersion <= currentVersion)
  );

  // 2d. 标记块不能被当成展示字段泄漏到界面上
  check(
    "标记块不出现在可展示字段里（读取侧已过滤）",
    readSource("src/utils/sdImageInspector/inspectSdImage.ts").includes(
      "!NON_PARAM_CHUNK_TYPES.has(chunk.keyword)"
    ),
    "NON_PARAM_CHUNK_TYPES 过滤"
  );

  return { current, legacy, future };
}

/* ---------------------------- 3. 真实语料 golden baseline ---------------------------- */

function walkImages(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkImages(full, out);
    else if (/\.(png|jpe?g|webp)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function resolveCorpusRoots() {
  const roots = [];
  process.argv.forEach((arg, index) => {
    if (arg === "--corpus" && process.argv[index + 1]) roots.push(process.argv[index + 1]);
  });
  if (roots.length > 0) return roots;

  // 默认：开发态与打包版的默认输出目录（存在才统计）。
  // 假设：开发态的「软件目录」= 工作区根，输出目录与它同级 —— 即工作区根的**上一级**。
  const base = path.resolve(APP_DIR, "..", "..", "..");
  return [
    path.join(base, "Illusion Realm Output"),
    path.join(base, "illusion Realm_exe", "win-unpacked Output"),
  ].filter((dir) => fs.existsSync(dir));
}

/** 语料目录的 git sha（用于说明这份基线是哪次提交下测的） */
function corpusGitSha() {
  try {
    return require("node:child_process")
      .execFileSync("git", ["rev-parse", "--short", "HEAD"], {
        cwd: APP_DIR,
        encoding: "utf8",
      })
      .trim();
  } catch {
    return null;
  }
}

/** 短 hash：让「语料是否同一批」从特例判断变成可核对的事实 */
function shortHash(text) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const BASELINE_PATH = path.resolve(APP_DIR, "..", "..", "logs", "meta-baseline.json");

/**
 * 写一份基线快照并**对比上次**，把漂移打出来。
 *
 * 为什么写到 logs/ 而不是入库：语料目录在仓库**之外**（用户的输出目录），
 * 逐项列表是机器相关的 —— 提交进仓库后 CI 上根本对不上，还会在每次应用生成新图时
 * 产生噪音 diff。放到本地 logs/ 后：本机能 diff 出漂移，PR 里则看打印出来的摘要行
 * （「新增 N 条 / 消失 M 条 / 新出现 K 条不可解析」）。
 * 若将来要入库，只需改这一个常量。
 */
function writeBaselineAndReportDrift(roots, entries, currentVersion) {
  /**
   * 两个指纹，语义**刻意分开**（别把前者当成跨机器可比的东西）：
   *
   * - `rootsPathHash`：hash 的是**目录路径字符串** —— 只回答「这次和上次是不是在
   *   看同一批目录」。换机器、换 checkout 路径它必然变，所以它**不支持跨机器比对**，
   *   作用就是防止「手滑切了 --corpus 目录」被误读成语料漂移。
   * - `itemsContentHash`：hash 的是**内容级清单**（文件名 + 分档 + 版本），
   *   不带路径，因此跨机器 / 跨分支可比 —— 「是不是同一批语料」看它。
   */
  const rootsPathHash = shortHash(roots.join("|"));
  const itemsContentHash = shortHash(
    entries
      .map((entry) => `${entry.file}:${entry.bucket}:${entry.metaVersion ?? "-"}`)
      .sort()
      .join("|")
  );

  const snapshot = {
    date: new Date().toISOString().slice(0, 10),
    gitSha: corpusGitSha(),
    metaVersion: currentVersion,
    roots,
    rootsPathHash,
    itemsContentHash,
    count: entries.length,
    parseable: entries.filter((entry) => entry.parseable).length,
    items: entries,
  };

  let previous = null;
  try {
    previous = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  } catch {
    previous = null;
  }

  if (previous && Array.isArray(previous.items)) {
    /**
     * 语料目录不同就不比漂移：换 `--corpus` 或换了输出目录时，
     * 逐项 diff 只会打出「消失 N 条 / 新增 N 条」这种纯噪音
     * （这不是漂移，是换了观察对象）。
     *
     * 判据用 hash 而不是字符串比较：这样「同一批语料」是可核对的数据，
     * 跨机器 / 跨分支比对时也能一眼看出观察对象是否变了。
     */
    const sameCorpus = previous.rootsPathHash
      ? previous.rootsPathHash === rootsPathHash
      : Array.isArray(previous.roots) && previous.roots.join("|") === roots.join("|");
    if (!sameCorpus) {
      console.log(
        `基线漂移：语料目录与上次不同（路径指纹 ${previous.rootsPathHash ?? "?"} → ${rootsPathHash}），` +
          `跳过对比并重建基线（换目录不是漂移）`
      );
      writeSnapshotOnly(snapshot);
      return;
    }

    const before = new Map(previous.items.map((item) => [item.file, item]));
    const after = new Map(entries.map((item) => [item.file, item]));
    const added = [...after.keys()].filter((key) => !before.has(key));
    const removed = [...before.keys()].filter((key) => !after.has(key));
    const becameUnparseable = [...after.entries()]
      .filter(([key, item]) => before.get(key)?.parseable === true && !item.parseable)
      .map(([key]) => key);

    console.log(
      `基线漂移（对比 ${previous.date}，N ${previous.count} → ${entries.length}）：` +
        ` 新增 ${added.length} 条` +
        `，消失 ${removed.length} 条` +
        `，新出现不可解析 ${becameUnparseable.length} 条` +
        `\n  路径指纹 ${rootsPathHash}（未变，仅本机可比）  内容指纹 ${previous.itemsContentHash ?? "?"} → ${itemsContentHash}` +
        `${previous.itemsContentHash === itemsContentHash ? "（未变）" : ""}`
    );
    if (added.length > 0) {
      console.log(`  新增：${added.slice(0, 5).join("、")}${added.length > 5 ? " …" : ""}`);
    }
    if (becameUnparseable.length > 0) {
      console.log(`  ⚠ 转为不可解析：${becameUnparseable.join("、")}`);
    }
    // 漂移本身不判失败（语料是活目录），但「由可解析转为不可解析」是明确的坏信号
    check(
      "没有语料从可解析变为不可解析",
      becameUnparseable.length === 0,
      becameUnparseable.slice(0, 3).join("、") || ""
    );
  } else {
    console.log(
      `基线漂移：无历史基线（首次运行，路径指纹 ${rootsPathHash} / 内容指纹 ${itemsContentHash}），` +
        `已写入 logs/meta-baseline.json`
    );
  }

  writeSnapshotOnly(snapshot);
}

/** 只写快照，不做对比（首次运行 / 换语料目录 / 对比完成后落盘） */
function writeSnapshotOnly(snapshot) {
  try {
    fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  } catch (error) {
    notes.push(`基线快照写入失败：${String(error)}`);
  }
}

function assertCorpus(currentVersion) {
  const roots = resolveCorpusRoots();
  if (roots.length === 0) {
    notes.push("真实语料不存在，跳过 golden baseline（这不算失败）");
    return;
  }

  const files = roots.flatMap((root) => walkImages(root));
  if (files.length === 0) {
    notes.push(`语料目录为空，跳过：${roots.join(" | ")}`);
    return;
  }

  const tally = new Map();
  const entries = [];
  for (const file of files) {
    const state = readMetaState(fs.readFileSync(file), currentVersion);
    /**
     * 非 PNG 不参与「全部可解析」断言：我们的写入路径只往 PNG 里嵌 Meta
     * （非 PNG 原样放行），所以输出目录里的 JPEG / WebP / 改名文件天然没有内嵌 Meta，
     * 那是预期行为、不是回归。单列一档报告，避免把预期行为判成失败。
     */
    const bucket = state.notPng
      ? "非 PNG（不参与断言）"
      : state.workflow
        ? "可解析"
        : state.keywords.length === 0
          ? "无文本块"
          : "有块但不可解析";
    tally.set(bucket, (tally.get(bucket) ?? 0) + 1);
    entries.push({
      file: path.basename(file),
      dir: path.basename(path.dirname(file)),
      /** null = 非 PNG，不参与漂移的「转为不可解析」判定 */
      parseable: state.notPng ? null : state.workflow != null,
      bucket,
      metaVersion: state.marker?.version ?? null,
    });
  }

  console.log(
    `\n真实语料 golden baseline：${roots.join(" | ")}，N=${files.length}` +
      [...tally].map(([k, v]) => ` ${k}=${v}`).join("")
  );
  // 只对 PNG 断言：PNG 里解析不出工作流，说明写入链路或格式约定变了。
  const unparsable = (tally.get("有块但不可解析") ?? 0) + (tally.get("无文本块") ?? 0);
  const pngCount = files.length - (tally.get("非 PNG（不参与断言）") ?? 0);
  check(
    `真实语料里的 PNG 全部可解析（PNG=${pngCount}，扫描于 ${new Date().toISOString().slice(0, 10)}）`,
    unparsable === 0,
    unparsable ? `${unparsable} 张不可解析` : ""
  );

  writeBaselineAndReportDrift(roots, entries, currentVersion);
}

/* ------------------------------ 4. 进程内往返 ------------------------------ */

/**
 * 用**真实模块**跑一遍「写入 → 读取」闭环：不生成真实图片、不碰 ComfyUI。
 *
 * 为什么要有这一段：写入路径原先只有 `scripts/smoke-anima-workflow.js` 覆盖，
 * 而那个套件要跑通「真实工作流 + 模型 + ComfyUI 服务」这条长链路，本机反复卡死。
 * 拿最不稳定的一环去测最该稳定的一环是错的 —— 这里直接import 源码本身：
 *   `embedComfyPromptInPng`（写）→ `inspectSdImageBuffer`（读）
 * 覆盖的是格式闭环，与生成链路解耦。
 *
 * 依赖 `lib/ts-resolve-hook.mjs` 解析 `@/*` 别名（Node 原生类型剥离 + 自定义解析）。
 */
async function assertRoundTrip(currentVersion) {
  const { register } = await import("node:module");
  const { pathToFileURL } = await import("node:url");
  const hookUrl = pathToFileURL(path.join(HERE, "lib", "ts-resolve-hook.mjs")).href;
  register(hookUrl);

  const importSrc = (relative) =>
    import(pathToFileURL(path.join(APP_DIR, "src", relative)).href);

  // 启动自检：先把要 import 的入口做一次传递别名检查，配置错了立刻报清楚
  const { assertAliasesResolvable, preflightAliases, ALIAS_ROOTS } = await import(
    hookUrl
  );
  const entries = [
    "utils/sdImageInspector/embedComfyPrompt.ts",
    "utils/sdImageInspector/inspectSdImage.ts",
    "utils/sdImageInspector/metaMarker.ts",
    "utils/sdImageInspector/metaFieldId.ts",
  ].map((rel) => path.join(APP_DIR, "src", rel));
  const checked = assertAliasesResolvable(entries);
  check(
    "别名自检：入口及其传递依赖全部可解析",
    checked > 0,
    `${checked} 个本地模块，候选根 ${ALIAS_ROOTS.length} 个`
  );

  // 负向对照：临时造一个引用不存在别名的文件，自检必须把它报出来。
  // 否则「自检永远通过」和「自检真的在工作」分不出来。
  const probeFile = path.join(os.tmpdir(), `alias-probe-${process.pid}.ts`);
  fs.writeFileSync(probeFile, 'import broken from "@/definitely/not/here";\n');
  const probe = preflightAliases([probeFile]);
  fs.rmSync(probeFile, { force: true });
  check(
    "别名自检：不存在的 specifier 必被报出（判据有区分度）",
    probe.missing.length === 1 &&
      probe.missing[0].specifier === "@/definitely/not/here",
    probe.missing.map((m) => m.specifier).join(",") || "未报出"
  );

  const { embedComfyPromptInPng } = await importSrc(
    "utils/sdImageInspector/embedComfyPrompt.ts"
  );
  const { inspectSdImageBuffer } = await importSrc(
    "utils/sdImageInspector/inspectSdImage.ts"
  );
  const { META_MARKER_KEYWORD, LEGACY_META_VERSION } = await importSrc(
    "utils/sdImageInspector/metaMarker.ts"
  );
  const { META_FIELD_ID } = await importSrc("utils/sdImageInspector/metaFieldId.ts");
  // `@/types/*` 由 apps/next/tsconfig 的第二段映射指向 packages/shared/src，钩子已处理
  const { GENERATED_IMAGE_META_VERSION } = await import("@/types/generatedImageMeta");

  check(
    "真实模块里的版本常量与校验脚本一致",
    GENERATED_IMAGE_META_VERSION === currentVersion,
    `v${GENERATED_IMAGE_META_VERSION}`
  );
  check(
    "真实模块里的遗留版本推理等于当前版本",
    LEGACY_META_VERSION === GENERATED_IMAGE_META_VERSION,
    `v${LEGACY_META_VERSION}`
  );

  const workflow = {
    "3": { class_type: "KSampler", inputs: { seed: 7, steps: 24 } },
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "m.safetensors" } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: "1girl" } },
  };
  const workflowJson = JSON.stringify(workflow);

  /** Buffer → ArrayBuffer（跨 realm 要用真正的 ArrayBuffer，不能是 SharedArrayBuffer 切片） */
  const toArrayBuffer = (buf) =>
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

  async function readBack(pngBuffer, label) {
    const result = await inspectSdImageBuffer(
      toArrayBuffer(pngBuffer),
      "image/png",
      "roundtrip.png",
      null
    );
    const chunk = readTextChunks(pngBuffer).find((c) => c.keyword === "prompt");
    return { result, promptChunkText: chunk?.text };
  }

  // 4a. 带标记（当前格式）：走一次真实写入
  const withMarker = Buffer.from(
    embedComfyPromptInPng(toArrayBuffer(buildPng([])), workflow, {
      version: GENERATED_IMAGE_META_VERSION,
      promptId: "roundtrip-1",
    })
  );
  const current = await readBack(withMarker, "current");

  check(
    "往返：写入的图片能被真实读取器读出当前版本",
    current.result.metaVersion === GENERATED_IMAGE_META_VERSION,
    `v${current.result.metaVersion}`
  );
  check(
    "往返：prompt 块逐字未被改动（等于送入的工作流 JSON）",
    current.promptChunkText === workflowJson,
    current.promptChunkText === workflowJson ? "" : "内容不一致"
  );
  check(
    "往返：标记块不会泄漏成展示字段",
    !current.result.fields.some((field) => field.key === META_MARKER_KEYWORD)
  );
  check(
    "往返：友好字段仍在（标记块不参与文本块分档）",
    current.result.metaType === "SD-WEBUI" &&
      current.result.fields.some((field) => field.key === META_FIELD_ID.prompt),
    `metaType=${current.result.metaType}`
  );

  // 4b. 不带标记（遗留格式）：同一张图、同样的写入路径，只是没传 marker
  const legacy = Buffer.from(
    embedComfyPromptInPng(toArrayBuffer(buildPng([])), workflow)
  );
  const legacyRead = await readBack(legacy, "legacy");

  check(
    "往返：无标记的图按遗留版本读出",
    legacyRead.result.metaVersion === LEGACY_META_VERSION,
    `v${legacyRead.result.metaVersion}`
  );
  check(
    "往返：新旧两种图的解析结果一致（旧图行为未变）",
    legacyRead.result.metaType === current.result.metaType &&
      legacyRead.result.fields.map((f) => f.key).join(",") ===
        current.result.fields.map((f) => f.key).join(","),
    `${legacyRead.result.fields.length} 字段`
  );

  // 4c. 重复落盘不堆叠标记块
  const twice = Buffer.from(
    embedComfyPromptInPng(toArrayBuffer(withMarker), workflow, {
      version: GENERATED_IMAGE_META_VERSION,
      promptId: "roundtrip-2",
    })
  );
  const markerCount = readTextChunks(twice).filter(
    (c) => c.keyword === META_MARKER_KEYWORD
  ).length;
  check("往返：重复写入不会堆叠标记块", markerCount === 1, `${markerCount} 个`);
}

/* --------------------------- 5. 分档契约（专用断言） --------------------------- */

/**
 * 专门盯住「文本块数量决定解析分档」这条边界 —— 它是最容易被静默改坏的地方：
 * 我们自己的元数据块若没在分档前剔除，新图会从「友好字段」退化成「原始 JSON 块列表」，
 * 而旧图完全正常，人工几乎不可能发现。
 *
 * 与往返断言的区别：往返是**顺带**覆盖到它，重构时容易被一起删掉；
 * 这里显式构造「参数块 + 标记块」的输入，把分档结果本身钉死。
 */
async function assertChunkBucketContract() {
  const { pathToFileURL } = await import("node:url");
  const importSrc = (relative) =>
    import(pathToFileURL(path.join(APP_DIR, "src", relative)).href);

  const { inspectSdImageBuffer } = await importSrc(
    "utils/sdImageInspector/inspectSdImage.ts"
  );
  const { META_FIELD_ID } = await importSrc("utils/sdImageInspector/metaFieldId.ts");
  const { META_MARKER_KEYWORD } = await importSrc(
    "utils/sdImageInspector/metaMarker.ts"
  );

  const toArrayBuffer = (buf) =>
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

  /** A1111 风格参数文本：单独一个块时会被切成三个友好字段 */
  const a1111Text =
    "masterpiece, 1girl\nNegative prompt: lowres\nSteps: 20, CFG scale: 7";
  const read = (pairs) =>
    inspectSdImageBuffer(
      toArrayBuffer(buildPng(pairs)),
      "image/png",
      "bucket.png",
      null
    );
  const paramKeysOf = (result) =>
    result.fields
      .map((field) => field.key)
      .filter(
        (key) =>
          key !== META_FIELD_ID.fileName &&
          key !== META_FIELD_ID.fileSize &&
          key !== META_FIELD_ID.rawParameters
      );

  // 5a. 基线：只有参数块
  const single = await read([["parameters", a1111Text]]);
  const baselineKeys = paramKeysOf(single);
  const promptValueOf = (result) =>
    result.fields.find((f) => f.key === META_FIELD_ID.prompt)?.value ?? "";

  check(
    "分档基线：单参数块切成三个友好字段且顺序不变",
    single.metaType === "SD-WEBUI" &&
      baselineKeys.join(",") ===
        [
          META_FIELD_ID.prompt,
          META_FIELD_ID.negativePrompt,
          META_FIELD_ID.otherParams,
        ].join(","),
    `${single.metaType} [${baselineKeys.join(",")}]`
  );
  check(
    "分档基线：提示词是切分结果而非整段原文",
    promptValueOf(single).trim() === "masterpiece, 1girl",
    JSON.stringify(promptValueOf(single))
  );
  check(
    "分档基线：负面提示词被切出来（不是兜底的「无」）",
    (
      single.fields.find((f) => f.key === META_FIELD_ID.negativePrompt)?.value ?? ""
    ).trim() === "lowres",
    JSON.stringify(
      single.fields.find((f) => f.key === META_FIELD_ID.negativePrompt)?.value
    )
  );

  // 5b. 契约：多一个自管理块（标记）后，分档结果必须与基线完全一致
  const marked = await read([
    ["parameters", a1111Text],
    [META_MARKER_KEYWORD, JSON.stringify({ version: 1, promptId: "bucket" })],
  ]);
  const markedKeys = paramKeysOf(marked);
  check(
    "分档契约：加了标记块后仍是三个友好字段、顺序不变（未退化为原始块列表）",
    marked.metaType === "SD-WEBUI" && markedKeys.join(",") === baselineKeys.join(","),
    `${marked.metaType} [${markedKeys.join(",")}]`
  );
  check(
    "分档契约：字段总数与基线一致（没有多出原始块字段）",
    marked.fields.length === single.fields.length,
    `单参数块 ${single.metaType} ${single.fields.length} 字段` +
      ` / 加标记块 ${marked.metaType} ${marked.fields.length} 字段`
  );
  check(
    "分档契约：标记块本身不出现在字段里",
    !marked.fields.some((f) => f.key === META_MARKER_KEYWORD)
  );
  check(
    "分档契约：提示词内容与基线一致",
    promptValueOf(marked) === promptValueOf(single)
  );

  // 5d. **单源绑定**：逐类型比对「过滤行为 ↔ NON_PARAM_CHUNK_TYPES」。
  //     光测「加标记块不翻档」是不够的 —— 若有人为了局部优化在过滤处内联一份
  //     硬编码列表，行为可以完全不变而契约已经分裂成两个真相来源，那时前面所有
  //     断言照样全绿。这里让实现与清单在物理上无法分叉。
  const { NON_PARAM_CHUNK_TYPES } = await importSrc(
    "utils/sdImageInspector/inspectSdImage.ts"
  );
  const KNOWN_CHUNK_TYPES = [
    META_MARKER_KEYWORD,
    "watermark",
    "copyright",
    "Comment",
    "workflow",
  ];
  for (const chunkType of KNOWN_CHUNK_TYPES) {
    const withType = await read([
      ["parameters", a1111Text],
      [chunkType, chunkType === "workflow" ? JSON.stringify({ a: 1 }) : "x"],
    ]);
    const behavesAsNonParam =
      withType.metaType === single.metaType &&
      withType.fields.length === single.fields.length;
    const listedAsNonParam = NON_PARAM_CHUNK_TYPES.has(chunkType);
    check(
      `单源：chunk "${chunkType}" 的过滤行为与 NON_PARAM_CHUNK_TYPES 一致` +
        `（清单${listedAsNonParam ? "含" : "不含"}该类型）`,
      behavesAsNonParam === listedAsNonParam,
      `行为=${behavesAsNonParam ? "被剔除" : "参与分档"}（${withType.metaType}/${withType.fields.length} 字段）`
    );
  }

  // 5c. 负向对照：证明「剔除标记块」这一步真的在起作用 ——
  //     把标记块换成普通块（不被剔除）时，分档必须**变成另一档**。
  //     若哪天剔除失效，5b 会失败；若哪天下游不再按块数分档，5c 会失败。
  const twoPlainChunks = await read([
    ["parameters", a1111Text],
    ["workflow", JSON.stringify({ note: "not-a-comfy-graph" })],
  ]);
  check(
    "分档契约：负向对照——两块输入确实走另一档（证明本断言的判据有区分度）",
    twoPlainChunks.metaType !== single.metaType ||
      twoPlainChunks.fields.length !== single.fields.length,
    `${single.metaType}/${single.fields.length} → ${twoPlainChunks.metaType}/${twoPlainChunks.fields.length}`
  );
}

/* ----------------------------------- 主流程 ----------------------------------- */

console.log("== 1. 静态一致性 ==");
const currentVersion = assertStaticConsistency();
console.log("\n== 2. 夹具往返（格式约定） ==");
assertFixtures(currentVersion ?? 1);
console.log("\n== 4. 进程内往返（真实写入 → 真实读取） ==");
await assertRoundTrip(currentVersion ?? 1);
console.log("\n== 5. 分档契约（文本块数量决定解析分档） ==");
await assertChunkBucketContract();
console.log("\n== 3. 真实语料 golden baseline ==");
assertCorpus(currentVersion ?? 1);

for (const note of notes) console.log(`\nNOTE: ${note}`);

if (failures.length > 0) {
  console.error(`\n格式契约校验失败 ${failures.length} 项：`);
  for (const name of failures) console.error(`  - ${name}`);
  process.exit(1);
}
console.log("\nOK");
void os;
void PNG_SIGNATURE;
