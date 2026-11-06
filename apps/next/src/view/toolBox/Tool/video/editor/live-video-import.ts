/**
 * 视频导入的纯适配与资源等待：复用 ffprobe 和 localfile，不整文件读取 Base64。
 * 元数据是文件事实，封面只是辅助展示；后者失败不能推翻前者。
 */
import { t } from "@/i18n";
import { probeVideoFile } from "@/utils/video/ffmpeg";
import { buildLocalFileUrl } from "@/utils/localFileUrl";
import type { EditorMediaAsset } from "./editor-panels";

// 与现有系统视频选择器保持相同的扩展名范围。
// 扩展名只是导入候选，文件是否有视频轨仍由 ffprobe 判断。
const VIDEO_EXTENSIONS = /\.(mp4|mov|mkv|avi|webm|flv|wmv|m4v|ts|mpg|mpeg|3gp)$/i;
export const MAX_IMPORT_FILES = 20;

// 去重只比较文件身份，不改写交给 ffprobe 的真实路径。
// Windows 的路径大小写通常不区分，所以比较时统一为小写。
// 正反斜线也统一，否则同一个文件会得到两个列表身份。
// `.` 表示当前层，移除它不会改变目标文件。
// `..` 只撤回已经积累的上一层，不把盘符从路径里弹出去。
// UNC 开头的空段保留，避免网络路径被拼成普通相对地址。
// 文件名中的空格保持原样，不对每段执行 trim。
// 这像比较两种写法的同一门牌，不把门牌改名后寄信。
// 函数的结果只存进 Set，不直接拼成本地媒体 URL。
// 同名文件在不同目录仍有不同身份，不能仅比较 basename。
// 本轮不读取文件哈希，因此不同硬链接仍可能是两个素材。
// 符号链接真实目标也不在渲染层解析，避免引入 Node 文件能力。
// 输入由按钮或 preload 得到，绝对路径判断在候选校验中完成。
// 这里没有磁盘副作用，可以单独核对去重规则。
export function pathIdentity(filePath: string): string {
  const parts: string[] = [];
  for (const part of filePath.replaceAll("\\", "/").split("/")) {
    if (part === ".") continue;
    if (part === ".." && parts.length > 1) parts.pop();
    else parts.push(part);
  }
  return parts.join("/").toLowerCase();
}

// 探测开始前先显示路径最后一段，让用户知道当前在读取哪个文件。
// 这只是临时行的名称，成功后会被 ffprobe 返回的 fileName 替换。
// 支持两种分隔符，拖入与系统选择器不会出现不同的名字处理。
// 源路径仍另存于素材对象，不因显示短名称而丢失完整引用。
// 没有最后一段时保留输入，便于无效项得到可辨认的反馈。
// 它不承担去重，同名但不同目录的文件仍能分别导入。
export function videoFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

// 候选路径先检查后缀，再交给真实媒体探测确认内容。
// 允许范围与现有系统视频多选器一致，包含容器而非编解码器名单。
// 大小写后缀均可接受，用户重命名为 MP4 不会被错误拒绝。
// 盘符路径与 UNC 路径是本轮桌面入口支持的绝对位置。
// 网页链接、相对路径和普通文本不应被当成本地视频。
// 目录即使起名为 `.mp4`，后续探测仍会拒绝没有视频轨的内容。
// 这不是安全权限校验的替代，实际文件读取仍发生在原主进程桥接。
// 通过候选校验不能向用户显示“可播放”，浏览器可能不支持该编码。
export function isVideoPath(filePath: string): boolean {
  return VIDEO_EXTENSIONS.test(filePath) && /^(?:[a-z]:[\\/]|\\\\)/i.test(filePath);
}

// 超时和取消像收回号码牌：底层探测即使迟到，也不能再更新已离开的会话。
// IPC 没有取消探测接口，因此只丢弃结果，不谎称主进程进程已被杀死。
// 给探测和封面读取增加可取消的等待上限。
// Promise.race 像柜台同时等包裹和关门铃，先到的结果决定是否继续办理。
// 它只取消当前等待，不伪造底层 ffprobe 已停止的结果。
// 底层 Promise 仍有拒绝处理，迟到失败不会变成未捕获异常。
// 外部信号已取消时立即拒绝，不再等待下一次 abort 事件。
// 每个调用拥有独立的定时器，多个文件之间不会共用过期闹钟。
// finally 在成功、失败、超时和取消四条路径上都执行。
// 清除定时器后，成功文件不会在几秒后被误报超时。
// 移除 abort 监听，已结束的等待不继续挂在批次控制器上。
// DOMException 的 AbortError 是内部取消标记，界面使用翻译后的文字。
// 超时使用独立可读消息，不能靠一直转圈掩盖文件不可读取。
// 封面调用传十二秒，元数据默认三十秒，两者的成本与失败语义不同。
// 定时器只是截止线，不改变视频 currentTime 或播放进度。
// 窗口进入后台时仍能结束等待，不依赖 requestAnimationFrame。
// 这里不会自行恢复 UI，调用方负责结束 busy 并保留已有素材。
// 泛型保持真实操作的返回类型，不把未知结果强转为成功对象。
// 抛错的读取操作直接进入调用方错误边界，不返回占位媒体参数。
// 清理发生在本次等待结束时，不依赖路由卸载才能释放监听。
export async function waitForImport<T>(operation: Promise<T>, signal: AbortSignal, milliseconds = 30000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let cancel: () => void = () => {};
  const deadline = new Promise<never>((_, reject) => {
    cancel = () => reject(new DOMException("", "AbortError"));
    timeout = setTimeout(() => reject(new Error(t("toolBox.editorUi.importTimeout"))), milliseconds);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
  });
  try { return await Promise.race([operation, deadline]); }
  finally { clearTimeout(timeout); signal.removeEventListener("abort", cancel); }
}

// 只有浏览器已经解码出的真实画面才可以成为封面。
// 画布最长边限制在 480 像素，避免为一个缩略图保留整张 4K 位图。
// 短边按同一比例缩放，横屏和竖屏不会被拉伸成固定 16:9。
// 小于上限的视频不放大，减少无意义的编码与内存开销。
// 最小尺寸为一像素只是画布合法性防御，不代表视频有有效画面。
// videoWidth 为零时仍拒绝，不能把空画布当成导入成功。
// Canvas 2D 不可用也明确失败，元数据仍由外层保留。
// 绘制来源是 video 元素，不使用演示图或默认背景补位。
// JPEG 质量用于列表缩略图，不改变原视频文件或节目输出质量。
// 返回的是一张小封面的数据地址，绝非整段视频的 Base64。
// 没有临时 object URL，因此这张封面不需要另设 URL 撤销登记表。
// 素材数组释放后数据字符串即可回收，不写入用户持久化文档。
// 匿名跨源读取成功后画布可读；权限不足时 toDataURL 会抛错。
// 这个错误由封面边界处理，不能扩散成整个素材库清空。
// 画布只在函数执行期间存在，不常驻 DOM 或创建隐藏播放窗口。
// 此函数不播放声音，也不推进工程播放头。
// 没有求任意帧 seek 的逻辑，首个可用帧就是本轮封面来源。
// 封面能解码不保证全片每一帧都可解码，实际播放器仍处理自己的错误。
function captureCover(video: HTMLVideoElement): string {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d");
  if (!context || !video.videoWidth) throw new Error(t("toolBox.editorUi.coverFailed"));
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

// 每次只建立一个短期 video 元素用于读取首个可用帧。
// 元素不插进页面，正式节目区域仍只显示用户选择的那一个播放器。
// muted 防止读取封面时触发音轨声音。
// preload auto 允许浏览器取到首帧，不把仅 metadata 就绪误当成画面可用。
// crossOrigin anonymous 配合应用限定来源的 localfile 响应头。
// 没有携带 Cookie 或远端身份，内容始终来自本地文件协议。
// loadeddata 表示首帧可用，loadedmetadata 单独不足以绘制封面。
// error 拒绝封面读取，但不推翻已取得的 VideoProbeResult。
// 事件回调内的 canvas 异常要转为 Promise 拒绝，不能漏到全局事件循环。
// 读取有十二秒截止线，异常编码不能永远阻塞后续文件。
// 用户取消批次会走同一个 finally，不用额外等待媒体事件。
// finally 先移除事件回调，再卸掉源，清理时的 error 不会二次报错。
// pause 确保浏览器不会继续使用这次短期媒体会话。
// 移除 src 再 load 用来释放解码器与本地 Range 读取资源。
// 不把 src 改成空字符串，避免浏览器误把当前 app 页面当作媒体。
// 局部 video 不被返回，因此下一文件不能复用上一个文件的解码状态。
// 串行批次最多有一个封面解码在途，不一次创建二十个媒体元素。
// 用户正在看的源播放器由另一个拥有者管理，不会被这里的 finally 关闭。
// 成功得到封面后也立即释放短期解码资源，不留隐藏播放器。
// 方法只返回封面字符串，不修改素材选择或时间线实例。
async function readCover(sourceUrl: string, signal: AbortSignal): Promise<string> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.preload = "auto";
  const operation = new Promise<string>((resolve, reject) => {
    video.onloadeddata = () => { try { resolve(captureCover(video)); } catch (error) { reject(error); } };
    video.onerror = () => reject(new Error(t("toolBox.editorUi.coverFailed")));
    video.src = sourceUrl;
  });
  try { return await waitForImport(operation, signal, 12000); }
  finally { video.onloadeddata = null; video.onerror = null; video.pause(); video.removeAttribute("src"); video.load(); }
}

// 创建的是探测中的素材记录，还不能声称文件具有某个时长。
// duration 用 null，避免错误地把未知视频显示成零秒。
// width、fps 和音轨信息在成功探测前都不填默认值。
// 随机 ID 代表本次素材身份，不能用文件名当作 React key。
// 相同源的失败重试可以替换旧失败行，而不是保留重复的坏记录。
// 封面初始为空，列表复用 loading 占位而不是演示图片。
// sourcePath 是后续探测引用，名字仅服务显示与搜索。
// 本轮身份不保存到工程文件，离开页面后整个会话释放。
// 没有创建时间线片段，素材 ID 与未来 clipId 始终是两种号码。
// crypto.randomUUID 在安全的 app 协议中可用，不要求 Node crypto。
export function loadingVideoAsset(filePath: string): EditorMediaAsset {
  return { id: crypto.randomUUID(), name: videoFileName(filePath), kind: "video", duration: null, cover: null, state: "loading", sourcePath: filePath };
}

// 元数据先探测，封面后读取；两项结果不能互相冒充。
// 沿用 probeVideoFile，它继续走真实 preload 和统一 IPC 解包。
// 源路径来自当前素材行，不从用户可见名称反推路径。
// 等待可以被批次控制器取消，迟到元数据不会写回离开的页面。
// 时长、宽高和 fps 必须为有限正数，非法数值不进入布局和时间码。
// 探测不支持的视频不能静默回落成 1920×1080、30fps。
// 项目的默认设置不在这里更新，源媒体与工程参数是两套事实。
// 本地地址通过 buildLocalFileUrl 编码，不自行拼 file://。
// 原路径里的空格、汉字或百分号由现有 URL 工具保留。
// 封面失败仅让 cover 为 null，素材仍是 ready 且保留全部探测字段。
// 用户可以继续选择这份素材，让正式播放器报告独立的解码结果。
// 取消信号与普通封面失败不同，取消要终止整个文件处理。
// 最后一次 abort 核对挡住封面完成与取消恰好同时发生的竞态。
// 这像包裹入库后再拍证件照，拍照失败不能把已经核实的包裹扔掉。
// notice 清楚说明封面问题，列表不会将它误画成探测成功后的假封面。
// size 和编码等原始字段保留在 metadata，不重新计算或格式化成假值。
// 返回新对象不修改原 loading 记录，调用方以稳定 ID 替换该行。
// 没有导出、转码、代理生成或后台写文件副作用。
// 源视频始终按协议 Range 读取，不先把大文件装入渲染内存。
// 真正的播放支持由源播放器判断，封面提取不是完整播放能力认证。
export async function prepareVideoAsset(asset: EditorMediaAsset, signal: AbortSignal): Promise<EditorMediaAsset> {
  const info = await waitForImport(probeVideoFile(asset.sourcePath!), signal);
  if (![info.duration, info.width, info.height, info.fps].every(value => Number.isFinite(value) && value > 0)) throw new Error(t("toolBox.editorUi.probeFailed"));
  const sourceUrl = buildLocalFileUrl(info.path)!;
  let cover: string | null = null;
  try { cover = await readCover(sourceUrl, signal); }
  catch (error) { if (signal.aborted) throw error; }
  if (signal.aborted) throw new DOMException("", "AbortError");
  return { ...asset, name: info.fileName, sourcePath: info.path, sourceUrl, duration: info.duration, metadata: info, cover, state: "ready", notice: cover ? undefined : t("toolBox.editorUi.coverFailed") };
}
