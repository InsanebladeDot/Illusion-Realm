/**
 * 从 zh-CN 机械生成 en 词条表（**镜像**，不是翻译）。
 *
 * ## ⚠️ 翻译开始之后，本脚本默认**拒绝**覆盖已有译文（这是刻意设计）
 * en 目前是增量翻译的：`--rebase` 会让 ratchet 一路下降，已翻的条目越来越多。
 * 而本脚本的语义是「把 zh 的值原样抄过去」—— 一旦被顺手重跑，**已翻译的内容会被中文覆盖**，
 * 且 ratchet 会立刻涨回去（如果没人看基线）。`pnpm mirror:locale` 这个名字听起来就像「该跑一下」，
 * 所以不能只靠注释劝阻。
 *
 * 现行口径（窄口径，不是简单加 `--force`）：
 *   · en 文件不存在 → 生成；
 *   · en 键集合与 zh **不一致**（结构变更，例如新增命名空间/新增键）→ 允许覆盖；
 *   · en 键集合与 zh 一致（= 结构没变，只是内容可能已翻译）→ **拒绝覆盖**，
 *     打印被拒绝的命名空间并在结尾给出提示。
 * 这样将来真要批量重排键时不必走强制通道，而手滑重跑不会丢字。
 *
 * `--force` 仍然保留，用于「确实要把某些命名空间退回镜像」的场景 —— 它是逃生门，不是日常路径。
 *
 * ## 用法
 *   node scripts/mirror-locale.mjs            # 生成缺失的；结构变了的覆盖；其余拒绝
 *   node scripts/mirror-locale.mjs --force    # 全部覆盖（**会抹掉译文**，慎用）
 *   node scripts/mirror-locale.mjs --check    # 只检查 en 与 zh 的键是否一致，不写文件
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.join(scriptDir, "..", "src", "i18n", "locales", "zh-CN");
const targetDir = path.join(scriptDir, "..", "src", "i18n", "locales", "en");
const checkOnly = process.argv.includes("--check");
const force = process.argv.includes("--force");
/** `--force` 必须显式指定命名空间：把单次失误的**波及面**从「整个 en 目录」压到「一个文件」 */
const forceTargets = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

/** 命名空间清单以 zh-CN/index.ts 的导入为准（新增命名空间只改那一处） */
function namespaceNames() {
  const indexSource = fs.readFileSync(path.join(sourceDir, "index.ts"), "utf8");
  return [...indexSource.matchAll(/^import \{ (\w+) \} from "\.\/([\w-]+)";$/gm)].map(
    (match) => ({ exportName: match[1], fileName: match[2] })
  );
}

/** 用 Node 原生类型剥离直接 import TS 词条文件，拿到对象字面量 */
async function loadNamespace(fileName) {
  const absolute = path.join(sourceDir, `${fileName}.ts`);
  const module = await import(pathToFileURL(absolute).href);
  const value = Object.values(module)[0];
  if (!value || typeof value !== "object") {
    throw new Error(`${fileName}.ts 没有导出对象字面量`);
  }
  return value;
}

function renderNamespace(exportName, value) {
  return `/**
 * English catalogue — **结构与 zh-CN 完全一致**（由 apps/next/scripts/mirror-locale.mjs 生成）。
 *
 * 现状：值仍与 zh-CN 相同（镜像），翻译按命名空间增量推进。
 * 未翻译数量由 apps/next/scripts/check-i18n-en.mjs 的 ratchet 盯着（只减不增），
 * 因此「翻了哪些」是可以机检的数字，不靠人记。
 */
export const ${exportName} = ${JSON.stringify(value, null, 2)} as const;
`;
}

function renderIndex(entries) {
  const imports = entries
    .map((entry) => `import { ${entry.exportName} } from "./${entry.fileName}";`)
    .join("\n");
  const fields = entries.map((entry) => `  ${entry.exportName},`).join("\n");
  return `${imports}

/** English catalogue：与 \`zh-CN/index.ts\` 同构（names排 序一致，键完全一致由类型强制） */
export const en = {
${fields}
} as const;
`;
}

/**
 * 递归比对键集合（**双向**，只比结构不比值）：正向报「en 缺词条」、反向报「en 多词条」，
 * 两者必须报在**同一条消息**里 —— 多一条独立门禁就多一个被人绕过的机会。
 *
 * 实测记录（2026-09-19，注入孤儿键 `updates.__orphan` 后逐格验证）：
 *   · 反向方向确实被报出：「en 多词条：updates.__orphan」；
 *   · **typecheck 拦不住孤儿键**：`LOCALES: Record<Locale, Messages>` 里的 `en` 是变量引用，
 *     不触发 excess property check ⇒ 孤儿键的唯一机械拦截点就是这里（+ 本脚本的 --check 模式）；
 *   · ratchet 计数**不受污染**（它只遍历 zh 的叶子），944 保持不变；
 *   · **孤儿键会打开覆盖通道**：键集被判定为「不一致」⇒ 结构变更分支 ⇒ 允许覆盖该文件。
 *     也就是说反向检查不只是洁癖 —— 少了它，一个孤儿键就能让「默认拒绝覆盖」在这文件上失效。
 */
function diffKeys(a, b, prefix = "") {
  const problems = [];
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  for (const key of keysA) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (!(key in b)) problems.push(`en 缺词条：${next}`);
    else if (typeof a[key] === "object" && a[key] !== null) {
      problems.push(...diffKeys(a[key], b[key], next));
    }
  }
  for (const key of keysB) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (!(key in a)) problems.push(`en 多词条：${next}`);
  }
  return problems;
}

const entries = namespaceNames();
if (entries.length === 0) {
  console.error("没解析到任何命名空间 —— 检查 zh-CN/index.ts 的 import 形式是否变了");
  process.exit(1);
}

/**
 * `--force` 不带目标 = 错误并退出。
 * 为什么不允许「--force 全量」：那条路径的波及面是整个 en 目录（16 个命名空间、已译数百条），
 * 一次手滑就是全丢。要求显式点名，代价是多打一个词，收益是把波及面压到单文件。
 * 真要全量重排键时，挨个写或另行改造本脚本，而不是留一个「一按即全灭」的开关。
 */
if (force && forceTargets.length === 0) {
  console.error(
    "[mirror-locale] --force 必须显式指定要覆盖的命名空间（不提供「全量覆盖」选项）。\n" +
      `  可用：${entries.map((entry) => entry.fileName).join(" / ")}\n` +
      "  例：node apps/next/scripts/mirror-locale.mjs --force create\n" +
      "  注意：覆盖会把这些命名空间的**已翻译内容**换回中文。"
  );
  process.exit(1);
}
if (force) {
  const unknown = forceTargets.filter(
    (name) => !entries.some((entry) => entry.fileName === name)
  );
  if (unknown.length > 0) {
    console.error(
      `[mirror-locale] 未知命名空间：${unknown.join(" / ")}\n` +
        `  可用：${entries.map((entry) => entry.fileName).join(" / ")}`
    );
    process.exit(1);
  }
}

if (checkOnly) {
  const problems = [];
  for (const entry of entries) {
    const zh = await loadNamespace(entry.fileName);
    const target = path.join(targetDir, `${entry.fileName}.ts`);
    if (!fs.existsSync(target)) {
      problems.push(`en 缺命名空间文件：${entry.fileName}.ts`);
      continue;
    }
    const enModule = await import(pathToFileURL(target).href);
    problems.push(...diffKeys(zh, Object.values(enModule)[0], entry.fileName));
  }
  if (problems.length > 0) {
    console.error(`en 与 zh-CN 键不一致（${problems.length} 处）：`);
    for (const line of problems.slice(0, 20)) console.error(`  · ${line}`);
    process.exit(1);
  }
  console.log(`OK  en 与 zh-CN 键完全一致（${entries.length} 个命名空间）`);
  process.exit(0);
}

fs.mkdirSync(targetDir, { recursive: true });
const generated = [];
const refused = [];

for (const entry of entries) {
  const value = await loadNamespace(entry.fileName);
  const target = path.join(targetDir, `${entry.fileName}.ts`);

  const forceThis = force && forceTargets.includes(entry.fileName);
  if (fs.existsSync(target) && !forceThis) {
    // 键集合一致 ⇒ 结构没变 ⇒ 覆盖只会抹掉译文，拒绝；键不一致 ⇒ 结构变更，允许覆盖
    const enModule = await import(pathToFileURL(target).href);
    const keyProblems = diffKeys(value, Object.values(enModule)[0], entry.fileName);
    if (keyProblems.length === 0) {
      refused.push(entry.fileName);
      continue;
    }
    console.log(
      `[mirror-locale] en/${entry.fileName}.ts 与 zh 键不一致（${keyProblems.length} 处）→ 按结构变更覆盖`
    );
  }

  fs.writeFileSync(target, renderNamespace(entry.exportName, value), "utf8");
  generated.push(entry.fileName);
}

if (generated.length > 0) {
  fs.writeFileSync(path.join(targetDir, "index.ts"), renderIndex(entries), "utf8");
  console.log(`[mirror-locale] 已写入 ${generated.length} 个命名空间：${generated.join(" / ")}`);
  console.log(`[mirror-locale] 已写入 en/index.ts`);
}
if (refused.length > 0) {
  console.log(
    `[mirror-locale] **拒绝覆盖 ${refused.length} 个**键集合一致的命名空间（覆盖会抹掉已翻译内容）：\n` +
      `  ${refused.join(" / ")}\n` +
      "  这些文件的结构没变，无需镜像。确实要退回镜像（会丢译文）才用：" +
      `\n    node apps/next/scripts/mirror-locale.mjs --force <命名空间>   （一次只建议一个）`
  );
}
if (generated.length === 0 && refused.length === 0) {
  console.log("[mirror-locale] 没有需要处理的命名空间");
}
