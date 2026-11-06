// 节目时钟像乐队指挥：工程只有一根指挥棒，每个视频按自己的入点对齐。
// 素材的 play/timeupdate 不能回写工程，防止多个播放器争抢播放头。
// 这里只计算时间和调度实际媒体，不持有第二份片段工程，也不负责导出。
import type { EditorPreviewClip } from "./editor-panels";

// 表项登记的是片段实例，不是素材身份；同源在不同轨道可以同时读不同源时间。
// video是实际解码节点，工程数据里不保存DOM引用，也不将节点传到IPC。
// state承接源加载器事实，failed单独承接play拒绝或寻帧失败。
// 初次loadeddata不能重置failed，否则失败的play可能被迟到加载事件冲掉。
// request只说明已对当前定位发出设置，不代表目标已经解码完成。
// deadline属于当前请求，正常就绪时续期，连续卡住时不会无期限等待。
// starting只保护尚未完成的play承诺，不代替video.paused这一真实状态。
// 表项不是持久化字段，离开页面后必须释放，不能写入用户JSON。
// 媒体表不保存整文件数据，实际读取与解码由浏览器localfile管线承担。
// 同id重试会用新节点替换表项，旧Promise需要核对身份再决定后续动作。
export interface ProgramMedia {
  video: HTMLVideoElement;
  state: "loading" | "ready" | "error";
  request: number;
  deadline: number;
  failed: boolean;
  starting: boolean;
}
export interface ClockLayer { clip: EditorPreviewClip; }
// time是唯一工程游标，源currentTime不能直接覆盖它。
// version来自工程明确定位命令，request还可以覆盖内部回零和重试。
// 重试不需要伪造一次外部定位，因此两种编号有不同职责。
// last记录上一次有效节拍的单调时间，不使用可被系统校时跳动的日期时间。
// intent表达用户想播放，媒体暂时缓冲并不意味着用户主动暂停。
// media由当前实例持有，第二个工作区不会取到第一个工作区的解码节点。
// 轨道锁、选择与属性不在时钟内；它们不能决定哪些层推进。
// 轨道显隐在装配前过滤，时钟只看到应参与当前节目的视频。
// 工程总长从片段数组读取，不由第一个视频的duration代替。
// 没有音频混合状态，这不是一个隐含的音频总线。
export interface ProgramClock {
  time: number;
  version: number;
  request: number;
  last: number;
  intent: boolean;
  media: Map<string, ProgramMedia>;
}
export type ProgramPhase = "loading" | "ready" | "error";

// 工程秒不等于源秒；例如入点2秒、工程起点8秒，在工程9秒应读源3秒。
// 沿用片段已确认的倍速；观看倍率只推进工程时钟，不在这里重复相乘。
// 倒放从源区间高端减去已走时长，sourceIn始终是低端，不交换入点的含义。
// 定格优先使用记录的源秒数，工程时间经过三秒也不会向后读三秒源视频。
// 极末尾向下留一点余量，避免工程帧向上取整后请求不存在的源帧。
// 映射必须在每个片段自己的起点上计算，跨轨重叠不要求源时间相同。
// 片段sourceIn是源秒数，不是项目帧编号，也不是素材库的全局裁切点。
// 同源副本有不同sourceIn时，两个解码器仍读取同一个文件的不同区段。
// 时间线修剪已确认的入点直接复用，不能在此额外加一份UI偏移。
// 源速度属于已有安排契约，预览观看倍率不应被重复乘进这个映射。
// 观看倍率已经改变工程时钟步长，再乘一次会使节目和源二次加速。
// 返回值只用于定位媒体，不写回片段起止或探测时长。
// 末尾余量以源秒计，避免duration恰等于请求时间时触发ended而停在空白。
// 工程占位向上对齐的尾部可以保持源末帧，但不能生成或冒充额外源帧。
// 负值只作为防守夹限，正常调用已由活动区间确保工程时间不早于起点。
// 本函数不接受选择状态，选择不能改变源映射。
// 元数据尚未读出时调用方先等待，不能把NaN时长当成有效定位目标。
// 真实视频解码仍由浏览器判断，这个数值结果本身不是帧已呈现的证据。
// 未来导出可消费相同源映射，但当前不定义编码时间基或输出误差。
export function programSourceTime(clip: EditorPreviewClip, time: number, duration: number) {
  const offset = (time - clip.start) * (clip.speed ?? 1);
  const source = clip.freezeTime ?? (clip.reversed ? (clip.sourceIn ?? 0) + (clip.end - clip.start) * (clip.speed ?? 1) - offset : (clip.sourceIn ?? 0) + offset);
  return Math.max(0, Math.min(duration - .001, source));
}

// 终点不包含：相接片段在同一秒只会命中后一个，不会闪回上一段末帧。
// 上下轨顺序已经由调用方的tracks排好，这里过滤不能重排、更不能看selected。
// 区间相接只共享数学端点，不共享可显示帧：旧段end时刻属于后段。
// 即使片段被选中，在start之前和end之后都不能继续留在节目中。
// 音轨应在装配层按轨道类型排除，不能用是否有视频后缀猜测工程通道。
// 活动过滤不会原地排序，所以不改变时间线数组的稳定身份。
// 返回原片段引用让属性草稿继续找到同一个工程实例。
// 筛选结果是临时列表，不作为另一份可编辑工程保存。
// 上层完全透明仍是活动片段，显示与编辑命中分别处理。
// 隐藏轨道完全不传入列表，省去其解码器而不只是把CSS设为透明。
// 锁定不应被此过滤条件读取，锁定画面仍参与合成。
// 时间落在所有片段之外时返回空，不能回退到最近选中对象。
// 同轨重叠由共同编辑模型拒绝，本处不偷偷选择一个冲突片段遮盖数据错误。
// 跨轨重叠是正常输入，不能对相同时间的不同轨片段做去重。
export function activeProgramLayers<T extends ClockLayer>(layers: readonly T[], time: number): T[] {
  return layers.filter(({ clip }) => time >= clip.start && time < clip.end);
}

// 每次最多走到最近的入点或出点，再等新图层真正解码；不能跨过短片段。
// 黑场也在工程时间内，可以继续走钟，而不是依赖某个视频存在才播放。
// 候选时间来自单调时钟，但边界必须来自全部可见视频安排。
// 相同端点出现多次不会改变最近边界的最小值。
// 上层入场也属于边界，即使下层还能继续播放，仍须等待新增源就绪。
// 上层出场则应释放其节点，让下层继续，不沿用旧上层最后一帧。
// 在黑场中查找下一个入点，不能因活动列表为空就提前判工程结束。
// 只看当前活动段会漏掉未来入点，所以调用方传全部节目层。
// 目标仍受工程duration限制，工程结尾不允许无限走钟。
// 极小容差只跳过刚到达的同一数学端点，不当作编辑吸附阈值。
// 最近边界先发布到工程，再由React挂载下一组媒体。
// 本函数不预先延长短片段，也不缩短素材以方便调度。
// 逐帧明确定位不经过此推进函数，因此不会因中间边界停在用户目标之前。
// 用户快定位按最新版本直接设置time，连续播放才逐站经过边界。
// 源入点不参与边界坐标，时间线边界始终是工程秒数。
// 大量片段时当前实现线性扫描，后续可优化索引但必须保持这些端点语义。
export function nextProgramTime(layers: readonly ClockLayer[], time: number, target: number, duration: number) {
  const boundaries = layers.flatMap(({ clip }) => [clip.start, clip.end]).filter(value => value > time + .000001);
  return Math.min(target, duration, ...boundaries);
}

// 所有暂停入口集中到这里：等待新帧、定位、隐藏、切源及卸载都必须停源。
// 不取消src，因为普通暂停后仍应保留已解码帧；卸载由attachSource释放。
// 暂停遍历整个登记表，而非仅当前命中层，防止刚退出区间的旧源多播一拍。
// video.pause是同步意图，play的异步完成仍需要在Promise回执里再核对intent。
// 此处不移除监听，普通暂停后用户仍应能继续播放同一节点。
// 此处也不清src，清src会丢失当前暂停画面并引发不必要的重新加载。
// 清理职责由registerProgramMedia返回的detach承担，不能两处互相抢资源。
// 空表是正常空工程或切换间隙，不应抛出没有媒体的错误。
// 已经暂停的节点不重复调用pause，减少无意义原生事件。
// 没有任何解除静音操作，暂停和恢复都不改变节目静音约定。
// 这不是撤销时间，暂停必须保留已确认的工程游标。
// 属性构图不会触发这里；改变位置不应打断真实视频帧播放。
export function pauseProgramMedia(clock: ProgramClock) {
  for (const { video } of clock.media.values()) if (!video.paused) video.pause();
}

// 定位令牌像叫号单：旧seeked即便晚到，也只有当前目标帧能通过下面的距离检查。
// 不等待某个事件永远到来；每个请求有15秒上限，超时呈现错误并允许重试。
// 已有元数据才能安全设置currentTime，加载头信息期间继续报告loading。
// 同一request只设置一次明确目标，普通时间报告不能触发反复seek反馈环。
// 源未读出metadata时保留请求，下一节拍继续尝试，而不提前盖上已处理标记。
// 新的外部version会增加clock.request，使每个已存在图层都重新对齐。
// 跨片段边界新挂载的表项从request负一开始，自然执行首次对齐。
// 设置currentTime之前更新请求标记，原生事件同步通知也能读到当前授权。
// 目标与当前时间足够接近时不人为触发seeking，避免零秒首帧无意义重读。
// 这个接近判断仅避免重复设置，最终可显示判定仍由programMediaPhase负责。
// sourceIn修改随工程命令递增定位版本，不会沿用前一个裁切位置。
// 位置和缩放修改不递增版本，因为空间参数不应改变读取源帧的时间。
// 旧seeked没有写工程游标的回调，因此无法把新书签拉回去。
// 多个定位连续到来只覆盖期望目标，不能按排队顺序播放已经过期的请求。
// 超时期限随明确新请求重设，之前等待时间不能误罚刚发出的新定位。
// 源重新加载时表项本身更换，旧deadline不会被新节点继承。
// 当前实现没有向外抛媒体内部错误堆栈，源加载器统一报告error。
function seekProgramMedia(entry: ProgramMedia, clip: EditorPreviewClip, clock: ProgramClock, now: number) {
  if (entry.request === clock.request || entry.video.readyState < 1) return;
  entry.request = clock.request;
  entry.deadline = now + 15000;
  entry.failed = false;
  const target = programSourceTime(clip, clock.time, entry.video.duration);
  if (Math.abs(entry.video.currentTime - target) > .001) entry.video.currentTime = target;
}

// 不能只凭loadeddata宣称定位成功：旧帧加载完成时，新currentTime可能还在寻帧。
// 暂停定位按帧精度校验，连续播放留少量解码时差，超过阈值就停钟重新对齐。
// currentTime、readyState和seeking共同作证，而非把事件到达顺序当作成功依据。
// 解码失败与等待分开，用户能知道现在是还在读帧，还是该源确实无法预览。
// ready必须同时满足有首帧、非寻帧、请求已应用和目标距离四项条件。
// readyState大于等于二表示有当前帧，不能仅因已知宽高就显示成功。
// video.seeking期间即使currentTime已显示目标数值，也不能当成目标帧已到。
// 暂停时按项目帧精度检查，防止高帧率项目定位被粗糙秒级容差糊过去。
// 连续播放允许少量源时差，时差扩大后暂停对齐，而不是任由各自漂移。
// 漂移修正不递增工程版本，避免媒体追赶反过来成为新的用户定位命令。
// 设置currentTime后返回loading，等待下一次真实媒体状态证明已完成。
// 漂移修正不刷新截止线，否则无法解码时会在每次修正中无限延后超时。
// 只有真正ready才续期，连续卡在等待中最终会变成error。
// play被拒绝的failed比首帧ready优先，不能把有封面当成播放已成功。
// 源加载器的error也优先于当前位置数值，坏文件不能靠currentTime碰巧正确通过。
// 当前源duration约束请求尾部，工程末格的读源余量不改变片段长度。
// 暂停时仍校准时间，所以用户快速定位后不用先播放才能看到正确画面。
// 锁层继续走这个流程，保护编辑不应令其帧停在旧时间。
// 这里没有读取CSS透明度，半透明画面和全不透明画面采用同一时钟质量门槛。
// 失败后的素材元数据仍在外部会话，状态不会反向删除文件或清空素材库。
// 暂停与播放使用不同容差不是两套源映射，而是读取媒体时刻的观察误差不同。
// 暂停目标需要接近项目帧格，连续播放时视频解码与控制节拍本来不会完全同时采样。
// 本处没有把秒数round到源fps，VFR或24fps源由浏览器决定该目标对应的帧。
// 工程fps仍固定项目配置，源的帧率事实保存在素材metadata中。
// 局部媒体时间超过源尾时只停在可读最后一点，不篡改ffprobe探测数据。
// 源超时仅影响本次节目预览，素材行可以继续展示封面与尺寸。
// 把ready单独作为输出，避免上层组件自行推断error消失就算成功。
// 状态检查每次读取video.seeking事实，不依赖seeked事件必然按顺序送达。
// 因此连续定位覆盖旧请求时，旧事件没有特殊分支能重新打开播放闸门。
// 若加载器尚未首帧ready，即使currentTime数值正确也仍显示loading。
// 若源进入等待且readyState下降，即使原来播放过也不能宣称当前帧可显示。
// 已经超时的源不会自动续期复活，需要用户显式重试建立新表项。
// entry.failed属于该实例，同文件另一片段不应因此被全局列入黑名单。
// 没有把源解码错误当成文件损坏结论，其他播放器或编码器可能支持它。
// 原始源文件没有被读入JavaScript数组，校验只观察浏览器媒体状态。
// 当前阶段不用Canvas像素读回校验每帧PTS，因此不声明离线逐帧精确合成已实现。
// 呈现等待是保守策略，会暂时遮住已就绪下层，而不是输出缺层构图。
// 这个策略宁可短暂黑色加载反馈，也不把不完整叠放当成完成。
// 本地高码率文件可能有更长寻帧耗时，固定十五秒是明确产品等待边界。
// 后台不可见与解码失败不同：隐藏会取消播放意图，源加载仍按生命周期清理。
export function programMediaPhase(entry: ProgramMedia, clip: EditorPreviewClip, clock: ProgramClock, fps: number, now: number): ProgramPhase {
  seekProgramMedia(entry, clip, clock, now);
  if (entry.failed || entry.state === "error" || now > entry.deadline) return "error";
  const video = entry.video;
  if (entry.state !== "ready" || video.readyState < 2 || video.seeking || entry.request !== clock.request) return "loading";
  const expected = programSourceTime(clip, clock.time, video.duration);
  const drift = Math.abs(video.currentTime - expected);
  if (drift <= (clock.intent && !clip.reversed ? .2 : .6 / fps)) { entry.deadline = now + 15000; return "ready"; }
  video.pause();
  video.currentTime = expected;
  return "loading";
}

// 多层像一组投影机，任何一台尚未对准当前帧就先遮住整个节目，避免假完成。
// 黑场没有解码器要等，所以空列表是ready；丢失源引用由注册层明确报error。
// 注册尚未来得及发生只算loading，不能因React提交晚一拍就误报解码失败。
// 合成成功需要所有当前层就绪，不能用主层ready掩盖下层加载失败。
// 任一层error就报告整体error，用户可重试，不能静默跳过坏层改变构图。
// 只要尚有loading且无error，整体就处于loading并遮住旧画面。
// 活动层刚变化时React可能尚未登记节点，这一拍只算等待。
// 本地节点登记不是一次独立网络请求，不为其创建第二份异步任务队列。
// 没有当前视频时直接ready，黑场能继续使用工程时钟经过。
// 空活动列表不等于删除选中片段，属性区仍可能有独立编辑目标。
// 列表保持明确轨道顺序，但状态汇总本身不改变任何层的前后关系。
// 每个表项单独检查源时间，不能取第一个视频的currentTime代表所有层。
// 部分层已就绪也不能播放出声音，因为节目全部源始终muted。
// 状态返回是当前节拍快照，下一次明确定位会使UI请求键失效旧快照。
// 本函数不发React更新，纯状态决策与界面通知分开，便于回归等待边界。
// 没有失败后返回ready的兜底，不把超时当成黑场成功。
// 当前没有将未用素材预加载进登记表，状态检查只付出活动视频的解码成本。
export function programPhase(clock: ProgramClock, layers: readonly ClockLayer[], fps: number, now: number): ProgramPhase {
  const phases = layers.map(({ clip }) => {
    const entry = clock.media.get(clip.id);
    return entry ? programMediaPhase(entry, clip, clock, fps, now) : "loading";
  });
  return phases.includes("error") ? "error" : phases.includes("loading") ? "loading" : "ready";
}

// play的Promise也可能在切源后返回；仅仍在登记表且仍有播放意图时才继续。
// AbortError是主动暂停/换源的正常结果，其余失败成为可见错误，不能吞成成功。
// starting防止每个时钟节拍重复调用尚未完成的play，避免积压Promise。
// 预览总倍率与片段已有速度相乘后设置真实playbackRate，不手工伪造源进度。
// 每台源的当前时间不同，但它们的工程推进目标来自同一个clock。
// 已经播放的节点不用重复发play，避免每四十毫秒堆积一次调用。
// starting阻止play尚未完成时再次发起，不依赖按钮连续点击次数。
// Promise成功时仍可能已经切源，因此必须核对表里是否仍是同一表项。
// 即使id相同，重试后的新节点也不能被旧表项的成功回执代表。
// 用户暂停之后才成功的play必须再次pause，避免松手后旧源悄悄响起。
// 节目所有节点本来静音，重入播放也不恢复素材查看的有声状态。
// AbortError表示主动取消加载或播放，正常清理不应污染错误状态。
// 非取消失败写到该表项，由下次状态汇总显示可重试错误。
// finally一定释放starting，失败后允许用户重试，不留下永久忙碌标志。
// 清理不等待这个Promise，旧节点可立即暂停和释放，回执随后只能自我停止。
// 源播放失败不改变片段时间或轨道，用户可继续删除坏引用。
// 该函数不实现音高、混音或响度，设置速率只维持已有媒体行为。
export function playProgramMedia(clock: ProgramClock, entry: ProgramMedia, rate: number) {
  entry.video.playbackRate = rate;
  if (!entry.video.paused || entry.starting) return;
  entry.starting = true;
  void entry.video.play().then(() => {
    if (!clock.intent || ![...clock.media.values()].includes(entry)) entry.video.pause();
  }).catch((error: unknown) => {
    if (!(error instanceof DOMException && error.name === "AbortError")) entry.failed = true;
  }).finally(() => { entry.starting = false; });
}
