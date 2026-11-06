/**
 * comfy-generation：直接验证生成生命周期服务。
 * comfy-generation：断开连接和主动取消必须收敛请求，而非只清除前端加载状态。
 */
/** 可取消生成的真实 HTTP 回归：假 ComfyUI 控制任务、断连及停止确认，不运行模型。 */
const assert = require("node:assert/strict");
const http = require("node:http");
const { setTimeout: delay } = require("node:timers/promises");
const generation = require("../apps/electron/src/main/modules/comfy/comfy-generation");
// 内存释放用生产服务发真实 HTTP，不用直接返回 true 的假请求器。
// 与生成取消共用本机夹具，便于区分 /free 和 /interrupt 两种动作。
// 两者只共用测试服务器，不在业务中合并生命周期或改写队列。
const { freeComfyMemory } = require("../apps/electron/src/main/modules/comfy/comfy-memory");
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
  // 内存用例进入专用分支，任何意外路由都会被该分支拒绝。
  // 不让 /queue 或 /interrupt 被后面的正常生成夹具悄悄接受。
  // 这条分流仅存在测试中，真实服务仍由 ComfyUI 自己管理任务。
  if (state.mode.startsWith("free")) return serveMemory(req, res);
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

/**
 * 空 200 是 ComfyUI /free 的真实响应形状，不能改成方便测试的 JSON。
 * 方法、路由、类型和完整请求体一起核对，防止遗漏其中一个清理标志。
 * 如同核对工单的收件人和内容，光看客户端说“发出了”并不能证明命令正确。
 * 每个请求都登记路由，结束时可发现暗中多发的队列或中断命令。
 * 即便其他命令被服务拒绝，也不能把它们算作允许的副作用。
 * 503 代表服务拒绝，404 代表当前服务没有这个接口，二者都不能成功。
 * socket.destroy 模拟连接丢失，与明确 HTTP 错误区分开。
 * hang 不返回响应头，验证生产请求器的超时能真正结束等待。
 * 空成功响应不提供显存数字，测试不把 true 当作物理显存回收证据。
 * 只操作随机端口上的本机服务器，不连接用户的 ComfyUI。
 * 若断言异常，原 server 回调会销毁响应并交由客户端错误边界收尾。
 * 最终 memoryCalls 的正向断言也会发现请求未到达服务就返回成功的实现。
 * 请求体读取使用已有 body 帮助函数，不复制另一套 JSON 解码逻辑。
 * header 只要求实际使用的 JSON 类型，避免测试依赖无关默认请求头。
 * 不向成功响应补填虚假的 completed 字段，保持接受与完成的语义边界。
 */
async function serveMemory(req, res) {
  // 路由先记后验：意外请求即使触发断言，也仍留下能定位的实际请求序列。
  // 不接受 GET 作为等价操作，清理命令会改变服务状态，必须使用 POST。
  // 精确比对对象还会拒绝 delete、interrupt 等本来不属于此命令的额外字段。
  // 读取请求体需要 await，断连故障只在完整合法命令已经到达后注入。
  // 这样连接失败用例可以证明生产异常处理，而不是仅仅验证本机端口没打开。
  // hang 分支已经记录命令但不回复，专门暴露缺失请求超时的实现。
  // 空 404 还能检查客户端没有因为无法解析错误 JSON 而丢掉稳定错误码。
  state.memoryCalls.push(req.url);
  assert.equal(req.url, "/free");
  assert.equal(req.method, "POST");
  assert.equal(req.headers["content-type"], "application/json");
  assert.deepEqual(await body(req), { unload_models: true, free_memory: true });
  if (state.mode === "free-disconnected") return req.socket.destroy();
  if (state.mode === "free-hang") return;
  res.writeHead(state.mode === "free-503" ? 503 : state.mode === "free-404" ? 404 : 200);
  res.end();
}

/**
 * 成功、两个拒绝状态、断连和超时共用一份实际 HTTP 请求实现。
 * 成功断言布尔接受标记，失败断言稳定错误码而不是易变系统错误文字。
 * 检查前保存时间，确保挂起服务最终能在请求上限附近返回失败。
 * 12 秒给机器调度保留余量，但仍能抓住缺少 8 秒请求超时的回归。
 * 全部失败也必须确认 /free 确实到达，避免 DNS 错误掩盖路由问题。
 * 每个检查由原 check 重置状态，不依赖前一个用例遗留的请求计数。
 * memoryCalls 在当前用例内单独初始化，正常生成测试不受影响。
 * 调用一次就应该只有一个 /free；多发停止命令会改变数组并失败。
 * state.running 放入另一个客户端任务，证明本地状态没有被清空。
 * state.pending 同时放入待执行任务，防止只保留运行中任务的错误通过。
 * 服务只接收标志，不模拟显存回收，也不对 GPU 可用性做任何承诺。
 * 断连和超时沿用生产 COMFY_DISCONNECTED，这是当前请求器的契约。
 * 不为这个入口改动全局错误归一化，避免影响已有生成回归。
 * 明确响应拒绝使用 COMFY_EXECUTION_FAILED，不能被误认为连接正常便成功。
 * 顶层 main 的 finally 仍关闭所有连接，挂起夹具不会留下服务占端口。
 * Promise 必须 await 到结束后检查路由，否则后台副作用可能漏检。
 * 最终通过输出由已有 check 负责，失败依旧设置非零退出码。
 * 未重试失败请求，确保本次验证不会靠第二次成功掩盖第一次问题。
 * 不调用下载或模型扫描，释放内存只验证服务端请求链。
 */
async function checkMemoryCase(mode) {
  // 运行中与待执行任务使用不同编号和名称，能看出错误修改了哪一类队列。
  // 服务当前并不实现内存释放，只检查客户端协议，因此任务数组保持原样。
  // 保留队列数组断言的意义是与实际仅有 /free 路由的证据一起约束副作用。
  // 不能单凭数组不变宣称没有发送停止命令，memoryCalls 才记录了完整到达路由。
  // 正例必须 await 返回 true；只验证 Promise 没拒绝会漏掉 undefined 等契约退化。
  // 失败例必须 await rejects；不等待断言会让进程先输出 PASS 再异步报错。
  // elapsed 从发起前开始统计，因此包含连接等待，不只计算收到响应后的处理时间。
  // 模式间不共用请求 Promise，每一例都实际创建并结束一条新的客户端请求。
  // 成功模式不设置任务完成字段，因为 /free 是操作命令，不是一次图片生成。
  // 503 正例对照关注服务主动拒绝，不能靠客户端“连接已建立”就认定操作成功。
  // 404 用例关注旧版本服务缺少端点，失败需要明确反馈而不能静默忽略。
  // 断连发生在命令已送达之后，客户端仍无法证明服务接受，因此必须按失败处理。
  // 请求超时也不代表远端肯定没有收到命令，所以生产按钮只允许用户手动重试。
  // 测试不假定服务端操作具有回滚：网络错误后实际内存状态仍由服务自己管理。
  // 比较原始路由序列可以发现服务函数错误地先请求 /interrupt 再请求 /free。
  // 若意外路由先导致连接异常，预期错误码可能碰巧一致，但路由断言仍会拒绝。
  // 若实现完全没有发送 HTTP 就直接返回 true，成功例的路由数组会保持空并失败。
  // 若实现发送了正确 JSON 却把卸载标志改为 false，请求体断言会立即中断响应。
  // 若只发送 free_memory，一个仍被模型引用的张量未必能回收，故两个字段都不可省。
  // Content-Type 不正确时真实服务的 JSON 读取可能失败，因此也属于协议回归范围。
  // 响应体为空是成功边界，任何依赖 JSON 中 success 字段的实现都会在此被抓住。
  // 精确的模型列表不参与释放操作，测试不会因扫描库大小变化而增加运行成本。
  // 没有文件系统夹具，因为本服务只发送 HTTP；磁盘删除不属于它的执行路径。
  // 与原取消测试一起跑，是为了确认新入口没有把生成的取消语义一起改掉。
  // 运行中和待执行队列的原值保留在断言里，未来误用清队列实现会有明确反证。
  // GPU 回收量取决于设备与 ComfyUI 版本，本机假服务不提供这方面结论。
  await check(mode + " frees model memory without stopping tasks", async () => {
    state.mode = mode;
    state.memoryCalls = [];
    state.running = [[1, "another-client"]];
    state.pending = [[2, "queued-task"]];
    const started = Date.now();
    const request = freeComfyMemory(`127.0.0.1:${server.address().port}`);
    if (mode === "free") assert.equal(await request, true);
    else await assert.rejects(request, { code: ["free-503", "free-404"].includes(mode) ? "COMFY_EXECUTION_FAILED" : "COMFY_DISCONNECTED" });
    assert.ok(Date.now() - started < 12000);
    assert.deepEqual(state.memoryCalls, ["/free"]);
    assert.deepEqual(state.running, [[1, "another-client"]]);
    assert.deepEqual(state.pending, [[2, "queued-task"]]);
  });
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
  // 先跑已有生成回归，再跑内存释放；同一服务器内保持串行。
  // 这样能发现新服务引入的全局状态污染，而非只验证一个孤立成功例。
  // 释放用例挂起也必须由 finally 关闭连接，不让测试进程静默常驻。
  // 服务器返回空 200 的正例放前面，后续失败结果才有可信对照。
  // 新增测试只验证请求协议，不会启动模型或删除真实任务。
  // 每个模式都执行一次，失败不会自动重试或改成跳过。
  try {
    await checks();
    for (const mode of ["free", "free-503", "free-404", "free-disconnected", "free-hang"]) await checkMemoryCase(mode);
  }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
