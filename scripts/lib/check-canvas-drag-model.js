// 直接执行生产 reducer，检查拖动时保留未动节点的引用，避免只凭体感宣布性能修复。
// 像数搬家工人翻了几次地址簿：计数 id 访问，能检测平方级查找，不依赖机器跑分。
// 这里没有窗口、媒体或人工输入；真实拖动与保存由 Electron 场景另验。
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const nextRequire = createRequire(path.resolve(__dirname, "../../apps/next/package.json"));
const ts = nextRequire("typescript");

// 只转译本画布的相对模块，实际位置算法仍来自已安装的 React Flow。
// 翻译 t 仅回显 key，因为本组不检查文案；真实翻译由界面回归覆盖。
// 不替换 applyNodeChanges，否则无法发现库的引用保留行为与产品假设不一致。
// 参数 directory 可指向任务前快照，便于独立证明旧实现会触发同一反证。
// 路径是测试运行者提供的源码根，不会从 renderer 或用户工程接收。
// cache 先登记空 exports，遵循 CommonJS 的依赖环语义。
// 转译只擦除类型，不重写测试期望或产品函数正文。
// 外部依赖从 Next 包解析，根包未声明 React Flow 也不会误装第二份库。
// 不加载 preload、主进程或用户 JSON，模型测试不能意外改写真实作品。
// 未知外部依赖交真实 require，缺失时抛错，不用空对象掩盖依赖问题。
// 每次加载独立 cache，当前实现和旧快照不会互相拿到已缓存的 reducer。
// 文件编译失败保留非零结果，不回落成跳过算法断言。
function loadCanvasReducer(directory = path.resolve(__dirname, "../../apps/next/src/view/infinite-canvas")) {
  // loader 缓存按完整文件名区分模块，防止不同相对引用重复实例化同一生产常量。
  // reducer 的 type-only import 在转译后消失，不需要构造假的跨进程接口。
  // 模型中的 lucide 图标依赖也从真实包加载，但本用例不会渲染它们。
  // 这与浏览器中的图标布局不同，不以模块能 require 成功作为视觉验收。
  // transpileModule 不做类型检查，运行前仍须独立执行项目 typecheck。
  // new Function 接收的只是本地测试选定源码，不执行用户上传的节点正文。
  // 本工具不是产品的工程导入器，工程文件仍只能作为数据解析。
  // 导出的函数方便对照旧快照，不把任务前临时目录硬编码成回归前提。
  // 常规检查不传目录，永远读取当前仓库的生产实现。
  // 因此临时基线被系统清理后，后续运行依旧可以验证当前性能规则。
  // 翻译替身只覆盖一个明确依赖名，不能把缺少其他模块一律当作成功。
  // 原地数据修改与对象复制都由真实 reducer 执行，测试不代它更新节点。
  // resolve 只在转译模块 require 时执行，不读取 DOM 或操作系统媒体事件。
  // 失败的 require 会抛到 Node 主入口，不转成空模块继续跑余下断言。
  // 当前没有导入异步生成服务，运行无需网络或模型账户权限。
  // 所以离线运行失败应按模型或依赖问题判断，不能借口远端服务不可用。
  // 依赖地图保存在这一次 load 调用内部，平行纯检查不会互改同一 cache。
  // 模型初始化返回的 INITIAL 常量没有被测试就地改写，而是展开成新的状态。
  const cache = new Map();
  const load = name => {
    const file = path.join(directory, `${name.replace(/^\.\//, "")}.ts`);
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const resolve = value => value === "@/i18n" ? { t: key => key } : value.startsWith("./") ? load(value) : nextRequire(value);
    new Function("exports", "require", source)(exports, resolve);
    return exports;
  };
  return load("canvas-reducer");
}

// 基准用三百张独立卡，最后一张移动，使“从头找目标”的旧算法无法碰巧很快结束。
// id getter 只记读取次数，始终返回同一个合法身份，不改变节点业务行为。
// 长提示词仍是普通字符串，统计器不会在 getter 内模拟耗时或伪造帧率。
// 只有 id 有观测，position/data 保持生产形状，React Flow 可以正常处理。
// before 保存引用数组，用于断言未动对象是否被全量克隆。
// getter 的闭包由当前测试拥有，不会存进用户草稿或工程包。
// state.drag 故意直接使用普通旧作品，先隔开开始快照自身的复制成本。
// 因此访问数只测一条拖动事件，不把历史创建的线性复制算成每帧开销。
function dragFixture(initial) {
  // 三百个对象通过 Array.from 单独创建，不用同一个对象填满数组伪装大图。
  // 每项有唯一 id，否则库可能因重复身份跳过处理而给出虚假的低访问数。
  // 目标在数组末尾，旧版为每项 find 原节点时要走到不同深度。
  // 旧版完整一轮产生九万级读取，新版只需要一次库遍历和目标复制。
  // 统计 Getter 读取不等于用户肉眼帧率，报告中分别解释两种指标。
  // getter 没有更改 id 或顺序，重复读取仍然等价于普通字段。
  // prompt 的长度合法，没有依赖超出产品上限的数据放大开销。
  // 文本卡没有媒体源，纯模型测试不能触发解码或文件读取。
  // position 彼此不同，撤销时回到末项原 x=5980 有明确可观察结果。
  // 初始 y 都为零，移动到 y=20 可以发现只更新一个轴的错误。
  // title 只是 fixture 标记，不混进正式页面的默认工程数据。
  // 计数闭包只读暴露 reads，不给生产 reducer 提供清零或改成绩的接口。
  // 历史部分从 INITIAL 展开，空 past/future 的前提与新工程一致。
  // drag 只包含文档字段，不把统计回调塞进可保存的作品。
  // 一个测试实例用一组计数，下一次 load 或 fixture 不会继承上次成绩。
  // 这使旧/新对照无需先减去复杂初始化成本，也不会漏算循环内部的 find。
  let visits = 0;
  const nodes = Array.from({ length: 300 }, (_, index) => ({ get id() { visits++; return `node-${index}`; }, type: "canvas", position: { x: index * 20, y: 0 }, data: { kind: "text", title: `${index}`, prompt: "long prompt ".repeat(250), content: "", ratio: "1/1" } }));
  const state = { ...initial, nodes, drag: { name: "", nodes, edges: [] } };
  return { state, reads: () => visits };
}

// 第一组是性能原因的反证：移动最后一项只能改变最后一项的对象身份。
// 不只是 data 同值，节点对象本身也应相同，图库才可以跳过无关消费者。
// 目标的 data 保持原引用，不能因为位置变动重新加载媒体或重建提示词状态。
// 坐标从明确的 10/20 读取，不用生产算法再算一份期望来互相自证。
// 位置事务进行中，past 不应逐帧增长；松手才产生一笔移动历史。
// id 访问上限留了常数余量，足够容纳库的线性遍历而排除九万次嵌套查找。
// 这不是毫秒阈值，慢机器也不会因为一次系统调度被误判性能失败。
// 读取阈值之前不进行测试自己的全表 id 查找，避免污染计数。
// 未动引用通过数组索引对照，因为产品保持节点顺序，这里不再 find。
// 明确检查第一个和倒数第二个，防止只有部分未动项碰巧复用。
// replace 反证另送一个假参数，验证删去修复性 map 后仍拒绝旧缓存覆盖。
// 屏蔽 replace 不能影响后续合法的位置事件，否则移动会失效。
// 末尾调用 stopDrag 要确认事务释放，不能优化成永远不提交作品。
// 一笔历史的判断在未改参数的独立 fixture 上完成，避免其他命令污染数量。
// 撤销后回到原 x 值，说明缓存优化没有把最终坐标写错或丢掉旧快照。
// 本组不衡量 DOM 布局或 GPU，不能把线性访问数写成用户电脑固定帧率。
function checkCanvasDrag() {
  // 读取真实导出名可在生产重命名后立即失败，避免测试继续跑自己的旧实现。
  // 一条 position 变化不包含 replace，因此参数保留不能依赖额外补丁步骤。
  // dragging=true 表示仍在手势中，不能把它作为独立编辑提交历史。
  // 计数在执行其他命令之前冻结，后续撤销遍历不污染单帧性能结果。
  // 访问量 1200 的阈值远高于正常约 301，给库实现的常数变化留空间。
  // 它仍远低于旧版 90600，不能通过微小常数改善蒙混过关。
  // 不要求固定毫秒数，避免系统杀毒或并行构建影响算法反证的确定性。
  // 首节点引用断言能发现“值相等但全克隆”的回归，深度相等无法覆盖这点。
  // 倒数第二项再次检查，防止实现只对数组前缀做了复用。
  // 目标 data 引用相同，是媒体路径与提示词不必重建的前提。
  // 目标 position 则必须改变，不能用始终返回旧数组来获得漂亮的引用成绩。
  // 坐标断言同时验证 x/y，不把 dragging 标志变化误当成位置移动成功。
  // past 仍为零，说明每个鼠标事件没有都拍一份整图快照。
  // replace 送的是同一个合法 id，避免因为目标不存在而被拒绝掩盖问题。
  // 假 prompt 与真实值不同，读取结果可以明确证明旧参数未覆盖当前 data。
  // 测试不要求 replace 是原 state，因为库可能返回等价数组；关注的是业务字段。
  // stopDrag 用没有受 replace 干扰的 moved，独立核对正常手势的提交规则。
  // drag=null 表示手势已释放，后续保存不应一直被拖动保护静默拒绝。
  // past=1 证明提交仍保留一笔历史，不能为性能删掉撤销能力。
  // 撤销命令是生产 history 分支，不由测试手动塞旧 position 恢复。
  // 回到5980来自fixture末项299×20，与移动后的10形成清楚差异。
  // 撤销使用的快照没有被位置变化就地污染，否则会错误地继续停在10。
  // 本组不测试 Escape 的窗口松手监听，那个生命周期需要实际浏览器配合。
  // 模型成功后还必须运行 Electron，防止节点 memo 或 Context 接线造成视觉冻结。
  // console 输出访问次数供记录追溯，真正通过仍依赖前面的 assert。
  // 如果 assert 抛错，不会先打印 OK 再通过正常退出隐藏失败。
  const { canvasReducer, INITIAL_CANVAS_STATE } = loadCanvasReducer();
  const fixture = dragFixture(INITIAL_CANVAS_STATE);
  const moved = canvasReducer(fixture.state, { type: "nodes", changes: [{ type: "position", id: "node-299", position: { x: 10, y: 20 }, dragging: true }] });
  const visits = fixture.reads();
  assert.ok(visits < fixture.state.nodes.length * 4, `Drag id visits must be linear, got ${visits}`);
  assert.equal(moved.nodes[0], fixture.state.nodes[0]);
  assert.equal(moved.nodes[298], fixture.state.nodes[298]);
  assert.equal(moved.nodes[299].data, fixture.state.nodes[299].data);
  assert.deepEqual(moved.nodes[299].position, { x: 10, y: 20 });
  assert.equal(moved.past.length, 0);
  const replaced = canvasReducer(moved, { type: "nodes", changes: [{ type: "replace", id: "node-299", item: { ...moved.nodes[299], data: { ...moved.nodes[299].data, prompt: "stale" } } }] });
  assert.equal(replaced.nodes[299].data.prompt, moved.nodes[299].data.prompt);
  const committed = canvasReducer(moved, { type: "dragStop" });
  assert.equal(committed.drag, null);
  assert.equal(committed.past.length, 1);
  assert.equal(canvasReducer(committed, { type: "history", redo: false }).nodes[299].position.x, 5980);
  console.log("CANVAS_DRAG_MODEL_OK", { nodes: 300, idReadsPerMove: visits });
}
module.exports = { checkCanvasDrag, loadCanvasReducer };
