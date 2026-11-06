"use client";
/**
 * 本地模型批量补全的会话队列：逐个调用既有单文件 IPC，不同时读取整库模型。
 * Zustand 将进度保留在页面之外，路由切换和本地/在线切换都不丢队列。
 * 任务按具体版本文件去重，点击时冻结筛选结果，后续筛选不改变正在执行的范围。
 * 首次启动会展示等待项而非预先宣称已找到图片，所有完成状态来自主进程结果。
 * 业务失败按文件隔离，单个未收录模型不会让整个批次提前返回空结果。
 * 用户关闭结果 details 只影响展示，队列不会因此停止或清空。
 * 不通过 React Context 分发全局任务，沿用项目既有 Zustand 状态约定。
 * 当前批次内同路径只运行一次，不建立依赖文件名模糊匹配的全局成功缓存。
 * 模型被系统资源管理器移动时，主进程会返回文件/权限相关失败供本批次解释。
 * 资料和 logo 是独立资产，重试不会因为已看到 JSON 就漏掉需要补的图片。
 * 已有封面可读时不自动替换为网站的新样图，尊重用户选定的目录封面。
 * 停止不会回滚已完成版本，磁盘已提交的 JSON 和图片仍供其他功能读取。
 * 同一批次状态用于按钮禁用、详情刷新、逐项解释和重试筛选，减少规则分叉。
 * 批量执行不引入新的 IPC 批量任意文件能力，复用现有单文件授权边界。
 * 任务数较多时逐项处理，只有少量固定尺寸缓冲同时存在，不积累模型内容。
 * 网络超时与模型文件中途修改均由主进程返回明确状态，页面不自行猜测根因。
 * 每项结果返回后才增加已检查计数，不能用已发出的请求数替代实际完成数。
 * 页面重新挂载后只订阅状态，不根据 running 再启动一条相同的队列循环。
 * 全部处理完成后保留结果，用户可以检查未完成原因后有针对性地重试。
 * 新启动批次使用当时的筛选快照；旧结果提示被替换，磁盘资产不会被清理。
 * 跳过完整项以 readable metadata 与 decoded logo 为基准，不依赖 scanner 的旧 iconPath。
 */
import { create } from "zustand";
// 共享类型只在编译期使用，不把主进程网络或文件系统模块导入页面。
// 运行时返回仍通过 electronBridge 的 Zod schema 验证。
// 状态列表不包含远程原始响应或 Error 堆栈，便于安全地显示原因。
import type { LocalModelRecoveryResult } from "@illusion-realm/shared";
import type { LocalModel } from "@/types/localModel";
import { recoverLocalModelMetadata } from "@/utils/electronBridge";
import { useSettingsStore } from "@/stores/useSettingsStore";
/**
 * phase 描述队列生命周期；具体失败原因仍使用共享结果，不再复制 IPC 枚举。
 * label 保存模型名和版本名，用于离开筛选范围后继续识别这项结果。
 * path 仅作为内部请求与列表 key，不把本地绝对路径放到日志或标题。
 * done 不等于成功，noPreview、notFound 等都属于已检查但未完成。
 * cancelled 只用于尚未提交的任务，已经运行的文件必须等到安全返回。
 * result 初始为空，避免等待项误用上一次识别结果。
 */
export interface ModelRecoveryBatchItem { path: string; label: string; phase: "waiting" | "running" | "done" | "cancelled"; result: LocalModelRecoveryResult | null }
/**
 * running 是会话级互斥，不允许另一个页面重复启动同一批量操作。
 * stopRequested 在当前文件返回后阻止继续提交，不声称能取消已经开始的磁盘操作。
 * revision 逐项递增，原有详情可在 JSON 先写入但封面失败时也重新加载文字资料。
 * scanFailed 只描述结束后的缩略图列表刷新，不改变已经落盘的成功结果。
 * start 只接收当前筛选的扫描对象，路径仍由主进程再次授权。
 * retry 重新运行未完成及已停止项，已经具备资料与 logo 的项保留。
 */
interface RecoveryBatchState {
  // items 是点击时的快照；顺序由页面当前扫描顺序决定，不与新筛选做自动合并。
  // revision 在完成每项后增加，卡片封面另在批次收尾统一重新扫描。
  // running 在扫描刷新结束前保持，避免最后一项后就错误允许重复启动。
  items: ModelRecoveryBatchItem[]; running: boolean; stopRequested: boolean; revision: number; scanFailed: boolean;
  start: (models: LocalModel[]) => void; stop: () => void; retry: () => void;
}
/**
 * UI 统计与重试条件使用同一个完成规则，避免只有 JSON 的项目被算进成功数。
 * 额外检查 cover，让旧版本主进程的 recovered+none 也不能伪装完成。
 * existing 只在主进程已确认可读取资料及本地可解码封面时是成功。
 * 未知或尚未返回结果自然为 false，等待项不会影响完成数。
 * 返回布尔值而非修改状态，结果列表可以直接用于独立计数。
 */
export function isModelRecoveryComplete(result: LocalModelRecoveryResult | null) {
  // 两个独立条件必须同时成立：来源成功状态与实际可用的封面结果。
  // noPreview/coverFailed 即使已保存文字也不会通过这条判断。
  // Boolean 化返回值避免把 null 传进计数器或 JSX，调用方可直接筛选。
  return !!result && (result.status === "recovered" || result.status === "existing") && (result.cover === "saved" || result.cover === "preserved");
}
/**
 * 将卡片展开成所有文件版本；两个不同版本不能因共用模型名而互相跳过。
 * Windows 路径大小写和分隔符统一，只在匹配 key 时转换，不改发送的实际路径。
 * 空文件路径没有可识别的模型，不生成假队列项。
 * 相同文件被重复传入时保留第一次的显示名称及原始路径。
 * 生成新的 item 对象，后续 scanner 更新模型对象不会改变当前批次。
 */
function snapshot(models: LocalModel[]): ModelRecoveryBatchItem[] {
  // Map 同时保留输入顺序与文件身份，重复扫描条目不会多次读取同一权重。
  // 只在路径 key 上小写化，界面名称保持用户原有模型命名。
  // Windows 常见的斜杠差异也归一化，防止同文件两种表示重复排队。
  const files = new Map<string, ModelRecoveryBatchItem>();
  for (const model of models) for (const version of model.versions) {
    // 必须展开 versions，模型卡片的 filePath 是目录而不是可哈希模型文件。
    // 每个版本保存独立 sidecar，不能用目录级 logo 代替版本身份查询。
    // 同模型共用 logo 是既有扫描契约，不会让缺 JSON 的版本自动成功。
    const key = version.filePath.replaceAll("\\", "/").toLowerCase();
    if (key && !files.has(key)) files.set(key, { path: version.filePath, label: `${model.name} · ${version.name}`, phase: "waiting", result: null });
  }
  return [...files.values()];
}
/**
 * 每个单文件操作独立捕获 IPC 或 schema 错误，不中断后续模型。
 * 更新结果使用文件路径定位，不能依赖当前筛选后的数组索引。
 * 失败响应仍是已处理项，用户能够看到具体 notFound/auth/封面原因。
 * 页面不接触 Node 或 Electron 模块，只使用已有 renderer bridge。
 * 当前文件返回后才处理下一项，避免多个 GB 模型争抢磁盘吞吐。
 * 原始异常文本不进入 store，防止界面显示含系统路径的底层错误。
 */
async function recoverItem(item: ModelRecoveryBatchItem) {
  // immutable 更新让 Zustand 通知页面，即便队列循环从挂载页面以外发起。
  // 对照原始路径更新唯一项，后续筛选或扫描不会改变结果定位。
  // 不修改传入 item，runBatch 的迭代快照因此保持稳定。
  const update = (change: Partial<ModelRecoveryBatchItem>) => useModelRecoveryBatchStore.setState(state => ({ items: state.items.map(value => value.path === item.path ? { ...value, ...change } : value) }));
  update({ phase: "running" });
  // running 先对 UI 可见，随后才等待主进程读取；可显示当前正在处理的文件。
  // awaiting Promise 不阻塞 React，停止请求和页面切换仍可正常响应。
  // 只有主进程返回后才标记 done，不用乐观成功占位覆盖实际失败。
  try { update({ phase: "done", result: await recoverLocalModelMetadata(item.path) }); }
  // 传输、旧版 preload 或不合法返回值都由 bridge 抛出，在这里单项处理。
  // 不在错误文本里拼本地路径，用户通过保留的模型名和版本名定位项目。
  // 当前失败后继续下一个模型，满足批量逐项解释而非遇错整批消失。
  catch { update({ phase: "done", result: { status: "io", sha256: "", cover: "none" } }); }
  // 即使封面未完成，noPreview 也可能已经提交 JSON，详情需要再次读取。
  // 递增号只触发订阅，不携带来源对象，不绕过只读侧的规范化与安全过滤。
  // 不在这里重扫模型树，避免 N 个版本造成 N 次全库扫描。
  useModelRecoveryBatchStore.setState(state => ({ revision: state.revision + 1 }));
}
/**
 * 循环位于模块内，不挂靠 React effect，切换路由不会重复启动或遗失后续任务。
 * 只在每个单文件完成后的边界检查 stop，已在写入中的事务正常收尾。
 * finally 将未提交项改为 cancelled，停止后可以显式重试而不是静默丢失。
 * 一个批次只在结束后重新扫描一次模型库，避免每个版本都遍历整棵模型树。
 * 扫描失败只影响卡片刷新，已写入的来源和图片仍然保持可用。
 * 扫描期间仍保留 running 防止另一个批次抢占结束收尾状态。
 * 状态不写入用户数据文档，本功能仅承诺当前客户端会话内切页保留。
 */
async function runBatch() {
  // running 由 launch 同步置位，本函数只处理已经冻结好的项目列表。
  // 中途修改搜索条件不会在这个 for-of 中插入新项目或删掉失败结果。
  // 每次迭代仍重新读取 stopRequested，不能缓存启动时的布尔值。
  try {
    for (const item of useModelRecoveryBatchStore.getState().items) {
      // stop 是“停止后续提交”，当前 recoverItem 的网络和落盘会先正常结束。
      // 主进程超时负责单文件的等待上界，这里不擅自杀进程或取消 writer。
      // 已完成项在重试快照中保持 done，会被下面的 waiting 条件跳过。
      if (useModelRecoveryBatchStore.getState().stopRequested) break;
      if (item.phase === "waiting") await recoverItem(item);
    }
  } finally {
    // 退出循环时剩下 waiting 都没有发过 IPC，准确标为 cancelled。
    // 用户不需要猜测它们是网站没找到还是主动停止，结果状态明确区分。
    // 已经 done 的项目连同失败原因一起保留，供后续只重试未完成项。
    useModelRecoveryBatchStore.setState(state => ({ items: state.items.map(item => item.phase === "waiting" ? { ...item, phase: "cancelled" } : item) }));
    try { await useSettingsStore.getState().scanAllModels(); }
    // 来源和 logo 已经由主进程保存，scanner 错误不能改写那些业务结果。
    // 扫描在 store 内处理 busy 状态，页面手动扫描入口遵循原有规则。
    // scanFailed 单独提示，用户点击重新扫描后可看见已经写好的封面。
    catch { useModelRecoveryBatchStore.setState({ scanFailed: true }); }
    // 收尾完成才释放 running；stopRequested 清零使下一次显式重试能运行。
    // 不清空 items，用户仍能展开结果列表复核原因与成功数。
    // 切换到在线页时此更新也会发生，返回本地页即可订阅到最终值。
    useModelRecoveryBatchStore.setState({ running: false, stopRequested: false });
  }
}
/**
 * launch 同步设置 running，连续两次点击在 React 重绘前也无法启动两个循环。
 * 不允许空批次覆盖已有结果，过滤无模型时按钮和内部规则都阻止启动。
 * 顶层兜底处理意外队列异常，不能产生无人处理的 Promise rejection。
 * 单项业务失败已经由 recoverItem 转为结果，不会触发这个异常兜底。
 * 重试由 retry 先保留成功项，再只将未完成项改为 waiting。
 * 原有结果直到用户再次启动/重试才变化，方便检查失败原因。
 */
function launch(items: ModelRecoveryBatchItem[]) {
  // 有 running 时连快照替换也不能进行，否则旧循环结果会写进新批次。
  // 全部成功且没有 waiting 的重试是无操作，原有完整结果保持不变。
  // start 的参数来自 UI，但主进程仍最终检查每个文件权限与存在性。
  if (useModelRecoveryBatchStore.getState().running || !items.some(item => item.phase === "waiting")) return;
  useModelRecoveryBatchStore.setState({ items, running: true, stopRequested: false, scanFailed: false });
  // UI 事件无需等待整个模型库完成，队列 Promise 在模块内负责异常兜底。
  // 正常业务失败已变成单项结果，此 catch 用于意外的队列或订阅异常。
  // 不把未处理的异常打印成包含用户文件名的控制台堆栈。
  void runBatch().catch(() => useModelRecoveryBatchStore.setState({ running: false, scanFailed: true }));
}
/**
 * store 动作引用保持稳定，页面每次挂载只订阅当前进度，不重新构建任务。
 * stop 保留已经处理的结果，等待中的文件由循环 finally 显式标记。
 * retry 保留所有成功项，不重新读取已具备 logo 的模型文件。
 * 被停止的 waiting 项与明确失败项都可重新提交，名称及顺序保持原快照。
 * 一个模型有多个版本时逐项执行，目录级封面可由后续版本直接复用。
 * 该 store 与移动/删除选择模式分离，不改变原有文件管理操作的选中集合。
 */
export const useModelRecoveryBatchStore = create<RecoveryBatchState>((set, get) => ({
  // 没有自动 hydration 或 localStorage 恢复，只有用户点击才启动磁盘读取。
  // 页面重挂载共享同一 store 实例，所以会话内无需持久化轮询计时器。
  // 客户端退出后的恢复不在本轮承诺范围；已经保存的资产本身仍在磁盘。
  items: [], running: false, stopRequested: false, revision: 0, scanFailed: false,
  // start 的新批次覆盖的是上一批页面提示，不会删除上一批已写入的文件。
  // stop 只是置位请求，不立即把正在运行项标 cancelled，避免错误状态。
  // retry 从完整快照中挑 waiting，成功项连同原结果保留以维持总数。
  start: models => launch(snapshot(models)), stop: () => set({ stopRequested: true }),
  retry: () => launch(get().items.map(item => isModelRecoveryComplete(item.result) ? item : { ...item, phase: "waiting", result: null })),
}));
