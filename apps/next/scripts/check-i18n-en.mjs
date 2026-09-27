/**
 * en 词条的**翻译进度 ratchet**：未翻译数只减不增。
 *
 * 为什么必须有它：en 目前是 zh-CN 的机械镜像（结构与键一致、值相同），
 * 这样 `Record<Locale, Messages>` 的全键约束立刻满足、界面也能切语言 ——
 * 但「切到 en 还是中文」这件事如果没人盯着，就会变成永久状态**且无人知道还差多少**。
 * 所以把「值与 zh-CN 相同」的叶子数记成基线：只能减。
 *
 * 判定口径：**递归展开叶子，值仍与 zh-CN 逐字相同**即视为未翻译。
 * 这个口径保守（有意为之）：真翻译出来的值一般不会与中文逐字相同；
 * 万一某条英文恰好与中文相同（如品牌名），把它算作未翻译只是让基线偏高，不会漏报。
 *
 * 用法：
 *   node apps/next/scripts/check-i18n-en.mjs           # 基线比对（超过基线即失败）
 *   node apps/next/scripts/check-i18n-en.mjs --list    # 按命名空间列出未翻译分布
 *   node apps/next/scripts/check-i18n-en.mjs --backlog # 把未翻译清单写成 docs/i18n-backlog.md
 *   node apps/next/scripts/check-i18n-en.mjs --rebase  # 翻译完成后把基线压到当前值（只允许调小）
 */
import fs from "fs";
import path from "path";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * 注册仓库自己的 TS 解析钩子，之后才能 import 渲染进程的 TS 源码
 * （`translate.ts` 里有 `./locales` 这类**目录导入**，裸 Node 会报 ERR_UNSUPPORTED_DIR_IMPORT；
 *  钩子的候选后缀里本来就有 `/index.ts`，缺的只是把它装上）。
 *
 * 注意：`--import <hook.mjs>` **不等于**注册 —— 那只是加载模块；
 * Node 需要显式 `register()` 才会安装 resolve 钩子。这个坑踩过一次。
 */
try {
  register(
    pathToFileURL(path.join(scriptDir, "lib", "ts-resolve-hook.mjs")).href,
    import.meta.url
  );
} catch (error) {
  console.error(`[check-i18n-en] TS 解析钩子注册失败：${String(error)}`);
}
const i18nDir = path.join(scriptDir, "..", "src", "i18n", "locales");
const baselineFile = path.join(scriptDir, "i18n-en-baseline.json");
const listMode = process.argv.includes("--list");
const rebaseMode = process.argv.includes("--rebase");
const backlogMode = process.argv.includes("--backlog");

async function loadNamespace(locale, fileName) {
  const absolute = path.join(i18nDir, locale, `${fileName}.ts`);
  const module = await import(pathToFileURL(absolute).href);
  return Object.values(module)[0];
}

function namespaces() {
  const indexSource = fs.readFileSync(path.join(i18nDir, "zh-CN", "index.ts"), "utf8");
  return [...indexSource.matchAll(/^import \{ (\w+) \} from "\.\/([\w-]+)";$/gm)].map(
    (match) => match[2]
  );
}

/** 递归收集叶子路径 → 值 */
function collectLeaves(value, prefix = "", into = new Map()) {
  for (const [key, child] of Object.entries(value)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") into.set(next, child);
    else if (child && typeof child === "object") collectLeaves(child, next, into);
  }
  return into;
}

const perNamespace = [];
let untranslatedTotal = 0;
let leafTotal = 0;
/** 未翻译的 key 全清单（`--backlog` 用；否则只是一堆没人看的字符串） */
let untranslatedKeys = [];
/** 每个命名空间自己的 key 清单，写 backlog 时按命名空间分组 */
const untranslatedByNamespace = new Map();

for (const fileName of namespaces()) {
  const zh = collectLeaves(await loadNamespace("zh-CN", fileName));
  const en = collectLeaves(await loadNamespace("en", fileName));
  let untranslated = 0;
  untranslatedKeys = [];
  for (const [key, zhValue] of zh) {
    if (!en.has(key)) {
      console.error(`en 缺词条：${fileName}.${key}（应先跑 mirror-locale 或手工补齐）`);
      process.exit(1);
    }
    if (en.get(key) === zhValue) {
      untranslated += 1;
      untranslatedKeys.push(`${fileName}.${key}`);
    }
  }
  perNamespace.push({ fileName, untranslated, total: zh.size });
  untranslatedByNamespace.set(fileName, [...untranslatedKeys]);
  untranslatedTotal += untranslated;
  leafTotal += zh.size;
}

if (listMode) {
  for (const item of perNamespace.sort((a, b) => b.untranslated - a.untranslated)) {
    console.log(`${String(item.untranslated).padStart(5)} / ${String(item.total).padStart(5)}  ${item.fileName}`);
  }
  console.log(`\n未翻译合计 ${untranslatedTotal} / ${leafTotal}`);
  await checkFallbackChain();
  process.exit(0);
}

/**
 * 未翻译清单落盘（`--backlog`）。
 *
 * 为什么要有这份文件：ratchet 只给一个**总数**，而「接下来翻哪儿」需要的是**结构** ——
 * 哪个命名空间、哪些 key、还剩多少。手抄一份清单必然过期（而且没人知道它过期了），
 * 所以这份文件由脚本生成，头部写明重新生成的命令。
 *
 * 清单里**不包含**数据层的用户可见字面量（`packages/shared/src/data/*` 之类）：
 * 那些字面量根本不经过词条表，ratchet 与这份清单都看不见它们
 * （已发生过一次：「全部」这一行永远显示中文，而 `createHistorySidebar.all` 早就翻好了）。
 * 这一条写在文件头，提醒下一批人别只看这张表。
 */
function writeBacklog() {
  /** scriptDir = apps/next/scripts，仓库根在三级之上 */
  const repoRoot = path.join(scriptDir, "..", "..", "..");
  const backlogPath = path.join(repoRoot, "docs", "i18n-backlog.md");
  const ordered = [...perNamespace].sort((a, b) => b.untranslated - a.untranslated);
  const lines = [
    "# 未翻译清单（en 目录）",
    "",
    "> **本文件由脚本生成，不要手改** —— 重新生成：",
    "> `node apps/next/scripts/check-i18n-en.mjs --backlog`",
    ">",
    /**
     * 刻意**不写生成时间**：写了的话每次重新生成都产生 diff，于是「这份清单过没过期」
     * 这件事就再也看不出来（内容没变也会红）。去掉时间戳后，它可以用
     * `node … --backlog && git diff --exit-code docs/i18n-backlog.md` 当一致性检查用。
     */
    `> 未翻译合计 **${untranslatedTotal} / ${leafTotal}**`,
    "",
    "## 判定口径",
    "",
    "递归展开叶子，**值与 zh-CN 逐字相同**即视为未翻译（`check-i18n-en.mjs` 的同一口径）。",
    "ratchet 基线存在 `apps/next/scripts/i18n-en-baseline.json`，只允许调小；",
    "翻译完一批就 `--rebase` 把基线压到当前值。",
    "",
    "## 这份清单**看不见**的东西",
    "",
    "1. **数据层的用户可见字面量**：`packages/shared/src/data/*`（如 `ALL_HISTORY_FOLDER.name = \"全部\"`）、",
    "   组件里绕过 `t()` 的常量。它们不经过词条表，因此 ratchet 与本文都统计不到，",
    "   但会在英文界面里原样显示中文。查到一处就顺手改成走词条（样板见「全部」那一行）。",
    "2. **非界面文案**：`console.warn` 之类的开发者日志按约定本来就用英文，不算未翻译。",
    "",
    "## 按命名空间",
    "",
    "| 命名空间 | 未翻译 / 总数 | 建议顺序 |",
    "|----------|--------------|----------|",
  ];

  for (const item of ordered) {
    const status =
      item.untranslated === 0
        ? "已完成"
        : item.untranslated === item.total
          ? "整表未翻"
          : "部分完成（继续收尾）";
    lines.push(
      `| \`${item.fileName}\` | ${item.untranslated} / ${item.total} | ${status} |`
    );
  }

  lines.push("", "## 未翻译 key 明细", "");
  for (const item of ordered) {
    if (item.untranslated === 0) continue;
    const keys = untranslatedByNamespace.get(item.fileName) ?? [];
    lines.push(
      `### \`${item.fileName}\`（${item.untranslated} / ${item.total}）`,
      "",
      ...keys.map((key) => `- \`${key}\``),
      ""
    );
  }

  fs.writeFileSync(backlogPath, `${lines.join("\n")}\n`, "utf8");
  console.log(`已写出未翻译清单：${path.relative(repoRoot, backlogPath)}`);
  console.log(`未翻译合计 ${untranslatedTotal} / ${leafTotal}`);
}

if (backlogMode) {
  writeBacklog();
  process.exit(0);
}

/**
 * 守卫：**未翻译 / 缺词条时回退中文原文，而不是吐出 key 名**。
 *
 * 为什么必须机检：en 是增量翻译的，一旦某处回退成
 * `create.addImagesToFolderDialog.title`，用户看到的是「像 bug 的字符串」，
 * 比纯中文更糟。回退链是 `当前语言 → zh-CN → key`，这里把中间那一环也钉住
 * （只断言「不等于 key 名」是不够的，要断言「等于中文原文」）。
 *
 * 对照方式：**在运行时**从 en 词条表里删掉一个键（`LOCALES.en` 与它同源），
 * 再取该 key —— 必须拿到 zh-CN 的原文；随后还原。这样才真正触发了中间那一环。
 */
async function checkFallbackChain() {
  const { createTranslator } = await import(
    pathToFileURL(path.join(scriptDir, "..", "src", "i18n", "translate.ts")).href
  );
  const { LOCALES } = await import(
    pathToFileURL(path.join(scriptDir, "..", "src", "i18n", "locales", "index.ts")).href
  );

  const problems = [];
  const en = createTranslator("en");
  const zh = createTranslator("zh-CN");

  if (zh("nav.home") !== "首页") problems.push(`zh-CN 取 nav.home 异常：${zh("nav.home")}`);

  const original = LOCALES.en.nav.home;
  try {
    delete LOCALES.en.nav.home;
    const fallback = en("nav.home");
    if (fallback !== "首页") {
      problems.push(`en 缺词条时应回退 zh-CN 原文「首页」，实际拿到「${fallback}」`);
    }
  } finally {
    LOCALES.en.nav.home = original;
  }

  if (en("nav.home") !== "Home") {
    problems.push(`还原后 en 仍应取英文，实际拿到「${en("nav.home")}」`);
  }

  if (problems.length > 0) {
    console.error("回退链校验未通过：");
    for (const line of problems) console.error(`  · ${line}`);
    process.exit(1);
  }
  console.log("OK  回退链：当前语言 → zh-CN 原文 → key（缺词条时显示中文原文，不露 key 名）");
}

let baseline = null;
let baselineLeafTotal = null;
try {
  const parsed = JSON.parse(fs.readFileSync(baselineFile, "utf8"));
  baseline = parsed.untranslated;
  baselineLeafTotal = typeof parsed.leafTotal === "number" ? parsed.leafTotal : null;
} catch {
  baseline = null;
}

/**
 * 允许的「未翻译数上涨」上限 = 新增的叶子数。
 *
 * 为什么需要这条：新功能难免新增中文词条，而新词条一开始必然是未翻译的
 * （英文还没人写）—— 若 ratchet 一律不许上涨，那么**每一个加文案的功能都会被它拦住**，
 * 结果大概率是被删掉或绕过。正确的不变量是：
 *   **新增词条可以是未翻译的；把「已翻译的」退回中文不行。**
 * 所以上涨额度 = `leafTotal - baselineLeafTotal`（只有叶子总数变多才给额度）。
 */
const allowedRise =
  baselineLeafTotal === null ? 0 : Math.max(0, leafTotal - baselineLeafTotal);

if (rebaseMode) {
  if (baseline !== null && untranslatedTotal > baseline + allowedRise) {
    console.error(
      `拒绝抬高基线：当前未翻译 ${untranslatedTotal} > 基线 ${baseline} + 新增叶子额度 ${allowedRise}。\n` +
        `  新增词条带来 ${allowedRise} 条未翻译是允许的；多出来的部分是**已翻译内容被退回中文**，` +
        "这不行 —— 请在 en/<命名空间>.ts 里补回英文。用 --list 看分布。"
    );
    process.exit(1);
  }
  fs.writeFileSync(
    baselineFile,
    `${JSON.stringify({ untranslated: untranslatedTotal, leafTotal, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8"
  );
  console.log(`OK  基线已更新为 ${untranslatedTotal} / ${leafTotal}`);
  process.exit(0);
}

if (baseline === null) {
  fs.writeFileSync(
    baselineFile,
    `${JSON.stringify({ untranslated: untranslatedTotal, leafTotal, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8"
  );
  console.log(
    `OK  已建立 en 翻译基线：未翻译 ${untranslatedTotal} / ${leafTotal}（此后只减不增）`
  );
  process.exit(0);
}

if (untranslatedTotal > baseline + allowedRise) {
  console.error(
    `en 未翻译数从 ${baseline} 涨到 ${untranslatedTotal}，超出允许额度（基线 ${baseline} + ` +
      `新增叶子 ${allowedRise}）—— ratchet 只允许「新增词条未翻译」，不允许「已翻译的退回中文」。\n` +
      "  用 --list 看分布；翻完一批用 --rebase 把基线压下去（只调小）。"
  );
  process.exit(1);
}

console.log(
  `OK  en 未翻译 ${untranslatedTotal} / ${leafTotal}（基线 ${baseline}` +
    (allowedRise > 0 ? ` + 新增叶子额度 ${allowedRise}` : "") +
    (untranslatedTotal < baseline ? "，已下降" : "，在额度内") +
    "）"
);
