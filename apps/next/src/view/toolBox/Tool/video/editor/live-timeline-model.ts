/** 真实V1的纯计算：按项目帧放置，创建与移动共用同一碰撞门槛。 */
// 素材像货架上的原件，片段像借用原件的一张安排表；移动安排不改文件。
// 所有位置存秒数，先换到整数帧再比较，避免浮点尾差制造假重叠。
// DOM坐标只在交互边界换算，业务计算不依赖窗口、导航宽度或浏览器缩放。
import { visualClipEdit } from "./clip-transform-model";
import { DEFAULT_TRACKS, DEFAULT_TRACK_LIMITS, nextTrack, isVideoTrack, sameTrackKind, type TrackId, type TrackLimits } from "./timeline-track-model";
import type { EditorMediaAsset } from "./editor-panels";
import type { EditorTimelineClip } from "./editor-timeline";

// sourceDuration保留ffprobe事实，end-start是向上取整后的项目占位。
// 两者不同不表示发生了转码或补帧，源文件仍保持原样。
// sourceIn本轮固定为零，后续修剪不能误把工程start当作源入点。
// id属于实例，assetId属于素材，同一个assetId可以引用多次。
// 以3.25秒的视频为例，30fps工程需要98帧占位，片段长度就是98/30秒。
// 素材列表仍显示原探测时长3.25秒，不能把98/30写回源信息。
// sourceDuration记录这份事实，后续解码器无需反推取整前的值。
// sourceIn是源文件内部的起点，工程中移动到10秒也仍从源0秒看起。
// 继承的start/end则是工程坐标，两套时间不能互相覆盖。
// 视频封面属于asset，片段只存引用，重复入轨不会复制Base64封面。
// 多个片段修改的是各自的小记录，共享源文件仍由素材会话管理。
// 这里的数据结构不包含播放器对象，能够作为纯业务函数的输入。
// 也不包含File对象，浏览器拖放结束后不会因此扣住文件载荷。
// 片段ID在创建意图发起时产生，鼠标每次hover不会制造另一份身份。
// audioOnly是对源音轨的独立安排，audioDetached使原视频实例保持静音。
// 它们属于工程引用，不会删除原文件中的音轨，也不复制视频字节。
// 同源其他视频实例不受影响，用户仍可在素材库查看完整原文件。
export interface LiveTimelineClip extends EditorTimelineClip { sourceDuration: number; sourceIn: number; }
// 创建需要调用者提供新身份；验证预览不能偷偷生成并浪费另一份UUID。
// 移动只接收片段身份，不允许顺便替换源素材或轨道。
// 两种意图都经过同一个函数，不在键盘和鼠标中各写碰撞规则。
// start是候选秒数，还不是已经提交的有效位置。
// add的id用于新的安排，assetId用于找到原件，这是两个不同的必需身份。
// move沿用旧安排的id，不能通过传另一个assetId偷换其内容。
// 调用者不能给命令指定轨道，当前创建只产生V1安排。
// 这样键盘末尾添加与鼠标拖入不会在轨道默认值上出现分歧。
// 候选起点允许暂时超出工程末端，由工程在成功提交后延长。
// 当前位置不要求是整数秒，例如一帧移动会给出1/30秒。
// 业务层先对齐帧，再处理碰撞，而不是各事件处理器自行舍入。
// 命令没有文件路径字段，名称和目录变化不属于时间线移动操作。
export type TimelineCommand = { kind: "add"; id: string; assetId: string; start: number; track?: TrackId } | { kind: "move"; id: string; start: number; track?: TrackId };
// 原数组只在成功时返回新快照，失败结果没有可误用的半成品片段。
// 原因是有限枚举，UI按语言显示，不把异常栈当用户提示。
// invalid覆盖未知身份、非就绪源、非法时间与重复实例身份。
// overlap单独报告，用户可以换一个落点而非误以为文件损坏。
export type TimelineResult = { ok: true; clips: LiveTimelineClip[]; clip: LiveTimelineClip } | { ok: false; reason: "invalidPlacement" | "overlap" };

// 总长按最晚结束时间计算，不把多个源时长相加。
// 空工程返回零；视口的初始三十秒由展示层另外提供。
// 移到更早的空隙后，总长允许收缩，不留下固定演示时长。
// reduce不修改数组，同源多个实例仍保留独立引用。
export function timelineDuration(clips: readonly EditorTimelineClip[]) { return clips.reduce((end, clip) => Math.max(end, clip.end), 0); }

// 将源时长向上补齐到一个项目帧，只改变时间线的占位长度。
// 起点则四舍五入到最近项目帧，两者的取整方向不同。
// 例如24fps源进入30fps工程，仍展示源24fps，不改元数据。
// 负数先被拒绝，不能通过四舍五入把负起点悄悄改成零。
// 源必须为ready视频，封面缺失不影响已探测源的使用。
// 同名文件不用名称查找，只有明确assetId才能引用。
// 非有限值不允许流入百分比CSS，避免NaN污染整条标尺。
// sourceIn固定零体现本轮未接修剪，不假装支持源入出点。
// 移动复制旧实例，只替换start/end，保留源入点与真实时长。
// 片段身份找不到就失败，不能默认移动首个片段。
// 创建身份与已有身份相同时拒绝，避免React复用错误节点。
// fps由工程提供，不随每次拖过不同源而改变。
// 先检查起点符号，再取整，防止负0.001秒在30fps下被四舍五入为合法零。
// fps必须为正有限数，否则除法可能产生Infinity并污染样式。
// 移动时先以实例ID定位旧记录，没有记录就返回空，而不是默认首项。
// 旧片段长度先乘fps再取整数帧，避免多次移动累积浮点尾差。
// 新终点用“新起点帧+长度帧”计算，保证移动前后帧数相等。
// 创建先确认源存在，再检查视频类型与ready状态，条件缺一不可。
// error、loading和cancelled行不能只凭存在duration就变成可入轨素材。
// 没有封面不在拒绝条件内，探测成功而封面缺失仍能安排源视频。
// 零时长不构成可见片段，负时长也不能靠绝对值变成有效源。
// 同名素材只要assetId不同就可以各自使用，名称不用于去重。
// 反过来，同一个clipId即使引用不同素材也必须拒绝重复创建。
// 源帧率不用于工程位置对齐，24fps素材仍在30fps工程格点上放置。
// 这只决定安排表的格子，不能宣称源文件被转码成30fps。
// 移动时目标轨道可省略，旧调用方因此仍留在原轨，不改变键盘平移语义。
// 显式目标必须与原片段类型相同，不能把视频改成音轨来逃过同轨碰撞。
// 创建新素材只允许视频轨，传入A编号时拒绝，而不是悄悄回落V1。
// 新实例的sourceIn初始化为零，后续修剪只改实例自己的入点。
// 移动spread保留sourceIn，所以修剪后再平移不会从文件开头重新播放。
// 移动长度仍按整数项目帧复制，不因目标轨宽度或当前缩放改变时长。
// 重复ID创建拒绝，新的同源实例必须使用不同clipId。
// 素材kind与state一起校验，不能仅用.mp4文件名判断已完成真实探测。
function candidateClip(clips: readonly LiveTimelineClip[], assets: readonly EditorMediaAsset[], command: TimelineCommand, fps: number): LiveTimelineClip | null {
  if (!Number.isFinite(command.start) || command.start < 0 || !Number.isFinite(fps) || fps <= 0) return null;
  const start = Math.round(command.start * fps) / fps;
  if (command.kind === "move") {
    const old = clips.find(clip => clip.id === command.id);
    return old && (!command.track || sameTrackKind(old.track, command.track)) ? { ...old, track: command.track ?? old.track, start, end: (Math.round(start * fps) + Math.round((old.end - old.start) * fps)) / fps } : null;
  }
  const asset = assets.find(item => item.id === command.assetId);
  if ((command.track && !isVideoTrack(command.track)) || !asset || asset.kind !== "video" || asset.state !== "ready" || !asset.duration || asset.duration < 0 || !Number.isFinite(asset.duration) || clips.some(clip => clip.id === command.id)) return null;
  return { id: command.id, assetId: asset.id, track: command.track && isVideoTrack(command.track) ? command.track : "V1", start, end: (Math.round(start * fps) + Math.ceil(asset.duration * fps)) / fps, sourceIn: 0, sourceDuration: asset.duration };
}

// 碰撞使用半开区间：[开始,结束)，前一段终点等于后一段起点合法。
// 比如0–6秒与6–12秒可以相邻，5–11秒则与第一段重叠。
// 对比整数帧，避免0.1+0.2和0.3的二进制差异被认成碰撞。
// 移动时排除自己的id，不能让片段与原位置撞到自己。
// 其余同源实例仍参与检查，assetId相同不是排除条件。
// 只比较同轨，未来扩轨不会把别轨安排当作本轨碰撞。
// 本轮候选始终V1，音频轨在交互边界也会拒绝。
// 所有判断先完成再构造数组，没有先移动再回滚的中间工程。
// 预览调用本函数只读结果，松手才真正写入。
// 键盘末尾添加和按帧移动也使用本函数，不绕开门槛。
// 失败后原数组、选择和总长均由调用方保持不变。
// 成功数组沿用原顺序，视觉位置由start决定而非数组下标。
// sourceDuration不参与碰撞，碰撞比较的是取整后的工程占位。
// 这像停车位的边线，车长按格子算，但不因此改写车辆真实尺寸。
// 两个条件共同表达相交：候选起点早于对方终点，候选终点晚于对方起点。
// 任一条件不成立就没有交集，故相邻边界不会被当成重叠。
// 例如长度98帧的首段占[0,98)，新段从98帧开始合法。
// 新段从97帧开始则有一帧交集，必须返回overlap。
// 移动时只排除相同clipId，而非相同assetId，这是同源多实例的关键。
// 复制数组之前先检查全部同轨记录，失败时没有可见半次写入。
// 成功移动使用map替换命中实例，其他实例对象引用保持稳定。
// 成功创建追加到数组末尾，实际视觉顺序由start百分比表示。
// 因此数组顺序不是播放顺序，也不需要为拖动反复排序原数组。
// 本函数既用于草稿验证，也用于最后提交，二者使用同一组帧规则。
// 它不生成UUID，重复计算同一候选不会改变身份或产生副作用。
// 它不访问React状态，鼠标、键盘和后续独立回归能共享相同结果。
// 它不抛业务异常，拒绝结果通过有限原因交给界面翻译。
export function applyTimelineCommand(clips: readonly LiveTimelineClip[], assets: readonly EditorMediaAsset[], command: TimelineCommand, fps: number): TimelineResult {
  const clip = candidateClip(clips, assets, command, fps);
  if (!clip) return { ok: false, reason: "invalidPlacement" };
  const overlaps = hasTimelineOverlap(clips, clip, fps);
  if (overlaps) return { ok: false, reason: "overlap" };
  return { ok: true, clip, clips: command.kind === "add" ? [...clips, clip] : clips.map(other => other.id === clip.id ? clip : other) };
}

// 放置像在停车场找最近的完整车位：不能停进别人的车，也不能截短自己的车。
// 负起点贴到零，碰撞时同时检查障碍前后边界，不总是跳到工程末尾。
// 所有候选再经过严格命令校验，鼠标草稿、松手和键盘共用同一个解决结果。
// 与严格apply分开，是为了分离音轨等原子操作仍能明确拒绝而不偷偷移位。
// 非有限起点与非法帧率先拒绝，不能通过夹紧把NaN变成可写工程的秒数。
// 不改变障碍片段、长度、源入点或轨道；相同距离优先较早的空位。
// 所有边界先换成项目帧，避免小数误差导致首尾相接仍被当作相交。
export function resolveTimelineCommand(clips: readonly LiveTimelineClip[], assets: readonly EditorMediaAsset[], command: TimelineCommand, fps: number): TimelineResult {
  // 先确认start与fps有限，NaN不该通过Math.max变成貌似合法的放置意图。
  // wanted保存整数帧，不是格式化为两位小数的提示文案。
  // 负起点夹零发生在这里，严格candidateClip仍保留拒绝负数的独立语义。
  // candidate先确认引用、状态和完整长度，非法源不必继续搜索空位。
  // 移动旧片段只变起点，长度来自原安排，不从鼠标轮廓宽度反推。
  // obstacles仅取同轨且排除本人，另一音轨同时间出现不会阻挡当前安排。
  // 搜索候选不是每帧遍历，长工程不会因十小时空白而多查一百多万次。
  // 一维区间的最近合法位置只可能是原落点、零或某个障碍的相接边界。
  // 障碍前边界要减完整片段长度，使候选end恰好等于障碍start。
  // 障碍后边界直接取end，使候选start恰好等于障碍end。
  // 不能只比较候选起点是否在障碍内，候选尾部也可能撞上后一个障碍。
  // 每个边界仍交给严格apply验证所有同轨障碍，避免避开一个却撞上另一个。
  // starts用Set去重，相邻障碍共享边界时不重复执行相同验证。
  // 负边界直接剔除，因为不存在工程零之前的可放置空间。
  // 排序先比较与wanted距离，距离相等再比较帧号，重复计算结果稳定。
  // 例如六秒片段要从4开始、障碍从8到14，最近前贴是2，不能缩成四秒。
  // 同样六秒片段想从9开始，障碍后贴14比前贴2更近，应选14。
  // 若短空隙容不下完整片段，两端候选都会严格失败，继续比较其他空位。
  // 候选不要求位于旧工程时长内，拖到末尾之外可以合法延长工程。
  // 最晚障碍之后通常总有空位，仍保留失败结果给非法或将来受限场景。
  // 返回严格apply产生的新数组，不在搜索过程中改原数组再撤回。
  // hover重复运行不会改变后续候选，松手能得到同样的边缘结果。
  // 此策略是碰撞避让，不包含靠近标尺、播放头或异轨边缘的通用吸附。
  // 分离音轨仍用严格碰撞，不借此偷偷移动声音造成音画起点错位。
  // 键盘方向移动也走这里，在障碍处贴边而不绕过同轨完整占位约束。
  // 新建与移动共用结果，避免蓝色草稿显示2秒、松手却提交14秒。
  if (!Number.isFinite(command.start) || !Number.isFinite(fps) || fps <= 0) return { ok: false, reason: "invalidPlacement" };
  const wanted = Math.max(0, Math.round(command.start * fps));
  const candidate = candidateClip(clips, assets, { ...command, start: wanted / fps }, fps);
  if (!candidate) return { ok: false, reason: "invalidPlacement" };
  const length = Math.round((candidate.end - candidate.start) * fps);
  const obstacles = clips.filter(clip => clip.track === candidate.track && clip.id !== candidate.id);
  const starts = [wanted, 0, ...obstacles.flatMap(clip => [Math.round(clip.start * fps) - length, Math.round(clip.end * fps)])];
  const ordered = [...new Set(starts)].filter(frame => frame >= 0).sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted) || a - b);
  for (const frame of ordered) {
    const result = applyTimelineCommand(clips, assets, { ...command, start: frame / fps }, fps);
    if (result.ok) return result;
  }
  return { ok: false, reason: "overlap" };
}

// 所有轨道共用整数帧半开区间，鼠标、键盘和右键分离不能各算一套碰撞。
// 轨道像不同层的停车场；相同时段停在不同层不冲突，同层才需要让位。
// 排除的是同一片段ID，不是同源素材，所以同源重复入轨仍会参与碰撞。
// 比较前后两个端点，刚好首尾相接合法，一帧交集也应拒绝。
export function hasTimelineOverlap(clips: readonly LiveTimelineClip[], clip: LiveTimelineClip, fps: number) {
  // 例如候选A1的[4,10)与A1的[8,14)相交两秒，必须拒绝。
  // 相同候选与A2的[8,14)不构成同轨碰撞，两者可同时保留独立安排。
  // start与end都先换成项目帧，30fps项目中的相邻边界不会受二进制小数尾差影响。
  // 片段本身的源帧率可为24fps；它只影响源解码，不改变这里的工程格子。
  // ID自排除只用于移动原实例，新的音轨ID与原视频不同，仍需接受完整检查。
  // 这个方法没有修改数组，因此可以同样用于悬停草稿和最终提交。
  // 先比较轨道能避免把视频与新分离音频同时间的安排当成异常。
  // 结束边界使用严格大于；前段结束恰等于后段开始时交集为空。
  return clips.some(other => other.id !== clip.id && other.track === clip.track && Math.round(clip.start * fps) < Math.round(other.end * fps) && Math.round(clip.end * fps) > Math.round(other.start * fps));
}

// 右键菜单和Delete键共用工程编辑结果，不让UI直接改数组中的对象。
// 成功可能没有选中片段，例如删除，所以与位置命令的结果单独表达。
// 操作不接收文件路径，也不提供转码、删除磁盘文件或保存工程的权限。
export type TimelineEdit = "detach" | "duplicate" | "delete" | "mirror" | "rotate";
export type TimelineEditResult = { ok: true; clips: LiveTimelineClip[]; selectedId: string | null } | { ok: false; reason: "overlap" | "invalidPlacement" | "trackLocked" };

// 分离只建立原源音轨的独立引用，像把同一页乐谱分给另一位演奏者。
// 新片段保留起止、源入点和时长，不能为了塞进空位偷偷挪动或缩短音轨。
// 优先A1，原时段已有冲突则尝试A2；两轨都冲突时原视频也不能被静音。
// 每个候选使用同一个碰撞方法，禁止绕过同轨重叠门槛。
// 探测确认无音轨、未就绪源、音频实例或已分离视频均不允许再次分离。
// 校验依据真实metadata.hasAudio，文件后缀为mp4不代表一定有声音。
// 返回完整新数组后才由会话一次提交，失败不产生“视频已静音、音频没建好”的半次结果。
// 音频片段与视频ID不同，后续移动、复制和删除均独立，不绑定同源其他实例。
// 新ID冲突要拒绝，不能用旧ID覆盖另一条轨道上的片段。
// 静音标记只写当前视频实例，素材对象和源文件都保持不变。
// 删除已分离音频不会自动把原视频恢复有声，符合独立片段的语义。
// 本方法不提取wav，也不制造素材库里不存在的文件；它是无损工程分离。
// 分离复用原编辑命令，只扩充可选音轨集合，不新建另一套分离业务。
// 先按工程音轨顺序找空位，全部占用后才尝试申请一个新的音轨编号。
// 锁定轨道从候选中排除，但源视频已锁仍由外层统一拒绝整个编辑。
// 新增候选也受audio名额限制，不能因为是分离操作绕过五条默认上限。
// 分离保持start/end/sourceIn，声音与修剪后画面引用相同的源区间。
// 清掉transform，因为音轨没有位置、缩放、旋转或画面不透明度。
// 只有找到可用完整区间才给视频加audioDetached，拒绝不留下半次静音状态。
// 已有audioDetached不能再次分离，避免同一个实例重复生成相同声音。
// 源metadata.hasAudio必须来自真实探测，无音轨视频不提供虚假的分离成功。
// 返回实际新音轨实例，由工程提交方登记其轨道，纯模型不修改外部tracks数组。
// 全部目标锁定与单纯占用使用不同失败原因，界面可以给出具体反馈。
// 锁表、轨道顺序和数量限制来自当前工程，旧调用方仍可使用默认参数。
// 候选集合由已有音轨列表加至多一个extra构成，不一次预建到二十轨。
// extra只有nextTrack返回合法编号才加入，设置已满时集合只有现有轨道。
// available的顺序保留A1/A2等工程顺序，find挑第一个无碰撞且未锁定目标。
// 同一工程时段可在不同音轨重叠，这是多音轨安排，不是同轨区间冲突。
// 源视频分离后audioDetached为true，但音频副本audioDetached为false，二者语义不同。
// 音频副本audioOnly为true，即使源asset.kind仍是video也不能出现在节目画面层。
// 删除分离音轨不会自动恢复源视频声音，恢复或链接应是后续明确编辑命令。
// 复制已分离的视频继续保留audioDetached，不能因创建新id悄悄恢复重复声音。
// sourceIn照搬原视频，保证先修剪再分离时声音从相同源入点开始。
// sourceDuration照搬探测总长，之后音频独立修剪仍受原文件边界约束。
// 原视频transform保持原值，生成音轨只清副本构图，不可将源构图一并置空。
// 没有把音轨时长设为源全长，必须保持被分离视频安排的end-start。
// 如果当前所有候选都锁，返回trackLocked而非overlap，用户不必猜是占用还是权限。
// 如果至少一条可编辑但全被片段占用且不能新增，返回overlap保留原视频完整状态。
// 分离不是移动，原视频仍留在原轨、原时段，只有音频静音标记改变。
// 新的音轨id由调用方生成并检查重复，不能沿用视频id导致选择和删除串对象。
// 此模型不调用FFmpeg提取wav，元数据中确有音轨也不代表磁盘新增音频文件。
// 独立音轨预览继续读取原容器音频流，源文件删除会同时影响两种引用。
function detachAudio(clips: readonly LiveTimelineClip[], assets: readonly EditorMediaAsset[], clip: LiveTimelineClip, id: string, fps: number, lockedTracks: readonly string[], tracks: readonly TrackId[], limits: TrackLimits): TimelineEditResult {
  // assetId是稳定引用，名称相同或路径改变不会让分离方法误查另一份素材。
  // state必须就绪，因为探测失败行可能还保留上次尝试的显示文字。
  // 封面是否存在不构成音轨条件，缺图视频只要探测有效仍可分离声音。
  // hasAudio只代表流存在，能否实际播放仍由浏览器媒体事件给出结果。
  // 因此解码失败也保留安排与元数据，用户可以删除该安排或换源查看。
  const asset = assets.find(item => item.id === clip.assetId);
  if (!isVideoTrack(clip.track) || clip.audioDetached || !asset?.metadata?.hasAudio || asset.state !== "ready") return { ok: false, reason: "invalidPlacement" };
// 音轨分离是安排引用的拆分，不是把视频画面变成一张透明图片。
// 清除transform可避免音频记录误继承视频X/Y和不透明度。
// 音量不属于opacity，未来音频效果需要独立契约，不能借画面透明度代替。
// video原实例的构图继续保留，分离只改变声音通道归属。
// 目标轨道仍先排除锁定，再检查完整时长碰撞，不能为分离缩短安排。
// 没有合法音轨时原工程保持不变，不产生带半份参数的音频记录。
// 同源音频与视频仍共享assetId，但拥有不同clip.id和属性类型。
// 属性适配读取audioOnly，文件扩展名仍为mp4不影响音频组判断。
// 清除构图只是工程数据清理，不触发转码、写盘或重新探测。
// 当前单源试听不会将这条音轨与原视频自动混音播放。
  const extra = nextTrack(tracks, "A", limits);
  const available = [...tracks.filter(track => !isVideoTrack(track)), ...(extra ? [extra] : [])];
  const audio = available.filter(track => !lockedTracks.includes(track)).map(track => ({ ...clip, id, track, audioOnly: true, audioDetached: false, transform: undefined, keyframes: undefined, crop: undefined, freezeTime: undefined })).find(candidate => !hasTimelineOverlap(clips, candidate, fps));
  // 两条候选只改变轨道，映射过程中没有把原clip的track原地改成A1。
  // find只选第一条空闲轨，数组顺序明确了A1优先的产品行为。
  // 即使候选在A2，源起点仍是sourceIn，工程起点仍是start，两套坐标不混用。
  // audioOnly打开后由渲染适配选audio元素，不从这份数据生成另一条文件路径。
  // audioDetached在音频上为false，因为它本身不含需要再拆出去的视频声音。
  // 原视频标记要等audio候选确定后再设置；找不到位置就不产生任何静音副作用。
  // 这是一次原子快照更新：V1静音与新音轨建立要么一起成功，要么一起失败。
  // 不同视频实例即使引用相同assetId，也只有目标id对应那条被置为静音。
  // 新音轨保留sourceDuration，后续真实预览仍能区分源长度和项目帧占位长度。
  // 例如3.25秒源占98帧，新音轨同样占98帧，不能反向更改源时长成98/30秒。
  // 锁像每个抽屉各自的封条，源抽屉没封不代表能往目标抽屉塞东西。
  // A1锁住时可以原时段使用空闲A2，不允许移动时间或缩短声音来规避锁。
  // 两轨都锁时单独报告锁定，不能误报成文件损坏或悄悄静音原视频。
  // 若只剩未锁轨但已有占用，则仍属于碰撞；两种拒绝原因不混为一谈。
  // 候选过滤与碰撞共用这里的纯计算，菜单和快捷键没有各自的目标轨选择规则。
  // 只有成功找到合法目标，下面才一次性返回视频静音与新音轨的完整快照。
  // 失败不返回半成品数组，调用方必须保留原工程与原选择。
  if (!audio) return { ok: false, reason: available.every(track => lockedTracks.includes(track)) ? "trackLocked" : "overlap" };
  return { ok: true, clips: [...clips.map(item => item.id === clip.id ? { ...item, audioDetached: true } : item), audio], selectedId: id };
}

// 右键菜单仅传动作与身份，执行时重新从当前快照查目标，旧菜单不能编辑已删实例。
// 删除只移除工程安排，素材库与磁盘文件依旧存在，其他同源实例不跟着消失。
// 复制放在所属轨道实际末尾，不抢占其他片段位置，也不依赖全工程的空白视口。
// 复制保留源入点、长度和已分离状态；复制一个静音视频不会偷偷恢复声音。
// 音频副本仍在原音频轨，不能通过复制隐式跨轨或返回V1。
// fps非法时拒绝，避免NaN比较把所有碰撞都误认为不相交。
// 分离和复制都要求新身份，生成身份归会话，纯计算重复调用没有额外副作用。
// 命令失败不返回新数组，由会话保留原选择、源预览和时长。
// 删除成功清除选中，避免属性面板仍引用已不存在的片段。
// 这里的复制直接放到同轨末尾；快捷键剪贴板与历史由会话层统一编排。
// 同一时间的不同轨道不冲突，但相同轨道的所有同源实例都需要比较。
// 复制再次经过共同碰撞方法，为后续时间参数扩展保留一致的提交门槛。
// tracks/limits是可选扩展，仍使用同一个编辑命令返回结构，菜单不新增另一条IPC。
// 默认轨道集合保留历史V1/A1/A2，而新增名额默认每类五条。
// 复制片段时transform继续独立克隆，sourceIn随原值保留，后续修剪互不污染。
// 删除仍仅按实例id，不删除素材文件或其他同源安排。
// 命令失败返回原因而非抛出，父层状态提示可保留原工程与选择。
// 菜单和键盘共用这条编辑命令，不能只在某一种入口检查锁轨。
// 目标片段由实例ID匹配，同名标题和相同源文件都不能替代这个身份。
// 删除不要求生成新UUID，但复制与分离必须保证新身份没有被工程占用。
// 镜像与旋转不创建新片段，传入的新ID参数不会改变原实例身份。
// 视频镜像状态放在片段本身，不会向asset写一个所有副本共用的布尔值。
// 旋转只复制目标transform，后续改副本角度不会改到原片段的同一对象。
// 纯音频拒绝画面动作，不能靠给音轨附带一个transform来声称实现。
// 复制到同轨末尾仍以完整片段长度放置，不按源文件总长重新展开已经修剪的内容。
// 复制同时保留源入点和speed，这样副本读到的内容与原片段一致。
// 分离音频引用真实原视频音轨，保留源时间映射，而不是建立假波形文件。
// 音轨分离的目标轨同样检查锁与碰撞，源轨未锁不代表任意目标轨都可写。
// 没有合法空闲同类轨时拒绝，不能静音源视频后又没有创建独立音轨。
// 新的音轨名额只有成功提交才进入tracks，失败不消耗候选编号。
// 菜单操作完成只代表临时工程更新，未保存提示仍由项目栏保留。
// 原文件删除、重命名、编码导出都不属于这个函数，不接受任意文件路径。
// 结果显式带ok联合，调用方不能把null或空数组理解成成功删除所有素材。
export function applyTimelineEdit(clips: readonly LiveTimelineClip[], assets: readonly EditorMediaAsset[], action: TimelineEdit, target: string, id: string, fps: number, lockedTracks: readonly string[] = [], tracks: readonly TrackId[] = DEFAULT_TRACKS, limits: TrackLimits = DEFAULT_TRACK_LIMITS): TimelineEditResult {
  // 重查目标能处理菜单打开后工程已经变化的情况，未找到就给明确无效结果。
  // 删除不需要新身份，所以仅对复制与分离检查id是否已经存在。
  // 选中ID与源ID不同，删除某个同源副本不会删除共享的素材引用对象。
  // 删除采用filter产生新数组，外层正在读取旧快照的草稿不会被偷偷改写。
  // fps不是字符串输入；依然拒绝非有限值，避免内部调用错误污染工程坐标。
  // 复制的start取本轨最大end，不取数组末项，因为DOM与数组顺序都不是时间顺序。
  // 如果V1末尾为12秒、A1末尾为20秒，复制V1仍应从12秒开始。
  // 总工程时长随后取所有轨的最大end，因此这次复制未必让总长增长。
  // end由整数帧加法构造，避免多次复制把小数误差累加到源长度里。
  // 拷贝对象会保留audioOnly和audioDetached，通道与静音不会因为新ID丢失。
  // 原安排对象不变，用户仍能分别选择原件和副本。
  // 返回selectedId只表达下一次UI应选谁，不让纯函数直接操作DOM焦点。
  const clip = clips.find(item => item.id === target);
  if (!clip || !Number.isFinite(fps) || fps <= 0 || (action !== "delete" && clips.some(item => item.id === id))) return { ok: false, reason: "invalidPlacement" };
  // 在提交入口重查源轨锁，不只依赖按钮disabled，旧菜单也必须服从当前锁。
  // 可选空锁表兼容纯模型旧调用方；正式会话每次提供最新锁表。
  // 复制、删除、分离共享此门槛，不允许某个操作通过另一条入口绕过去。
  // 源轨锁住时不生成副本、不清选择，也不尝试把音轨写入另一轨。
  // 分离还要继续检查目标轨，源和目标是两个独立的写入权限。
  // 此函数不修改锁表，失败不会替用户解锁或改动其他轨道状态。
  // 用实例实际track判断，不拿当前高亮的轨道或素材kind推断权限。
  if (lockedTracks.includes(clip.track)) return { ok: false, reason: "trackLocked" };
  if (action === "delete") return { ok: true, clips: clips.filter(item => item.id !== target), selectedId: null };
  // 基础画面编辑只作用于视频实例；音轨不能获得一个假旋转效果。
  // 保留原时间区间、源入点和轨道，镜像/旋转不重新安排节目时间。
  // 独立复制transform，后续属性编辑不会与同源或复制片段共享可变对象。
  if (action === "mirror" || action === "rotate") {
    if (clip.audioOnly || !clip.transform) return { ok: false, reason: "invalidPlacement" };
    const next = visualClipEdit(clip, action);
    if (!next) return { ok: false, reason: "invalidPlacement" };
    return { ok: true, clips: clips.map(item => item.id === target ? next : item), selectedId: target };
  }
  if (action === "detach") return detachAudio(clips, assets, clip, id, fps, lockedTracks, tracks, limits);
  const start = timelineDuration(clips.filter(item => item.track === clip.track));
// 复制保留数值但分开对象，像复印构图记录而不是让两份表共用同一张便签。
// 只展开clip还不够：嵌套transform会继续指向原记录，后续原地写入容易串值。
// 这里显式展开五个标量，副本与原片段的相等数值不代表相同引用。
// 旧样板没有transform时保持undefined，由正式创建边界提供默认中心。
// 新id仍由原复制命令生成，不能用源素材id替代安排身份。
// 复制不改assetId，所以不会在素材库再生成一份视频文件。
// start/end仍按完整帧长度放到同轨末尾，构图继承不能影响时长。
// 原锁与碰撞规则先执行，不能靠复制构图绕过已有轨道保护。
// 修改副本X/Y后原片段的缩放、角度与透明度均应保留。
// 删除副本只删除工程引用，源文件和原片段构图都不受影响。
  const duplicate = { ...structuredClone(clip), transform: clip.transform ? { ...clip.transform } : undefined, id, start, end: (Math.round(start * fps) + Math.round((clip.end - clip.start) * fps)) / fps };
  if (hasTimelineOverlap(clips, duplicate, fps)) return { ok: false, reason: "overlap" };
  return { ok: true, clips: [...clips, duplicate], selectedId: id };
}

// DOM矩形的left已包含横向滚动带来的负位移，不能再加一次scrollLeft。
// 抓取偏移用秒数保存，片段中间被抓住时起点仍保持原有距离。
// 坐标换算保留负数供上层判断；交互命令统一在resolve入口贴零与避让。
// 返回项目帧位置，轮廓、预计时间与最终提交共用同一结果。
// pixelsPerSecond在手势开始时冻结，工程边界变化不能追着鼠标缩放。
// 这里只换算，不读取或改写任何素材、片段及播放器。
// 例如每秒32px，内容左边为400px，鼠标落在560px，对应工程5秒。
// 若在片段内部第1秒抓住，则片段起点应为4秒，而非5秒。
// 横滚160px后内容left变为240px，同一屏幕鼠标对应工程10秒。
// 此时再加scrollLeft会把滚动算两遍，得到错误的15秒。
// 抓取偏移在手势开始时冻结，因此滚动不会改变“抓住哪一处”。
// 最后乘fps并四舍五入，把连续像素落点变为工程可表示的帧。
// 负数仍返回，严格校验可拒绝；交互放置层会把它解析为零边界。
// 函数不替调用者读取导航宽度，所有外部布局已折算进DOM矩形。
export function timelineDropTime(clientX: number, laneLeft: number, pixelsPerSecond: number, offset: number, fps: number) {
  return Math.round(((clientX - laneLeft) / pixelsPerSecond - offset) * fps) / fps;
}

// 内部载荷只传身份，不传本地路径、完整视频或封面字节。
// MIME和session两层隔离，另一页或另一编辑器不能拿同名ID越界引用。
// getData在拖过期间可能被浏览器保护为空，最终读取必须在drop发生。
// parse只接受本轮明确的两个操作类型，不把网页纯文本当内部安排。
export const TIMELINE_DRAG_TYPE = "application/x-illusion-realm-timeline";
export interface TimelinePayload { session: string; kind: "asset" | "clip"; id: string; }
// JSON异常、数组或null都返回空值，不让拖放事件抛错导致页面导航。
// 字段逐个缩窄，不用any或强行把未知对象断言成可信载荷。
// 会话比较放在解析层，每个入口不必重复一份身份判断。
// ID是否真实存在继续由工程验证，能解析不代表能执行。
// JSON能解析不等于可信，例如null和数组也都是合法JSON文本。
// 每个属性都在存在性与类型检查后才读取，不依赖强制类型断言。
// session必须等于本组件会话，复制上一页的载荷不会继续生效。
// kind只允许asset和clip，未知操作不能回落为默认创建。
// id的存在性还会在工程命令中再次检查，解析器不查素材库。
// 解析失败返回null，由drop给就地反馈，不能让异常穿透React事件。
// 文本中额外字段不会成为命令参数，返回值只取三项已认可身份。
// 即使伪造了会话和ID，drop还要求当前确实存在同身份起始手势。
export function readTimelinePayload(text: string, session: string): TimelinePayload | null {
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || !("session" in value) || value.session !== session || !("id" in value) || typeof value.id !== "string" || !("kind" in value) || (value.kind !== "asset" && value.kind !== "clip")) return null;
    return { session, id: value.id, kind: value.kind };
  } catch { return null; }
}
