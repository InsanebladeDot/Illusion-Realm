"use client";

/** 正式入口的短期素材会话：素材身份、导入批次和播放器各有自己的拥有者。 */
import { useEffect, useReducer, useRef, useState, type RefObject } from "react";
import { t } from "@/i18n";
import { hasVideoBridge, pickVideoFiles } from "@/utils/video/ffmpeg";
import type { EditorMediaAsset } from "./editor-panels";
import { isVideoPath, loadingVideoAsset, MAX_IMPORT_FILES, pathIdentity, prepareVideoAsset, videoFileName } from "./live-video-import";

// 正式素材库只保存当前页面拥有的短期素材。
// selectedAssetId 是素材身份，不是时间线 clipId。
// sourceVisible 表示用户正在查看源媒体，不表示工程开始播放。
// 返回节目时保留素材高亮，便于用户重新打开同一源。
// 本轮时间线没有片段，所以没有构造虚假的 selectedClipId。
// 演示工程不调用这个 Hook，A/B 样板不会分享这里的数组。
// 没有持久化插件，关闭路由即结束本次会话。
// 已有素材只通过明确的 action 替换，不因一次导入失败整库赋空。
// 后续片段实例仍需独立引用素材，不应在这个对象中塞入轨道位置。
// 加载、错误和取消也保留为行，用户能够知道哪一项没有成功。
interface LibraryState { assets: EditorMediaAsset[]; selectedAssetId: string | null; sourceVisible: boolean; }
type LibraryAction = { type: "append" | "replace"; asset: EditorMediaAsset } | { type: "select"; id: string } | { type: "return" };
// Reducer 只计算素材 UI 状态，不执行文件选择、探测或播放。
// return 只退出源查看，不能清空已有素材或改写所选素材。
// select 同时进入素材查看，源与节目的区别由明确状态表达。
// replace 按 ID 更新一行，另一文件即使同名也不会被误改。
// append 先去掉同路径的旧失败记录，使失败重试只保留一个素材身份。
// 成功素材在进入 append 前已经由批次去重挡住，不会被悄悄替换。
// 路径去重比较规范化身份，实际 sourcePath 保持原样。
// 所有分支返回新对象，React 可以观察到更新，不依赖隐式数组变异。
// 素材行排序跟随导入顺序，不用最近完成时间抢占顶部位置。
// 原数组不被 sort 或 splice，样板中共享的数据也不会受到副作用。
// 这里没有依据视频时长生成片段，导入不是时间线编排。
// 多个 action 排队时使用上一个 reducer 结果，避免慢文件覆盖快文件。
// 这像逐笔登记入库账本，不用一份过时账本整本盖掉新记录。
// 报错行与成功行拥有同样的稳定 ID 规则，列表不会串用其他行的 DOM。
// 文件名变化仅影响显示，replace 仍按素材 ID 定位。
// 没有调度 toast 的副作用，批次消息由导入拥有者统一说明。
function libraryReducer(state: LibraryState, action: LibraryAction): LibraryState {
  if (action.type === "return") return { ...state, sourceVisible: false };
  if (action.type === "select") return { ...state, selectedAssetId: action.id, sourceVisible: true };
  if (action.type === "replace") return { ...state, assets: state.assets.map(asset => asset.id === action.asset.id ? action.asset : asset) };
  return { ...state, assets: [...state.assets.filter(asset => pathIdentity(asset.sourcePath ?? "") !== pathIdentity(action.asset.sourcePath ?? "")), action.asset] };
}
// 每次调用建立独立 reducer 实例，正式入口不读取样板的选择。
// 初始数组为空，不能从 DEMO_ASSETS 自动水合出看似导入的素材。
// 初始预览是节目空态，不自动打开隐藏的视频元素。
// dispatch 仅在当前组件树内使用，不暴露为新的 preload 能力。
// 返回的状态是渲染快照，真正并发导入锁另由 ref 管理。
// 因此重渲染不会把锁清空，也不会依赖按钮灰度保证互斥。
function useVideoLibrary() {
  const [state, dispatch] = useReducer(libraryReducer, { assets: [], selectedAssetId: null, sourceVisible: false });
  return { ...state, dispatch };
}
// 一个批次持有一个 AbortController，相当于本次柜台业务的号码牌。
// append 和 replace 是它能进行的两种素材写入，不获得任意工程修改权限。
// 这两个方法会检查本页是否仍存在以及号码牌是否已取消。
// 异步探测迟到时不能借旧回调往新页面添加行。
// 控制器不被写入 React state 或 JSON 文档，避免不可序列化资源进入持久化。
// 导入报告只统计已经处理的文件，不声称扫描完整个磁盘。
// 四类计数分别表示成功、重复、候选拒绝和真实探测失败。
// 超过二十个上限的项归拒绝计数，不悄悄遗失。
interface BatchOwner {
  controller: AbortController;
  replace: (asset: EditorMediaAsset) => void;
  append: (asset: EditorMediaAsset) => void;
}
interface ImportReport { added: number; duplicate: number; rejected: number; failed: number; rejectedFiles: string; }
// 先追加 loading 行，再等待真实探测，这样界面能显示当前文件。
// prepareVideoAsset 成功后沿用原 ID 替换行，不创建第二份相同素材。
// 封面缺失由 prepareVideoAsset 的 notice 表达，不进入探测失败分支。
// 探测异常只替换本文件为 error，其他成功项保留。
// 界面使用通用可读原因，不直接显示带路径和命令的 ffprobe 堆栈。
// 原始异常继续向批次层传播，用于区分用户取消与普通失败。
// 取消时不把行再写成 error，取消按钮负责提供中性取消状态。
// owner 的写入护栏防止卸载后继续 setState。
// 这里不弹成功提示，批次摘要只在真实处理结果确定后更新。
// 单个文件失败不停止剩余候选，是否继续由外层批次决定。
// 错误不会触发自动无限重试，用户明确重新导入才重新探测。
// 成功返回不代表时间线已经创建片段。
// 同一素材文件的元数据不会在这里被项目默认设置覆盖。
// 该方法只知道文件和素材行，不知道轨道名称或节目播放头。
// 资源清理属于底层封面读取，不能等整个批次结束才释放解码器。
// 异步调用有上限，错误文件不会永远占住队列。
async function importOne(filePath: string, owner: BatchOwner): Promise<void> {
  const asset = loadingVideoAsset(filePath);
  owner.append(asset);
  try { owner.replace(await prepareVideoAsset(asset, owner.controller.signal)); }
  catch (error) {
    if (!owner.controller.signal.aborted) owner.replace({ ...asset, state: "error", notice: t("toolBox.editorUi.probeFailed") });
    throw error;
  }
}
// 逐项候选校验让混合拖入得到独立的拒绝计数。
// 非视频后缀不进入探测，避免把普通文本交给媒体进程。
// 路径必须为本地绝对路径，网页链接不能变成文件读取参数。
// seen 同时包含已有成功素材和本批已经见过的路径。
// 两个入口最终共享这一层，所以按钮与拖入有相同去重规则。
// 大小写或斜线差异不会绕过去重。
// 不同目录的同名文件仍有不同 identity，可以分别导入。
// seen 在探测前登记，批内重复失败文件也只尝试一次。
// 后续批次只预填成功素材，失败项仍允许用户重试。
// 导入成功后才增加 added，不能仅凭建立 loading 行增加成功数量。
// 取消异常必须继续向上传，不把取消计入 failed。
// 普通错误增加 failed 后返回，让批次继续后续文件。
// 报告对象仅属于当前批次，不被另一个实例共享。
// 没有按照文件大小猜测能否解码，真实失败留给实际探测与播放器。
// 候选层不生成播放器，不会因为重复文件再开一个解码器。
// 名称不是去重键，汉字与同名文件不需要靠追加后缀制造身份。
async function importCandidate(filePath: string, seen: Set<string>, owner: BatchOwner, report: ImportReport) {
  if (!isVideoPath(filePath)) {
    report.rejected += 1;
    report.rejectedFiles += `${report.rejectedFiles ? ", " : ""}${videoFileName(filePath) || t("toolBox.editorUi.invalidDrop")}`;
    return;
  }
  const identity = pathIdentity(filePath);
  if (seen.has(identity)) { report.duplicate += 1; return; }
  seen.add(identity);
  try { await importOne(filePath, owner); report.added += 1; }
  catch (error) { if (owner.controller.signal.aborted) throw error; report.failed += 1; }
}
// 每批最多处理二十个候选，超过部分在摘要中明确计为拒绝。
// for 循环按顺序 await，封面读取不会一次占用二十个解码器。
// 导入顺序决定素材顺序，完成较慢的文件不会跑到其他行前面。
// 进入批次时只把 ready 素材登记为已存在。
// 错误或取消记录可以重试，不会永远被去重挡住。
// 每个文件开始前检查取消，用户停止后不再发起下一份 ffprobe。
// 当前文件结束后再次核对取消，不能用迟到结果覆盖取消说明。
// publish 接收当前累计结果，界面可以看到已完成数量。
// 摘要不是百分比动画，不会在没有真实结果时假装增长。
// 候选拒绝和重复也会更新摘要，即使没有新增素材也有反馈。
// 某个文件失败只增加失败计数，保留前面已经导入的内容。
// 本轮没有回滚整批的事务，适合桌面素材逐项导入的行为。
// 文件列表是 readonly，不会为了截取上限改写系统选择器的结果数组。
// 工程时长不等于素材时长总和，批次层不修改项目信息条。
// 没有自动选中第一条的新规则，搜索与选择不被导入过程暗中改写。
// 现有播放器仍由用户所选素材决定，后台导入不会抢走它。
async function runImportBatch(paths: readonly string[], assets: readonly EditorMediaAsset[], owner: BatchOwner, publish: (report: ImportReport) => void) {
  const report = { added: 0, duplicate: 0, rejected: Math.max(0, paths.length - MAX_IMPORT_FILES), failed: 0, rejectedFiles: paths.slice(MAX_IMPORT_FILES).map(videoFileName).join(", ") };
  const seen = new Set(assets.filter(asset => asset.state === "ready").map(asset => pathIdentity(asset.sourcePath ?? "")));
  for (const filePath of paths.slice(0, MAX_IMPORT_FILES)) {
    if (owner.controller.signal.aborted) return;
    await importCandidate(filePath, seen, owner, report);
    if (!owner.controller.signal.aborted) publish(report);
  }
}
// 导入上下文是当前一次页面渲染的依赖集合，不是全局状态容器。
// library 提供入库与选择数据，active 提供跨渲染仍稳定的互斥锁。
// alive 仅在事件或异步回调中读取，不在渲染时从 ref 取界面值。
// setBusy 和 setNotice 属于导入状态，不负责改变播放器时间。
// 类型直接使用当前 Hook 的真实返回值，避免手写另一套不一致接口。
// RefObject 中的控制器可以替换，但外部不能拿它直接访问 Node。
// 没有把文件字节或浏览器 File 对象写进状态树。
// 上下文不会跨越 preload，也不参与 IPC 序列化。
interface ImportContext {
  library: ReturnType<typeof useVideoLibrary>;
  active: RefObject<AbortController | null>;
  alive: RefObject<boolean>;
  setBusy: (value: boolean) => void;
  setNotice: (value: string) => void;
}
// 把写入能力限定在一个批次身份内。
// 每次真正写入前重新读 alive，不相信异步开始时的旧页面状态。
// 取消信号也在写入时检查，封面刚完成就取消的竞态不会漏过。
// append 与 replace 共享同一个护栏，不能只有成功写入检查而错误漏检。
// 闭包保留的是稳定 dispatch 与控制器，不需要把最新数组复制进异步回调。
// Reducer 会基于当前数组应用更新，避免过时快照覆盖新行。
// 这像收据要盖当天柜台的有效章，旧号码牌不能给新账本入账。
// 没有当前页面时静默丢弃结果是预期清理，不向新路由发出失败消息。
// 本层不撤销已经成功入库的文件，也不删除用户磁盘文件。
// controller 只取消本批，不会误停旧视频工具的其他任务。
// 调用方获得最小两个方法，不把整份 store 当成任意写入口。
// 这里不生成成功回包，真正的成功来自底层探测返回。
function batchOwner(context: ImportContext, controller: AbortController): BatchOwner {
  function send(type: "append" | "replace", asset: EditorMediaAsset) {
    if (context.alive.current && !controller.signal.aborted) context.library.dispatch({ type, asset });
  }
  return { controller, append: asset => send("append", asset), replace: asset => send("replace", asset) };
}
// finally 使用批次身份归还锁，不能无条件清空 active。
// 若未来旧批次迟到，新批次的控制器也不会被旧 finally 擦掉。
// 只有仍挂载的页面才恢复 busy，卸载后不继续调状态。
// 释放锁不等于成功，失败和取消也必须恢复入口。
// 这里只收尾导入，不触碰源播放器的暂停与清理。
// 错误摘要在原错误分支保留，finally 不用空字符串覆盖。
function releaseVideoImport(context: ImportContext, controller: AbortController) {
  if (context.active.current !== controller) return;
  context.active.current = null;
  if (context.alive.current) context.setBusy(false);
}
// 按钮没有 paths 时打开原生选择器，外部拖入则直接提供路径数组。
// 两个入口从这里汇合，不分别实现探测、去重和封面读取。
// ref 锁在打开选择器前取得，双击按钮不能同时打开两批。
// 这比只依赖 React 的 busy 更可靠，因为按钮灰度需要下一次渲染才更新。
// 控制器创建后才进入 try，finally 无论哪条路径都会归还本次锁。
// 桌面桥缺失给出真实不可用反馈，不用演示数据补一次“成功导入”。
// 选择器取消返回空数组，显示取消说明并保留素材和高亮。
// 路径解析后的空数组与探测失败不同，不把取消误报为坏文件。
// 等待选择器期间离开页面，拿到路径也不再启动探测。
// 取消后的旧批次不能继续写摘要，控制器和 alive 都要核对。
// 批次的 publish 只承载计数，不暴露完整用户路径。
// 探测失败已被单文件边界接住，外层 catch 主要负责入口与未预期异常。
// catch 不覆盖明确的取消消息，避免用户点取消却看到选择器失败。
// 系统选择器自身没有取消 IPC；本轮等待它的原生关闭结果。
// 不会使用 Promise 定时器伪造“用户已经选好了文件”。
// 读取真实数据之前先显示读取状态，让较慢磁盘有可见反馈。
// 所有成功行由真实 prepareVideoAsset 返回，按钮按下本身不算成功。
// 没有导出、保存或云端请求进入这条入口。
// 导入发生在当前路由会话，导航退出不保留后台隐形任务队列。
// 摘要只展示文件名，不能把完整用户路径放进状态播报。
// 非视频与超出批次上限都说明拒绝依据，不能只留下一个看不懂的计数。
// 原生取消不走这个摘要，用户主动停止仍是独立中性状态。
// 文件名来自真实候选，列表没有新增行时也能知道哪些项未导入。
function importReportText(report: ImportReport) {
  const summary = t("toolBox.editorUi.importSummary", { ...report });
  return report.rejected ? `${summary} · ${t("toolBox.editorUi.rejectedFiles", { names: report.rejectedFiles })}` : summary;
}
async function startVideoImport(context: ImportContext, paths?: readonly string[]) {
  if (context.active.current || !context.alive.current) return;
  const controller = new AbortController();
  context.active.current = controller;
  context.setBusy(true);
  context.setNotice(t("toolBox.editorUi.mediaLoading"));
  try {
    if (!hasVideoBridge()) throw new Error();
    const picked = paths ?? await pickVideoFiles();
    if (!context.alive.current || controller.signal.aborted) return;
    if (!picked.length) { context.setNotice(t("toolBox.editorUi.importCancelled")); return; }
    await runImportBatch(picked, context.library.assets, batchOwner(context, controller), report => context.setNotice(importReportText(report)));
  } catch { if (context.alive.current && !controller.signal.aborted) context.setNotice(t("toolBox.editorUi.importDialogFailed")); }
  finally { releaseVideoImport(context, controller); }
}
// 取消先发出信号，正在等候的探测或封面 Promise 会停止本次等待。
// 已有 ready 行不动，只把当前 loading 行改成 cancelled。
// 中性取消状态与红色探测错误分开，用户不会被误告知文件损坏。
// 源文件仍在磁盘，取消从不执行删除或移动。
// 当前行保留名称，用户能确认哪一份在取消前尚未完成。
// 入口的 busy 随用户取消结束，但旧 finally 仍负责正式归还批次锁。
// 这个短暂锁保护取消回调尚未收尾时不启动新批。
// 摘要明确说明已有素材保留，不虚构整批回滚或自动保存。
// 没有 abort 时调用也不会抛错，按钮重复操作仍是安全的。
// 取消不会清空素材选择，用户可以继续看之前成功的视频。
// 这里不伪称杀死 ffprobe 子进程；桥接没有提供该能力。
// 底层迟到结果依靠 owner 护栏丢弃，不重新把 cancelled 改为 ready。
function cancelVideoImport(context: ImportContext) {
  context.active.current?.abort();
  for (const asset of context.library.assets.filter(item => item.state === "loading")) context.library.dispatch({ type: "replace", asset: { ...asset, state: "cancelled", notice: t("toolBox.editorUi.importCancelled") } });
  context.setBusy(false);
  context.setNotice(t("toolBox.editorUi.importCancelled"));
}
// active 是导入控制器容器，不是 DOM 节点。
// 卸载时必须读取最后一批，捕获挂载时的 null 会漏掉后来开始的导入。
// 清理先标记页面失效，再发出取消，已排队的 Promise 也不能再更新 UI。
// 这只结束当前页面的队列，不停止旧工具正在处理的其他视频任务。
function closeVideoImporter(alive: RefObject<boolean>, active: RefObject<AbortController | null>) {
  alive.current = false;
  active.current?.abort();
}
// busy 与摘要由本实例持有，两个编辑器不会互相显示导入状态。
// active ref 只承担互斥和取消，不承担可见计数。
// alive 在卸载时变为 false，所有异步写入都从同一个标记判断。
// 清理同时 abort 当前控制器，等待中的封面解码也会被释放。
// React 开发环境可能重新执行 effect，进入时恢复 alive 为 true。
// 闭包在点击时读取当前上下文，导入前的已有素材集合来自最新渲染。
// 一个批次进行中不启动第二个，所以其 seen 集合不会与并行批次冲突。
// 返回的是业务意图方法，不向组件暴露任意 ipcRenderer。
// 没有定期轮询或后台续传，这只是页面范围的一次导入。
// finally 的状态恢复与组件清理互相补足，失败不会留下永久 busy。
// 用户文档与 localStorage 均未参与，会话结束即释放数组。
// 导入取消和路由卸载共享 AbortController 机制，避免两套清理规则。
// 控制器不会因每一帧视频 timeupdate 而重建。
// 播放状态在另一个 Hook 中，因此导入摘要不会让播放器重载。
function useVideoImporter(library: ReturnType<typeof useVideoLibrary>) {
  const [importBusy, setBusy] = useState(false);
  const [importNotice, setNotice] = useState("");
  const active = useRef<AbortController | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => closeVideoImporter(alive, active); }, []);
  const context = { library, active, alive, setBusy, setNotice };
  return { importBusy, importNotice, startImport: (paths?: readonly string[]) => startVideoImport(context, paths), cancelImport: () => cancelVideoImport(context) };
}
// 把库和导入两种职责组合成正式入口使用的最小接口。
// 所选素材按稳定 ID 查找，不默认取数组第一份当作用户选择。
// 加载、错误和取消行不能进入真实源播放器。
// 选择只产生 select action，不创建时间线实例或修改工程时长。
// sourceVisible 是显式查看模式，返回节目不丢失素材库。
// 这里没有 DEMO_ASSETS 或 DEMO_CLIPS 的运行时引用。
// 静态样板自己的状态与真实文件路径不会交叉。
// 导入和选择状态可一起渲染，但执行生命周期仍分属各自拥有者。
// 返回动作由宿主注入公共预览，不把路由跳转塞进播放器。
// 相同素材再次打开时由组件 key 重新建立干净的播放生命周期。
// 未选中时返回 null，预览复用真正空态，不显示伪造封面。
// 本层不推断片段属性，右侧检查器仍明确未选片段。
export function useLiveVideoSession() {
  const library = useVideoLibrary();
  const importer = useVideoImporter(library);
  const selectedAsset = library.assets.find(asset => asset.id === library.selectedAssetId) ?? null;
  function selectAsset(id: string) {
    if (library.assets.some(asset => asset.id === id && asset.state === "ready")) library.dispatch({ type: "select", id });
  }
  return { ...library, ...importer, selectedAsset, selectAsset, returnToProgram: () => library.dispatch({ type: "return" }) };
}
