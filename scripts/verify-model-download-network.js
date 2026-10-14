/** Exercise real Chromium HTTP redirects/streams; fixture-only DNS routes and validators never touch production sessions. */
const assert = require("node:assert/strict");
const http = require("node:http");
const { app, session } = require("electron");
const { createDownloadTransport, allowedUrl } = require("../apps/electron/services/model-download-network");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "model-download-network", timeoutMs: 45000 });
smoke.installWatchdog(app);
const hosts = ["civitai.red", "civitai.com", "b2.civitai.com"];
app.commandLine.appendSwitch("host-resolver-rules", hosts.map((host) => `MAP ${host} 127.0.0.1`).join(", "));
const key = "test-network-credential-1234";
const requests = [];
const bytes = Buffer.alloc(1024 * 1024, 42);
let port;
function serve(request, response) {
  const url = new URL(request.url, "http://" + request.headers.host);
  requests.push({ host: url.hostname, path: url.pathname, auth: request.headers.authorization, marker: request.headers["x-illusion-realm-download-id"], cookie: request.headers.cookie });
  if (url.pathname === "/start") { response.writeHead(302, { location: `http://civitai.com:${port}/middle` }); response.end(); return; }
  if (url.pathname === "/middle") { response.writeHead(307, { location: `http://b2.civitai.com:${port}/file` }); response.end(); return; }
  if (url.pathname === "/blocked") { response.writeHead(302, { location: "http://outside.test/file" }); response.end(); return; }
  if (url.pathname === "/loop") { response.writeHead(302, { location: "/loop" }); response.end(); return; }
  if (url.pathname === "/auth") { response.writeHead(401); response.end(); return; }
  if (url.pathname === "/login-redirect") { response.writeHead(307, { location: "/login" }); response.end(); return; }
  if (url.pathname === "/pending") return;
  response.writeHead(200, { "content-type": "application/octet-stream", "content-length": bytes.length });
  let offset = 0;
  const timer = setInterval(() => {
    response.write(bytes.subarray(offset, offset + 16384)); offset += 16384;
    if (offset >= bytes.length) { clearInterval(timer); response.end(); }
  }, url.pathname === "/slow" ? 100 : 2);
  response.on("close", () => clearInterval(timer));
}
async function redirectChecks(target, transport, rootUrl) {
  await target.cookies.set({ url: rootUrl, name: "fixture-cookie", value: "not-sent" });
  await assert.rejects(target.fetch(rootUrl + "/start", { redirect: "manual", signal: AbortSignal.timeout(10000) }), /Redirect was cancelled/);
  requests.length = 0;
  const response = await transport.fetch(rootUrl + "/start", { headers: { Authorization: `Bearer ${key}` } });
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  assert.deepEqual(requests.map((item) => item.auth), [`Bearer ${key}`, `Bearer ${key}`, undefined]);
  assert.equal(requests.every((item) => !item.marker && !item.cookie), true);
  smoke.check("Real 302/307 chain streams fully, preserves first-party auth and strips CDN auth/private markers/cookies", true);
  await assert.rejects(transport.fetch(rootUrl + "/blocked", { headers: { Authorization: `Bearer ${key}` } }), /^Error: redirect$/);
  const beforeLoop = requests.length;
  await assert.rejects(transport.fetch(rootUrl + "/loop"), /^Error: redirect$/);
  assert.equal(requests.length - beforeLoop <= 9, true);
  const anonymous = await transport.fetch(rootUrl + "/auth");
  assert.equal(anonymous.status, 401); await anonymous.body?.cancel();
  await assert.rejects(transport.fetch(rootUrl + "/login-redirect"), /^Error: auth$/);
  assert.equal(requests.some((item) => item.path === "/login"), false);
  smoke.check("Unsafe redirects and loops stop before dispatch, while authorization responses remain identifiable", true);
}
async function cancellationChecks(transport, rootUrl) {
  const cancelled = new AbortController();
  const response = await transport.fetch(rootUrl + "/slow", { signal: cancelled.signal });
  const reader = response.body.getReader();
  assert.equal((await reader.read()).done, false);
  cancelled.abort();
  await assert.rejects(reader.read()); reader.releaseLock();
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new Error("timeout")), 100);
  try { await assert.rejects(transport.fetch(rootUrl + "/pending", { signal: timeout.signal }), /^Error: timeout$/); }
  finally { clearTimeout(timer); }
  const preCancelled = new AbortController(); preCancelled.abort();
  await assert.rejects(transport.fetch(rootUrl + "/file", { signal: preCancelled.signal }));
  assert.equal(allowedUrl("http://civitai.red/file"), false);
  assert.equal(allowedUrl("https://civitai.red.attacker.test/file"), false);
  smoke.check("Native cancellation, timeout and strict production HTTPS/host checks", true);
}
async function main() {
  await app.whenReady();
  const server = http.createServer(serve);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
  const target = session.fromPartition("model-download-network-fixture", { cache: false });
  await target.setProxy({ mode: "direct" });
  const transport = createDownloadTransport(target, (value) => {
    const url = new URL(value);
    return url.protocol === "http:" && hosts.includes(url.hostname) && url.port === String(port);
  });
  const rootUrl = `http://civitai.red:${port}`;
  try { await redirectChecks(target, transport, rootUrl); await cancellationChecks(transport, rootUrl); smoke.finish({ app, ok: true }); }
  finally { server.closeAllConnections(); server.close(); }
}
main().catch((error) => smoke.finish({ app, ok: false, error }));
