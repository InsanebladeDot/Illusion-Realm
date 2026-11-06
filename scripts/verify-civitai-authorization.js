/**
 * secret：Civitai 凭据由其业务域的密钥模块提供。
 * model-download-transfer：调用下载传输实现处理响应与文件流。
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * civitai.handlers：Civitai 密钥相关 IPC 与密钥实现放在同一业务域。
 * secret：模型下载授权与 Agent 服务商密钥是两个独立边界。
 * model-download-transfer：传输代码继续复用专用网络会话，不另起未经限制的下载入口。
 * ipc-channels：通道值必须与 shared 的类型表一致，路径调整不能重命名通道。
 * civitai.handlers：输入校验和状态摘要仍由主进程封装，页面不直接访问凭据文件。
 * secret：公开状态只能返回配置摘要，不能把原始凭据传到页面。
 * model-download-transfer：错误应沿原任务状态返回，迁移不能把失败传输显示为完成。
 */
/** Verify isolated credential storage, masked IPC and per-hop download authorization without contacting Civitai. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, safeStorage, ipcMain } = require("electron");
const { createSmokeHarness } = require("./lib/smoke-harness");
const smoke = createSmokeHarness({ name: "civitai-authorization", timeoutMs: 30000 });
smoke.installWatchdog(app);
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ir-civitai-auth-"));
process.env.ILLUSION_CIVITAI_SECRET_DIR = root;
const secret = require("../apps/electron/src/main/modules/civitai/secret");
const { fetchDownload } = require("../apps/electron/src/main/modules/models/downloads/model-download-transfer");
const { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels");
const fixtureKey = "test-credential-only-1234";

function verifyStorage() {
  assert.equal(secret.status().configured, false);
  const status = secret.write(fixtureKey);
  assert.deepEqual(Object.keys(status).sort(), ["configured", "protection", "tail"]);
  assert.equal(status.tail, "1234");
  assert.equal(secret.resolve().key, fixtureKey);
  assert.equal(status.protection, safeStorage.isEncryptionAvailable() ? "safeStorage" : "plain");
  const file = path.join(root, "civitai-api-key.json");
  assert.equal(fs.readFileSync(file, "utf8").includes(fixtureKey), false);
  fs.writeFileSync(file, JSON.stringify({ version: 1, protection: "safeStorage", value: "invalid" }));
  assert.equal(secret.status().configured, false, "Unreadable encrypted files must fail closed");
  for (const value of ["", "\n", "a\nb", "a".repeat(4097), null]) assert.throws(() => secret.write(value), /invalid/);
  secret.write(fixtureKey);
  assert.equal(secret.clear().configured, false);
  assert.equal(fs.existsSync(file), false);
  console.log("PASS isolated key roundtrip, masking, protection, invalid inputs, unreadable ciphertext and clear");
}

async function verifyRedirects() {
  const hops = ["https://civitai.red/api/download/models/1", "https://civitai.com/api/download/models/1", "https://files.r2.dev/model"];
  let index = 0;
  const fetcher = async (url, options) => {
    assert.equal(url, hops[index]);
    assert.equal(new Headers(options.headers).get("Authorization"), index < 2 ? `Bearer ${fixtureKey}` : null);
    assert.equal(options.redirect, "manual");
    return ++index < hops.length ? new Response(null, { status: 302, headers: { location: hops[index] } }) : new Response("model");
  };
  await fetchDownload(hops[0], new AbortController().signal, fixtureKey, fetcher);
  assert.equal(index, 3);
  const anonymous = async (_url, options) => { assert.equal(new Headers(options.headers).has("Authorization"), false); return new Response("model"); };
  await fetchDownload(hops[0], new AbortController().signal, anonymous);
  await fetchDownload("https://image.civitai.com/preview.png", new AbortController().signal, fixtureKey, anonymous);
  await assert.rejects(fetchDownload(hops[0], new AbortController().signal, fixtureKey, async () => new Response(null, { status: 403 })), /^Error: auth$/);
  await assert.rejects(fetchDownload(hops[0], new AbortController().signal, fixtureKey, async () => new Response(null, { status: 302, headers: { location: "https://example.org/model" } })), /^Error: invalid$/);
  console.log("PASS auth on Civitai only, stripped on CDN/subdomain, anonymous downloads and redirect whitelist");
}

async function verifyIpc() {
  const handlers = new Map();
  const originalHandle = ipcMain.handle;
  ipcMain.handle = (channel, handler) => { handlers.set(channel, handler); };
  try { require("../apps/electron/src/main/modules/civitai/civitai.handlers").registerCivitaiHandlers(); }
  finally { ipcMain.handle = originalHandle; }
  for (const args of [[], [""], [fixtureKey, "extra"], ["a\nb"]]) {
    const result = await handlers.get(C.CIVITAI_KEY_SET)({}, ...args);
    assert.equal(result.code, "INVALID_ARGUMENT");
  }
  const stored = await handlers.get(C.CIVITAI_KEY_SET)({}, fixtureKey);
  assert.equal(stored.success, true);
  assert.equal(JSON.stringify(stored).includes(fixtureKey), false);
  assert.equal((await handlers.get(C.CIVITAI_KEY_STATUS)({})).data.configured, true);
  assert.equal((await handlers.get(C.CIVITAI_KEY_CLEAR)({})).data.configured, false);
  console.log("PASS IPC argument counts and validation, masked responses and clear");
}

app.whenReady().then(async () => {
  try {
    verifyStorage(); smoke.check("Credential storage assertions", true);
    await verifyRedirects(); smoke.check("Per-hop authorization assertions", true);
    await verifyIpc(); smoke.check("Masked IPC assertions", true);
    smoke.finish({ app, ok: true });
  }
  catch (error) { smoke.finish({ app, ok: false, error }); }
}).catch((error) => smoke.finish({ app, ok: false, error }));
