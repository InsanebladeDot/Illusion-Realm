/** 源波形请求与会话内小缓存：同源复用包络，片段仍各自选择自己的源区间。 */
// 像借同一本索引册：只缓存源声音的摘要，入点、倍速、选中属于每位读者的书签。
// 不fetch整视频，也不创建AudioBuffer；小数组由已有桌面FFmpeg能力返回。
import { useEffect, useState } from "react";
import { unwrapIpc } from "@/utils/ipcResult";
import type { VideoWaveformResult } from "@/types/electron-api";

// task.users是同源订阅数，不能退出一个片段就取消其他实例仍在用的请求。
// id不包含磁盘路径，仅用于主进程按本窗口归属取消。
// started区别等待队列与已经提交IPC，未开始的取消不发多余控制消息。
// result只保存源峰值，不携带Blob、File、播放器或输入路径副本。
// promise失败在UI订阅的拒绝分支消费，不留下unhandled rejection。
// cache最多八个已完成源；活跃任务不能为腾位置被误删。
// 最后一条波形卸载时清空整个会话缓存，返回页面不会沿用旧源快照。
// 任务串行，避免一个多轨页面同时打开几十个FFmpeg音频解码器。
// 串行只限制辅助波形，不阻塞视频首帧、节目播放或原导出作业。
// 源时间数据只读，各片段只读同一数组，不在裁剪时splice共享包络。
interface WaveformTask {
  id: string;
  users: number;
  cancelled: boolean;
  started: boolean;
  promise: Promise<VideoWaveformResult | null>;
}
const cache = new Map<string, WaveformTask>();
let queue: Promise<unknown> = Promise.resolve();
let subscribers = 0;

// source使用完整磁盘路径，与VideoFilmstrip使用媒体URL的缓存身份分开。
// 两个名称相同但目录不同的文件，声音摘要不会因显示名相同而串用。
// 同一文件出现在V1、V2和分离音轨时可共用数组，三处构图与选择仍互不影响。
// 缓存的是源包络，不是某个片段的“裁好版本”，否则不同入点会互相覆盖。
// task.users只统计借用这一源的组件，subscribers统计整个模块活跃组件总数。
// 前者决定何时可取消单个源，后者决定何时结束这一轮编辑会话的缓存生命周期。
// 队列里的Promise不是播放器句柄，清理它不会暂停节目中正在播放的视频。
// queue最终恢复resolved，避免一个坏文件令后面的所有源永久等在拒绝链后。
// requestId只用于本窗口辅助请求，不沿用片段ID，避免复制与删除改变任务身份。
// UUID即使在同一路径重新挂载也不同，旧取消不会误杀新的读取任务。
// cache在模块内管理，没有写入Zustand工程，也不会被保存到用户JSON。
// 返回页面时重新探测包络，避免把同路径但外部已被替换的旧声音永远缓存。

// IPC可用性只在effect启动后检查，服务端预渲染不会读window。
// 旧主进程缺方法时明确失败，不能以null假装视频真的没有音轨。
// 排队期间若所有订阅者退出，任务直接null，不再启动磁盘读取。
// unwrapIpc保留既有错误语义，主进程数据失败不能伪装成空峰值成功。
// started必须在invoke前设置，紧接到来的卸载才能发取消给同一身份。
// payload只包含schema允许的身份与路径，时长和采样预算由主进程决定。
// 任务返回后组件还要检查订阅live标记，迟到成功不能覆盖另一个素材。
// 执行函数不写React状态，多个片段可以安全共享同一个Promise。
// 失败交给借用方就近显示波形不可用，不给素材行写入导入失败。
// 这里没有后台自动重试，坏文件不会反复占用FFmpeg队列。
async function requestWaveform(source: string, task: WaveformTask) {
  if (task.cancelled) return null;
  if (!window.electronAPI?.videoWaveform) throw new Error("Waveform bridge unavailable");
  task.started = true;
  return unwrapIpc(await window.electronAPI.videoWaveform({ requestId: task.id, inputPath: source }));
}

// 浏览器环境没有桥接时抛出短错误，组件会展示不可用而不是请求不存在的HTTP接口。
// import使用type-only读取结果类型，不会把主进程实现打进Next静态页面。
// 页面不传采样频率或数组长度，统一预算由主进程决定，UI缩放不能扩大工作量。
// unwrapIpc将success:false转成拒绝，错误会由每个订阅者的失败回调消费。
// 无音轨源正常不走这里，因为ClipWaveform已经按metadata.hasAudio跳过请求。
// 因此活跃的有声订阅收到null时，应该标记不可用而非显示成功静音。
// 网络断开不影响本地波形读取，但文件消失或桥接断开仍会产生独立失败。
// 取消只看task状态而不看React当前选择；选中别的片段不等于删除旧源所有借用。

// 取消请求同样处理Promise拒绝，页面退出不产生未处理异常。
// cancelled先置位，队列尚未开始时下一轮就能跳过，而不是先读再取消。
// 只取消任务自己的id，不借用旧videoCancel影响用户手动导出。
// 若主进程已经完成，取消回null是幂等清理，不应显示新的错误通知。
// 取消用于生命周期，不代表用户删除源文件或静音了某条轨道。
// 不在取消时清空其他缓存，仍被另一个片段借用的源数据保持可用。
// 方法缺失只表示旧桥接没有可取消任务，主进程30秒截止仍是最终清理边界。
function cancelTask(task: WaveformTask) {
  task.cancelled = true;
  if (task.started) void window.electronAPI?.videoWaveform?.({ requestId: task.id, cancel: true }).catch(() => {});
}

// 取消请求不需要原文件还存在，移动文件后也能结束已启动的旧解码。
// 未开始的任务只设置标记，轮到它时requestWaveform会直接返回，不多发IPC。
// 已开始的任务发独立取消消息，由主进程核对sender与requestId归属。
// 取消消息失败不再给已卸载UI写错误；主进程自带截止和窗口销毁清理。
// 这里吞掉的是生命周期清理失败，读取本身失败仍会进入可见error状态。
// task仍可能被队列闭包引用，但cancelled能阻止它后来意外启动读取。
// 正常完成后的取消是幂等空操作，不向主进程发“删除音频”类副作用。
// 清理过程中不读取当前document，所以快速路由切换不会误找到别页媒体节点。

// 缓存身份是完整源路径，重名文件在不同目录不能共享声音摘要。
// task先创建再排队，promise闭包读取同一个对象，取消标记不会丢到另一个实例。
// queue.catch恢复的是排队能力，任务自身promise仍保留失败供UI显示。
// 超过八个缓存时只淘汰无订阅条目，不能结束活跃片段的声音摘要。
// 即使一个源请求失败，后面不同源仍会正常执行，不让队列永久拒绝。
// 源缓存属于当前编辑器会话，不监听外部程序同路径热替换，退出后再读会重建。
// 此处只去重内容获取，不将片段sourceIn、速度或工程时间放进缓存键。
// sourceIn变化只重新绘制已有源包络，不每拖一像素就重跑FFmpeg。
// id使用浏览器随机UUID，生成不需要Node/Electron模块或用户持久化字段。
// 初始resolved空值只填充类型构造，实际返回给订阅的是随后替换的排队promise。
function acquireTask(source: string) {
  let task = cache.get(source);
  if (!task || task.cancelled) {
    task = { id: crypto.randomUUID(), users: 0, cancelled: false, started: false, promise: Promise.resolve(null) };
    const current = task;
    current.promise = queue.catch(() => {}).then(() => requestWaveform(source, current));
    queue = current.promise.catch(() => {});
    cache.set(source, current);
  }
  task.users += 1;
  for (const [key, value] of cache) {
    if (cache.size > 8 && value.users === 0) { cancelTask(value); cache.delete(key); }
  }
  return task;
}

// Map按插入顺序淘汰无借用条目，这不是永久磁盘缓存或完整LRU实现。
// 活跃源超过八个时允许暂时超过缓存软上限，不能为了凑上限取消仍在用的图。
// 任务输出本身至多4096个数，所以活跃小数组与完整音频缓冲是不同量级。
// 相同源同时请求时先登记task，再由后来的调用递增users，共享一次读取。
// 已取消的条目不能作为命中返回；它的Promise可能马上以null结束。
// 新建时初始空Promise只是满足对象形状，不作为任何订阅者最终收到的结果。
// queue更新为带catch的链，current.promise仍保留原始拒绝供订阅显示。
// 这样既能让队列继续，也不会把失败源误变成ready。
// 清理旧条目时只删Map关联，不修改已经交给活跃组件的不可变峰值数组。
// 源修剪改变的是绘图窗口，不调用acquireTask重新读全文件。
// 素材名称改显示别名不会影响此键；真正换路径才启动新内容请求。
// 外部程序同路径热替换未做文件监听，当前会话内可能继续展示旧摘要，需如实保留边界。

// 包络切换后用key隔离结果，旧请求完成不能把新源画成旧声音。
// state只有loading/ready/error，真正无音轨由调用方metadata.hasAudio单独处理。
// 对有音轨源返回null属于不可用，不能把取消或旧桥接当作一条成功静音线。
// 两个相同源实例各自持有React结果状态，只有不可变峰值内容去重复用。
// promise回调内确认live，清理后即使IPC迟到也不调用setState。
// 卸载减少users，归零才取消；其余借用者仍可收到正在读取的数据。
// subscribers是所有波形组件的生命周期计数，最后一条卸载清空会话摘要。
// StrictMode清理再挂载时cancelled条目会被重建，不沿用已经取消的Promise。
// 隐藏面板是否保留DOM由原宿主决定，本hook不把所有源永久挂载。
// 错误只呈现在波形槽位，不改变正式片段、素材探测数据或播放状态。
// effect依赖仅源路径，修剪、速度和横滚不会重新解码整段音频。
// source未提供时不借用任务，静态样板继续保持演示/正式数据隔离。
interface WaveformState { key: string; status: "ready" | "error"; result: VideoWaveformResult | null; }
export function useSourceWaveform(source?: string) {
  const [state, setState] = useState<WaveformState | null>(null);
  useEffect(() => {
    if (!source) return;
    let live = true;
    subscribers += 1;
    const task = acquireTask(source);
    void task.promise.then(result => { if (live) setState({ key: source, status: result ? "ready" : "error", result }); }, () => { if (live) setState({ key: source, status: "error", result: null }); });
    return () => {
      live = false; task.users -= 1; subscribers -= 1;
      if (task.users === 0) cancelTask(task);
      if (subscribers === 0) { for (const entry of cache.values()) cancelTask(entry); cache.clear(); }
    };
  }, [source]);
  return state?.key === source ? state : null;
}

// effect先捕获本次task，清理时递减的也是这份借用，不去Map里重新猜当前条目。
// live标记只保护这次effect，旧源迟到回调不能写入新源对应的状态。
// 返回值再检查state.key，因此源切换后、effect尚未运行前也不会闪出旧波形。
// loading通过返回null表达，ready/error通过有身份的state表达，不需要第三份全局状态。
// 失败分支保留key，只有同一源的组件才可显示这份失败。
// 两个实例的setState是各自React生命周期，关闭一条不会改另一条的UI状态。
// 默认不传source时不增加subscribers，独立样板不会延长真实工程的缓存寿命。
// 清理先设live=false，再取消任务，立即到来的取消结果也不能触发旧setState。
// 使用计数归零与cache清空配对，避免返回空工程仍握住上一个会话的源路径。
// 本hook只返回只读用途的数据，不提供改峰值接口，调用方不能把包络当工程音量。
// 这里没有window级事件监听，素材选择和时间轴键盘命令仍由原宿主负责。
// UI仍在但声音槽隐藏时是否释放取决于真实DOM卸载，不把CSS不可见当作已卸载证明。
