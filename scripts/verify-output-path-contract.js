/**
 * 「输出路径」契约的机械门禁（纯 Node，无需 Electron，进 `pnpm check`）。
 *
 * 为什么需要它：这条契约刚被校验器反咬过一次 ——
 * `outputPaths.resolveOutputPath()` 的契约是「未指定时回落默认路径」，**显式处理空串**；
 * 但 `ipc-handlers/files.handlers.js` 的校验器却要求 `customOutputPath` 非空，
 * 于是**回落在 IPC 边界成了死代码**，症状是两个看起来毫不相干的 bug：
 *   ① 设置页显示着默认路径（`getDefaultOutputPath()`），生成保存却失败，
 *      报 `customOutputPath 必须是非空字符串`（store 里的值其实是空串）；
 *   ② 创建页永远列不出默认目录里的图（列表通道同样被拦）。
 *
 * 检查两件事：
 *   A. 运行时：`resolveOutputPath` 对 `undefined / null / "" / 空白` 都回落默认，对显式路径不覆盖。
 *   B. 源码不变量：files.handlers.js 里所有 `customOutputPath` 校验必须是**可选**校验器
 *      （空 = 用默认），且不允许退回 `requireString`。
 *
 * 都用**桩替换 appPaths** 的方式在纯 Node 下加载主进程模块（不启 Electron）：
 * 用 `require.cache` 预置一个假的 `getAppRootDir`，这样断言与平台无关、可进 CI。
 */
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..");
const APP_PATHS_MODULE = path.join(REPO_ROOT, "apps", "electron", "appPaths.js");
const OUTPUT_PATHS_MODULE = path.join(REPO_ROOT, "apps", "electron", "outputPaths.js");
const FILES_HANDLERS = path.join(REPO_ROOT, "apps", "electron", "ipc-handlers", "files.handlers.js");

const FAKE_APP_ROOT = path.join(REPO_ROOT, "fake-app-dir");

/** 用桩替换 appPaths，避免在纯 Node 下拉起 Electron 依赖 */
function loadOutputPathsWithStub() {
  require.cache[APP_PATHS_MODULE] = {
    id: APP_PATHS_MODULE,
    filename: APP_PATHS_MODULE,
    loaded: true,
    exports: { getAppRootDir: () => FAKE_APP_ROOT },
  };
  return require(OUTPUT_PATHS_MODULE);
}

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

/** 源码级不变量：解析出所有 `customOutputPath` 的校验器调用 */
function customOutputPathValidators(source) {
  return [...source.matchAll(/require(String|OptionalString)\(args\[0\], "customOutputPath"\)/g)].map(
    (match) => match[1]
  );
}

function main() {
  const { resolveOutputPath, getDefaultOutputPath } = loadOutputPathsWithStub();
  const expectedDefault = path.join(path.dirname(FAKE_APP_ROOT), "fake-app-dir Output");

  check("默认路径 = 软件目录同级的「{目录名} Output」", getDefaultOutputPath() === expectedDefault,
    getDefaultOutputPath());

  // ---- A. 运行时回落语义 ----
  check("空串 → 回落默认路径", resolveOutputPath("") === expectedDefault, resolveOutputPath(""));
  check("纯空白 → 回落默认路径", resolveOutputPath("   ") === expectedDefault);
  check("undefined → 回落默认路径", resolveOutputPath(undefined) === expectedDefault);
  check("null → 回落默认路径", resolveOutputPath(null) === expectedDefault);
  // 负向对照：显式路径**不得**被覆盖，否则「回退」会变成「忽略用户设置」
  check("负向对照：显式路径原样保留", resolveOutputPath("D:\\custom") === "D:\\custom",
    resolveOutputPath("D:\\custom"));
  check("显式路径两侧空白被裁掉", resolveOutputPath("  D:\\custom  ") === "D:\\custom");

  // ---- B. 源码不变量：校验器必须是可选校验 ----
  const handlersSource = fs.readFileSync(FILES_HANDLERS, "utf8");
  const validators = customOutputPathValidators(handlersSource);
  check("files.handlers.js 里存在 customOutputPath 校验点（防解析器失配而恒真）",
    validators.length >= 4, `${validators.length} 处`);
  check("所有 customOutputPath 校验都用可选校验器（空 = 默认路径）",
    validators.length > 0 && validators.every((name) => name === "OptionalString"),
    validators.join(" / "));

  // 解析器自身的配对对照：换成 requireString 必须被认出来
  const syntheticBad = 'const x = requireString(args[0], "customOutputPath");';
  const syntheticGood = 'const x = requireOptionalString(args[0], "customOutputPath");';
  check("负向对照：解析器能认出 requireString（否则上面那条是恒真）",
    customOutputPathValidators(syntheticBad).join() === "String",
    customOutputPathValidators(syntheticBad).join() || "(空)");
  check("解析器认得 requireOptionalString",
    customOutputPathValidators(syntheticGood).join() === "OptionalString");

  const failed = checks.filter((item) => !item.ok);
  if (failed.length > 0) {
    console.error(`\n输出路径契约未通过：${failed.map((item) => item.name).join(" / ")}`);
    console.error(
      "  提示：`customOutputPath` 空串代表「用默认路径」，校验必须用 requireOptionalString；\n" +
        "  改成 requireString 会让回落逻辑在 IPC 边界变成死代码（保存失败 + 创建页列不出图）。"
    );
    process.exit(1);
  }
  console.log(`OK  输出路径契约：用时回落 / 显式不覆盖 / 校验器可选（${checks.length} 项）`);
}

main();
