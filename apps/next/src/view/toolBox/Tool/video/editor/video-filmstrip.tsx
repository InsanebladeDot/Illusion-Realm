"use client";

// 时间线胶片带从源视频抽取真实帧；它不使用播放器节点，也不改变节目播放位置。
// 所有片段排队共用一条解码队列，像共用一台冲印机，避免长工程同时打开几十个视频。
// 缓存只留64张最大160×160画布，像素预算不超过6.25MiB；不会读入整个视频或长期保留文件字节。
// 页面最后一条胶片带卸载即清缓存；进行中的任务收到取消后也释放媒体源。
import { useEffect, useRef } from "react";
import type { EditorMediaAsset } from "./editor-panels";
import styles from "./editor.module.css";

// 缓存只保存已解码的小图，不持有File、ArrayBuffer或完整视频Blob。
// 这里缓存的是像素，不是播放句柄；缓存命中不会恢复视频播放。
// 同一源被多次入轨可以复用相同时间点，但每条片段仍有自己的展示画布。
// 毫秒键是抽样展示精度，不参与正式剪辑的工程帧对齐。
// 缓存上限限制常驻图像像素，浏览器内部解码缓存不在这个数字内。
// 因此不能把6.25MiB当作本功能全部进程或显存占用的实测值。
// Map删除最早插入项，当前采用简单有界FIFO，不宣称是完整LRU。
// 页面无胶片带时主动清理，使下次进入工程不会保留旧用户源索引。
// 队列本身只保存待办闭包，不把所有任务的媒体字节预先下载到内存。
// 取消任务在实际取得队列席位后先检查signal，过时任务不再创建解码器。
// 前一个任务失败后队列仍可继续，坏视频不能阻塞整条工程缩略图。
// 任务只有一条顺序链，外层catch用于恢复链状态，不代表帧采样成功。
// users按有sourceUrl的胶片带订阅计数，静态样板封面不占这份缓存生命周期。
// StrictMode清理再挂载也会先取消旧任务，不让开发模式产生永久双订阅。
// 抽样缓存生命周期比某一个任务长，比一次编辑器会话短，这两个边界不能混在一起。
// 缓存键不使用本地磁盘哈希，因为抽取辅助帧不需要重新扫描大文件内容。
// 源URL若被其他程序原地替换而地址不变，本轮没有文件监视器自动失效机制。
// 因此当前缓存适用于会话内稳定源，不声称已经覆盖外部程序热替换同路径视频。
// 条目上限只按数量约束，固定最大160×160尺寸使每条像素成本大致一致。
// 若未来支持HDR或更高位深，不能沿用当前四字节每像素估算而不重新核查。
// Canvas缓存属于渲染进程小图，不会被保存到统一用户JSON中。
// 数据没有上传到云端，素材路径只供本地协议寻址，不参与远端搜索。
// 缓存不负责文件权限，是否允许读取由现有localfile协议边界处理。
// 队列顺序是请求顺序，当前没有优先队列抢占已经开始的可见片段抽样。
// 可见性取消能缩短等待，但不能保证每种编解码器的浏览器内部取消立刻释放所有内存。
// 没有测量驱动层显存，释放src只作为媒体生命周期行为，不报告为释放若干GB。
// 同一任务结束后video对象退出局部作用域，缓存不保留它的闭包引用。
// 一个任务异常不会自动重试到成功，新的尺寸或可见性请求才可能再次尝试。
// 这样坏源不形成无限重试循环，也不会持续挤占其他片段的解码机会。
const frames = new Map<string, HTMLCanvasElement>();
let queue: Promise<void> = Promise.resolve();
let users = 0;

// 等待真实媒体事件，取消、错误或五秒超时均拒绝，并成对清除监听与定时器。
// seeked与loadeddata才证明浏览器已拿到帧，固定延迟不能代替解码证据。
// 先挂监听再执行load/seek，短视频缓存命中也不会错过同步到达的通知。
// 把媒体事件等待当作有截止时间的收据，不是等一段时间就默认办好了。
// 事件名由内部固定调用传入，不接受用户指定任意DOM事件名称。
// loadeddata表示当前帧可读取；只有loadedmetadata仍可能没有任何解码像素。
// seeked表示这次定位完成；currentTime刚赋值并不表示对应画面已准备好。
// 同一等待同时注册媒体错误和取消，失败可以尽快释放串行队列的位置。
// 取消监听用once减少迟到回调，正常完成仍显式移除未触发的其他监听。
// 定时器由主线程的任务机制负责，不依赖隐藏窗口是否调度动画帧。
// 超时只表示辅助缩略帧不可用，不修改探测成功状态或现有节目片段。
// 这里产生的短错误只在本地收口，不把磁盘完整路径写入可见错误文字。
// promise只接收一次完成结果，success和abort紧接到达也不会重复推进队列。
// clearTimeout和removeEventListener在同一个完成边界运行，避免留下悬空等待。
// action在监听装好后才执行，源命中缓存时也不会先发事件后开始等。
// signal已取消时不执行action，防止旧任务再次启动视频load。
// 监听从传入的离屏video解绑，不去清除节目播放器或其他片段的监听。
// 事件等待不会绑定window级播放键，页面焦点和键盘路径不受辅助解码影响。
// 同步action异常仍使Promise拒绝，外层finally负责释放媒体源。
// video元素没有插入DOM，不会占用预览画布布局或抢夺焦点。
// 五秒是辅助单步等待上限，不是整个用户导入或节目播放的超时配置。
// 长GOP编码定位可能比短测试源慢，超时仅退回封面，不删除有效片段。
// 媒体元素的error事件不携带可直接展示的完整诊断，本层统一当辅助帧不可用处理。
// 取消是请求失效，不作为用户文件损坏的证据，不能写回asset.state=error。
// 错误与取消共用清理路径，但调用方仍通过signal区分是否应启动后续任务。
// 监听器捕获当前video，不根据document里第一个video猜测等待对象。
// 当节目和抽帧同时存在时，这条区别可防止节目seeked误唤醒辅助任务。
// 完成后移除abort监听，AbortController不会被旧回调链一直持有。
// 定时器只发出拒绝，真正停止源读取仍由paint的finally执行。
// 任何新等待都需要自己的监听，不能复用已经完成的Promise作为下一次定位证据。
function mediaEvent(video: HTMLVideoElement, name: string, signal: AbortSignal, action: () => void) {
  return new Promise<void>((resolve, reject) => {
    const finish = (failed: boolean) => {
      clearTimeout(timer);
      video.removeEventListener(name, ready);
      video.removeEventListener("error", failure);
      signal.removeEventListener("abort", failure);
      if (failed) reject(new Error("frame unavailable")); else resolve();
    };
    const ready = () => finish(false), failure = () => finish(true);
    const timer = setTimeout(failure, 5000);
    video.addEventListener(name, ready, { once: true });
    video.addEventListener("error", failure, { once: true });
    signal.addEventListener("abort", failure, { once: true });
    try { if (signal.aborted) failure(); else action(); } catch { failure(); }
  });
}

// 缓存键包含完整源URL和毫秒采样点，同名文件与不同源区间不会串图。
// 视频最后一刻可能恰好落在EOF外，向内留1ms，仍取本片段所覆盖的源时间。
// 新画布固定小尺寸，目标长片段上的高像素画布不进入共享缓存。
// 浏览器解码失败时拒绝此帧，不用封面复制出一条假的“连续帧”。
// 时间点由工程片段映射到源秒数后传入，不在这里重新推断片段速度。
// 源URL是缓存身份的一部分，不能仅凭文件名认定两个文件内容相同。
// sourceIn不同的同源实例自然查询不同帧，不会都回到文件第一帧。
// 缓存键保留三位小数，为小图去重复用，不写回剪辑数据。
// 读取命中缓存属于同步像素复用，不需要重新挂载视频节点。
// 真实源末尾是duration，工程为保留末帧可能多占不到一帧的时间。
// 抽帧以浏览器可读源区间夹限，不能请求不存在的EOF帧。
// 已经位于同一时间点时不等一个可能永远不会发出的seeked事件。
// 初始loadeddata已由paint等待，所以源零秒也有真实像素可画。
// 定位完成后再次看取消标记，快速切源时不能把旧帧写进新任务。
// 采样画布最大160×160并保留源比例，长时间线不会把原视频分辨率复制进共享缓存。
// 抽帧压缩只影响辅助预览，节目播放器仍读取真实原视频分辨率。
// 2D上下文可用时直接绘制媒体帧，不先把视频编码成另一份文件。
// 不使用toDataURL，所以不会为每格反复创建Base64长字符串。
// 不创建objectURL，因此缓存淘汰不需要维护一份容易漏掉的URL撤销表。
// 画布的像素容量上限可以估算，但浏览器对象与解码器开销另计。
// 先插入再淘汰保证新帧可供当前任务立即绘制，不依赖旧键一定存在。
// 缓存返回的是只读用途的采样画布，调用方只drawImage，不向它继续写图。
// 片段自己的长画布与缓存小画布不同，缩放时清空前者不会破坏别的片段。
// 抽样使用源秒而非源帧编号，因为浏览器currentTime的接口单位就是秒。
// 源帧率可能为非整数，不能简单把时间乘一个四舍五入fps再当准确帧索引。
// 辅助展示不追求逐帧编码分析，剪辑边界仍保持项目整数帧的独立契约。
// 没有设置crossOrigin绕过本地协议规则，绘制权限沿用现有媒体源处理。
// 缓存小画布可能继承媒体来源的安全标记，但本功能不读取像素或导出它。
// 若后续要导出帧，必须重新验证来源权限，不能把当前drawImage可见当可读取证明。
// 缓存命中时不修改取出的画布尺寸，否则其他片段复用会得到已清空的图。
// 图像缓冲使用普通Canvas，减少额外ImageBitmap.close配对资源的复杂度。
// 固定小图会丢失细节，这是时间线缩略用途的明确取舍，不影响节目解码帧。
// 当前辅助图按源比例缓冲后裁成方格，竖视频在带中仅作内容识别，不代表节目画面被拉伸。
// 源分辨率仍从metadata给节目contain适配，不能从辅助小图反推源尺寸。
// 方格为居中裁图，完整源画面仍在节目预览中显示，不反向改变源宽高。
async function sample(video: HTMLVideoElement, source: string, time: number, signal: AbortSignal) {
  const key = `${source}|${time.toFixed(3)}`, cached = frames.get(key);
  if (cached) return cached;
  const target = Math.min(Math.max(0, video.duration - .001), Math.max(0, time));
  if (Math.abs(video.currentTime - target) > .0001) await mediaEvent(video, "seeked", signal, () => { video.currentTime = target; });
  if (signal.aborted) throw new Error("cancelled");
  const frame = document.createElement("canvas");
  const factor = Math.min(160 / video.videoWidth, 160 / video.videoHeight);
  frame.width = Math.max(1, Math.round(video.videoWidth * factor)); frame.height = Math.max(1, Math.round(video.videoHeight * factor));
  frame.getContext("2d")?.drawImage(video, 0, 0, frame.width, frame.height);
  frames.set(key, frame);
  if (frames.size > 64) frames.delete(frames.keys().next().value ?? "");
  return frame;
}

// 每格按照当前片段的源时间采样，不按标题或封面推算画面。
// sourceIn与speed共同映射项目时间，修剪和倍速后缩略带仍对应实际内容。
// 任务只抽当前窗口附近的方格；长片段的屏外区域不进入本轮采样。
// finally无论成功、失败还是取消都卸载源，离屏视频不能在后台继续播放。
// 一条任务从加载到释放只拥有一个离屏video，采样循环不会每格新建播放器。
// muted设置在源加载之前，辅助解码不允许把用户音轨意外播放出来。
// preload表示浏览器可以预读，不代表代码把完整源文件装入JS内存。
// 所有定位操作串行等待，不能同时对同一video发几十个currentTime写入。
// 帧数根据片段屏幕宽度决定，宽度越小抽样点越少。
// 最大48格是每条任务的预算，未声称逐一解码视频中的每一个源帧。
// 每格锚定源时间网格，修剪只移走左侧格子，不把剩余缩略图重新均分拉伸。
// 跨度由sourceIn之后实际覆盖内容定义，与素材总长不是同一个值。
// 2倍速的源跨度不变，但占用工程长度更短，画带随片段一起收窄。
// 格子固定40px，缓冲只覆盖可见窗口和两侧余量，不随整段长度无限增长。
// 目标画布高度40缓冲像素，匹配正式中间帧槽，不覆盖底部真实声音。
// 画布最长4096像素，超宽片段会伸展有限缓冲，而非无限分配显存。
// 辅助帧拉伸并不改变源视频宽高或节目画布的contain适配尺寸。
// 只有全部格子成功才设置ready标记，中途失败不能谎称整条带已完成。
// 没有ready时外壳保留单封面回退，缺帧不会让整片段不能选择或修剪。
// 取消会在下一格开始前退出，正在等待的媒体事件则由signal立即结束。
// finally覆盖加载失败、单格定位失败、取消和正常结束四种路径。
// removeAttribute加load用于停止并释放该离屏媒体资源，不删除磁盘上的文件。
// video从不play，抽帧依赖定位后解码，不用假播放进度来猜画面。
// 串行队列只保护辅助抽帧，正式节目主播放器始终可以独立播放和定位。
// 单任务采样过程中源video没有声音输出，默认静音也不等于真实音频试听通过。
// 抽样任务和节目播放器各有媒体节点，因此抽帧seek不会直接跳动节目当前帧。
// 二者仍共享机器解码资源，串行预算只能限制辅助负担，不能承诺所有机器零卡顿。
// 这里没有上传无限长纹理，长片段仅为当前滚动窗口附近分配目标缓冲。
// 方格仍是最大160像素的源摘要，放大时间线不会把它升级为完整源帧。
// 用户可以据此定位内容，但不能用缩略格数判断视频总源帧数。
// 片段非常窄时仍保留至少一格，避免count为零产生除零或空循环假成功。
// 最后一格的源时间小于span终点，避免每次都抽到工程占位之外的源末尾。
// 相邻格可能因源帧率较低而落到同一实际帧，这是合法采样而非伪造重复封面。
// 只有ready标记控制封面回退可见性，错误不会产生一个可以点击的假重试成功按钮。
// 画布节点本身由React卸载，资源finally不尝试删除别的片段DOM。
// 即使队列被新的请求替换，旧Promise的finally仍会执行，不能提前遗失媒体引用。
async function paint(canvas: HTMLCanvasElement, source: string, sourceIn: number, speed: number, pixelsPerSecond: number, signal: AbortSignal, span: number, reversed?: boolean, freezeTime?: number, offset = 0) {
  const video = document.createElement("video");
  video.muted = true; video.preload = "auto";
  try {
    await mediaEvent(video, "loadeddata", signal, () => { video.src = source; video.load(); });
    // 源秒与像素的换算像固定格距的胶卷尺：从当前入点左边最近的格子开始画。
    // 入点落在一格中间时x为负，由canvas自然裁掉左边，不能把该格挤窄重排。
    // 前后修剪后span与可见宽度同时变化，源时间网格的单位比例仍保持一致。
    // 仅缩放视口才改变格子覆盖的秒数，整个片段平移不会重新取另一组画面。
    // 额外取首尾相交格覆盖边缘，窗口之外不抽帧，与原有界队列共用。
    // 例：40px覆盖一秒、入点0.5秒时，第一格从x=-20开始，留下右半格。
    // 左边缘再向右裁0.25秒，这格会继续左移10px，而不是把整条视频重新均分。
    // 右边缘恢复内容时沿相同格距增加后续图，之前已可见的帧位置不会因均分而改变。
    // step使用源跨度除以像素宽，倍速导致工程宽变化时仍能对应正确源秒。
    // 源时间网格从零点锚定，不从每次修剪的新入点重新开始编号。
    // first可落在可见区之前一格，drawImage的负x由画布裁切，不需要额外DOM遮罩。
    // 多取一格覆盖不整除的右边缘，避免最后一小截保留黑色空洞。
    // 缓冲按窗口与DPR设置，tile始终对应40个CSS像素。
    // 画布上连续展示的是按时间抽样的缩略帧，不声称解码并常驻视频全部源帧。
    // 极大缩放只减少每格覆盖的时间，不扩大格子或预先解码整段源。
    const ratio = canvas.width / Math.max(1, canvas.getBoundingClientRect().width), tile = 40 * ratio;
    const step = 40 / Math.max(1, pixelsPerSecond) * speed, visibleIn = sourceIn + offset / Math.max(1, pixelsPerSecond) * speed, first = Math.floor(visibleIn / step) * step;
    const count = Math.ceil(canvas.width / tile) + 1;
    for (let index = 0; index < count; index += 1) {
      if (signal.aborted) return;
      const time = first + index * step, x = (time - visibleIn) / step * tile;
      const frame = await sample(video, source, freezeTime ?? (reversed ? sourceIn + span - (time - sourceIn) : time), signal);
      drawSquareFrame(canvas, frame, x, tile);
    }
    canvas.dataset.filmstripReady = "true";
  } finally { video.pause(); video.removeAttribute("src"); video.load(); }
}

// 每一格先按封面方式裁到正方形，宽屏与竖屏源不会把人物拉变形。
// 目标格固定40 CSS像素，DPR只增加像素清晰度，不改变格子屏幕尺寸。
function drawSquareFrame(canvas: HTMLCanvasElement, frame: HTMLCanvasElement, x: number, tile: number) {
  const context = canvas.getContext("2d"), size = tile;
  if (!context) return;
  const side = Math.min(frame.width, frame.height);
  context.drawImage(frame, (frame.width - side) / 2, (frame.height - side) / 2, side, side, x, 0, size, canvas.height);
}

// 只给当前滚动窗口附近分配画布，避免一小时长片段一次抽取几千张图。
// 两侧各预留一格，滚动时旧图先留着，停下后按新的源窗口补图。
// CSS左偏移和源采样偏移共用offset，不能仅移动图层却仍采文件开头。
// 不使用缩小整张长画布的办法；每格始终40屏幕像素，缓冲只按DPR加清晰度。
function sizeFilmstripWindow(canvas: HTMLCanvasElement, clip: HTMLElement, scroll: HTMLElement | null) {
  const box = clip.getBoundingClientRect(), viewport = scroll?.getBoundingClientRect() ?? box;
  const offset = Math.max(0, viewport.left - box.left - 40);
  const width = Math.max(1, Math.min(box.width - offset, viewport.width + 80));
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.style.left = `${offset}px`; canvas.style.width = `${width}px`;
  canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = 40 * ratio;
  return offset;
}

// ResizeObserver读取片段真实宽度，Ctrl滚轮、滑杆、容器变化都走同一展示入口。
// 短暂停顿后才采样，连续滚轮会取消旧任务；确认片段时间本身从不被这里修改。
// 只观察可见区域附近的片段，横滚到远处才解码，不为屏外工程预先解码全部素材。
// 画布采样与节目媒体分离，逐帧定位不会被缩略图seek拖慢。
// 错误由本地catch收口并保留空带/已有封面，不把辅助缩略图失败标为素材导入失败。
// 卸载时清定时器、观察器和请求；队列任务也先检查取消标记才启动解码。
// 这个展示组件的输入是源、入点与源跨度，不持有工程写入回调。
// 片段从V1挪到V2但源区间不变时，不需要重新抽取相同画面。
// 父层把跨度舍入到微秒，消除浮点平移导致的无意义重复抽样。
// 真正修剪或改变源跨度会触发新的effect，取消旧任务后重新绘制。
// 窗口变化只触发本组件ResizeObserver，不修改项目宽高与片段时间。
// IntersectionObserver以真实裁切可见性判断，横向滚动后新进入视区才开始。
// 可见性退出同样取消当前任务，避免屏外片段继续抢占解码队列。
// 延后120ms用于合并连续尺寸变化，不作为视频帧准备完成的证据。
// 每次schedule先清上一个计时器，再取消旧signal，不能同时保留两份采样意图。
// 新signal局部捕获给本次任务，后来的重排不会把旧任务取消标记替换掉。
// 定时器触发时重新读取真实尺寸，不能沿用缩放开始时已经失效的旧矩形。
// width赋值会清除画布像素，paint随后按新缓冲宽度绘制完整帧带。
// Promise链末端catch是辅助展示的失败边界，不向素材列表写错误状态。
// 这与probeVideoFile失败不同：源元数据可用时，辅助图失败不能清空已有素材。
// 组件卸载清理两类Observer，返回页面不会再被旧节点尺寸通知唤醒。
// StrictMode下users增减配对，取消过的旧任务不能迟到追加缓存。
// 缓存清理只在最后使用者离开时执行，卸载一个片段不会让其他片段失去缓存。
// Canvas设置aria-hidden，读屏信息仍来自片段壳的真实文件名与修剪滑块。
// Canvas不接收指针，左右热区和主体移动仍由原外壳处理。
// 缺少sourceUrl时不创建任何后台任务，静态样板继续用自己的封面资源。
// Observer只订阅当前canvas，不监听整个应用每一张图片尺寸。
// 父层主题变化不会改源URL或span，通常无需重新解码相同内容。
// 素材封面补齐也不会改变sourceUrl，因此辅助帧缓存不依赖封面是否存在。
// 裁剪候选宽度变化可能短暂触发抽样意图，连续手势会由120ms合并避免每像素开任务。
// 确认后的入点变化则明确生成新的时间采样，不继续展示旧入点的完整帧带。
// 滚动可见性改变只决定辅助工作，不取消片段正在进行的主体拖放。
// 没有给canvas设置tabIndex，新增帧带不会让完整键盘路径多出几十个焦点站点。
// Canvas的aria-hidden不隐藏父片段，文件名、选中状态和修剪值仍可访问。
// ref在effect中读取，静态预渲染不会访问document或创建媒体元素。
// 组件需要use client仅因DOM与Observer，不代表允许渲染层导入Node模块。
// 清理不删除本地源文件，也不清空素材面板已经探测成功的元数据。
// 辅助预览没有持久化结构，因此离开页面不会额外生成一个缓存JSON文件。
export function VideoFilmstrip({ asset, sourceIn = 0, span, speed = 1, pixelsPerSecond, reversed, freezeTime }: { asset: EditorMediaAsset; sourceIn?: number; span: number; speed?: number; pixelsPerSecond: number; reversed?: boolean; freezeTime?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current, clip = canvas?.parentElement;
    if (!canvas || !clip || !asset.sourceUrl) return;
    const scroll = clip.closest<HTMLElement>("[data-editor-timeline-scroll]");
    users += 1;
    let active = new AbortController(), timer: ReturnType<typeof setTimeout>, visible = false;
    const schedule = () => {
      clearTimeout(timer); active.abort(); active = new AbortController();
      const signal = active.signal;
      if (!visible) return;
      timer = setTimeout(() => {
        // 改画布尺寸会清空像素，先撤销旧就绪标记；重采样失败时才能重新露出封面。
        // 这像擦掉旧底片的“已冲印”章，不能让空白新底片沿用上一次成功状态。
        delete canvas.dataset.filmstripReady;
        // 像素缓冲与40px方格槽一致，标题和音频不进入采样画布。
        // 宽度限于滚动窗口附近，极端缩放也不创建按源帧总数增长的纹理。
        // 缓冲大小只影响概览清晰度，不修改实际视频或节目画布分辨率。
        const offset = sizeFilmstripWindow(canvas, clip, scroll);

        queue = queue.catch(() => {}).then(async () => { if (!signal.aborted) await paint(canvas, asset.sourceUrl ?? "", sourceIn, speed, pixelsPerSecond, signal, span, reversed, freezeTime, offset); }).catch(() => {});
      }, 120);
    };
    const resize = new ResizeObserver(schedule), intersection = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; schedule(); });
    resize.observe(clip); intersection.observe(clip); scroll?.addEventListener("scroll", schedule, { passive: true });
    return () => { active.abort(); clearTimeout(timer); resize.disconnect(); intersection.disconnect(); scroll?.removeEventListener("scroll", schedule); users -= 1; if (!users) frames.clear(); };
  }, [asset.sourceUrl, sourceIn, span, speed, pixelsPerSecond, reversed, freezeTime]);
  // 帧带源区间与声音槽共用输入，修剪候选时两者同步，不改变节目时钟。
  // 数据标记供回归读取，不把请求状态放进正式工程或源元数据。
  // canvas不接收指针，边缘光标和修剪仍由共享片段壳处理。
  return <canvas ref={ref} aria-hidden="true" data-video-filmstrip data-filmstrip-source-in={sourceIn} data-filmstrip-span={span} data-filmstrip-tile="40" data-filmstrip-speed={speed} className={styles.clipFilmstrip} />;
}
