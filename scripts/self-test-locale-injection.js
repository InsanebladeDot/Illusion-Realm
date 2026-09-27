/**
 * 启动语言注入的渲染侧三档自检（真实 Electron，秒级）。
 *
 * ## 为什么是「自己派生自己」的多进程形状
 * `additionalArguments` **只在该窗口新建渲染进程时生效**。同一进程里连续开三个窗口时，
 * 第二个窗口会复用第一个的渲染进程，于是它的 argv 从未进入那个进程 ——
 * 实测症状：第 1 档（不传）通过，第 2 档（传 en）读到 `undefined`。
 * 所以每一档必须跑在**独立进程**里（与 `self-test-harness-guard.js` 同款形状）。
 *
 * ## 三档（对应 docs/locale-hydration.md 第九节 e）
 *   1. 不传                  → `undefined`（missing）
 *   2. `--illusion-locale=en` → `"en"`（stored）
 *   3. `--illusion-locale=ja` → `"ja"`（**原样透传**，非法值由渲染层判）
 * 第 3 档是核心理由：若 preload 侧顺手清洗成合法值，正式窗口上 `invalid` 那格永远测不到。
 *
 * 退出码：0 通过 / 1 断言失败 / 3 **SKIP**（探针页面无法加载 —— 注入语义未验证，不计入覆盖）。
 *
 * 页面取法：`about:blank`。两个实测坑记在这里免得重踩：`data:` 顶层导航被本版本拒；
 * `file://` 页面**配上 preload** 也加载不了（同页面不带 preload 正常）。
 */
const path = require("path");
const { spawnSync } = require("child_process");
const { app, BrowserWindow } = require("electron");

const PRELOAD = path.join(__dirname, "..", "apps", "electron", "preload.js");
const EXIT_SKIP = 3;

const CASES = [
  {
    id: "no-arg",
    label: "不传 additionalArguments → undefined（missing → 回退 zh-CN）",
    additionalArguments: null,
    expected: null,
  },
  {
    id: "en",
    label: '--illusion-locale=en → "en"（stored）',
    additionalArguments: ["--illusion-locale=en"],
    expected: "en",
  },
  {
    id: "ja",
    label: '--illusion-locale=ja → "ja"（非法值原样透传，判决权在渲染层）',
    additionalArguments: ["--illusion-locale=ja"],
    expected: "ja",
  },
];

/** 单档模式（由 runner 派生） */
async function runSingleCase(caseId) {
  const target = CASES.find((item) => item.id === caseId);
  if (!target) {
    console.error(`[case] 未知用例 "${caseId}"。可用：${CASES.map((item) => item.id).join(" / ")}`);
    app.exit(2);
    return;
  }

  const win = new BrowserWindow({
    width: 400,
    height: 300,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: PRELOAD,
      ...(target.additionalArguments ? { additionalArguments: target.additionalArguments } : {}),
    },
  });

  try {
    await win.loadURL("about:blank");
  } catch (error) {
    console.log(`[SKIP] ${caseId}：探针页面无法加载（${String(error).slice(0, 100)}）—— 未验证`);
    app.exit(EXIT_SKIP);
    return;
  }

  const actual = await win.webContents.executeJavaScript(
    `window.initialLocale === undefined ? null : window.initialLocale`
  );
  const type = await win.webContents.executeJavaScript(`typeof window.initialLocale`);
  win.destroy();

  const ok = actual === target.expected;
  console.log(
    `${ok ? "PASS" : "FAIL"}  [${caseId}] ${target.label}  ` +
      `(actual=${JSON.stringify(actual)} expected=${JSON.stringify(target.expected)} type=${type})`
  );
  app.exit(ok ? 0 : 1);
}

/** runner 模式：逐档派生独立进程并断言退出码 */
function runAllCases() {
  const failures = [];
  let skipped = 0;

  for (const item of CASES) {
    const result = spawnSync(process.execPath, [__filename, "--case", item.id], {
      stdio: "inherit",
    });
    if (result.status === EXIT_SKIP) {
      skipped += 1;
      failures.push(`${item.id}：SKIP（未验证）`);
    } else if (result.status !== 0) {
      failures.push(`${item.id}：退出码 ${result.status}`);
    }
  }

  if (failures.length > 0) {
    console.error(
      `\n启动语言注入自检：${CASES.length - skipped}/${CASES.length} 通过` +
        (skipped > 0 ? `（跳过 ${skipped}）` : "") +
        ` —— ${failures.join(" / ")}`
    );
    app.exit(1);
    return;
  }
  console.log(`\n启动语言注入自检：${CASES.length}/${CASES.length} 通过 ✓（三档独立进程）`);
  app.exit(0);
}

app.whenReady().then(async () => {
  const caseIndex = process.argv.indexOf("--case");
  if (caseIndex >= 0) {
    await runSingleCase(process.argv[caseIndex + 1]);
    return;
  }
  runAllCases();
});
