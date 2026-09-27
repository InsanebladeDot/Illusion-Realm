/**
 * 冒烟相关文件的**机械校验**（进 `pnpm check`）：把两件「靠人品维持」的约定变成 CI 会拦的规则。
 *
 * 规则 1：声明「不适用 harness」的套件里不得出现时序 / 媒体查询 API。
 *   为什么：`smoke-app.js` / `smoke-task.js` 的文件头写着「只做静态导出页的样式/文本断言，
 *   不受遮挡与事件丢失前提影响」——**负向声明会随时间腐烂**：将来有人在里面加一行
 *   `matchMedia` 断言，注释不会报错。这条把它们钉住：一旦用到这些 API，
 *   必须重估不适用结论并接入 harness。
 *
 *   **豁免机制**：确有必要时（例如只用 `getComputedStyle` 读静态样式、不涉及过渡中间态），
 *   在文件里写一行 `smoke-rules-allow: <API 名>（理由）`。豁免必须**点名 API 并给理由**，
 *   于是「重估」留下了痕迹；没点名的 API 仍然会被拦。
 *
 * 规则 2：接入 harness 的套件不得直接调用 `app.exit()` / `app.quit()`。
 *   为什么：exit 出口收口到一处（`smoke.finish()` / `smoke.exitEnvironment()`），
 *   护栏（构建前置条件、失败不得 exit(0)、quit 的退出码陷阱）才有唯一语义。
 *   散落的调用点会让「干净路径上误调 quit」静默漏过。
 *
 * 两条规则都**先剥注释再匹配**——否则文件头里解释性提到 `matchMedia` 的注释会被误报，
 * 而误报会把这条门禁变成噪音。剥注释与匹配逻辑自带配对对照（见文件末尾）。
 */
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..");
const SCRIPTS_DIR = path.join(REPO_ROOT, "scripts");

/** 去掉行注释与块注释（保守实现：不处理字符串里的 // ，足够本用途） */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

/** 规则 1：这些文件声明了「不适用」，因此不得出现下列 API（除非点名豁免） */
const NOT_APPLICABLE_FILES = ["scripts/smoke-app.js", "scripts/smoke-task.js"];
const TIMING_OR_MEDIA_APIS = ["requestAnimationFrame", "matchMedia", "getComputedStyle"];

/** 从**原始源码**（含注释）读豁免声明：`smoke-rules-allow: getComputedStyle（理由）` */
function allowedApis(source) {
  const allowed = new Set();
  for (const match of source.matchAll(/smoke-rules-allow:\s*([A-Za-z]+)/g)) {
    allowed.add(match[1]);
  }
  return allowed;
}

function findTimingApis(source) {
  const code = stripComments(source);
  const allowed = allowedApis(source);
  return TIMING_OR_MEDIA_APIS.filter(
    (api) => !allowed.has(api) && new RegExp(`\\b${api}\\s*\\(`).test(code)
  );
}

/** 规则 2：接入 harness 的套件不得自己调退出函数 */
function findDirectExits(source) {
  const code = stripComments(source);
  return [/app\.exit\s*\(/, /app\.quit\s*\(/]
    .filter((pattern) => pattern.test(code))
    .map((pattern) => pattern.source);
}

function usesHarness(source) {
  return /require\(["'][^"']*smoke-harness["']\)/.test(source);
}

function readIfExists(relativePath) {
  const absolute = path.join(REPO_ROOT, relativePath);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : null;
}

function main() {
  const failures = [];

  // 规则 1
  for (const file of NOT_APPLICABLE_FILES) {
    const source = readIfExists(file);
    if (source === null) {
      failures.push(`${file} 不存在（声明清单腐烂了）`);
      continue;
    }
    const hits = findTimingApis(source);
    if (hits.length > 0) {
      failures.push(
        `${file} 声明「不受事件丢失 / 遮挡前提影响」，却用到了 ${hits.join(" / ")}；\n` +
          `      → 要么删掉这些断言，要么重估该声明并接入 smoke-harness（backgroundThrottling: false + 遮挡/事件丢失维度）`
      );
    }
  }

  // 规则 2
  const suites = fs
    .readdirSync(SCRIPTS_DIR)
    .filter((name) => /^smoke-.*\.js$/.test(name))
    .map((name) => `scripts/${name}`);
  for (const file of suites) {
    const source = readIfExists(file);
    if (!source || !usesHarness(source)) continue;
    const hits = findDirectExits(source);
    if (hits.length > 0) {
      failures.push(
        `${file} 已接入 harness，却直接调用 ${hits.join(" / ")}；\n` +
          `      → 退出出口必须收口到 smoke.finish({ app, ok, error })，否则护栏语义（不得 exit(0)、quit 退出码陷阱）会被绕过`
      );
    }
  }

  // ---- 规则的配对对照：证明匹配逻辑有区分度，而不是恒真 ----
  const controls = [
    ["剥离注释：文件头提到 matchMedia 不算违规", findTimingApis("// 本文件不依赖 matchMedia\nconst a = 1;").length, 0],
    ["剥离块注释：同上", findTimingApis("/* 不依赖 getComputedStyle */\nconst a = 1;").length, 0],
    ["真的调用 matchMedia 会被抓到", findTimingApis("const m = window.matchMedia('(min-width:1px)');").length, 1],
    ["真的调用 requestAnimationFrame 会被抓到", findTimingApis("requestAnimationFrame(() => {});").length, 1],
    ["注释里的 app.exit( 不算违规", findDirectExits("// 收尾用 smoke.finish，不再 app.exit(0)\nconst a = 1;").length, 0],
    ["真的调用 app.quit( 会被抓到", findDirectExits("app.quit();").length, 1],
    ["真的调用 app.exit( 会被抓到", findDirectExits("app.exit(1);").length, 1],
    [
      "豁免点名后不再违规",
      findTimingApis("// smoke-rules-allow: getComputedStyle（仅静态样式）\ngetComputedStyle(el);").length,
      0,
    ],
    [
      "豁免未点名的 API 仍被拦（豁免不是免死金牌）",
      findTimingApis("// smoke-rules-allow: getComputedStyle（仅静态样式）\nwindow.matchMedia('x');").length,
      1,
    ],
  ];
  for (const [label, actual, expected] of controls) {
    if (actual !== expected) {
      failures.push(`对照失败：${label}（实际 ${actual}，期望 ${expected}）`);
    } else {
      console.log(`PASS  ${label}`);
    }
  }

  if (failures.length > 0) {
    console.error("\n冒烟约定校验未通过：");
    for (const line of failures) console.error(`  · ${line}`);
    process.exit(1);
  }
  console.log(
    `OK  冒烟约定校验：${NOT_APPLICABLE_FILES.length} 个「不适用」声明仍成立；` +
      `接入 harness 的套件未直接调用退出函数（对照 ${controls.length} 条）`
  );
}

main();
