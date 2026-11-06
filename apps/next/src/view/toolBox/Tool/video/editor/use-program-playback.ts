"use client";

// 单一工程时钟拥有播放意图；图层只登记真实video，不各自更新工程时间。
// 调度器按真实经过时间推进，并以媒体就绪状态为闸门，缓冲时不会伪造进度。
// 像过站换乘：先停在片段边界，等新列车开门后再走，空站台则正常经过。
import { useEffect, useRef, useState, type RefObject, type Dispatch, type SetStateAction } from "react";
import { attachSource, type LivePreviewTransport } from "./live-source-preview";
import { activeProgramLayers, nextProgramTime, pauseProgramMedia, playProgramMedia, programSourceTime, programPhase, type ClockLayer, type ProgramClock, type ProgramMedia, type ProgramPhase } from "./program-clock";

// 输入layers是正式片段的轻量投影，仍引用原工程实例，不保存可独立编辑的副本。
// 传全部可见视频层才能计算未来边界，不能只传当前选中或当前活动层。
// transport来自现有工程书签，duration来自所有轨道安排的最大结束时间。
// 音轨尾部虽然无画面，仍属于工程时长，因此该段允许静音黑场。
// fps只用于精确定位的容差，源fps不会偷偷修改工程时间步长。
// rate是观看倍率，与片段自身的已有速度字段分开保存。
// 观看倍率不写工程，不会改动时间线片段长度或源区间。
// 控制器不接素材选择回调，播放过程中不能给素材列表强行换高亮。
// 控制器也不接属性提交回调，走钟不会生成属性草稿。
// 输入没有保存路径、输出选项或云端身份，这一阶段没有文件写回副作用。
interface PlaybackInput {
  layers: readonly ClockLayer[];
  transport: LivePreviewTransport;
  duration: number;
  fps: number;
  rate: number;
}
// phase告诉用户当前节目是否真的可显示，playing表示当前播放意图。
// 缓冲时保留播放意图才能在新层就绪后自然接播，不要求用户逐片段按播放。
// 界面仍允许在缓冲中按暂停，避免加载时无法取消先前播放请求。
// key标记这一份状态属于哪个定位与活动层组合，不能只凭phase字符串复用。
// 同一个time的小幅连续推进不一定改key，因为同组媒体不该每帧重建。
// 源时间是否跟上由真实节点校验，key本身不是成功证据。
// 状态里不放video引用，React重渲染不负责媒体资源的所有权。
// phase与playing相同时保留旧对象，减少没有视觉变化的无效重渲染。
interface PlaybackState { phase: ProgramPhase; playing: boolean; key: string; }

// 明确定位优先于正在播放的旧时间：递增请求号并关闭播放意图。
// 此处不向工程重复发送seek，防止两个定位回调互相触发造成抖动。
// 版本变化是用户明确定位或时间安排变化的授权，不是媒体通知。
// 同一个版本的工程进度回报只能更新显示，不能反复把媒体暂停并定位。
// 源时间在另外一层统一映射，本处只接收工程游标的新位置。
// 接受新请求先关intent，保证拖播放头时旧播放进度不会继续竞争。
// request增加后每个活动源都必须应用最新目标，旧seeked无法替新请求盖章。
// clock.time直接采用最新输入，不按历史请求排队逐个展示中间位置。
// 重置last防止用户拖动用掉的时间在下次播放时被补走。
// 暂停遍历全部登记源，刚离场但尚未卸载的节点也必须停下。
// 暂停不清src，明确定位仍尽量复用当前节点和缓冲。
// 此函数不调用onSeek，避免定位确认再触发定位命令造成循环。
// 此函数也不重写selectedId，书签与片段选择仍是两个状态。
// 用户连续拖过黑场时不用等待前一个区域加载完才处理最新目标。
// 只要React提交新输入，effect就接受版本，不需要等待媒体发出timeupdate。
// 返回页面时控制器新建，以当前书签为初始状态，不恢复旧播放意图。
function acceptProgramSeek(clock: ProgramClock, input: PlaybackInput, now: number) {
  if (clock.version === input.transport.version) return;
  clock.version = input.transport.version;
  clock.request += 1;
  clock.time = input.transport.time;
  clock.intent = false;
  clock.last = now;
  pauseProgramMedia(clock);
}

// 一次节拍只推进同一份工程时间，视频的timeupdate不参与竞争。
// 隐藏窗口直接停播，不靠后台rAF或计时器保持看不见的音视频读取。
// 跨边界先发布精确边界时间，下一次登记的真实节点决定能否继续。
// 等待期间重设last，解码完成后不会把等待的几秒一口气跳过去。
// duration来自工程所有片段，末尾音轨区间也能显示静音黑场。
// 节拍只看最近提交的输入，不能读取另一次尚未确认渲染的候选工程。
// 先更新源的真实倍率，再决定是否播放，暂停状态下的倍速预设也立即生效。
// 倍率变化不代表已经播放，因此不得顺带解除静音或自动启动。
// 存在错误或加载中时先停全部源，把经过的墙钟时间丢弃。
// 丢弃等待时间是为了保持工程暂停，不是把解码等待算成片段播放时长。
// 正常播放以单调经过时间推进，而非把多个timeupdate累加。
// 每节拍最多接收一小段经过时间，系统长时间卡顿后不会突然跨完整工程。
// 这是一种预览保守追赶策略，不承诺在严重过载时仍保持严格实时输出。
// 最近边界优先于候选时间，上层入场不能被一次较长节拍跨过去。
// 到边界后新层未登记会使phase转loading，旧层保持暂停直到合成可显示。
// 在黑场没有源可播放，但工程游标仍能向下一入点推进。
// 每次只通过原transport.onTime发布时间，不建立第二个时间线store。
// 源timeupdate没有发布权限，所以暂停中的迟到媒体事件不能回退书签。
// 工程尾部结束播放意图，并暂停所有剩余节点，不无限停在播放按钮状态。
// 末尾画面由半开区间过滤清空，不沿用最后选中片段的末帧。
// document.hidden会主动关播放意图，返回前台不在用户不知情时自动恢复。
// visibilitychange是快速停播通路，节拍中的读取是事件丢失时的兜底。
// 本节拍不改变源入点，修剪和移动仍由原共同业务模型拥有。
// 即使某视频已ended，工程其他有效层仍由同一时钟推进。
// 当前不建立音频设备时钟，因为节目尚无混音通路且全部静音。
function advanceProgram(clock: ProgramClock, input: PlaybackInput, phase: ProgramPhase, now: number) {
  if (document.hidden) clock.intent = false;
  const active = activeProgramLayers(input.layers, clock.time);
  for (const { clip } of active) {
    const entry = clock.media.get(clip.id);
    if (entry) entry.video.playbackRate = input.rate * (clip.speed ?? 1);
    // Chromium不支持可靠负倍速；倒放按统一时钟逐次寻帧，定格始终停在记录的源帧。
    if (entry && (clip.reversed || clip.freezeTime !== undefined)) entry.video.pause();
    else if (entry && clock.intent && phase === "ready") playProgramMedia(clock, entry, entry.video.playbackRate);
  }
  if (!clock.intent || phase !== "ready") { pauseProgramMedia(clock); clock.last = now; return; }
  const target = clock.time + Math.min(.1, (now - clock.last) / 1000) * input.rate;
  clock.last = now;
  clock.time = nextProgramTime(input.layers, clock.time, target, input.duration);
  seekReverseLayers(clock, active, clock.time);
  input.transport.onTime(clock.time);
  if (clock.time >= input.duration) { clock.intent = false; pauseProgramMedia(clock); }
}

// 倒放不能给video设置负倍速；每次工程推进后向后寻一小步，下一拍核实解码完成。
// 像逐页倒翻书，先翻到目标页再读，不能让墙钟先跑而仍展示上一页。
// 不刷新deadline：某次寻帧永远不能完成时，原有十五秒边界仍会报告失败。
// 定格不进入此循环，它的源目标恒定；普通播放继续交给原生video推进。
function seekReverseLayers(clock: ProgramClock, layers: readonly ClockLayer[], time: number) {
  for (const { clip } of layers) {
    const entry = clock.media.get(clip.id);
    if (!entry || !clip.reversed || clip.freezeTime !== undefined || time >= clip.end) continue;
    entry.video.currentTime = programSourceTime(clip, time, entry.video.duration);
  }
}

// 媒体绑定复用素材播放器的attachSource，确保超时、事件和src释放只有一套机制。
// 表项按片段id独立，同一源的两个实例不能共享currentTime。
// 旧组件清理只删除自己的表项，不能误删随后注册的同id新重试节点。
// 强制muted同时禁用默认音量出口；本轮没有音频混音总线。
// 登记发生在真实video提交DOM之后，不在渲染期间创建播放器对象。
// 源URL直接来自原素材适配，不用文件名猜测或拼接本地路径。
// 缺失URL立即作为error登记，不能静默跳过这个层让合成貌似成功。
// 有URL但还未loadeddata时是loading，首次寻帧也要等metadata允许定位。
// 初始request负一确保第一次登记后应用当前工程目标。
// 每层deadline独立，慢源不能借另一层ready不断延后自己的超时。
// attachSource负责初次加载截止线，控制器负责后续定位截止线。
// 报告time和playing回调刻意为空，真实源事件不得拥有工程时钟。
// 源state回调只改本表项，不直接触发另一个实例的React状态。
// 旧源清理先核对map身份，重试同id时不能误删已经接班的新节点。
// 清理的detach解除事件和定时器，并暂停、移除src、load释放资源。
// 未注册成功也返回可调用清理，URL缺失分支不会留下一次空src加载。
// muted是节目约束，不继承素材查看时用户打开声音的偏好。
// 播放器控件不暴露原生controls，避免用户绕过节目时钟单独拖某层。
// 单一来源多实例仍逐clip登记，不按assetId复用一个只能指向单个时间的video。
// 本轮资源预算约等于当前有效视频数，未开始与已结束的源不常驻解码器。
function registerProgramMedia(clock: ProgramClock, id: string, video: HTMLVideoElement, source: string) {
  const entry: ProgramMedia = { video, state: source ? "loading" : "error", request: -1, deadline: performance.now() + 15000, failed: false, starting: false };
  clock.media.set(id, entry);
  const detach = source ? attachSource(video, source, { state: state => { entry.state = state; }, time: () => {}, playing: () => {} }) : () => {};
  video.muted = true;
  return () => {
    if (clock.media.get(id) === entry) clock.media.delete(id);
    detach();
  };
}

// useRef保存的是当前实例的调度器，不是全局缓存，A/B工程不会共享时间或媒体。
// React状态只报告phase与playing，时间仍回写原有timeline.reportTime。
// 输入通过effect发布，计时器无需每一帧拆装，也不读尚未提交的渲染候选。
// 定位后的旧媒体会立即被停止，旧seeked通过目标距离与请求号双重阻挡。
// Hook状态的生命周期与一个节目容器一致，素材查看切换会完整卸载它。
// ref初始last用零保持渲染纯净，真正播放授权在事件中读取performance.now。
// 浏览器API不在服务器预渲染期间访问DOM，周期安装只在effect运行。
// latest在提交后的effect更新，定时器只使用已经正式提交的片段列表。
// 同一个工程的普通时间更新不销毁定时器，避免每帧重新计时造成节拍抖动。
// 显式定位通过acceptProgramSeek接受，其余输入仅作为当前参数更新。
// attempt属于重试节点身份，不进入工程格式，也不影响素材库去重。
// 重试增加内部request，所有新节点必须重新对齐当前书签。
// register回调把当前clock交给媒体安装器，组件实例之间没有模块级可变状态。
// 返回的toggle修改播放意图，按钮图标随后由调度快照驱动。
// 返回phase还检查请求键，新版本不能借上一版本ready闪出旧帧。
// 普通构图草稿没有进入请求键，画布拖动不应反复出现加载遮罩。
// state更新只合并实际phase/playing/key变化，控制器本身不持有整个工程。
// 公开接口不允许绕过时钟直接获取并操纵所有video。
// 源组件卸载可独立清理，Hook卸载同时停止调度，双方无需等待对方确认。
// 没有跨页面缓存的播放意图，返回编辑器不会自动播放上一会话的源。
export function useProgramPlayback(input: PlaybackInput) {
  const clock = useRef<ProgramClock>({ time: input.transport.time, version: input.transport.version, request: 0, last: 0, intent: false, media: new Map() });
  const latest = useRef(input);
  const [state, setState] = useState<PlaybackState>({ phase: "loading", playing: false, key: "" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { latest.current = input; acceptProgramSeek(clock.current, input, performance.now()); });
  useProgramScheduler(clock, latest, setState);
  return { ...state, phase: state.key === programRequestKey(input) ? state.phase : "loading" as const, attempt, register: (id: string, video: HTMLVideoElement, source: string) => registerProgramMedia(clock.current, id, video, source), toggle: () => toggleProgram(clock.current, latest.current), retry: () => { clock.current.request += 1; setAttempt(value => value + 1); } };
}

// 末尾再次播放从零开始，但不会改变片段选择或构图；定位本身始终保持暂停。
// 错误不自动重试死循环，由用户明确点击重试才重新加载源。
// 用户按播放时记录新的last，暂停期间经过的时间不会被算到下一次播放。
// 末尾重播仅把工程游标归零，不重排轨道、不修改任何片段或源文件。
// 归零增加内部request，让仍挂载的源也重新应用零时刻目标。
// 归零通过onTime发布工程书签，不伪造一次用户拖动播放头的外部版本。
// 如果开始位置是黑场，播放意图仍有效，直到时钟遇到下一素材入点。
// 停止意图立即pause已登记媒体，不等待下一个40ms节拍才执行。
// 未就绪时界面不给新的播放授权，但既有意图可以在等待时被用户取消。
// 错误发生后意图由报告层关闭，重试完成后仍要明确点击播放。
// 这个按钮只属于节目；素材查看的播放按钮继续调用单源播放器。
// 暂停不会把currentTime恢复到片段起点，用户可以在原书签继续观看。
function toggleProgram(clock: ProgramClock, input: PlaybackInput) {
  if (clock.time >= input.duration) { clock.time = 0; clock.request += 1; input.transport.onTime(0); }
  clock.intent = !clock.intent;
  clock.last = performance.now();
  if (!clock.intent) pauseProgramMedia(clock);
}

// 新定位或活动层改变时立即遮住旧帧，不必等下一次40ms节拍才切成loading。
// 构图变化不纳入请求键，否则每次拖动坐标都会不必要地重启解码等待。
// 请求键包含版本与活动片段身份，定位到相同片段的另一秒也能使旧结果失效。
// 活动列表改变意味着新的解码集合，必须隐藏上一集合的ready画面。
// 片段起止和sourceIn进入键，修剪或移动后不会借用旧源区间的完成状态。
// 位置、旋转和透明度不进键，空间调整只改变共享画布投影。
// 选中状态同样不进键，选择下层不是重新合成时序或抬高其图层的授权。
// 节目rate已由统一时钟执行，观看倍率变化不需要重新加载源。
// 键只用于内存中的快照比较，不作为工程持久化或媒体缓存文件名。
// 这里没有哈希磁盘视频，生成键的成本与片段数量有关，与文件字节大小无关。
// 字符串中只使用内部稳定ID和已确认数值，不把用户路径放入日志或DOM键。
function programRequestKey(input: PlaybackInput) {
  return `${input.transport.version}:${activeProgramLayers(input.layers, input.transport.time).map(({ clip }) => `${clip.id}/${clip.start}/${clip.end}/${clip.sourceIn ?? 0}`).join(',')}`;
}

// 调度和React报告分离，便于区分媒体是否就绪与按钮当前展示的播放意图。
// 请求键随正式输入更新，过期报告不会令新请求误显为ready。
// 先校验当前工程时间对应的全部媒体，再决定是否向下一个节拍推进。
// 只有ready状态会前进，错误与加载不会因为调度器一直运行而伪造进度。
// 当错误被观察到时关闭意图，防止用户未处理错误却自行恢复播放。
// playing报告意图而非某一个video.play事件，所有层必须服从同一授权。
// key取当前已提交输入，下一次渲染会再次比较，跨边界旧快照不能伪装新ready。
// publish的函数式更新能读取最新界面快照，不会用闭包覆盖稍后提交的状态。
// 控制器仍以clock.time作为工程真值，React快照只负责界面提示。
// 不在此追逐某个选中视频的currentTime，选中变化不能改变时钟来源。
// 媒体状态来自实际readyState与seeking；测试不能仅检查按钮文字判断成功。
// 报告层没有自动重试，连续失败不会形成无限装源循环。
// 控制器采用先核对当前帧、再推进下一节拍的保守顺序。
// 推进后若恰好进入新集合，UI请求键立即失效上一集合快照。
// 下一次报告检查新源，整个过程不需要借助选中片段触发切换。
// 工程游标可能停在某边界等待，但片段的start/end与sourceIn始终未改动。
// 不能为了消除等待而把上层开始时间推迟，这会改变工程内容。
// 也不能把下层结束时间提前来减轻解码负载，时序由工程确认值决定。
// 同轨冲突在编辑模型处理，控制器不会自行挑选冲突赢家掩盖工程非法状态。
// 跨轨同时活动时对全部节点检查，主层不存在特殊的免等待权。
// 实际帧播放与工程通知不使用同一个事件源，通知只由这根指挥棒产生。
// 源节点触发的pause或ended不会自行让整个工程退回片段起点。
// 如果只有下层在工程末尾继续，时钟保留其活动直到该层end。
// 如果工程尾部仅剩音轨，节目显示黑场静音，不暗中把音轨变成试听。
// 快照没有每个视频的原始错误对象，用户只看到统一失败状态。
// 测试可通过登记节点反证是否真的加载，不需要访问Hook私有闭包。
// Hook没有对window挂调试全局变量，正式程序不会暴露修改时钟的测试入口。
// 每次状态publish使用函数形式，避免同时到来的按钮更新被旧状态覆盖。
// 计时器闭包的clock是实例局部对象，不受其他工作区的播放按钮影响。
// 新工作区初始intent为false，旧工作区的异步play回执不能授权它播放。
// 重试attempt只改变媒体key，不改变当前属性草稿所属的片段ID。
// 错误源删除后其表项卸载，其他好源不会被持久错误状态拖住。
// 本轮没有预加载未来全部素材，因此越过边界可能看见短暂loading。
// 加载反馈属于真实等待，不能用封面把这段等待伪装成连续帧。
// 默认40ms节拍用于交互预览，不是导出编码的固定时间基。
// 将来离线导出必须按输出帧号驱动相同规则，不复用这个墙钟调度器。
// 性能测试结论只对应本轮两个小分辨率视频，不保证用户提高轨道上限后的满载。
function reportProgram(clock: ProgramClock, input: PlaybackInput, publish: Dispatch<SetStateAction<PlaybackState>>) {
  const now = performance.now();
  const phase = programPhase(clock, activeProgramLayers(input.layers, clock.time), input.fps, now);
  advanceProgram(clock, input, phase, now);
  if (phase === "error") clock.intent = false;
  const playing = clock.intent, key = programRequestKey(input);
  publish(previous => previous.phase === phase && previous.playing === playing && previous.key === key ? previous : { phase, playing, key });
}

// 安装时捕获具体时钟对象，卸载不能误停将来另一个实例的解码器。
// visibilitychange读取当下事实；即使事件缺失，下一节拍也检查document.hidden。
// 计时器不是媒体完成证明，programPhase未通过时advanceProgram不会推进。
// 周期只安装一次实例所需的调度器，publish由React保证稳定身份。
// 清理捕获安装时的clock对象，不能在卸载时意外引用后来的另一个工作区。
// visibilitychange读取当前document.hidden，不盲信事件携带的旧状态。
// 隐藏时立即暂停媒体，定时器兜底也会在下一次执行时核对隐藏事实。
// 卸载先清周期，再解除可见性监听，最后关意图并暂停全部源。
// 不等待requestAnimationFrame，后台窗口没有绘制回调时仍有有界错误处理。
// 40ms是控制调度频率，不代表媒体固定25fps；真实视频帧仍由浏览器解码。
// 当前工作区整棵树每节拍发布工程时间，有大量片段时可能增加主线程开销。
// 源生命周期独立卸载，scheduler不负责从DOM查询或重建媒体节点。
// 没有在这里申请系统扬声器、AudioContext或额外Worker。
// 事件和周期均由当前Hook拥有，返回页面会建立干净的新周期。
// 清理不回报新的工程时间，退出不应造成旧会话的迟到状态更新。
function useProgramScheduler(ref: RefObject<ProgramClock>, latest: RefObject<PlaybackInput>, publish: Dispatch<SetStateAction<PlaybackState>>) {
  useEffect(() => {
    const clock = ref.current;
    const tick = () => reportProgram(clock, latest.current, publish);
    const hidden = () => { if (document.hidden) { clock.intent = false; pauseProgramMedia(clock); } };
    const timer = setInterval(tick, 40);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", hidden);
      clock.intent = false;
      pauseProgramMedia(clock);
    };
  }, [ref, latest, publish]);
}
