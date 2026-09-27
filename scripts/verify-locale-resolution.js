/**
 * locale 决议的真值表（纯 Node，无需 Electron / 无需 alias 钩子，进 `pnpm check`）。
 *
 * 为什么先有它、再有接线：这条不变量是「locale 的决议顺序**只能有一条**」——
 * 缺字段 → zh-CN；字段合法 → 用字段值；**字段非法 → 也必须落到 zh-CN，不能落到 undefined**。
 * 第三格是最容易漏的：老文档被手改、或某次合并写进脏值，都会让 store 拿到
 * 不在 AVAILABLE_LOCALES 里的东西。先把这个真值表钉住，再去接文档合并与水合，
 * 接线时就不用再逐格推理。
 *
 * 覆盖：三格真值表 + 大小写/空白边界 + 告警文案（invalid 必须能报出脏值）。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const modulePath = path.join(
  scriptDir,
  "..",
  "apps",
  "next",
  "src",
  "utils",
  "localeResolution.ts"
);

const { resolveLocale, localeResolutionWarning } = await import(pathToFileURL(modulePath).href);

const ALLOWED = ["zh-CN", "en"];
const FALLBACK = "zh-CN";

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

/** 一行一格的断言助手：输入 → 期望 locale + 期望 reason */
function cell(label, input, expectedLocale, expectedReason) {
  const result = resolveLocale(input, ALLOWED, FALLBACK);
  check(
    label,
    result.locale === expectedLocale && result.reason === expectedReason,
    `locale=${result.locale} reason=${result.reason}`
  );
  return result;
}

/* ---------------- 第 1 格：缺字段 → zh-CN（老文档） ---------------- */
cell("缺字段（undefined）→ zh-CN，reason=missing", undefined, "zh-CN", "missing");
cell("缺字段（null）→ zh-CN，reason=missing", null, "zh-CN", "missing");
cell("空串 → zh-CN，reason=missing", "", "zh-CN", "missing");
cell("纯空白 → zh-CN，reason=missing", "   ", "zh-CN", "missing");

/* ---------------- 第 2 格：合法值 → 用字段值 ---------------- */
cell("zh-CN → zh-CN，reason=stored", "zh-CN", "zh-CN", "stored");
cell("en → en，reason=stored", "en", "en", "stored");
cell("两侧空白被裁掉后合法", "  en  ", "en", "stored");

/* ---------------- 第 3 格：非法值 → zh-CN（**不能**是 undefined） ---------------- */
const invalidLocale = cell('未来语言 "ja" → zh-CN，reason=invalid', "ja", "zh-CN", "invalid");
cell("大小写不符的 zh-cn → zh-CN（不做模糊匹配）", "zh-cn", "zh-CN", "invalid");
cell("数字 42 → zh-CN", 42, "zh-CN", "invalid");
cell("对象 → zh-CN", { locale: "en" }, "zh-CN", "invalid");
cell("布尔 true → zh-CN", true, "zh-CN", "invalid");
check(
  "非法值时结果**绝不为 undefined**（否则 LOCALES[undefined] 取不到词条）",
  resolveLocale("ja", ALLOWED, FALLBACK).locale !== undefined &&
    typeof resolveLocale("ja", ALLOWED, FALLBACK).locale === "string"
);

/* ---------------- 告警：非法值要能报出脏值本身（可选但已就位） ---------------- */
const warning = localeResolutionWarning(invalidLocale, FALLBACK);
check(
  "非法值产出告警文案且带上脏值",
  typeof warning === "string" && warning.includes('"ja"') && warning.includes("fell back to zh-CN"),
  warning ?? "(无告警)"
);
check(
  "合法/缺字段**不产生**告警（避免日常噪音）",
  localeResolutionWarning(resolveLocale("en", ALLOWED, FALLBACK), FALLBACK) === null &&
    localeResolutionWarning(resolveLocale(undefined, ALLOWED, FALLBACK), FALLBACK) === null
);

/* ---------------- 负向对照：判定逻辑有区分度 ---------------- */
check(
  "负向对照：把 allowed 换成空列表时，合法值也应被拒（证明上面不是恒真）",
  resolveLocale("en", [], FALLBACK).reason === "invalid",
  JSON.stringify(resolveLocale("en", [], FALLBACK))
);

/* ---------------- 接线自检：真值表引用的模块确实是产品代码那一份 ---------------- */
const source = fs.readFileSync(modulePath, "utf8");
check(
  "被测模块就是产品源码（防止将来被替换成测试桩）",
  source.includes("export function resolveLocale") && source.includes("LocaleResolutionReason"),
  `${path.relative(path.join(scriptDir, ".."), modulePath)}`
);

const failed = checks.filter((item) => !item.ok);
if (failed.length > 0) {
  console.error(`\nlocale 决议真值表未通过：${failed.map((item) => item.name).join(" / ")}`);
  process.exit(1);
}
console.log(`OK  locale 决议：三格真值表 + 边界 + 告警（${checks.length} 项）`);
