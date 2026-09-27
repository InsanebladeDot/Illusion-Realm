/**
 * Node ESM 解析钩子：让纯 Node 脚本能直接 import **渲染进程的 TS 源码**。
 *
 * 用途：`verify-image-meta.mjs` 需要跑真实的写入/读取模块做进程内往返断言，
 * 而不是靠重写一遍逻辑去"验证"自己。Node 24 原生支持类型剥离，
 * 缺的只是 tsconfig 的路径别名解析 —— 这个钩子补上这一段。
 *
 * 别名根是**数据**（`ALIAS_ROOTS`，按顺序尝试、命中即返回），不是 if-else 链：
 * `apps/next/tsconfig.json` 的 `@/*` 目前是两段映射 ——
 *   1) `apps/next/src/*`
 *   2) `packages/shared/src/*`
 * `@/types/generatedImageMeta` 这类只命中第二段。将来加第三段时只需往数组里追加一项。
 *
 * 另提供 `assertAliasesResolvable()` 启动自检：把入口文件及其传递依赖里所有本地
 * specifier 都在候选根下试一遍，有解析不了的**立刻退出并打印缺哪个 specifier** ——
 * 让 CI 报「钩子配置错了」，而不是跑到一半才报 Cannot find package。
 *
 * 局限：只解析路径，不做类型检查。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, "..", ".."); // apps/next
const SRC_DIR = path.join(APP_DIR, "src");
const SHARED_SRC_DIR = path.resolve(APP_DIR, "..", "..", "packages", "shared", "src");

/** 别名根：按顺序尝试，命中即返回。新增别名段时只改这里。 */
export const ALIAS_ROOTS = [SRC_DIR, SHARED_SRC_DIR];

/** 带包名的别名（非 `@/` 前缀）单独映射 */
const PACKAGE_ALIASES = new Map([
  ["@illusion-realm/shared", path.join(SHARED_SRC_DIR, "index.ts")],
]);

const CANDIDATE_SUFFIXES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx", ".js", ".mjs"];

function firstExistingFile(base) {
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = `${base}${suffix}`;
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      /* 继续试下一个后缀 */
    }
  }
  return null;
}

/** 把 specifier 解析成绝对文件路径；不是本地别名/相对路径时返回 null 交给 Node */
export function resolveSpecifier(specifier, parentFile) {
  const bases = [];

  if (specifier.startsWith("@/")) {
    const rest = specifier.slice(2);
    for (const root of ALIAS_ROOTS) bases.push(path.join(root, rest));
  } else if (PACKAGE_ALIASES.has(specifier)) {
    bases.push(PACKAGE_ALIASES.get(specifier));
  } else if (specifier.startsWith("@illusion-realm/shared/")) {
    bases.push(
      path.join(SHARED_SRC_DIR, specifier.slice("@illusion-realm/shared/".length))
    );
  } else if (specifier.startsWith(".") && parentFile) {
    bases.push(path.resolve(path.dirname(parentFile), specifier));
  } else {
    return null;
  }

  for (const base of bases) {
    const hit = firstExistingFile(base);
    if (hit) return hit;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  const parentFile =
    context.parentURL && context.parentURL.startsWith("file:")
      ? fileURLToPath(context.parentURL)
      : null;
  const hit = resolveSpecifier(specifier, parentFile);
  if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
  return nextResolve(specifier, context);
}

/* ------------------------------- 启动自检 ------------------------------- */

const SPECIFIER_PATTERNS = [
  /(?:^|[\s;])(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g,
  /import\s*\(\s*["']([^"']+)["']\s*\)/g,
  /(?:^|[\s;])import\s*["']([^"']+)["']/g,
];

function specifiersOf(source) {
  const found = new Set();
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of source.matchAll(pattern)) found.add(match[1]);
  }
  return [...found];
}

function isLocalSpecifier(specifier) {
  return (
    specifier.startsWith("@/") ||
    specifier.startsWith(".") ||
    specifier.startsWith("@illusion-realm/shared")
  );
}

/**
 * 传递地检查入口文件及其本地依赖里的 specifier 能否解析。
 * @param {string[]} entryFiles 绝对路径
 */
export function preflightAliases(entryFiles) {
  const visited = new Set();
  const missing = [];
  const queue = [...entryFiles];

  while (queue.length > 0) {
    const file = queue.shift();
    if (!file || visited.has(file)) continue;
    if (!fs.existsSync(file)) continue;
    visited.add(file);

    let source;
    try {
      source = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }

    for (const specifier of specifiersOf(source)) {
      if (!isLocalSpecifier(specifier)) continue;
      const resolved = resolveSpecifier(specifier, file);
      if (!resolved) {
        missing.push({ specifier, from: path.relative(APP_DIR, file) });
      } else if (/\.tsx?$/.test(resolved)) {
        queue.push(resolved);
      }
    }
  }

  return { missing, checked: visited.size };
}

/**
 * 自检：解析不了就立刻退出，并说清这是**钩子配置**的问题。
 *
 * 已知局限（**别试图"修掉"它**）：这里靠静态扫描源码里的 import/export/动态 import()
 * 文本。任何**运行期才产生**的引用 —— `require(变量)`、`eval`、`new Function`、
 * 由配置拼出来的模块名 —— 都扫不到，也解析不了。这是静态依赖扫描的固有边界，
 * 不是缺陷；真要覆盖它得改成运行期上报（例如在解析钩子里记录未命中），
 * 那会增加复杂度却只换来一处极不可能出现的场景。
 */
export function assertAliasesResolvable(entryFiles) {
  const { missing, checked } = preflightAliases(entryFiles);
  if (missing.length > 0) {
    console.error(
      `\n[ts-resolve-hook] 别名自检失败：${missing.length} 个 specifier 在所有候选根下都不存在。`
    );
    console.error(`候选根（按顺序）：\n  ${ALIAS_ROOTS.join("\n  ")}`);
    for (const item of missing) {
      console.error(`  x ${item.specifier}    <- ${item.from}`);
    }
    console.error(
      `\n通常意味着 tsconfig 的 paths 加了新的一段，而 ALIAS_ROOTS 没同步。` +
        `（本次共检查 ${checked} 个本地模块）\n`
    );
    process.exit(1);
  }
  return checked;
}
