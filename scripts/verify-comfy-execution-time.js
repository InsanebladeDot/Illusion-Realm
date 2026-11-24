/** 验证真实计时解析与合计；使用固定服务器时间，不依赖测试机器运行速度。 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("../apps/next/node_modules/typescript");
const { readExecutionMs } = require("../apps/electron/src/main/modules/comfy/execution-time");
const loaded = { exports: {} };
const source = fs.readFileSync("apps/next/src/utils/generation-execution-time.ts", "utf8");
new Function("exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(loaded.exports);
const { getWorkflowExecutionMs: sum } = loaded.exports;
const message = (event, timestamp, prompt_id = "p") => [event, { timestamp, prompt_id }];
const entry = messages => ({ status: { completed: true, messages } });
const valid = [message("execution_start", 100000), message("execution_success", 128700)];
assert.equal(readExecutionMs(entry(valid), "p"), 28700);
// 外来任务、坏时间、缺少终点都不能变成一个看似准确的零秒。
for (const messages of [[], valid.slice(0, 1), [valid[0], message("execution_success", 99999)], [valid[0], message("execution_success", "128700")], [valid[0], message("execution_success", Infinity)], valid.map(([event, data]) => [event, { ...data, prompt_id: "other" }])]) {
  assert.equal(readExecutionMs(entry(messages), "p"), undefined);
}
assert.equal(readExecutionMs({}, "p"), undefined);
assert.equal(readExecutionMs(entry([message("execution_start", 0), message("execution_success", 0)]), "p"), 0);
const a = { id: "a", server: "server1", promptId: "p1", executionMs: 28700 };
const b = { id: "b", server: "server1", promptId: "p2", executionMs: 1250 };
assert.equal(sum([a, b]), 29950);
assert.equal(sum([a, { ...a, id: "duplicate" }, b]), 29950);
assert.equal(sum([a, { ...a, server: "server2" }]), 57400);
// 批量中有一批尚未结束或缺少计时，整份合计应回落，不能只展示已知批次。
for (const executions of [undefined, [], [a, { id: "pending", server: "server1" }], [a, { ...b, executionMs: undefined }], [a, { ...b, executionMs: NaN }], [a, { ...b, executionMs: -1 }]]) assert.equal(sum(executions), null);
assert.equal(sum([{ ...a, executionMs: 0 }]), 0);
console.log("PASS server timestamps, malformed/missing history, batch sum, duplicate prompts and zero duration");

/** 运行真实 Zustand 和提交封装，只替换 Electron 返回值与历史写盘，验证任务归属。 */
function load(file, imports) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", code)(name => {
    assert.ok(name in imports, `unexpected import ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}
const { useGenerationTaskStore: store } = load("apps/next/src/stores/useGenerationTaskStore.ts", {
  zustand: require("../apps/next/node_modules/zustand"),
  "./use-generation-history-store": { recordGenerationTask: async () => {} },
});
const { requestComfyGeneration: request } = load("apps/next/src/api/comfyui/generate-request.ts", {
  "@/i18n": { t: key => key },
  "@/utils/ipcResult": { unwrapIpc: result => { if (!result.success) throw Error(result.error); return result.data; } },
  "@/stores/useGenerationTaskStore": { useGenerationTaskStore: store },
});
async function checkRequests() {
  store.setState({ tasks: [{ id: "one", status: "generating" }, { id: "two", status: "generating" }] });
  global.window = { electronAPI: { comfyGenerate: async () => ({ success: true, data: { promptId: "first", executionMs: 28700 } }) } };
  await request({}, "server", "one");
  assert.equal(sum(store.getState().tasks[0].executions), 28700);
  assert.equal(store.getState().tasks[1].executions, undefined);
  window.electronAPI.comfyGenerate = async () => ({ success: true, data: { promptId: "second", executionMs: 1250 } });
  await request({}, "server", "one");
  assert.equal(sum(store.getState().tasks[0].executions), 29950);
  window.electronAPI.comfyGenerate = async () => ({ success: false, error: "failed" });
  await assert.rejects(request({}, "server", "one"), /failed/);
  assert.equal(sum(store.getState().tasks[0].executions), null);
  window.electronAPI.comfyGenerate = async () => ({ success: true, data: { promptId: "old-server" } });
  await request({}, "server", "two");
  assert.equal(sum(store.getState().tasks[1].executions), null);
  console.log("PASS shared request records serial batches, isolates tasks and retains missing/failed placeholders");
}
checkRequests().catch(error => { console.error(error); process.exitCode = 1; });
