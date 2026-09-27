/**
 * smoke-harness 退出码护栏的自检（配对对照，需真实 Electron）。
 *
 * 为什么单独有这个文件：护栏本身也会说谎。若没人验证「护栏真的会拦」，
 * 它和没有护栏是一样的 —— 而这里要防的恰恰是「失败被当成成功」这种最贵的错误。
 * 更进一步：**调度层也会说谎** —— 曾经出现过「未知 case 回落到默认分支」，
 * 导致前两例因为错误的理由通过（见 logs.md）。所以：
 *   · 未给 case → **永久失败**（不再回落到任何默认分支）；
 *   · 未知 case → 响亮失败并列出可用值（exit 2）。
 *
 * 跑法（各自独立进程）：
 *   npx electron scripts/self-test-harness-guard.js exit-zero-with-failure  # 期望 1
 *   npx electron scripts/self-test-harness-guard.js quit-with-failure       # 期望 1
 *   npx electron scripts/self-test-harness-guard.js quit-with-clean         # 期望 0
 *   npx electron scripts/self-test-harness-guard.js exit-zero-clean         # 期望 0
 *   npx electron scripts/self-test-harness-guard.js quit-exitcode-ignored   # 期望 0（行为不变量）
 *   npx electron scripts/self-test-harness-guard.js stdout-completeness     # 期望 7 且末行完整
 *
 * 后两例不是「护栏」的用例，而是把两条**已证实的行为**钉成不变量：
 *   ① Electron 的 `app.quit()` 无视 `process.exitCode`（所以护栏的存在是必要的）；
 *   ② 受控实验未能复现「app.exit() 截断 stdout」（所以不必改退出机制）。
 * 它们一旦变红，说明 Electron 行为变了，我们对护栏与退出机制的取舍要重估。
 */
const { app } = require("electron");
const { createSmokeHarness } = require("./lib/smoke-harness");

const KNOWN_CASES = new Set([
  "exit-zero-with-failure",
  "quit-with-failure",
  "quit-with-clean",
  "exit-zero-clean",
  "quit-exitcode-ignored",
  "stdout-completeness",
]);

const CASE = process.argv[2];

/**
 * 缺 case 或未知 case 一律**响亮失败**（exit 2），绝不回落默认分支：
 * 回落本身就是危险的控制流 —— 哪怕回落到一个失败，也会让「参数传错」看起来像「用例通过」。
 */
if (!CASE || !KNOWN_CASES.has(CASE)) {
  console.error(
    `[self-test] ${CASE ? `未知用例 "${CASE}"` : "缺少用例参数"}。` +
      `可用：${[...KNOWN_CASES].join(" / ")}\n` +
      "  （刻意不设默认分支：调度层传错参数必须立刻可见）"
  );
  process.exit(2);
}

const smoke = createSmokeHarness({ name: "self-test-guard" });
smoke.installConsoleTee();
smoke.installWatchdog(app);

const STDOUT_LINE_COUNT = 200;
const PAD = "x".repeat(60);

app.whenReady().then(() => {
  console.log(`[self-test] case=${CASE}`);

  if (CASE === "stdout-completeness") {
    // 不变量 ②：200 行定长输出后直接退出，末行必须完整送达（外壳负责数行）
    for (let index = 0; index < STDOUT_LINE_COUNT; index += 1) {
      const no = String(index).padStart(3, "0");
      console.log(`L${no} ${PAD}${index === STDOUT_LINE_COUNT - 1 ? " LAST_LINE" : ""}`);
    }
    app.exit(7);
    return;
  }

  if (CASE === "quit-exitcode-ignored") {
    // 不变量 ①：干净路径下 process.exitCode 会被 app.quit() 丢掉（实测退出码 0）
    smoke.check("对照：干净路径（无失败断言）", true);
    process.exitCode = 7;
    app.quit();
    return;
  }

  if (CASE === "quit-with-clean") {
    // 干净时护栏放行 app.quit()（证明不是「一律禁 quit」而误伤正常收尾）
    smoke.check("对照：干净路径", true);
    app.quit();
    return;
  }

  if (CASE === "exit-zero-clean") {
    smoke.check("对照：全部通过", true);
    app.exit(0);
    return;
  }

  // 以下两例都要先制造一条失败断言（不通过 finish，直接退出 —— 这才需要护栏）
  smoke.check("故意失败的断言（自检用）", false, "这条永远红，用于验证护栏");

  if (CASE === "quit-with-failure") {
    app.quit();
    return;
  }

  app.exit(0);
});
