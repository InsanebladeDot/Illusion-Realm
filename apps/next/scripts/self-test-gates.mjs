/**
 * 门禁自检：**已存在的检查脚本本身失效时会怎样**。
 *
 * 为什么需要：`check-i18n` / `verify-i18n-values` / `find-unused-keys` 都在
 * `pnpm check` 里跑，但它们自己没有任何断言兜着 —— 一旦解析静默返回空集、
 * 或判据被改坏，它们会照常打印「OK」并退出 0，也就是**假装通过**。
 * 这类失效不会表现为功能错误，只会让门禁悄悄失去作用。
 *
 * 每条自检都必须成对：**正向对照**（该抓的必须抓到）
 * + **负向对照**（不该抓的必须不抓，或该报的必须报出来）。
 * 只有正向对照的断言是无效断言 —— 一个 `return true` 的实现也能全绿。
 *
 * 失败即 exit 1，已接进 `pnpm check`。
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { scanSource } from "./check-i18n.mjs";
import { canonical, cjkRuns } from "./verify-i18n-values.mjs";
import { collectKeysFromSource, findUnusedKeys } from "./find-unused-keys.mjs";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));

const failures = [];
let checks = 0;
function check(name, ok, detail = "") {
  checks += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures.push(name);
}

/* ---------------------- 1. check-i18n 的扫描核心 ---------------------- */

function assertScanner() {
  console.log("== check-i18n：扫描核心 ==");

  // 正向：JSX 文本里的中文必须被数到
  check(
    "扫描器抓到 JSX 文本里的中文（正向）",
    scanSource("probe.tsx", "export const A = () => <div>中文文案</div>;").count === 1,
    String(scanSource("probe.tsx", "export const A = () => <div>中文文案</div>;").count)
  );

  // 负向：纯中文注释不算 —— 这是最容易被正则实现误伤的地方
  const commentOnly = scanSource(
    "probe.ts",
    "// 这是一整行中文注释\n/* 块注释里的中文 */\nexport const a = 1;\n"
  );
  check("扫描器不数中文注释（负向）", commentOnly.count === 0, String(commentOnly.count));

  // 负向：纯 ASCII 不算
  check(
    "扫描器不数纯 ASCII（负向）",
    scanSource("probe.ts", 'export const a = "masterpiece, 1girl";').count === 0
  );

  // 正向：调用实参里的中文（曾经整类漏检的形态）
  check(
    "扫描器抓到 throw new Error 里的中文（历史漏检形态）",
    scanSource("probe.ts", 'throw new Error("请在桌面版中使用");').count === 1
  );

  // 正向：解构默认值里的中文（历史上漏过 3 处）
  check(
    "扫描器抓到解构参数默认值里的中文",
    scanSource("probe.tsx", "function f({ emptyText = \"暂无预设\" }) { return emptyText; }")
      .count === 1
  );
}

/* ------------------ 2. verify-i18n-values 的判据 ------------------ */

function assertValueComparer() {
  console.log("\n== verify-i18n-values：逐字比对判据 ==");

  // 正向：空白与插值写法差异必须被容忍（否则迁移会被误报）
  check(
    "容忍空白差异（正向）",
    canonical("  已选择  {count} 个  ") === canonical("已选择 {count} 个")
  );
  check(
    "容忍 ${x} 与 {x} 的写法差异（正向）",
    canonical("已复制 ${label}") === canonical("已复制 {label}")
  );

  // 负向：标点差异**必须不**被容忍 —— 这条是整套 i18n 验证的意义所在
  check(
    "不容忍标点差异（负向）",
    canonical("已选中。") !== canonical("已选中")
  );
  check(
    "不容忍全角/半角差异（负向）",
    canonical("已完成（3）") !== canonical("已完成(3)")
  );

  // 中文片段抽取：用于「拆分入表」那一档
  check(
    "中文片段抽取只取连续中文（正负对照）",
    cjkRuns("已选 3 个角色").join("|") === "已选|个角色" &&
      cjkRuns("ascii only").length === 0,
    cjkRuns("已选 3 个角色").join("|")
  );
}

/* ------------------ 3. find-unused-keys 的收集器 ------------------ */

function assertKeyCollector() {
  console.log("\n== find-unused-keys：词条收集器 ==");

  const source = `export const demo = {
  title: "标题",
  nested: {
    leaf: "叶子",
    deeper: { tip: "提示" },
  },
  numeric: 3,
  flag: true,
  empty: {},
} as const;
`;
  const keys = collectKeysFromSource(source, "demo").map((item) => item.key).sort();

  // 正向：嵌套叶子收集齐、且带命名空间前缀
  check(
    "收集器取到全部嵌套叶子并带命名空间前缀（正向）",
    keys.join(",") === "demo.nested.deeper.tip,demo.nested.leaf,demo.title",
    keys.join(",")
  );
  // 负向：非字符串叶子（数字/布尔/空对象）不算词条
  check(
    "收集器排除非字符串叶子（负向）",
    !keys.some((key) => /numeric|flag|empty/.test(key)),
    keys.join(",")
  );
  // 负向对照（针对解析失效）：解析失败时它会静默返回空集 —— 这里用「无 export 的坏源码」验证
  check(
    "坏源码不会静默产出伪 key（负向）",
    collectKeysFromSource("这不是合法的 TypeScript {{", "bad").length === 0
  );

  // 结构自检：真实词条表必须真的被解析到（防「解析全空 → 0 未引用 → 假装通过」）
  const { total, unused } = findUnusedKeys();
  check(
    "真实词条表被解析到（数量级自检，防解析全空）",
    total > 500,
    `叶子 ${total} 个`
  );
  check(
    "未引用数为 0（当前基线状态）",
    unused.length === 0,
    unused.slice(0, 3).map((item) => item.key).join("、") || ""
  );
}

/* ---------------------------- 4. 自检不可为空转 ---------------------------- */

function assertSelfTestIsMeaningful() {
  console.log("\n== 自检本身的可信度 ==");
  // 若上面的对照全部「正向也过、负向也过」，说明断言写成了恒真。
  // 这里用一对必然相反的期望来证明判定逻辑真的在区分：
  const truthy = canonical("同一个字串") === canonical("同一个字串");
  const falsy = canonical("同一个字串") === canonical("不同的字串");
  check("判定逻辑能区分相等与不等（防恒真断言）", truthy && !falsy);
  check("自检项数量达到预期", checks >= 14, `${checks} 项`);
}

assertScanner();
assertValueComparer();
assertKeyCollector();
assertSelfTestIsMeaningful();
void fs;
void require;
void HERE;

if (failures.length > 0) {
  console.error(`\n门禁自检失败 ${failures.length} 项：`);
  for (const name of failures) console.error(`  - ${name}`);
  process.exit(1);
}
console.log(`\nOK（${checks} 项）`);
