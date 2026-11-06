/** 源音频振幅包络：复用FFprobe与FFmpeg，用逐窗统计替代整段PCM装入内存。 */
// 像沿胶卷每隔一小格记一个最高水位：这里只返回小格峰值，不把整卷声音搬进渲染层。
// 同一窗口最多两个任务，取消按窗口与请求双重身份限定，不复用导出作业编号。
const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs/promises");
const { resolveTools } = require("./locate");
const { probeVideo } = require("./probe");
const { registerHandle } = require("../../ipc/result");
const { IPC_CHANNELS } = require("../../../common/ipc-channels");

// 固定8kHz单声道足以画概览，不是母带采样或音高分析。
// 约2048窗覆盖完整源，不按用户传来的宽度、时长无限扩大返回载荷。
// 每个窗口先由FFmpeg计算峰值，再输出一条元数据；Node不接收PCM原始音频。
// 1MiB输出上限包含每窗时间标签与峰值，错误时拒绝，不静默截断为成功。
// 没有输出文件或临时WAV，不产生需要跨页面保留的音频磁盘缓存。
// Map只在请求进行中保存AbortController，结束后删除，不常驻保存源路径。
// sender.id属于Electron窗口，渲染层不能在payload伪造它。
// requestId由调用方生成用于取消，服务仍检查短ASCII格式和重复占用。
// 若任务取消时FFprobe尚未完成，同一个signal也能终止探测阶段。
// 所有控制器都有30秒截止时间，隐藏窗口不会使辅助任务永远等下去。
// 任务失败只影响波形，不清空素材、删除片段或报告导入失败。
// 失败文字不包含源路径、stderr或堆栈，详细文件名由原素材展示层提供。
/** @type {Map<string, AbortController>} */
const active = new Map();
const execute = promisify(execFile);

// 这里抽的是音量轮廓，不是音高曲线；440Hz与880Hz同振幅可能得到相近轮廓。
// 返回值没有频率字段，界面也不能把纵向高低标成某个音符。
// 源中的声音不因画包络而变调，播放速度与预览倍率继续由原播放器处理。
// 峰值比平均值更容易保留短促鼓点，适合时间线快速辨认声音位置。
// 统计前降采样会丢失高频细节，所以这份数据不能用于专业响度检测。
// FFmpeg解析容器并选择第一条音轨，当前不提供多语言音轨选择。
// 不把每条音轨混入不同UI行，分离安排仍引用原先的第一条声音流。
// 渲染层只得到数字数组，不能取得FFmpeg命令执行器或子进程句柄。
// 包络读取没有输出路径参数，因此不会覆盖原视频或已有导出文件。
// app窗口与开发窗口共享相同校验，不因开发环境而允许任意网络输入。
// UNC代表操作系统可访问的文件位置，不表示本服务接受http媒体地址。
// 路径权限沿用当前本地媒体能力；绝对路径形状校验不是文件选择授权凭证。

// shared schema与此手写校验等价：严格两种对象、短身份、绝对路径。
// validator接受任意输入，不能先解构unknown造成异常绕开INVALID_ARGUMENT。
// cancel必须为true；false、字符串和附带inputPath的取消对象都拒绝。
// 读取对象只允许requestId/inputPath，拼错字段不会被忽略。
// 路径不接受空白、NUL、URL或相对位置，避免FFmpeg将URL当成网络源。
// UNC路径仍可作为用户本地挂载源，文件存在性稍后异步检查。
// 参数个数必须是一，不把额外参数隐式吞掉；取消无需文件仍存在。
// Object.keys只在非空对象分支运行，数组明确排除。
// 正则不使用g标志，多次校验同一请求不会因lastIndex改变结果。
// schema长度是UTF-16字符串长度，主进程用相同length比较。
/** @param {unknown[]} args @returns {string | null} */
function validateWaveform(args) {
  const value = args[0];
  if (args.length !== 1 || !value || typeof value !== "object" || Array.isArray(value)) return "Invalid waveform request";
  const record = /** @type {Record<string, unknown>} */ (value);
  if (typeof record.requestId !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(record.requestId)) return "Invalid waveform identity";
  if (record.cancel === true && Object.keys(record).every(key => ["requestId", "cancel"].includes(key))) return null;
  if (Object.keys(record).some(key => !["requestId", "inputPath"].includes(key))) return "Invalid waveform fields";
  const input = record.inputPath;
  return typeof input === "string" && input.trim() && input.length <= 4096 && !input.includes("\0") && /^(?:[a-zA-Z]:[\\/]|\\\\)/.test(input) ? null : "Invalid waveform path";
}

// 取消对象与读取对象不能合在一起：否则拼错cancel可能意外启动一次读取。
// 对象没有requestId时无法建立归属，后续也无法可靠取消，因此必须先拒绝。
// 允许的连字符适配浏览器UUID，不需要接受路径分隔符或任意长用户文本。
// 重复requestId不是缓存命中；运行中的身份必须唯一，避免两个任务共用撤销开关。
// 大小写不同的身份会作为不同请求处理，不把用户路径作为任务键的一部分。
// 空白路径不会先trim再打开，校验通过的字符串仍按原样传给文件系统。
// 含空格的合法文件名不会被拆开，后续使用参数数组而非shell命令串。
// 数组虽也是object，但不符合请求记录的业务形状，不能让数字键绕过字段名单。
// 上层registerHandle负责把校验文字包装成INVALID_ARGUMENT，本层不重复封装。
// 校验只读输入，不创建控制器；非法消息不会消耗本窗口任务名额。

// -inf在真实静音窗口合法，转成振幅零；NaN或缺数据不是静音，必须拒绝。
// dBFS转线性用10的db/20次方，这是振幅而非能量，不能误用db/10。
// 极小负数仍保留，绘制时才做开方压缩以便看清轻声，不伪造声音。
// 数值夹到1只约束展示包络，不能据此声称源未削波或电平已经校正。
// 数组最多4096条，包含AAC尾部填充的有限余量；超量则拒绝整个结果。
// 前面的约2048窗预算是目标，实际解码音轨稍长不会让正常最后一窗被丢掉。
// 匹配只接受指定Peak_level键，不将pts、帧号或其他astats统计混成振幅。
// 逐行匹配避免把完整stderr路径或无关输出转成数字。
// 没有峰值时不补一条零线，缺失与静音属于不同状态。
// 出错不返回部分数组，避免看起来整条波形都有数据而后半部其实失败。
/** @param {string} output @returns {number[]} */
function parsePeaks(output) {
  // FFmpeg写的是-inf，JavaScript只直接识别-Infinity，必须显式适配静音标记。
  // 不把其他非法字符串统一转零，否则损坏或字段格式变化会被误报成静音成功。
  // 行尾可能是CRLF，trim只用于数字标签，不改源路径或用户文件名。
  const values = [...output.matchAll(/^lavfi\.astats\.Overall\.Peak_level=(.+)$/gm)].map(match => match[1].trim() === "-inf" ? -Infinity : Number(match[1]));
  if (!values.length || values.length > 4096 || values.some(value => Number.isNaN(value) || value === Infinity)) throw new Error("Waveform data unavailable");
  return values.map(value => value === -Infinity ? 0 : Math.min(1, 10 ** (value / 20)));
}

// Peak_level单位是相对于数字满幅的分贝，例如-20dB对应0.1振幅。
// 输出里的frame、pts和pts_time用于FFmpeg诊断，不属于可视化峰值。
// ametadata按时间顺序输出窗口，所以数组顺序天然对应源声音顺序。
// 没有按振幅排序；排序会把静音和说话位置打乱，失去时间线意义。
// 静音的负无穷是合法极限，单独适配它比把全部非法数值转零更可靠。
// 正无穷会使绘图失控，因此即使字段名正确也不能接受。
// 真实有限负分贝可以非常小，保留线性值让界面自行决定展示压缩。
// 0与非零峰值在返回值中仍可区分，视觉开方之后也不会把静音变成声音。
// 4096上限是防异常响应的硬门槛，2048是前面计算采样窗的目标预算。
// 预算留余量是为了容器时长与实际AAC尾部长度存在小差异的情况。
// 解析器不依赖Electron对象，独立回归可以直接检查-inf和缺失数据反例。
// FFmpeg标准错误与标准输出分开，stderr诊断不会被混入正则扫描输入。

// 元数据与音频采样都读同一真实路径，渲染层不能指定一个虚构源长影响时间映射。
// stat必须是普通文件；目录和设备不交给媒体解析器。
// FFmpeg协议限制仅file/pipe，容器不能转而读取网络播放列表。
// 禁用stdin避免子进程等待用户键盘，windowsHide避免弹出命令行窗口。
// asetnsamples把声音按固定样本数切窗，p=0不在最后窗人为补零。
// astats每窗reset，累计量不会随着整个文件增长。
// ametadata仅把峰值文字写stdout，null输出不编码也不保留WAV。
// execFile使用参数数组，不经过shell，含空格的路径不会被拆开执行。
// duration为真实视频时间，采样step明确返回，AAC填充不挤压前方窗口时间。
// aformat在统计前下混单声道，这是可视化概览，不保留各声道单独峰值。
// 最后时间窗不足整窗仍保留，修剪到源尾不能把真实声音尾巴丢掉。
// 反相立体声下混可能抵消，当前包络不宣称声道级响度测量。
// 本任务取消、30秒截止和子进程失败均会让execFile拒绝，并由外层释放记录。
// maxBuffer约束文字而非PCM；FFmpeg内部解码缓冲也只随解码/统计窗工作。
// 无音轨直接null，不启动第二个采样子进程，不能用装饰波形冒充音轨。
// 源时长非法时拒绝，不能除零产生无限样本窗口。
/** @param {string} input @param {AbortSignal} signal @returns {Promise<import("@illusion-realm/shared").VideoWaveformResult | null>} */
async function readWaveform(input, signal) {
  if (!(await fs.stat(input)).isFile()) throw new Error("Waveform source unavailable");
  const tools = resolveTools();
  const info = await probeVideo(tools.ffprobePath, input, signal);
  if (!info.hasAudio) return null;
  if (!tools.ffmpegPath || !Number.isFinite(info.duration) || info.duration <= 0) throw new Error("Waveform source unavailable");
  const samples = Math.max(1, Math.ceil(info.duration * 8000 / 2048));
  const filter = `aresample=8000,aformat=channel_layouts=mono,asetnsamples=n=${samples}:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.Peak_level:file=-`;
  const { stdout } = await execute(tools.ffmpegPath, ["-v", "error", "-nostdin", "-protocol_whitelist", "file,pipe", "-i", input, "-map", "0:a:0", "-vn", "-af", filter, "-f", "null", "-"], { signal, timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true });
  return { duration: info.duration, secondsPerPeak: samples / 8000, peaks: parsePeaks(String(stdout)) };
}

// 8kHz乘时长得到预计样本总数，再除2048决定每窗包含多少样本。
// 向上取整保证长视频的窗口数不会随着时长无限增多。
// 极短视频每窗至少一个样本，避免给asetnsamples传入零导致滤镜失败。
// secondsPerPeak记录真实整窗步长，而非简单用duration除最终数组长度。
// 最后不足一窗的数据仍有峰值，但它覆盖的时间短于前面的整窗。
// 若用数组长度均分源长，会把AAC尾部填充造成的差异传播到所有前方波形。
// 返回duration用于说明探测的源范围，绘图定位仍以secondsPerPeak为准。
// -vn禁止处理视频输出，读取包络不需要重新编码或保存视频画面。
// -map明确第一条音轨，不能让FFmpeg根据默认最佳流规则换成另一条音轨。
// null复用器只消费处理结果，实际返回的小统计文本来自ametadata。
// 解码器内部仍需处理音频帧，所谓小内存返回不代表完全没有解码开销。
// execFile最多收集1MiB文本，超过会拒绝请求，不会把半条波形当完整成功。
// stat后文件仍可能被外部移动，后面的子进程失败会进入同一个异常收口。
// 缺少FFmpeg与没有音轨是不同原因，前者失败而后者返回合法空值。
// 调用probeVideo传入signal不改变原导入调用签名，旧调用可以继续省略第三参。
// 30秒超时包含慢磁盘情况，但超时不能说明文件损坏，只表示辅助图不可用。

// 取消使用同一个handler，只有同sender/request的控制器会被终止。
// 请求在开始异步stat之前登记，立即取消也能命中，不会先发读取再丢失撤销消息。
// 同一身份重复读取拒绝，防止新控制器覆盖旧进程而失去取消能力。
// 两个任务上限按窗口分别计算；一个窗口不能阻塞另一个窗口的额度。
// destroyed只订阅本请求，正常结束移除，不能留下每次采样累积的窗口监听。
// 定时器从stat前开始，覆盖探测和抽样合计时间，而不只覆盖最后子进程。
// 取消返回null与没有音轨相同的辅助空值；渲染订阅已撤销，不会显示取消为静音成功。
// 超时也是取消请求，前端仍标为不可用，不让长文件错误牵连工程导入。
// 若任务真实失败，统一短错误替换含路径的系统消息，原IPC助手只输出脱敏文字。
// finally总会删除Map记录与监听，即使文件消失或解码器异常也恢复窗口额度。
// 窗口销毁时signal结束关联FFprobe/FFmpeg，不能留下孤儿媒体子进程。
// 不持有BrowserWindow，不改焦点和主题；sender仅用于归属和销毁清理。
// cancel键不附带路径，文件被用户移动后仍能结束旧请求。
// 多余字段先由validator拒绝，handler只消费已经校验的联合类型。
// 读取返回小数组，不把输入路径重复返回到UI错误或波形记录里。
/** @param {Electron.IpcMainInvokeEvent} event @param {import("@illusion-realm/shared").VideoWaveformRequest} payload */
async function handleWaveform(event, payload) {
  // 仅应用站点与固定开发站点可读源包络，窗口归属还要在下面单独核对。
  // 前缀包含最后的斜线，localhost:30000或外部相似域名不能冒充开发源。
  // 请求发起于页面加载后；空URL、其他协议和外部导航一律拒绝读取。
  if (!["app://app/", "http://localhost:3000/", "http://127.0.0.1:3000/"].some(origin => event.sender.getURL().startsWith(origin))) throw new Error("Waveform caller denied");
  const prefix = `${event.sender.id}:`, key = prefix + payload.requestId;
  if ("cancel" in payload) { active.get(key)?.abort(); return null; }
  if (active.has(key) || [...active.keys()].filter(id => id.startsWith(prefix)).length >= 2) throw new Error("Waveform queue busy");
  const controller = new AbortController(), cancel = () => controller.abort();
  active.set(key, controller);
  const deadline = setTimeout(cancel, 30000);
  event.sender.once("destroyed", cancel);
  try { return await readWaveform(payload.inputPath, controller.signal); }
  catch { if (controller.signal.aborted) return null; throw new Error("Waveform unavailable"); }
  finally { clearTimeout(deadline); active.delete(key); event.sender.removeListener("destroyed", cancel); }
}

// 窗口前缀末尾有冒号，窗口1的请求不会与窗口10误判成同一归属。
// 同一requestId可由两个不同窗口分别使用，取消只能影响发起者的那份。
// sender URL来自Electron而非payload，页面不能传一个可信origin来替自己背书。
// getURL核对的是当前顶层页面，嵌入式页面的细粒度授权不由这个字段提供。
// 外部页面仍不能因知道固定通道名而跳过来源与请求形状两层检查。
// destroyed事件是任务级清理，窗口提前关闭时不等待UI再发一次cancel。
// 正常结束移除同一个cancel函数，不能使用removeAllListeners破坏其他任务。
// AbortController同时交给探测和解码，两阶段共用取消身份但不共用输出缓冲。
// abort后execFile拒绝，catch只把已取消任务转为空值，真正读取失败继续报错。
// finally删除记录后，同一个窗口才会恢复一个并发名额。
// 先登记再await的顺序很重要；立即收到取消时必须已经能找到控制器。
// 如果先探测完才登记，快速离开页面可能留下找不到归属的后台子进程。
// deadline从开始算一次，探测后不会重新续期让整个任务超过总时限。
// 定时器取消与主动取消都不写用户文档，重开工程不会留下“取消过”的持久状态。
// 主进程只保证任务终止和小数据返回，不根据读取成功自动播放声音。
// 没有向通知中心发成功消息，辅助包络就绪只由对应槽位状态反映。

// 注册走原registerHandle，成功由助手包装，非法输入统一INVALID_ARGUMENT。
// 新通道由视频模块原入口调用，不需要修改全局IPC聚合或应用启动顺序。
// 没有在模块加载时绑定app事件，测试require本服务不会立即生成窗口或子进程。
// 导出校验和纯解析器便于独立反证；生产UI只能通过preload读取小结果。
function registerWaveformIpc() {
  registerHandle(IPC_CHANNELS.VIDEO_WAVEFORM, handleWaveform, validateWaveform);
}
module.exports = { registerWaveformIpc, validateWaveform, parsePeaks };
