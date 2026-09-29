/**
 * IPC 契约冒烟测试（第 1 轮改造的回归网）。
 *
 * 用真实的 preload + 真实的 handler 注册，在渲染上下文里调用 window.electronAPI，
 * 断言：
 * 1. 成功路径返回 { success: true, data }，且 data 形状不变（缺省路径 / 读取用户数据）；
 * 2. 失败路径返回 { success: false, error, code }，不再跨边界抛异常（空路径 → INVALID_ARGUMENT）；
 * 3. 不存在的文件按原语义回落为 data: null（读操作静默回落）；
 * 4. 通道名常量两端一致（由 scripts/verify-electron-modules.js 另行断言）。
 *
 * 运行：pnpm exec electron scripts/smoke-ipc-result.js
 * 退出码 0 = 契约成立；1 = 有断言失败。
 */
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { app, BrowserWindow } = require("electron");
const { registerAllIpcHandlers } = require("../apps/electron/ipc-handlers");

/**
 * 密钥那几条断言要真的写文件，因此**先把它重定向到临时目录**：
 * 一来不会冲掉用户本机正在用的 key，二来"本机配没配"不再影响断言结果。
 * 用的是主进程侧的自检开关 `ILLUSION_AGENT_SECRET_DIR`（见 agent/secret.js）。
 */
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "ipc-result-smoke-"));
process.env.ILLUSION_AGENT_SECRET_DIR = path.join(workDir, "secret");

const PRELOAD_PATH = path.join(__dirname, "..", "apps", "electron", "preload.js");
const PROBE_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>ipc-probe</title></head><body></body></html>`;

/** preload 只在 http(s)/file 等常规页面执行，因此起一个最小 http 服务承载探测页 */
function startProbeServer() {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(PROBE_HTML);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}/` });
    });
  });
}

function assertShape(name, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  return ok;
}

app.whenReady().then(async () => {
  // 先注册全部 handler，再打开承载探测页的窗口
  registerAllIpcHandlers();
  const { server, url } = await startProbeServer();

  const win = new BrowserWindow({
    width: 900,
    height: 600,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: PRELOAD_PATH,
    },
  });

  win.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error("PRELOAD_ERROR", preloadPath, error);
  });

  try {
    await win.loadURL(url);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const probe = await win.webContents.executeJavaScript(`(async () => {
      const api = window.electronAPI;
      if (!api) return { error: "window.electronAPI 未暴露" };

      const out = {};
      out.hasApi = true;
      out.fullScreen = await api.setFullScreen(false);
      out.defaultOutput = await api.getDefaultOutputPath();
      out.listImageFilesEmpty = await api.listImageFiles("");
      out.readMissingImage = await api.readLocalImage(
        "Z:\\\\__definitely_missing__\\\\nope.png"
      );
      out.userData = await api.readUserData();
      out.unknownChannelGuard = typeof api.videoProbe === "function";
      /**
       * agent 密钥（设置页那一块）：preload → IPC → 主进程加密落盘 的整趟往返。
       * **只在「本机还没配」时才写入/清除** —— 已配置时动它会冲掉用户正在用的 key，
       * 那种情况宁可打一条 SKIP（跳过比假绿诚实）。
       */
      const secretBefore = await api.agentSecretStatus();
      out.agentSecretBefore = secretBefore;
      if (secretBefore.success && secretBefore.data.configured === false) {
        out.agentSecretSet = await api.agentSetSecret("sk-smoke-1234abcd");
        out.agentSecretAfterSet = await api.agentSecretStatus();
        /** 空字符串必须被**拒绝**（否则「保存」会退化成「清空」） */
        out.agentSecretBlank = await api.agentSetSecret("   ");
        out.agentSecretCleared = await api.agentClearSecret();
        out.agentSecretAfterClear = await api.agentSecretStatus();
      }
      return out;
    })()`);

    if (probe.error) {
      console.log("FAIL  preload 未生效:", probe.error);
      server.close();
      app.exit(1);
      return;
    }

    const results = [
      assertShape(
        "setFullScreen 返回 IpcResult",
        probe.fullScreen && probe.fullScreen.success === true,
        JSON.stringify(probe.fullScreen)
      ),
      assertShape(
        "getDefaultOutputPath 成功且 data 为非空字符串",
        probe.defaultOutput &&
          probe.defaultOutput.success === true &&
          typeof probe.defaultOutput.data === "string" &&
          probe.defaultOutput.data.length > 0,
        probe.defaultOutput && probe.defaultOutput.data
      ),
      assertShape(
        "listImageFiles('') 返回失败形状 + INVALID_ARGUMENT",
        probe.listImageFilesEmpty &&
          probe.listImageFilesEmpty.success === false &&
          typeof probe.listImageFilesEmpty.error === "string" &&
          probe.listImageFilesEmpty.code === "INVALID_ARGUMENT",
        JSON.stringify(probe.listImageFilesEmpty)
      ),
      assertShape(
        "readLocalImage(不存在) 回落为 data: null",
        probe.readMissingImage &&
          probe.readMissingImage.success === true &&
          probe.readMissingImage.data === null,
        JSON.stringify(probe.readMissingImage)
      ),
      assertShape(
        "readUserData 成功且 data 含 filePath/data 字段",
        probe.userData &&
          probe.userData.success === true &&
          typeof probe.userData.data?.filePath === "string" &&
          typeof probe.userData.data?.data === "object",
        probe.userData && probe.userData.data && probe.userData.data.filePath
      ),
      assertShape("invoke 类 API 均存在", probe.unknownChannelGuard === true),
    ];

    /**
     * agent 密钥：状态摘要**不许带原值**（只准这四个字段），写入后能读到状态、
     * 空字符串被拒、清除后回到未配置。源文件里那一层（加密落盘 / 明文标记）
     * 由 scripts/verify-electron-modules.js 断言，这里只管跨进程那一趟。
     */
    const before = probe.agentSecretBefore;
    const allowedKeys = ["configured", "source", "protection", "tail"];
    results.push(
      assertShape(
        "agentSecretStatus 只回状态摘要（configured/source/protection/tail）",
        before?.success === true &&
          typeof before.data?.configured === "boolean" &&
          Object.keys(before.data).every((key) => allowedKeys.includes(key)) &&
          !("value" in before.data),
        JSON.stringify(before?.data)
      )
    );

    if (probe.agentSecretSet) {
      results.push(
        assertShape(
          "agentSetSecret 保存成功且只回尾 4 位",
          probe.agentSecretSet.success === true &&
            probe.agentSecretSet.data?.configured === true &&
            probe.agentSecretSet.data?.tail === "abcd" &&
            !JSON.stringify(probe.agentSecretSet).includes("sk-smoke-1234abcd"),
          JSON.stringify(probe.agentSecretSet)
        ),
        assertShape(
          "保存后状态为已配置（source=stored）",
          probe.agentSecretAfterSet?.success === true &&
            probe.agentSecretAfterSet.data?.configured === true &&
            probe.agentSecretAfterSet.data?.source === "stored",
          JSON.stringify(probe.agentSecretAfterSet?.data)
        ),
        assertShape(
          "agentSetSecret('  ') 被拒（INVALID_ARGUMENT）",
          probe.agentSecretBlank?.success === false &&
            probe.agentSecretBlank.code === "INVALID_ARGUMENT",
          JSON.stringify(probe.agentSecretBlank)
        ),
        assertShape(
          "agentClearSecret 后回到未配置",
          probe.agentSecretCleared?.success === true &&
            probe.agentSecretAfterClear?.data?.configured === false,
          JSON.stringify(probe.agentSecretAfterClear?.data)
        )
      );
    } else {
      console.log(
        `SKIP  agent 密钥的写入/清除：本机已配置（source=${before?.data?.source}），` +
          "不覆盖用户正在用的 key"
      );
    }

    const failed = results.filter((ok) => !ok).length;
    console.log(failed === 0 ? "\nIPC CONTRACT OK ✓" : `\n${failed} ASSERTION(S) FAILED ✗`);
    fs.rmSync(workDir, { recursive: true, force: true });
    server.close();
    app.exit(failed === 0 ? 0 : 1);
  } catch (error) {
    console.error("SMOKE_FAIL", error);
    server.close();
    app.exit(1);
  }
});
