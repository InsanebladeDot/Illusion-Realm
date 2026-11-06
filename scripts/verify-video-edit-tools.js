/** 直接加载生产纯模型，反证剪切、动画与历史记录；不把这里的对象当实机媒体证明。 */
// 测试源像印好的胶卷尺：工程起点8秒、源入点2秒，不能混为同一时间。
// 所有期望由明确的例子写出，不再复制一份产品算法计算预期。
// 本脚本不用React、不创建浏览器视频，也不声称覆盖系统文件选择或扬声器。
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const ts = require("../apps/next/node_modules/typescript"), cache = new Map();
const root = path.join(__dirname, "../apps/next/src/view/toolBox/Tool/video/editor");

// 只允许加载这个目录的相对纯模块，外部依赖会明确失败而非返回假替身。
// 先登记exports再执行，类型关联形成的模块环也能沿用CommonJS语义。
// 转译只擦除TypeScript语法，不替换任何生产业务函数或返回结果。
function load(name) {
  const filename = path.join(root, `${name.replace(/^\.\//, "")}.ts`);
  if (cache.has(filename)) return cache.get(filename);
  const result = {};
  cache.set(filename, result);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("exports", "require", source)(result, value => { if (!value.startsWith("./")) throw new Error(`Unexpected runtime dependency: ${value}`); return load(value); });
  return result;
}
const tracks = load("timeline-track-model");
const edit = load("timeline-edit-model"), transform = load("clip-transform-model"), basic = load("clip-basic-edit-model"), clock = load("program-clock"), history = load("timeline-history");
const project = { width: 1920, height: 1080, fps: 30, duration: 12 };
const clip = { id: "a", assetId: "source", track: "V1", start: 8, end: 12, sourceIn: 2, sourceDuration: 20, speed: 2, transform: { x: 960, y: 540, scale: 100, rotation: 0, opacity: 100 } };
const assets = [{ id: "source", name: "same.mp4", kind: "video", state: "ready", duration: 20, cover: null }];
let nextId = 0;
const id = () => `copy-${++nextId}`;

// 9秒拆开时，右段从源4秒继续，而非从工程9秒或源0秒播放。
// 分割后的两段边界相接，不制造一帧空洞或零长度片段。
// 左段沿用原身份，右段必须生成新身份，之后可独立选择和删除。
// 修改副本嵌套构图用于反证别名共享，原片段必须仍是中心960。
// 首尾拆分都是无操作，不能因为用户碰到边缘就写一页空历史。
// 锁定V1时整批拒绝；不能在生成副本后才发现原片段不可写。
// 删除左边只处理明确选中的主体，未选的其他片段不被波纹推移。
// sourceIn断言把工程时长与源速度连接起来，漏乘2倍会得到错误的3秒。
function sectionChecks() {
  const split = edit.editTimelineSections([clip], ["a"], "split", 9, 30, [], id);
  assert.equal(split.length, 2); assert.equal(split[1].sourceIn, 4); assert.equal(split[0].end, split[1].start);
  assert.notEqual(split[1].id, "a"); split[1].transform.x = 123; assert.equal(clip.transform.x, 960);
  assert.equal(edit.editTimelineSections([clip], ["a"], "split", 8, 30, [], id), null);
  assert.equal(edit.editTimelineSections([clip], ["a"], "split", 12, 30, [], id), null);
  assert.equal(edit.editTimelineSections([clip], ["a"], "split", 9, 30, ["V1"], id), null);
  assert.equal(edit.editTimelineSections([clip], ["a"], "removeLeft", 9, 30, [], id)[0].sourceIn, 4);
}

// 复制快照不改原对象，粘贴后每个片段获得独立ID与构图对象。
// 原轨8–12已占用，所以把完整副本粘在9秒必须整批拒绝。
// 精确粘在12秒合法，半开区间允许前后相接，不偷偷挪到另一个空隙。
// 目标轨已锁时不能借粘贴绕过编辑保护。
// 多选按片段身份切换，同源assetId不会把多个实例误判成一个主体。
// 一般复制允许读锁源，但真正写入粘贴时仍用最新锁表。
function clipboardChecks() {
  assert.equal(edit.pasteTimelineClips([clip], [clip], 9, 30, [], ["V1"], ["source"], id), null);
  const pasted = edit.pasteTimelineClips([clip], [clip], 12, 30, [], ["V1"], ["source"], id);
  assert.equal(pasted.clips[1].start, 12); assert.equal(pasted.clips[1].end, 16);
  assert.notEqual(pasted.clips[1].id, "a"); assert.notEqual(pasted.clips[1].transform, clip.transform);
  assert.equal(edit.pasteTimelineClips([clip], [clip], 12, 30, ["V1"], ["V1"], ["source"], id), null);
  assert.deepEqual(edit.selectTimelineIds([clip, pasted.clips[1]], "a", [], "selectRight", false, []), ["a", pasted.clips[1].id]);
}

// 30帧的X=1060，工程第15帧应位于960与1060中点1010。
// 增加关键帧前后，未启用动画的Y必须仍为540。
// 同一帧再次点击菱形会删除，不能在一个字段上叠两枚重复标记。
// 修改已有动画字段会新增当前帧，而不是把整段基础X一起改掉。
// 分割在第15帧时左右画面一致；右段的新0帧承接1010。
// 复制后的点数组必须独立，防止副本调关键帧影响原段播放。
// 不使用CSS判断插值，这是纯工程数值反证，真实视频仍由Electron另测。
// 本组覆盖终点越界；非法数值与锁轨分别由boundaryChecks提供反例。
function keyframeChecks() {
  const animated = transform.toggleTransformKeyframe([clip], "a", "x", 30, 1060, project, [])[0];
  assert.equal(transform.evaluateTransform(clip.transform, animated.keyframes, 15).x, 1010);
  assert.equal(transform.evaluateTransform(clip.transform, animated.keyframes, 15).y, 540);
  const edited = transform.updateAnimatedTransform([animated], assets, "a", { x: 1200 }, project, [], 8.5)[0];
  assert.equal(edited.transform.x, 960); assert.equal(edited.keyframes.x.find(point => point.frame === 15).value, 1200);
  const split = edit.editTimelineSections([animated], ["a"], "split", 8.5, 30, [], id);
  assert.equal(split[1].transform.x, 1010); assert.equal(transform.evaluateTransform(split[0].transform, split[0].keyframes, 15).x, 1010);
  const copy = edit.cloneTimelineClip(animated); copy.keyframes.x[0].value = 3; assert.equal(animated.keyframes.x[0].value, 1060);
  assert.equal(transform.toggleTransformKeyframe([animated], "a", "x", 30, 1060, project, [])[0].keyframes, undefined);
  assert.equal(transform.toggleTransformKeyframe([clip], "a", "x", 120, 1060, project, []), null);
}

// 定格插入在9秒，应该保留8–9的左段与12–15的右段，中间9–12为静帧。
// 静帧源位置4秒来自实际源映射，不能把暂停媒体当成工程中的定格实体。
// 插入只顺延同轨后续对象，原片段源文件与素材库仍保持不变。
// 倒放在工程9秒应读源8秒：源区间2–10反向行走一工程秒即两源秒。
// 定格在整个三秒内始终映射源4秒，不随播放时钟继续往前读。
// 镜像与旋转只改变目标画面属性，不变动start/end或相邻安排。
// 裁剪非法的两边总和必须拒绝，合法裁剪生成独立对象。
// 锁轨反例对合法裁剪发起，排除因为输入本身非法而偶然通过保护测试。
function basicChecks() {
  const frozen = basic.basicClipEdit([clip], "a", "freeze", 9, 30, [], id);
  const still = frozen.find(item => item.freezeTime !== undefined);
  assert.equal(still.start, 9); assert.equal(still.end, 12); assert.equal(still.freezeTime, 4);
  assert.equal(clock.programSourceTime(still, 11, 20), 4); assert.equal(frozen.find(item => item.start === 12).end, 15);
  const reverse = basic.basicClipEdit([clip], "a", "reverse", 9, 30, [], id)[0];
  assert.equal(clock.programSourceTime(reverse, 9, 20), 8);
  assert.equal(basic.basicClipEdit([clip], "a", "mirror", 9, 30, [], id)[0].mirrored, true);
  assert.equal(basic.basicClipEdit([clip], "a", "rotate", 9, 30, [], id)[0].transform.rotation, 90);
  assert.equal(basic.updateClipCrop([clip], "a", { left: .6, right: .6, top: 0, bottom: 0 }, []), null);
  assert.equal(basic.updateClipCrop([clip], "a", { left: .1, right: .1, top: 0, bottom: 0 }, ["V1"]), null);
}

// 历史只记录工程结构，普通播放头进度不会占一页或清掉重做分支。
// 撤销后片段恢复原样，定位版本应单调增加，旧媒体回执不得覆盖新画面。
// 选择变化不是剪辑命令，撤销后再选对象仍可以重做原先的删除。
// 新的真正工程编辑才清重做，不能凭改变鼠标工具就抹掉用户历史。
// 最后核对initial未被改写，证明恢复操作没有反向修改输入快照。
// 删除最后片段后工程为空，恢复时长度与选择从快照取，不近似平移复原。
function historyChecks() {
  const present = { tracks: ["V1"], limits: { video: 5, audio: 5 }, clips: [clip], selectedId: "a", selectedIds: ["a"], currentTime: 8, seekVersion: 0, hiddenTracks: [], lockedTracks: [], viewed: true, notice: "" };
  const initial = { present, past: [], future: [] };
  const progress = history.timelineHistoryReducer(initial, { patch: { currentTime: 9 } }); assert.equal(progress.past.length, 0);
  const removed = history.timelineHistoryReducer(progress, { patch: { clips: [], selectedId: null } }); assert.equal(removed.past.length, 1);
  const undone = history.timelineHistoryReducer(removed, { step: "undo" }); assert.equal(undone.present.clips.length, 1); assert.equal(undone.present.seekVersion, 1);
  const selected = history.timelineHistoryReducer(undone, { patch: { selectedId: "a" } }); assert.equal(selected.future.length, 1);
  assert.equal(history.timelineHistoryReducer(selected, { step: "redo" }).present.clips.length, 0);
  assert.equal(initial.past.length, 0); assert.equal(initial.present.clips.length, 1);
}
// 菱形不能绕过字段校验：NaN、Infinity、负帧号和锁定轨道分别单独发起。
// 拒绝锁定时使用合法帧和值，避免“恰巧因为参数非法”掩盖权限漏洞。
// 合法裁剪必须复制四边对象，否则调用者后续改草稿会污染确认记录。
// 下列均为纯数据验证，不涉及系统锁、文件访问或实际视频解码。
function boundaryChecks() {
  assert.equal(transform.toggleTransformKeyframe([clip], "a", "x", 1, NaN, project, []), null);
  assert.equal(transform.toggleTransformKeyframe([clip], "a", "x", 1, Infinity, project, []), null);
  assert.equal(transform.toggleTransformKeyframe([clip], "a", "x", 1, 960, project, ["V1"]), null);
  assert.equal(transform.toggleTransformKeyframe([clip], "a", "x", -1, 960, project, []), null);
  const crop = { left: .1, right: .2, top: .1, bottom: .2 };
  const cropped = basic.updateClipCrop([clip], "a", crop, [])[0];
  crop.left = .3;
  assert.equal(cropped.crop.left, .1);
}
// 倒放裁左边只收高端，裁右边才提高低端；恢复窗口应找回完全相同的源区间。
// 动画裁去前15帧后，新第0帧必须仍是旧15帧画面，伸回后起点恢复960。
function trimChecks() {
  const reversed = { ...clip, reversed: true };
  const left = tracks.trimClip([reversed], "a", "start", 9, 30, [])[0];
  assert.equal(left.sourceIn, 2); assert.equal(clock.programSourceTime(left, 9, 20), 8);
  const right = tracks.trimClip([reversed], "a", "end", 11, 30, [])[0];
  assert.equal(right.sourceIn, 4); assert.equal(clock.programSourceTime(right, 8, 20), 10);
  const restored = tracks.trimClip([right], "a", "end", 12, 30, [])[0];
  assert.equal(restored.sourceIn, 2);
  const animated = { ...clip, keyframes: { x: [{ frame: 30, value: 1060 }] } };
  const trimmed = tracks.trimClip([animated], "a", "start", 8.5, 30, [])[0];
  assert.equal(transform.evaluateTransform(trimmed.transform, trimmed.keyframes, 0).x, 1010);
  const extended = tracks.trimClip([trimmed], "a", "start", 8, 30, [])[0];
  assert.equal(transform.evaluateTransform(extended.transform, extended.keyframes, 0).x, 960);
}
trimChecks(); sectionChecks(); clipboardChecks(); keyframeChecks(); basicChecks(); historyChecks(); boundaryChecks();
console.log("PASS video editing: independent entities, clipboard, keyframe interpolation, source mapping, freeze, crop validation and undo/redo");
