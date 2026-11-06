"use client";

// 把所有导入入口接到同一条 File → 路径引用 → 编辑事务流程。
// 隐藏 input 仍由浏览器调用真实系统选择框，不新增通用文件读取 IPC。
// input 的值每次清空，取消不修改作品，再次选择同一文件仍能发出 change。
// target 是这一次请求的替换目标，不是持久化选中状态，也不跟随之后的选择漂移。
// 参数通过现有编辑器回调写回，和手动修改、删除、撤销使用同一本作品账本。
import { useEffect, useRef, useState, type ChangeEvent, type RefObject } from "react";
import { useReactFlow } from "@xyflow/react";
import { t } from "@/i18n";
import { unwrapIpc } from "@/utils/ipcResult";
import type { CanvasNode } from "./canvas-model";
import type { useCanvasEditor } from "./use-canvas-editor";
import { createMediaNode, mediaAccept, readCanvasMedia, type CanvasMediaKind } from "./canvas-media-import";

interface ImportTarget { id: string; kind: CanvasMediaKind }
type ImportMode = "copy" | "move";
// target 不是“当前高亮素材”的别名，而是某一次系统框请求的明确收件人。
// 用户从底栏开启混合导入时没有收件人，所有合法文件都建立新节点。
// 用户从现有卡片开启更换时收件人固定，即使随后发生重新渲染也不能漂移。
// 把 id 与 kind 放在一起可同时确认身份和类型，不靠文件选择结果反推节点类型。
// 结构只有普通标量，但仍只在事件 ref 中使用，不写进作品快照。

// 默认落在镜头中央；导航开合、平移和缩放都由当前图引擎矩阵换算。
// 尺寸来自当前宿主，不借旧导航常量拼偏移，窄窗口同样可找到导入节点。
// 目标不存在就创建新节点，避免选择框打开期间节点被删除后悄悄丢掉文件。
// 不在素材入图时自动 fitView，防止导入打断用户当前观察位置。
// readonly File 数组说明不修改调用者的选择清单，拖放和系统框都遵循同一规则。
// destination 为 null 表示批量新增；未传时只读取这次系统框的明确目标。
// null 不能换成 undefined，否则默认参数会把外部拖入误当成单卡替换。
// editable 来自可靠草稿水合，加载失败时不能导入后覆盖未读出的旧作品。
// 空数组只表示没有选择，不创建空节点，也不显示成功。
// 先找到真实宿主矩形，避免把窗口标题栏和应用导航宽度算进画布位置。
// 宿主已经卸载时直接结束，不能把迟到的选择结果写回消失的工作区。
// 屏幕中心减半张卡片宽高，让首张导入卡围绕观察中心出现。
// 横向视频仍由自己的节点宽度显示，不把这个起点计算当作素材尺寸。
// 导入流程把 File 身份与工程节点身份分开。
// preload 只负责从真实 File 取系统路径，不在渲染层使用 File.path。
// prepareFiles 先拒绝未知类别，避免向磁盘服务提交空批次。
// 即使前端通过，主进程仍有等价形状和后缀校验。
// position 只计算一次，同批素材按统一偏移排布。
// 位置取当前宿主中心，不依赖窗口外壳固定宽度。
// 屏幕坐标经 screenToFlowPosition 换成画布世界坐标。
// 结果不因已有缩放与平移而错误落到远处。
// 原 input 只是定位宿主，不把 File 本体永久存进去。
// 调用 IPC 时传 name 与已有 workspace，首次复制才分配目录。
// 已有作品导入新素材继续使用原归属，不每次创建新画布文件夹。
// 窗口离开时 active 会变 false，迟到结果不改旧图。
// 磁盘复制完成后才写 workspace 与媒体引用。
// 因此卡片不会短暂保存一个尚未成功复制的目标地址。
// 返回的实际媒体可以少于请求数，必须按成功项创建节点。
// 单卡替换优先匹配明确 destination.id。
// 不读取当前选中项来猜目标，用户在系统框中等待不会换错卡。
// 原目标若已经不在图中，则用成功文件创建新卡。
// replace 只执行一次，异常多项结果也不会反复覆盖同一目标。
// 新建卡片有新身份，更换卡片则保留原身份。
// 单卡更换不改 prompt、content 或原连接。
// 追加批次不清空 editor.nodes，先前工程继续保留。
// rejected 合并前端分类失败与主进程复制失败。
// 反馈截取基本名列表长度，极大批次不会撑开状态栏。
// 成功数量取实际新建与替换，不能直接使用 FileList.length。
// 导入成功只表示受管副本登记，解码结果由各卡真实事件决定。
// 媒体预览错误不会回头撤销整个批次。
// 此边界不触发视频时间线，也不会自动启动模型生成。
async function applyMediaImport(editor: ReturnType<typeof useCanvasEditor>, flow: ReturnType<typeof useReactFlow>, input: HTMLInputElement | null, files: readonly File[], destination: ImportTarget | null, active: () => boolean, mode: ImportMode) {
  if (!editor.persistence.editable || !files.length) return;
  const host = input?.closest("[data-infinite-canvas]")?.getBoundingClientRect();
  if (!host) return;
  const position = flow.screenToFlowPosition({ x: host.left + host.width / 2 - 142, y: host.top + host.height / 2 - 142 });
// 替换示例：用户从视频 A 的更换按钮打开系统框。
// destination 固定记录 A 的 id 与 video 类别。
// 用户选择音频时，前端拒绝类型，不改变 A。
// 用户取消时 target 清空，下一次底栏导入不会继续替换 A。
// 用户选择视频且复制成功时，只更新 A 的 media。
// A 的自定义标题可以继续保留，卡片内仍显示真实源文件名。
// 如果选择期间 A 已被删除，成功文件不会被悄悄丢弃，而是新建节点。
// 批量入口 destination=null，混合媒体按类别创建各自节点。
// 拖放同样显式传 null，不读取文件选择器的残留目标。
// 未知类型只有拒绝反馈，不生成一个无来源的空媒体卡。
// 原节点不因整批失败而失去高亮或内容。
// 部分成功的消息列出拒绝项，不能误报全部成功。
// 同批成功文件按实际返回顺序排布，失败项不占一个假节点。
// 浏览器给出的文件路径只作为来源，最终 node.media 使用受管副本。
// 这让外部原文件改名后的工程仍有自己的资产。
// 工程目录失去归属时显示整批失败，不能偷偷回落原路径。
// 本流程不会扫描同名目录猜测另一份素材位置。
// 相同名称也可能是不同内容，不能自动替用户做替换判断。
// 新卡 id 在创建边界生成，文件名从来不是节点身份。
// 返回节点交给原 importMedia 命令，撤销和重做继续统一。
  const candidates = prepareFiles(files, destination);
  if (!candidates.media.length) { editor.setMessage(t("canvas.importRejected", { names: candidates.rejected.join("、").slice(0, 240) })); return; }
// 这次调用不会把 File 正文串成 base64。
// 媒体只以地址、基本名、大小和类型描述跨桥接传递。
// 请求的 workspace 取编辑器当前归属，不能用画布显示名覆盖它。
// 标题为空时只给目录分配提供本地化建议名。
// 一旦主进程分配实际 folder，后续标题切换语言不会移动它。
// 系统复制失败由 IpcResult 返回，unwrapIpc 进入外层 catch。
// 部分失败则返回 media 与 rejected，不会丢掉同批成功结果。
// 这里 await 真正的复制完成，再把新地址交给预览。
// 否则播放器可能抢在目标文件写完前读到截断内容。
// 同一工作区没有并发复制批次，减少首轮分配目录竞态。
// 其他画布实例仍可独立导入，不共享这次 running。
// 来源 File 的 size 不决定目标字节分配，主进程重新 stat。
// 即使原文件在选择后被删，现有节点也不会被清空。
// 新批次只有可成功复制的文件能建立媒体引用。
// 复制到工程目录不自动执行探测或生成队列。
// 首帧加载由下游真实 video 事件结束，不在这里设置 ready。
// 对不支持编码的完整文件也可保留引用供更换。
// 界面不会把整个工程因单张卡的解码失败重置为空。
// 本导入流程不支持 URL 远程下载，也不请求网络账户权限。
// 用户选择的图片、视频、音频不会自动上传到模型服务。
  // 模式随这一次请求发送，不存在全局“上次选择移动”的隐式偏好。
  // 主进程返回实际目标路径后才创建节点，播放不会读取尚未搬完的文件。
  // 图节点的剪切快捷键与磁盘移动完全独立，不能借 Ctrl+X 改动原媒体。
  const result = unwrapIpc(await window.electronAPI!.canvasImportMedia({ name: editor.name || t("canvas.untitled"), workspace: editor.workspace, files: candidates.media, mode }));
  // 复制期间离开页面不把迟到结果写进已卸载图；磁盘副本不因此删除源文件。
  // 工程目录身份来自主进程，不能根据用户标题自行拼磁盘地址。
  if (!active()) return;
  editor.setWorkspace(result.workspace);
  const nodes: CanvasNode[] = [];
  let replaced = false;
  for (const media of result.media) {
    if (!replaced && destination && flow.getNode(destination.id)) { editor.updateNodeData(destination.id, { media }); replaced = true; }
    else nodes.push(createMediaNode(media, position, nodes.length));
  }
  editor.importMedia(nodes);
  const rejected = [...candidates.rejected, ...result.rejected];
  editor.setMessage(rejected.length ? t("canvas.importRejected", { names: rejected.join("、").slice(0, 240) }) : t("canvas.imported", { count: nodes.length + Number(replaced) }));
}

// 系统框与拖放先做同一分类；主进程仍会重复校验，不能把 accept 当权限。
// 逐文件失败只拒绝本项，已经存在的作品不受影响。
// File 的 name 可以合法但 MIME 缺失，因此分类复用既有后缀规则。
// getPathForFile 可能因桥接限制抛错，每一项都有独立 catch。
// 一项坏文件不会阻止同批其他类型被尝试。
// destination.kind 限定单卡更换类型，视频卡不能误接音频。
// 工作区多选没有 destination，可同时接收三类已支持素材。
// 返回的 media 只含普通对象，IPC 不发送浏览器 File。
// rejected 保留用户看到的原基本名，帮助识别失败项。
// 原数组只读，不重排系统选择框的文件顺序。
// 不检查内容哈希，避免每次导入都完整扫描大文件。
// 后续主进程 stat 与 copyFile 才确认实际文件可读取。
function prepareFiles(files: readonly File[], destination: ImportTarget | null) {
  const media = [];
  const rejected = [];
  for (const file of files) {
    try {
      const item = readCanvasMedia(file);
      if (!item || destination && item.kind !== destination.kind) rejected.push(file.name);
      else media.push(item);
    } catch { rejected.push(file.name); }
  }
  return { media, rejected };
}

function useNativeFileCancel(input: RefObject<HTMLInputElement | null>, target: RefObject<ImportTarget | undefined>, editor: ReturnType<typeof useCanvasEditor>) {
  // 原生取消通常只通知打开系统框的 input，监听不放在全局 window 上。
  // 不通过 setTimeout 或 focus 事件猜取消，耗时系统框也不会被误判为超时失败。
  // 更换框取消后原卡媒体继续播放与否仍由当前选择和预览生命周期决定。
  // 此处不调用 load 或恢复旧图，因为用户只是取消了文件选择而不是取消全部编辑。
  // 返回页面后会有新的 input 与新的监听，不复用已卸载节点上的事件目标。
  // React 的 input 类型未登记 cancel，直接订阅原生事件，不用类型断言伪造支持。
  // 文件选择器关闭或重复选择同一项时浏览器会通知取消，不改变已确认节点。
  // 注册和释放都使用同一函数，路由卸载后不会保留指向旧编辑器的事件。
  // 只清理本工作区的 input，不使用全局焦点猜测“用户是不是取消了”。
  useEffect(() => {
    // 取 effect 安装时的实际 input，清理时不能改用未来可能替换的新元素。
    // target 在 ref 中只用于事件，不参与 JSX 的条件渲染。
    // 清空目标防止下一次普通导入误更换刚刚取消的卡片。
    // 用户取消只改变提示，画布节点数、连接与撤销记录均保持不变。
    const element = input.current;
    const cancel = () => { target.current = undefined; editor.setMessage(t("canvas.importCancelled")); };
    element?.addEventListener("cancel", cancel);
    return () => element?.removeEventListener("cancel", cancel);
  }, [editor, input, target]);
}

// 异步文件复制有自己的门闩和卸载边界；文件框目标仍归下方选择器会话。
// 拆开资源生命周期后，控件装配不必同时管理磁盘操作的错误与 finally。
// 门闩在 await 前同步关闭，避免两次快速拖入同时分配不同目录。
// busy 用于界面遮挡与禁用，不是文件复制百分比。
// 独立 alive ref 避免旧路由回调写进新实例。
// 卸载不强行取消已经执行的系统复制，因为可能有成功资产正在返回。
// 完成但未接收的副本保持在所属目录，不删除原文件或他人历史资产。
// 下一次进入仍从保存草稿恢复，而不是盲目扫描 user 目录全部文件。
// 空 File 数组不进入忙碌，不显示“复制中”的假状态。
// 这里捕获整批异常，包括 IPC 拒绝与目录归属错误。
// 逐项拒绝由成功返回中的 rejected 表达，不混成整批异常。
// finally 对成功、失败和取消都释放 running。
// 只在活着的实例 setBusy，避免卸载后继续驱动 UI。
// 返回的 importFiles 供系统框和外部 drop 共同调用。
// 拖入入口显式传 null，不消费上一次文件框的替换目标。
// 单卡入口捕获目标后才进入异步，不在 await 后重新读 ref。
// 操作状态没有写入全局 Zustand，多个工作区请求不会互相占门闩。
// 媒体加载状态归下游播放器，复制完成不意味着浏览器解码完成。
function useMediaImportOperation(editor: ReturnType<typeof useCanvasEditor>, flow: ReturnType<typeof useReactFlow>, input: RefObject<HTMLInputElement | null>) {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // 同一工作区串行复制，避免两批导入同时给未分配的项目建立不同目录。
  // 失败恢复 busy 并保留旧图；finally 只清自己的门闩，不伪造成功。
  const importFiles = async (files: readonly File[], destination: ImportTarget | null, mode: ImportMode) => {
    if (running.current || !files.length) return;
    running.current = true;
    setBusy(true);
    editor.setMessage(t(mode === "move" ? "canvas.movingMedia" : "canvas.importing"));
    try { await applyMediaImport(editor, flow, input.current, files, destination, () => alive.current, mode); }
    catch { if (alive.current) editor.setMessage(t("canvas.importFailed")); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  };
  return { busy, importFiles };
}

// 确认流程像先写搬运单再叫搬家公司；在确认前不创建目录、不复制也不删文件。
// 系统选择框和外部拖入都经过 request，不能让拖入绕过默认复制和风险说明。
// pending 只保留本次浏览器 File，关窗或取消即释放，不写入可导出的工程 JSON。
// 更换目标随请求捕获，等待期间选择别的节点也不会把视频换错卡。
// 图片和音频无需二次确认，直接沿用原来的复制流程。
// 混合批次只有视频受移动模式影响，说明和主进程判断保持一致。
// 前端分类沿用 prepareFiles，不再维护另一套视频扩展名。
// 分类失败由原流程反馈；不会因确认框没出现就静默忽略坏文件。
// 每次弹窗的选项由组件初始化为 copy，不记住危险的移动选择。
// 确认关闭弹窗后才执行系统操作，busy 接替它隔离背景。
// 取消仅释放待选列表并更新提示，不撤销此前已经完成的素材导入。
// 焦点在背景 inert 之前捕获，关闭后复用 CanvasOverlay 的返回能力。
// 文件来源可以是资源管理器，活动元素不是节点时允许返回画布根。
// 单个 Hook 只属于自己的工作区，不会拦住另一画布实例的导入。
// pending 期间拒绝新的请求，避免用户没确认的来源被第二次拖放替换。
function useVideoImportChoice(operation: ReturnType<typeof useMediaImportOperation>, editor: ReturnType<typeof useCanvasEditor>) {
  // pending 中保存的是选择瞬间的数组，不延后读取已经被清空的 input.files。
  // readCanvasMedia 经 preload 取得实际路径，文件名只用于类别与可读反馈。
  // 确认之前的分类不访问文件正文，所以不会为了弹框先读完整个大视频。
  // 分类时没有可用视频则交原流程处理，不把普通 TXT 导入误叫“取消”。
  // 类型合法但正文损坏的视频仍需要确认，字节能否解码属于播放器责任。
  // File 的浏览器引用不会序列化给 IPC，确认后只提交普通媒体描述。
  // 系统框返回前目标放在 ref，返回后立即封装进 pending，之后 ref 可安全清空。
  // 外部 drop 明确传 null，不可能继承上一次“更换视频”的节点 ID。
  // 记录 ID 不记录节点索引，图里其他节点排列不影响替换的接收方。
  // 确认后原目标已删除的情形由 applyMediaImport 降级为新建卡，而非丢失文件。
  // 背景不能编辑时仍由 applyMediaImport 的 editable 再检查，不把弹窗当写权限。
  // operation 的同步 running ref 是最终并发门闩，React 状态尚未提交也不会并发写盘。
  // pending 的判断只防止两份确认相互替换，不代替磁盘层的串行保护。
  // 关闭弹窗和启动 busy 在同一用户动作中，不给背景安排额外的异步编辑窗口。
  // 确认后的异常由 operation 的 catch/finally 接住，不能留下永久不可操作的画布。
  // 模式选错但尚未确认可直接取消，此时磁盘服务尚未收到请求。
  // 已开始的移动不显示假取消按钮，因为当前系统复制没有可靠的中断回滚协议。
  // 窗口卸载只忽略迟到的图更新，不会强删已经完成的目标副本。
  // 移动后若立即离开，目标仍在工程目录，不能误以为原位置保留了第二份。
  // 这种磁盘副作用不会自动保存图，用户仍需使用原有保存或导出工程入口。
  // 操作成功消息只统计实际写入的引用数，不把一个确认点击算作导入成功。
  // 部分失败的基本名仍由原 rejected 提示，不用“全部完成”隐藏受管来源拒绝。
  // returnFocus 只保留 HTMLElement，不保存鼠标坐标来猜返回焦点。
  // 系统框已关闭时活动元素可能是原卡按钮，Overlay 会检查它是否仍连接在 DOM。
  // 若原触发器已消失，不强制聚焦已经卸载的元素，更不会自动重新打开文件框。
  // 取消保留所有原节点、连接和选择，不调用空数组导入来伪造状态恢复。
  // 各实例拥有自己的 pending 与 returnFocus，另一个画布不会确认本实例的 File。
  // 模式不写入用户设置，用户导出工程不会带上另一台电脑不适用的搬运偏好。
  // 新请求从复制开始的规则在展示组件而不是持久层实现，避免迁移旧用户文档。
  // 确认提示不假装提供转码，复制或移动不会改变视频的浏览器编码兼容性。
  const [pending, setPending] = useState<{ files: readonly File[]; destination: ImportTarget | null } | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const request = (files: readonly File[], destination: ImportTarget | null) => {
    if (pending || operation.busy || !files.length) return;
    if (!prepareFiles(files, destination).media.some(media => media.kind === "video")) { void operation.importFiles(files, destination, "copy"); return; }
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPending({ files, destination });
  };
  const confirm = (mode: ImportMode) => {
    if (!pending) return;
    setPending(null);
    void operation.importFiles(pending.files, pending.destination, mode);
  };
  const cancel = () => { setPending(null); editor.setMessage(t("canvas.importCancelled")); };
  return { pending: !!pending, request, confirm, cancel, returnFocus };
}

// 选择框状态只跟当前工作区实例走，不加入 Zustand 的全局持久化分段。
// 两个画布即使用相同展示组件，也不会互相覆盖等待中的替换目标。
// 一个工作区只用一个 input，菜单、底栏与每张卡通过参数传递差异。
// 更换目标记录 ID 而不是数组索引，文件选择期间节点排序变化也不会换错卡。
// 不持有节点 data 的可变引用，替换时只把新媒体交给已有 updateNodeData。
// Hook 不导入 Electron，不直接读写用户文档，不新增绕过 preload 的权限。
// 本地媒体预览由下游组件管理，本 Hook 不承担加载、播放和解码超时。
// 导入失败不是保存失败，失败提示通过画布消息展示，不改持久化状态机。
// 选择框取消不撤销此前导入，也不触发 reducer 的 remove。
// File 最迟在本次导入确认结束后释放，不把浏览器对象留进持久化状态。
export function useCanvasMediaImport(editor: ReturnType<typeof useCanvasEditor>) {
  const input = useRef<HTMLInputElement>(null);
  const target = useRef<ImportTarget | undefined>(undefined);
  const flow = useReactFlow();
  useNativeFileCancel(input, target, editor);
  const operation = useMediaImportOperation(editor, flow, input);
  const choice = useVideoImportChoice(operation, editor);
  const busy = operation.busy;
  const importFiles = (files: readonly File[], destination: ImportTarget | null = target.current ?? null) => choice.request(files, destination);
  // 每次事件使用最新 editor 回调，保存期间仍可继续编辑，之后签名只记录提交时快照。
  // 这里不等待保存完成才允许本地预览，导入后的新引用会正确显示未保存。
  // 此流程没有自动云备份；离开前是否已保存仍以原顶部状态提示为准。
  // 普通草稿使用本机受管地址；跨设备应导出完整工程包，不自动搜索全磁盘。
  // 不自动扫描相邻目录查找同名文件，避免错连另一份内容或造成隐私与性能问题。


  // 每次选择前同步设置 accept，用户真正按下按钮时仍保留浏览器激活权限。
  // 不用异步延时打开 input，否则系统可能将其识别为无用户意图的弹窗并拒绝。
  // 媒体缺失时仍可更换同一张卡，提示词、连线和节点身份都保持原样。
  // 桌面桥接缺失就明确反馈，不静默导入一个无法保存的浏览器文件。
  const pick = (destination?: ImportTarget) => {
    // 尚未可靠读出用户文档时禁止开启选择框，和顶部保存入口保持相同保护。
    // 桌面桥接检查发生在用户操作中，静态导出阶段不会访问 window。
    // 不因为系统框可以打开就假定路径桥接存在；两种能力是不同边界。
    // 受管复制依赖桌面桥接，浏览器页面给出明确原因，不偷偷退回临时 Blob。
    if (!editor.persistence.editable) return;
    if (!window.electronAPI?.getPathForFile || !window.electronAPI?.canvasImportMedia) { editor.setMessage(t("canvas.importDesktop")); return; }
    target.current = destination;
    // 每次先清空 value，不依赖浏览器是否会对重复文件派发 change。
    // accept 在 click 前设置，系统框首次打开就知道当前卡片允许哪类文件。
    // multiple 的真假来自业务意图，而不是复用组件自身记住上一次设置。
    // 没有 input 时不尝试创建临时 DOM，避免同一工作区出现两份资源拥有者。
    // 同步 click 保留用户激活链，音视频权限和文件选择不会靠假延时解锁。
    // 单卡更换只选一份；工作区入口才开启多选，避免一次替换混进额外的撤销步骤。
    if (input.current) { input.current.accept = mediaAccept(destination?.kind); input.current.multiple = !destination; input.current.value = ""; input.current.click(); }
  };

  // FileList 立即复制，因为稍后清空 input 会改变浏览器维护的选择列表。
  // 处理完清掉目标，拖入下一批文件不会继续替换上一次点过的卡片。
  // 系统取消事件不计作错误，也没有“导入成功”的虚假反馈。
  // 用户看到的成功仅表示引用进入作品；可解码性继续由真实媒体事件决定。
  const changed = (event: ChangeEvent<HTMLInputElement>) => {
    // 不延后访问 React event 的 currentTarget，先在同一事件栈完成 FileList 拷贝。
    // 选择的是真实系统 File，路径只由 preload 解释，不解析不标准的 file.path。
    // 清空 input 后不会丢媒体，作品中已经保留了独立的普通数据引用。
    // File 本身不能 JSON 序列化；清掉它也避免无意持有大文件的浏览器包装对象。
    // 替换目标只对这一次 change 有效，下次底栏导入不会继承单卡意图。
    // 逐项路径异常在 prepareFiles 收敛；异步磁盘复制失败由 importFiles 的 catch/finally 恢复。
    void importFiles(Array.from(event.currentTarget.files ?? []));
    event.currentTarget.value = "";
    target.current = undefined;
  };
  // 给 input 的是稳定 ref，渲染只挂载引用，不读取 ref.current 计算 UI。
  // 给卡片的是意图回调，卡片不获取全工作区文件清单或其他节点的路径。
  // drop 包装明确传 null，保证它总是新增，不会消费尚未完成的系统框目标。
  // 返回值没有装入 Context 的共享业务状态；每个工作区继续拥有自己的请求目标。
  return { inputRef: input, pick, changed, busy, choice, importFiles: (files: readonly File[]) => { void importFiles(files, null); } };
}
