/**
 * 「门禁自检」总入口：把散在各处的**负向对照**收拢成一条可执行作业。
 *
 * 为什么需要：这一套门禁的价值全在「能主动制造故障」。但故障注入原本散在四处，
 * 全靠人记得开环境变量 —— 没人记得开的东西等于不存在。这条作业把它们固定下来：
 *
 *   1. Next 侧三件套的配对对照（16 条，`apps/next/scripts/self-test-gates.mjs`）
 *   2. 构建指纹的确定性对照（`record-build-fingerprint.js --compare`）
 *   3. 退出码护栏四例 + 两条行为不变量（`self-test-harness-guard.js`）
 *   4. 事件丢失维度（`SMOKE_SWALLOW_MEDIA_EVENT=all`）——**headless 可跑**的最坏情况注入
 *
 * 刻意**不含** `SMOKE_OCCLUDE=1`：那条需要真实可见窗口（无桌面会话时会被显式 SKIP），
 * 属于本地 / 带桌面会话 runner 的维度。两个维度分开命名正是为了这一刻。
 *
 * 跑法：
 *   `pnpm self-test:gate`           正常跑，0 = 全通过
 *   `node scripts/self-test-gates.js --chaos`
 *       混沌模式：故意给一个**错误期望**，要求调度层必须把它报成失败。
 *       为什么需要：这个 runner 自己谎报过一次（把人类可读的标签当 CLI 参数传下去，
 *       未知 case 回落默认分支 → 前两例因为错误的理由通过）。**调度层说谎比断言说谎更隐蔽**，
 *       所以它自己也得有一条负向测试 —— 靠运气发现一次不算制度化。
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..");
const electronBinary = require("electron");
const CHAOS = process.argv.includes("--chaos") || process.argv.includes("--chaos=pass");
const CHAOS_EXPECT_PASS = process.argv.includes("--chaos=pass");

const steps = [];
function record(name, ok, detail) {
  steps.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

/** 同步跑一个子进程，输出直接透传（不捕获管道，避免平台差异） */
function runChild(name, command, args, { env = {}, expectExit = 0 } = {}) {
  console.log(`\n=== ${name} ===`);
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  record(name, result.status === expectExit, `退出码=${result.status}（期望 ${expectExit}）`);
}

/** 需要校验 stdout 完整性的步骤：这一例必须捕获管道 */
function runCapturing(name, command, args, { expectExit = 0, mustContain = "" } = {}) {
  console.log(`\n=== ${name} ===`);
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  const stdout = result.stdout ?? "";
  const hasTail = mustContain === "" || stdout.includes(mustContain);
  record(
    name,
    result.status === expectExit && hasTail,
    `退出码=${result.status}（期望 ${expectExit}）、stdout ${stdout.split("\n").length} 行、` +
      `末行标记${hasTail ? "完整" : "**丢失**"}`
  );
}

/** 退出码护栏 + 两条行为不变量的用例表（label 与 caseId 分开传，别把标签当参数） */
const GUARD_CASES = [
  ["有失败却 exit(0) → 必须 1", "exit-zero-with-failure", 1],
  ["有失败时 app.quit() → 必须 1", "quit-with-failure", 1],
  ["干净时 app.quit() → 必须 0（不得误伤正常收尾）", "quit-with-clean", 0],
  ["干净退出 → 必须 0（不得误伤）", "exit-zero-clean", 0],
  ["不变量①：app.quit() 无视 process.exitCode（退出码 0）", "quit-exitcode-ignored", 0],
];

function main() {
  if (CHAOS) {
    /**
     * 混沌模式**双向**覆盖调度层：
     *   ① 故意给错误期望 → 必须报 FAIL（防「把失败吞成成功」）
     *   ② 故意给正确期望 → 必须报 PASS（防「把成功报成失败」）
     * 为什么两个方向都要：这个 runner 真的谎报过一次 —— 未知 case 回落默认分支，
     * 让前两例「因为错误的理由通过」。只测一个方向就漏掉另一半。
     */
    const mode = CHAOS_EXPECT_PASS ? "成功路径" : "失败路径";
    console.log(`=== 混沌模式（${mode}）：调度层必须如实报出结果 ===`);
    runChild(
      CHAOS_EXPECT_PASS
        ? "混沌：正确期望必须被报成通过"
        : "混沌：错误期望必须被报出来",
      electronBinary,
      ["scripts/self-test-harness-guard.js", "exit-zero-clean"],
      { expectExit: CHAOS_EXPECT_PASS ? 0 : 99 }
    );
    const reported = CHAOS_EXPECT_PASS ? steps[0].ok === true : steps[0].ok === false;
    console.log(
      reported
        ? `\n混沌模式（${mode}）：调度层如实报出结果 ✓（自检没有说谎）`
        : `\n混沌模式（${mode}）：**调度层报错了** ✗ —— 自检本身不可信，先修调度层`
    );
    process.exit(reported ? 0 : 1);
  }

  // 1. Next 侧配对对照（16 条）
  runChild("Next 侧三件套配对对照（check:gates）", process.execPath, [
    "apps/next/scripts/self-test-gates.mjs",
  ]);

  // 2. 构建指纹确定性对照（需要先有一次构建；缺基准时显式记为未覆盖，不静默略过）
  const recordFile = path.join(REPO_ROOT, "apps", "next", ".next", "build-fingerprint.json");
  if (fs.existsSync(recordFile)) {
    runChild("构建指纹确定性对照（--compare）", process.execPath, [
      "scripts/record-build-fingerprint.js",
      "--compare",
    ]);
  } else {
    record(
      "构建指纹确定性对照（--compare）",
      false,
      "缺少构建基准：先跑 pnpm --filter @illusion-realm/next build（本环节未执行）"
    );
  }

  // 3. 护栏四例 + 行为不变量①
  for (const [label, caseId, expected] of GUARD_CASES) {
    runChild(
      `退出码护栏自检：${label}`,
      electronBinary,
      ["scripts/self-test-harness-guard.js", caseId],
      { expectExit: expected }
    );
  }

  // 4. 行为不变量②：stdout 完整性（捕获管道，检查末行标记）
  runCapturing(
    "不变量②：stdout 完整性（200 行 + app.exit(7)）",
    electronBinary,
    ["scripts/self-test-harness-guard.js", "stdout-completeness"],
    { expectExit: 7, mustContain: "LAST_LINE" }
  );

  // 4. 启动语言注入的三档自检（各自独立进程：`additionalArguments` 只在新建渲染进程时生效）
  runChild("启动语言注入自检（不传 / en / ja 三档，独立进程）", electronBinary, [
    "scripts/self-test-locale-injection.js",
  ]);

  // 5. 事件丢失维度（最坏情况：matchMedia 的 change 永远不来），headless 可跑
  runChild("事件丢失维度（SMOKE_SWALLOW_MEDIA_EVENT=all）", electronBinary, [
    "scripts/smoke-prompt-assembly.js",
  ], { env: { SMOKE_SWALLOW_MEDIA_EVENT: "all" } });

  const failed = steps.filter((step) => !step.ok);
  console.log(
    `\n门禁自检：${steps.length - failed.length}/${steps.length} 通过` +
      (failed.length > 0 ? ` —— 不通过：${failed.map((step) => step.name).join(" / ")}` : "")
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main();
