/** 可取消生成的真实 HTTP 回归：假 ComfyUI 控制任务、断连及停止确认，不运行模型。 */
const assert = require("node:assert/strict");
const http = require("node:http");
const { setTimeout: delay } = require("node:timers/promises");
const generation = require("../apps/electron/services/comfy-generation");
let state;
let server;
const prompt = { "1": { class_type: "PreviewImage", inputs: {} } };
const image = { filename: "fixture.png", subfolder: "", type: "output" };

function reset(mode = "running") {
  state = { mode, accepted: 0, history: 0, downloads: 0, running: [], pending: [], deleted: [], interrupted: [] };
}
function json(res, value, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value));
}
async function body(req) {
  let text = "";
  for await (const chunk of req) text += chunk;
  return text ? JSON.parse(text) : {};
}
async function submit(req, res) {
  const data = await body(req); assert.deepEqual(data.prompt, prompt);
  state.accepted++; const id = "fixture-" + state.accepted;
  if (state.mode === "invalid") return json(res, { error: "invalid" }, 400);
  (state.mode === "pending" ? state.pending : state.running).push([1, id]);
  if (state.mode === "submit-delay") await delay(150);
  return json(res, { prompt_id: id });
}
function history(req, res) {
  state.history++;
  if (state.mode === "disconnected") return req.socket.destroy();
  if (state.mode === "hang") return;
  if (state.mode === "error") return json(res, { "fixture-1": { status: { status_str: "error" }, outputs: {} } });
  if (["completed", "download-disconnect", "download-hang"].includes(state.mode)) {
    state.running = []; return json(res, { "fixture-1": { status: { completed: true }, outputs: { "1": { images: [image] } } } });
  }
  return json(res, {});
}
async function serve(req, res) {
  const url = req.url;
  if (url === "/prompt") return submit(req, res);
  if (url.startsWith("/history/")) return history(req, res);
  if (url.startsWith("/view")) {
    state.downloads++;
    if (state.mode === "download-disconnect") return req.socket.destroy();
    if (state.mode === "download-hang") return;
    res.writeHead(200, { "Content-Type": "image/png" }); return res.end(Buffer.from("fixture"));
  }
  if (url === "/queue" && req.method === "GET") return json(res, { queue_running: state.running, queue_pending: state.pending });
  if (url === "/queue") {
    const data = await body(req);
    if (state.mode === "stop-fails") return json(res, {}, 503);
    state.deleted.push(...data.delete);
    state.pending = state.pending.filter((item) => !data.delete.includes(item[1]));
    return json(res, {});
  }
  if (url === "/interrupt") {
    const data = await body(req); state.interrupted.push(data.prompt_id);
    if (state.mode !== "delayed-stop") state.running = [];
    res.writeHead(200); return res.end();
  }
  json(res, {}, 404);
}
async function until(predicate) {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await delay(10); }
  throw new Error("Fixture step timed out");
}
function begin(id = "test", owner = 1) {
  const promise = generation.generate(owner, prompt, `127.0.0.1:${server.address().port}`, id);
  return promise.then((value) => ({ value }), (error) => ({ error }));
}
async function check(name, run) {
  reset(); await run(); console.log("PASS " + name);
}
async function checkCancellation(mode) {
  await check("cancel " + mode + " reaches the server and settles the original request", async () => {
    state.mode = mode; const task = begin(); await until(() => mode === "download-hang" ? state.downloads : state.accepted);
    assert.equal(await generation.cancel(2, "test"), false);
    assert.equal(await generation.cancel(1, "test"), true);
    assert.equal((await task).error.code, "COMFY_CANCELLED");
    assert.deepEqual(state.deleted, ["fixture-1"]);
    assert.equal(state.interrupted.length, ["pending", "download-hang"].includes(mode) ? 0 : 1);
    assert.equal(await generation.cancel(1, "test"), false);
  });
}
async function checks() {
  await check("successful generation still downloads its result", async () => {
    state.mode = "completed"; const result = await begin();
    assert.equal(result.value.images.length, 1); assert.equal(state.downloads, 1);
  });
  for (const mode of ["disconnected", "download-disconnect", "hang"]) {
    await check(mode + " returns a bounded connection error", async () => {
      state.mode = mode; const started = Date.now(); const result = await begin();
      assert.equal(result.error.code, "COMFY_DISCONNECTED"); assert.ok(Date.now() - started < 12000);
    });
  }
  for (const mode of ["invalid", "error"]) {
    await check(mode + " is a workflow error, not a disconnect", async () => {
      state.mode = mode; assert.equal((await begin()).error.code, "COMFY_EXECUTION_FAILED");
    });
  }
  for (const mode of ["running", "pending", "submit-delay", "download-hang"]) await checkCancellation(mode);
  await checkStopResults();
}
async function checkStopResults() {
  await check("stop failure does not pretend remote cancellation succeeded", async () => {
    state.mode = "stop-fails"; const task = begin(); await until(() => state.history);
    await assert.rejects(generation.cancel(1, "test"), { code: "COMFY_STOP_FAILED" });
    assert.equal((await task).error.code, "COMFY_STOP_FAILED");
  });
  await check("stop waits until the server removes the running task", async () => {
    state.mode = "delayed-stop"; const task = begin(); await until(() => state.history);
    let settled = false;
    const stop = generation.cancel(1, "test").then(() => { settled = true; });
    await until(() => state.interrupted.length); await delay(120); assert.equal(settled, false);
    state.running = []; await stop; assert.equal((await task).error.code, "COMFY_CANCELLED");
  });
  await check("a different client's running task is never explicitly interrupted", async () => {
    const task = begin(); await until(() => state.history);
    state.running = [[2, "other-client"]]; await generation.cancel(1, "test");
    assert.equal((await task).error.code, "COMFY_CANCELLED"); assert.equal(state.interrupted.length, 0);
  });
}
async function main() {
  server = http.createServer((req, res) => { void serve(req, res).catch((error) => { console.error(error); res.destroy(); }); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try { await checks(); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
