/** 直接执行生产连通分量函数，验证分支、反向、环、断线与失效边；不启动媒体或GPU。 */
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const ts = require("../apps/next/node_modules/typescript");
const code = ts.transpileModule(fs.readFileSync(path.resolve("apps/next/src/view/infinite-canvas/canvas-network.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const production = {};
new Function("exports", code)(production);

function checkGraph() {
  const nodes = ["root", "left", "right", "leaf", "other"].map(id => ({ id }));
  const edges = [["root", "left"], ["root", "right"], ["left", "leaf"], ["leaf", "root"], ["other", "missing"]].map(([source, target]) => ({ source, target }));
  const document = { nodes, edges }, before = JSON.stringify(document);
  for (const id of ["root", "left", "right", "leaf"]) assert.deepEqual(production.canvasNetwork(document, id).map(node => node.id), ["root", "left", "right", "leaf"]);
  assert.deepEqual(production.canvasNetwork(document, "other").map(node => node.id), ["other"]);
  assert.deepEqual(production.canvasNetwork(document, "missing"), []);
  assert.deepEqual(production.canvasNetwork({ nodes, edges: [] }, "root").map(node => node.id), ["root"]);
  assert.equal(JSON.stringify(document), before);
}

// 长链用队列而不是递归，避免节点网很深时调用栈溢出；返回的仍是原节点身份。
function checkLongChain() {
  const nodes = Array.from({ length: 2000 }, (_, index) => ({ id: String(index) }));
  const edges = nodes.slice(1).map((node, index) => ({ source: String(index), target: node.id }));
  const result = production.canvasNetwork({ nodes, edges }, "1999");
  assert.equal(result.length, 2000);
  assert.equal(result[0], nodes[0]);
}
checkGraph(); checkLongChain();
console.log("CANVAS_NETWORK_OK: bidirectional reachability, branches, cycles, isolation, dangling edges, no mutation, 2000-node chain");
