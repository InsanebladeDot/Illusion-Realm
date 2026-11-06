/** 轨道和修剪的纯规则：同类可换层，源入点与工程起点分别计量。 */
import type { TransformKey, ClipKeyframes } from "./clip-transform-model";
import type { LiveTimelineClip } from "./live-timeline-model";

// 编号只作稳定身份；列表顺序决定上层覆盖下层，点击不会重排列表。
// 编号不是层级数值：V1和V2的字符串只识别轨道，实际覆盖由tracks数组顺序决定。
// 不能按最近点击时间排序，否则点属性就会让一张画面突然盖到前面。
// 视频轨与音轨分别计数，五条视频加五条音频属于两个独立名额池。
// DEFAULT_TRACKS保留原工程的V1/A1/A2布局，不在空工程一次铺满十条空行。
// 只有成功落下或分离音轨才分配新轨，拖到一半取消不消耗名额。
// TrackLimits属于本次页面会话，关闭编辑器后恢复默认值，当前没有工程保存。
// 轨道ID采用正整数形式，A0、V-1和陌生前缀不能被当成合法目标。
// 模板类型只约束TypeScript，运行时入口仍需检查外部事件里的字符串。
// 判定同类时先验证目标格式，再比较前缀，不把VV1等伪编号当视频轨。
// 音频是否来自视频分离与类型无关，audioOnly片段始终属于音轨。
// 原始视频素材的hasAudio仅说明媒体里有声音，不把它自动变成音轨片段。
// 本模块只接收小型时间记录，不读取文件内容或创建播放器。
// 因此拖动时重复校验不会启动FFprobe或复制视频字节。
// 导入失败与修剪失败的恢复边界不同，修剪拒绝只返回null保留原数组。
// 纯函数不读取选中状态，避免鼠标、键盘和菜单得到不同结果。
export type TrackId = `V${number}` | `A${number}`;
export interface TrackLimits { video: number; audio: number; }
export const DEFAULT_TRACKS: readonly TrackId[] = ["V1", "A1", "A2"];
export const DEFAULT_TRACK_LIMITS: TrackLimits = { video: 5, audio: 5 };
export const isVideoTrack = (track: string) => /^V[1-9]\d*$/.test(track);
export const sameTrackKind = (first: string, second: string) => /^[VA][1-9]\d*$/.test(second) && first[0] === second[0];

// 新轨只是候选，松手成功才加入工程；取消不能留下空轨或消耗名额。
// 先计算同类条数，再查最大编号生成新身份，不能用整个轨道数组长度作V编号。
// 例如V1、A1、A2之后新增视频仍叫V2，不叫V4。
// 上限比较条数而不是最大编号，为将来允许删空轨保留正确语义。
// 如果达到上限返回null，调用方据此不绘制可投放的新轨候选。
// 提高视频名额不能改变音频名额，两种设置不共用一个数字。
// 构造结果使用新的字符串，输入数组不被push或排序。
// 该函数不决定插入显示位置，只负责能否分配以及新ID是什么。
// 调用方会在松手时重新计算，避免设置已变化却仍使用旧候选授权。
// 空数组从编号一开始，Math.max的零是编号起点，不是允许创建零号轨。
// 同类筛选与编号提取使用同一前缀，音轨数字不会影响视频编号。
// 上限由正式设置字段约束为1到20，模型不在这里悄悄改写用户设置。
// 当已有轨道多于新上限时拒绝继续新增，不删除已存在的片段。
export function nextTrack(tracks: readonly TrackId[], kind: "V" | "A", limits: TrackLimits): TrackId | null {
  const count = tracks.filter(track => track[0] === kind).length;
  if (count >= (kind === "V" ? limits.video : limits.audio)) return null;
  return `${kind}${Math.max(0, ...tracks.filter(track => track[0] === kind).map(track => Number(track.slice(1)))) + 1}`;
}

// 左边缘向右：工程start和sourceIn一起增加，保留结束时间；向左则找回源前面的帧。
// 右边缘向右：只延长end，不能超出文件剩余内容，也不改变播放速度。
// 像裁纸只收放边缘，不拉长纸上的图案；相邻片段不自动移动，不做波纹编辑。
// start/end使用工程秒数，sourceIn使用源文件秒数；两把尺子的零点不同。
// 把片段当成一条书签：工程起点是把书放在哪，源入点是从第几页开始读。
// 左边缘向右移动一工程秒，start增加一秒，sourceIn增加speed个源秒，end不变。
// 左边缘向左找回内容时，sourceIn最多退到零，不能凭空补源文件前面的帧。
// 右边缘移动只改end，不能改变起点、入点或画面变换。
// 工程边缘先换算成整数项目帧，源入点保留精度，两把尺子不能一起取整。
// 当前片段start/end本来就在项目帧上，因此round保留原工程帧的身份。
// 源文件时长可能落在半帧间，ceil沿用创建时的占位契约，不偷偷减少尾部占位。
// 最短长度是一项目帧，左边缘不能越过end减一帧，右边缘不能越过start加一帧。
// 前方障碍只取同轨且结束不晚于当前start的片段，最近的结束位置就是左边界。
// 后方障碍只取同轨且开始不早于当前end的片段，最近的开始位置就是右边界。
// 其他视频轨可以在同一时刻覆盖，不能因跨轨画面重叠而拒绝修剪。
// 音轨使用同样的时间边界，分离音轨也不能越过它引用的源内容。
// 排除只按clip.id做，不能按assetId排除，否则同源多实例会互相穿过去。
// 前方没有片段时工程零点仍是下限，不能把工程时间写成负数。
// 后方没有片段时用Infinity表示没有邻居限制，但源内容上限仍会生效。
// 右侧上限由工程起点加剩余源内容换算而来，不从当前尾部累计取整误差。
// 已用完源内容时继续向右拖会停在原边缘，不能通过改变速度伪造更长素材。
// 同时受到源与邻居限制时取更近的一侧，不能先过邻居再回弹。
// 夹限发生在共同模型，鼠标候选和键盘提交没有两套边界公式。
// 无效ID、锁轨、非有限秒数或非法帧率直接拒绝，不把错误转换成零秒。
// 锁定的判断读取当前片段所属轨道，跨轨移动后仍由新轨权限控制。
// 有效结果只换目标对象，其余片段保持原引用，源素材与构图对象没有改写。
// spread保留音频分离标记和transform，修剪不应把画面跳回中心或恢复静音状态。
// 原数组不被排序，已有层级和素材插入顺序不会因拖边缘变化。
// 不做波纹编辑：相邻片段不前移补洞，也不后退为本次延长让位置。
// 不做滚动编辑：邻居的入点和出点都保持原值。
// 不做速率伸缩：缩短只改变使用区间，不挤压视频每秒的播放速度。
// 不创建新的媒体文件，原路径和文件字节保持完整，伸回边缘仍能找回未使用部分。
// 返回null不同于空数组，调用方不能把拒绝误解释为删除全部片段。
// 左修剪的推导：旧区间从start到end，使用源从source到source加区间长度。
// 把左边缘改到position后，使用长度变为end减position。
// 为了让原结束画面不变，新的源入点必须增加(position-start)乘speed，不能把工程秒直接当源秒。
// 理论上position等于start-source/speed时源入点归零；实际向上对齐项目帧，避免读到负源时间。
// 左侧源边界使用start减source除speed，不能只夹到工程零点。
// 若前方邻居更晚结束，还必须把这条源边界推到previous。
// 左侧真正下限因此是max(previous,ceil(start-source/speed))，这里全部使用工程帧。
// 左侧上限end-1保证至少保留一项目帧。
// 右修剪的推导：已用源帧是source加(end-start)乘speed，入点与播放跨度都使用源时间。
// 源可用长度是sourceDuration减sourceIn，除speed后再对齐工程帧。
// 右边缘最高位置等于start加这段长度，左边缘调整时这条源终点不变。
// 像把原胶卷放在刻度尺后面：左边只改变露出的起始画面，胶卷没有被拉长。
// 1.37倍速的3.25秒源要占72个30fps工程帧，缩短后也必须能恢复到72帧。
// 若先把源长取整、再把剩余长度向下取整，会错误地只恢复71帧。
// ceil与素材创建、改倍速的末帧占位一致，最后不足一帧只占一格，不能再延长。
// 这个末格属于工程对齐，不会生成超出源结尾的新画面或改动播放速度。
// sourceIn在小数倍速下可能不是整数项目帧，重复取整会让左边零位移也换内容。
// 因此只将工程start/end/request取整，源入点始终按精确秒数换算。
// 若后方邻居先开始，following提供更严格右边界。
// 右侧下限start+1同样保留一帧，不允许倒置区间。
// 请求时间先round到项目帧，边界夹限后除fps回到工程秒数。
// 正放左边、倒放右边改变源区间低端；另一侧调整只改变高端。
// 两个方向都保留clip.start/end之外的属性，不丢同源实例的独立构图。
// 同一轨道已有合法非重叠是本编辑器工程不变量，模型不会在修剪时修复坏历史数据。
// 若将来接入工程文件读取，应由读取校验保证这个不变量再进入编辑流程。
// sourceDuration来自成功探测，非法元数据不能通过本函数变成合法素材。
// 这里对time/fps检查有限性是因为它们可能来自指针和键盘计算。
// edge由类型联合与内部手柄固定值提供，不来自任意JSON字符串。
// locked是当前轨道锁列表，不是素材文件只读标记，两种权限不同。
// 修剪只是非破坏引用，磁盘文件只读并不妨碍修改当前临时工程区间。
// 不在模型里弹窗或写用户提示，调用方决定就近展示原因与候选。
// clamp成功即使位置没变也可返回新目标，交互层可以保持边缘反馈。
// 返回原对象数组以外的新数组可让React观察到确认更新，不依赖原地赋值。
// 新对象中transform仍沿用同一不可变值，因为修剪没有改变其内容。
// 复制片段的transform克隆由duplicate负责，不能把这条职责混进修剪。
// 原sourceDuration保持原值，缩短工程不等于文件被裁短。
// 延长回源边界依赖保留的sourceDuration，若错误覆写会无法找回未使用帧。
export function trimClip(clips: readonly LiveTimelineClip[], id: string, edge: "start" | "end", time: number, fps: number, locked: readonly string[]): LiveTimelineClip[] | null {
  const clip = clips.find(item => item.id === id);
  if (!clip || locked.includes(clip.track) || !Number.isFinite(time) || !Number.isFinite(fps) || fps <= 0) return null;
  const frame = (value: number) => Math.round(value * fps);
  const start = frame(clip.start), end = frame(clip.end), source = clip.sourceIn * fps;
  const requested = frame(time);
  const previous = Math.max(0, ...clips.filter(item => item.track === clip.track && item.id !== id && item.end <= clip.start).map(item => frame(item.end)));
  const following = Math.min(Infinity, ...clips.filter(item => item.track === clip.track && item.id !== id && item.start >= clip.end).map(item => frame(item.start)));
  const speed = clip.speed ?? 1;
  const tail = (clip.sourceDuration - clip.sourceIn - (clip.end - clip.start) * speed) * fps;
  const before = clip.reversed ? tail : source;
  const after = clip.reversed ? source : tail;
  const still = clip.freezeTime !== undefined;
  const limit = edge === "start" ? Math.max(previous, still ? 0 : Math.ceil(start - before / speed)) : still ? Infinity : end + Math.ceil(after / speed);
  const position = edge === "start" ? Math.max(limit, Math.min(end - 1, requested)) : Math.max(start + 1, Math.min(following, limit, requested));
  const delta = position - (edge === "start" ? start : end);
  const sourceIn = still ? clip.sourceIn : clip.reversed ? clip.sourceIn - (edge === "end" ? delta * speed / fps : 0) : clip.sourceIn + (edge === "start" ? delta * speed / fps : 0);
  const updated = edge === "start" ? { ...clip, start: position / fps, sourceIn, keyframes: offsetTrimKeyframes(clip, delta) } : { ...clip, end: position / fps, sourceIn };

  return clips.map(item => item.id === id ? updated : item);
}

// 裁边是移动观看窗口，不销毁被遮住的动画；伸回去时还能读回原来的曲线。
// 像把画有刻度的胶卷从窗口后面平移：帧号一起平移，源内容不会被重新排版。
// 隐式起点补成显式点后再平移，保证原来0到第一枚标记之间的动画也能找回。
// 窗口外的负帧和尾部标记留在数据里，时间线只绘制当前窗口内的标记。
function offsetTrimKeyframes(clip: LiveTimelineClip, delta: number): ClipKeyframes | undefined {
  if (!clip.keyframes || !clip.transform || !delta) return clip.keyframes;
  const shifted: ClipKeyframes = {};
  for (const key of Object.keys(clip.keyframes) as TransformKey[]) {
    const points = clip.keyframes[key];
    if (!points?.length) continue;
    const origin = points.some(point => point.frame <= 0) ? [] : [{ frame: 0, value: clip.transform[key] }];
    shifted[key] = [...origin, ...points].map(point => ({ ...point, frame: point.frame - delta }));
  }
  return shifted;
}

// 高层先返回用于命中，渲染时反过来画；透明区域自然露出低层，不以selected排序。
// 数组先按视频轨头的物理顺序查找，返回顺序始终是上层到下层。
// 渲染使用反向顺序铺底，浏览器自然让上层的透明像素透出下层。
// contains采用半开区间，结束帧处不再同时绘制前后两个同轨片段。
// audioOnly必须排除，即使旧记录误留视频前缀也不能画一个音频占位覆盖视频。
// 某条视频轨没有覆盖当前时刻就跳过，不用该轨最近选中的片段补空白。
// 不接收selectedId，所以选择不可能在这里改变叠放优先级。
// 返回的是当前工程记录，播放器仍按sourceIn与start换算源内时间。
// 这里没有混音或媒体时钟，视觉层列表不能被描述为音频总线已经接通。
// tracks顺序来自时间线行顺序，新增视频在已有视频下方，所以新层默认是更低层。
// 即使新文件刚导入、刚拖动或刚被选中，也不能因此盖到原上层前面。
// 同轨片段在共同模型保证不重叠，因此每轨通常至多一个当前可见安排。
// 跨轨可以同时覆盖，返回多个记录是合法组合，不属于同轨冲突。
// 未包含在tracks的陌生轨道不参与输出，不能靠伪造clip.track将图层插到最高处。
// A轨即使包含video源也不画画面，因为工程安排audioOnly与素材容器类型不同。
// 输出中保留完整clip对象，CSS变换、透明度和源入点使用同一份确认数据。
// 复制过滤结果不会原地sort clips，属性选择与键盘移动依赖的稳定数组顺序保持。
// 时间恰等于end时不再命中，这和相邻片段接触合法的半开区间契约一致。
// 时间小于start不提前显示封面，不能因该层选中就突破时间覆盖条件。
// 透明度零仍返回该层供操作反馈，内容透明不等于该实例被工程删除。
// 锁轨也不排除该层，锁只保护编辑，不是可见开关。
// 新增hidden参数默认空表，保留已有纯模型和样板调用的默认可见行为。
// 过滤先按真实tracks执行，不把隐藏片段从工程clips永久移除。
// 隐藏表可含音轨ID，但视觉列表始终先识别视频轨，因此不会画出音频占位。
// 锁表刻意不作为入参，锁定和显示契约互相独立。
// 默认参数不建立共享可变数组，函数从不向hidden或tracks写值。
// 相邻同轨片段end/start接触合法，半开区间让同一时刻只出现后段。
// 跨视频轨时间重叠保留多层，不按assetId去重同源实例。
// 层序只由tracks决定，clips数组插入位置不能抬高某个实例。
// 隐藏上轨后下一可见轨自然成为最上层，不需要重写每个clip的层级。
// 显示恢复后原tracks顺序直接恢复，没有最近操作置顶副作用。
// 过滤结果仍保留独立transform与sourceIn，供共享画布和源时间映射读取。
// 每个片段以自身id区分，多份同源安排不共享可修改的变换状态。
// 本函数只选择参与者，像列出本场演员名单；什么时候开场仍由工程时钟决定。
// 演员名单不等于已经演出，真实解码就绪必须由媒体状态另行确认。
// 该纯规则可被未来离线输出消费，但本轮没有编码或输出一致性证明。
export function visualClipsAtTime(clips: readonly LiveTimelineClip[], tracks: readonly TrackId[], time: number, hidden: readonly string[] = []) {
  return tracks.filter(track => isVideoTrack(track) && !hidden.includes(track)).flatMap(track => clips.filter(clip => clip.track === track && !clip.audioOnly && time >= clip.start && time < clip.end));
}

// 候选轨放在同类轨的下边，鼠标下移就能继续落下；取消时不写进工程。
// 候选视频行插在最后一条视频轨下面、第一条音轨上面，符合向下换视频层的直觉。
// 候选音轨放在音轨组末尾，不能插进视频组改变已有层序。
// 候选与正式行复用TrackRow，所以高度、拖放校验和横向秒尺完全一致。
// 没有手势或没有名额时直接沿用原列表，不制造一条永远可见的空候选。
// 只构造显示数组，不把临时ID写进正式工程，Escape无需删除一条假轨道。
// 正式插入也采用同一分组方向，松手后片段不会突然跳到音轨下面。
export function displayTracks(tracks: readonly TrackId[], kind?: "V" | "A", limits = DEFAULT_TRACK_LIMITS): readonly TrackId[] {
  const candidate = kind ? nextTrack(tracks, kind, limits) : null;
  if (!candidate) return tracks;
  return kind === "V" ? [...tracks.filter(isVideoTrack), candidate, ...tracks.filter(track => !isVideoTrack(track))] : [...tracks, candidate];
}
