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
const secret = require("../apps/electron/civitai-secret");
const { fetchDownload } = require("../apps/electron/services/model-download-transfer");
const { IPC_CHANNELS: C } = require("../apps/electron/ipcChannels");
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
  try { require("../apps/electron/ipc-handlers/civitai.handlers").registerCivitaiHandlers(); }
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
