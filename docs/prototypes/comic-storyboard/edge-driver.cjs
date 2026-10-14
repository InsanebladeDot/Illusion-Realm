/** Start and close only a private Edge instance; CDP requests have bounded waits. */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const { once } = require("events");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function startBrowser() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ir-comic-workbench-"));
  const child = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  let startupError;
  child.on("error", error => { startupError = error; });
  try {
    const portFile = path.join(profile, "DevToolsActivePort");
    for (let i = 0; !fs.existsSync(portFile); i++) {
      if (startupError || child.exitCode !== null || i > 100) throw startupError || Error("Browser startup failed");
      await pause(100);
    }
    const [port, endpoint] = fs.readFileSync(portFile, "utf8").split(/\r?\n/);
    const socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
    await once(socket, "open");
    return await connect(socket, child);
  } catch (error) { if (child.exitCode === null) child.kill(); throw error; }
}
async function connect(socket, child) {
  let count = 0, sessionId;
  let fileChoosers = 0;
  const pending = new Map();
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data), item = pending.get(message.id);
    if (message.method === "Page.fileChooserOpened") fileChoosers++;
    if (!item) return;
    clearTimeout(item.timer); pending.delete(message.id);
    message.error ? item.reject(Error(message.error.message)) : item.resolve(message.result);
  });
  function send(method, params = {}, browser = false) {
    return new Promise((resolve, reject) => {
      const id = ++count, timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 15000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, ...(!browser && sessionId ? { sessionId } : {}) }));
    });
  }
  const { targetId } = await send("Target.createTarget", { url: "about:blank" }, true);
  sessionId = (await send("Target.attachToTarget", { targetId, flatten: true }, true)).sessionId;
  await send("Page.enable");
  return {
    send,
    fileChooserRequests: () => fileChoosers,
    evaluate: async expression => {
      const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    close: () => closeBrowser(socket, child, send),
  };
}
async function closeBrowser(socket, child, send) {
  if (socket.readyState === WebSocket.OPEN) {
    try { await send("Browser.close", {}, true); } catch { /* Disconnect during close is expected. */ }
    socket.close();
  }
  if (child.exitCode === null) {
    await Promise.race([once(child, "exit"), pause(2000)]);
    if (child.exitCode === null) child.kill();
  }
}
module.exports = { startBrowser, pause };
