/**
 * 启动注入参数的解析真值表（纯 Node，进 `pnpm check`）。
 *
 * 对应验收第 1 格：**注入参数带命名空间前缀，且只取 argv 最后一个匹配**。
 * 为什么必须先钉住解析语义：接线要动 main / preload / AppShell 三处，
 * 而那三处都要真窗口才能测；解析这一层是唯一能用真值表钉死的，
 * 于是「明明传了参数却回退中文」这类假失败会在这里就被拦住。
 */
const path = require("path");
const {
  INITIAL_LOCALE_PREFIX,
  parseInitialLocale,
  buildInitialLocaleArg,
  initialLocaleArguments,
} = require(path.join(__dirname, "..", "apps", "electron", "initialLocale.js"));

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
function cell(label, argv, expected) {
  const actual = parseInitialLocale(argv);
  check(label, actual === expected, `实际=${JSON.stringify(actual)} 期望=${JSON.stringify(expected)}`);
}

/* ---------------- 基本形态 ---------------- */
check("前缀是命名空间化的（不与 Chromium 开关抢名字）", INITIAL_LOCALE_PREFIX === "--illusion-locale=", INITIAL_LOCALE_PREFIX);
cell("单个匹配 → 取其值", ["electron", "--illusion-locale=en"], "en");
cell("夹在其它参数之间也能取到", ["electron", "--foo", "--illusion-locale=en", "--bar"], "en");

/* ---------------- 验收重点：只取最后一个匹配 ---------------- */
cell(
  "**多个匹配 → 取最后一个**（argv 可重复，后者覆盖前者）",
  ["--illusion-locale=zh-CN", "--illusion-locale=en"],
  "en"
);
cell(
  "多个匹配且顺序颠倒时同样取最后一个",
  ["--illusion-locale=en", "--illusion-locale=zh-CN"],
  "zh-CN"
);

/* ---------------- 无匹配 = undefined = missing ---------------- */
cell("完全没有该参数 → undefined", ["electron", "--enable-logging"], undefined);
cell("空数组 → undefined", [], undefined);
cell("非数组（防御）→ undefined", null, undefined);
cell("前缀无值（`--illusion-locale=`）→ undefined", ["--illusion-locale="], undefined);
cell(
  "前缀无值不覆盖前面的有效值",
  ["--illusion-locale=en", "--illusion-locale="],
  "en"
);

/* ---------------- 负向对照：不得误认别的开关 ---------------- */
cell("Chromium 自己的 `--lang=ja` **不得**被误认", ["--lang=ja"], undefined);
cell("相似但不带前缀的 `--locale=en` 不得被误认", ["--locale=en"], undefined);
cell("前缀作为独立参数（`--illusion-locale en`）不匹配", ["--illusion-locale", "en"], undefined);
cell("只匹配前缀本身、不做子串包含", ["--x-illusion-locale=en"], undefined);

/* ---------------- 构造端与解析端共用同一常量（防两处各写一份字符串） ---------------- */
check(
  "构造出的参数能被自己解析回来",
  parseInitialLocale([buildInitialLocaleArg("en")]) === "en",
  buildInitialLocaleArg("en")
);
check(
  "构造端使用的前缀与解析端一致",
  buildInitialLocaleArg("zh-CN").startsWith(INITIAL_LOCALE_PREFIX)
);

/* ---------------- main 侧：从用户文档取值的透传（纯函数，零窗口可验） ----------------
 * 这一组是施工图 a 的机械对照：**透传原始值，不得清洗**。
 * 若将来有人在 main 侧「顺手校验一下」（import 允许集 / 调 resolveLocale），
 * `ja` 那一行会立刻红 —— 那就是它存在的意义。
 */
const wrap = (doc) => ({ filePath: "x", data: doc, isNew: false });

check("文档缺 locale → 不注入（= missing）", initialLocaleArguments(wrap({ settings: {} })).length === 0);
check(
  "**settings 整个缺失也兜得住**（老文档形态，这条链必须一路可选）",
  initialLocaleArguments(wrap({})).length === 0
);
check("data 为 null（文件不存在/损坏）→ 不注入", initialLocaleArguments(wrap(null)).length === 0);
check("入参整个为 undefined → 不注入", initialLocaleArguments(undefined).length === 0);
check(
  "locale 为空串 → 不注入（空值等同没传）",
  initialLocaleArguments(wrap({ settings: { locale: "" } })).length === 0
);
check(
  'locale 为 "en" → 注入 ["--illusion-locale=en"]',
  JSON.stringify(initialLocaleArguments(wrap({ settings: { locale: "en" } }))) ===
    JSON.stringify(["--illusion-locale=en"]),
  JSON.stringify(initialLocaleArguments(wrap({ settings: { locale: "en" } })))
);
check(
  '**locale 为非法值 "ja" 也必须原样透传**（不得在 main 侧清洗）',
  JSON.stringify(initialLocaleArguments(wrap({ settings: { locale: "ja" } }))) ===
    JSON.stringify(["--illusion-locale=ja"]),
  JSON.stringify(initialLocaleArguments(wrap({ settings: { locale: "ja" } })))
);
check(
  "顶层 userDataPath 那种形态**不**被当作语言（避免误取别的同名字段）",
  initialLocaleArguments(wrap({ userDataPath: "/tmp/x" })).length === 0
);

/* ---------------- 结构层守卫：main 不得知道「有哪些语言」 ----------------
 * 施工图 a 的数据层守卫是 `"ja"` 那一行（只有跑测试才红）。这里再加一道**结构层**的：
 * 用一行源码扫描断言 main.js 不出现 resolveLocale / AVAILABLE_LOCALES / DEFAULT_LOCALE。
 * 两者抓的是同一件事的不同形态 —— 数据层抓「校验错了」，结构层抓「main 开始知道有哪些语言了」；
 * 即使将来有人把注入逻辑挪出 initialLocaleArguments、或那行测试被误删，这道守卫还在。
 *
 * 必须先剥注释：main.js 里的说明注释**恰好**写了「不 import 允许集、不调 resolveLocale」，
 * 不剥注释的话这道守卫会被自己的文档打败（典型假红）。
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

const FORBIDDEN_IN_MAIN = ["resolveLocale", "AVAILABLE_LOCALES", "DEFAULT_LOCALE"];

function offendingIdentifiers(source) {
  const code = stripComments(source);
  return FORBIDDEN_IN_MAIN.filter((name) => new RegExp(`\\b${name}\\b`).test(code));
}

const mainSource = require("fs").readFileSync(
  path.join(__dirname, "..", "apps", "electron", "main.js"),
  "utf8"
);
const offenders = offendingIdentifiers(mainSource);
check(
  "main.js 不引用任何 i18n 标识符（只透传原始值，判决权在渲染层）",
  offenders.length === 0,
  offenders.length === 0 ? "无" : `出现了：${offenders.join(" / ")}`
);

// 对照：证明这行扫描有区分度，且剥注释生效
check(
  "对照：代码里出现 resolveLocale 会被抓到",
  offendingIdentifiers("const x = resolveLocale(a, b, c);").length === 1
);
check(
  "对照：**注释里**提到 resolveLocale 不算违规（否则被自己的文档打败）",
  offendingIdentifiers("// 这里刻意不调 resolveLocale\nconst x = 1;").length === 0
);

const failed = checks.filter((item) => !item.ok);
if (failed.length > 0) {
  console.error(`\n注入参数解析未通过：${failed.map((item) => item.name).join(" / ")}`);
  process.exit(1);
}
console.log(`OK  注入参数解析：前缀 + 取最后一个匹配 + 不误认他人开关（${checks.length} 项）`);
