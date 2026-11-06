/** 片段构图纯计算：工程像素存事实，预览百分比只负责缩小显示。 */
import { inspectorFields, propertyField, type PropertyKey } from "./editor-property-model";
import type { EditorMediaAsset, EditorPreviewProject } from "./editor-panels";
import type { LiveTimelineClip } from "./live-timeline-model";

// 位置是整张源画面的中心，左上原点、向右向下递增，允许画面移出项目。
// 缩放百分比乘在contain基础尺寸上，不表示源文件一像素对应屏幕一像素。
// 旋转是中心周围的二维顺时针角度，和DOM坐标向下的约定一致。
// 不透明度属于当前单源画面，不把它叫作已经完成多轨混合。
// 一个片段一份数值记录；源素材和其他同源安排不共享可修改的对象。
// 关键帧只对这五个画面数值插值，不包含透视、自由变形或源文件处理。
// 参数的单位跟字段一一对应，x/y为项目px，scale/opacity为百分数，rotation为度。
// 位置可以为零和负数，不能用逻辑或把合法零换成默认中心。
// 透明度0也不是空值，必须保留为整张画面透明的明确意图。
// scale最小值沿用字段的0.01%，不允许0造成对象变成不可操作的退化点。
// 这里没有源宽高字段，源分辨率仍由素材元数据拥有，不复制到每个实例里。
// 保留的是五个数值，不持有HTMLVideoElement或Image对象，也不扣住文件句柄。
// 将来序列化需要独立工程版本规则，当前接口只属于临时渲染会话。
// 它不是跨进程类型，本轮不增加IPC通道或任意JSON写入能力。
// 工程重开后依然是空会话，值不会悄悄写进用户设置。
// 未显式传入transform的历史样板仍可显示，不能为兼容改写DEMO常量。
// X/Y使用项目像素，可表达小数位置，不随播放器的CSS宽高变成不同单位。
// 缩放100对应适配后的基础盒，缩放200使基础宽高各翻倍、面积变为四倍。
// 不透明度按百分数保存，渲染时才除100转为CSS的0到1。
// 旋转输入度数，浏览器CSS也接收deg，不引入弧度存储和二次换算。
// X/Y不会因为旋转改变参照轴，向右拖动始终增加X。
// 位置定义中心意味着修改scale不需要补偿半个旧宽高。
// 二维旋转不包含透视倾斜，不能把此类型当成任意四角网格。
// 帧率不参与空间参数，30fps和24fps素材使用同一种项目像素尺。
// 基础参数没有时间戳，关键帧另存为片段内工程帧；最终数值由共同插值器给出。
// 不同源分辨率共用项目坐标系，但各自contain基础盒不同。
// 项目边界之外仍是有效位置，裁边只改变可见像素，不改保存的中心。
// 允许极小缩放是数值能力，不保证屏幕上始终容易用鼠标抓取。
// 极小或全透明对象仍可通过属性重置恢复，操作层不随透明度消失。
// 类型本身不决定媒体可编辑，模型仍需检查素材类别和轨道锁。
// transform对象不能放回共享素材条目，否则两个同源片段将被迫使用同一构图。
export interface ClipTransform { x: number; y: number; scale: number; rotation: number; opacity: number; }
export type TransformKey = keyof ClipTransform;
export interface TransformKeyframe { frame: number; value: number; }
export type ClipKeyframes = Partial<Record<TransformKey, TransformKeyframe[]>>;
export const TRANSFORM_KEYS: readonly TransformKey[] = ["x", "y", "scale", "rotation", "opacity"];

// 关键帧按片段内的工程帧存储，移动片段不会把动画留在原来的绝对秒数。
// 起始构图是隐式的第0帧；显式关键帧之间做线性插值，末值保持到片段结束。
// 像路线上标有里程的路牌，先找包住当前帧的两块牌，再按距离求中间值。
// 这里的距离是工程帧差，不是源帧差；倒放不会把构图动画也偷偷倒过来。
// 例如基础X=960、第30帧X=1200，第15帧显示1080。
// 显式第0帧可以覆盖基础值；没有动画的其他字段继续采用自己的基础值。
// 一个字段到达最后一枚关键帧后保持末值，不绕回起点，也不推算未指定的趋势。
// 返回独立五值对象供画布和属性读取，求值过程不修改基础值或关键帧数组。
export function evaluateTransform(base: ClipTransform, keyframes: ClipKeyframes | undefined, frame: number): ClipTransform {
  const value = { ...base };
  for (const key of TRANSFORM_KEYS) value[key] = evaluateValue(base[key], keyframes?.[key] ?? [], frame);
  return value;
}

// 无关键帧时沿用基础值；第一枚关键帧之前从片段起始构图平滑过渡。
// 这像两张透明胶片之间逐格淡变，不跳到下一数值后又突然弹回。
// 排序使用副本，避免读取一次动画就改变原工程数组和撤销快照。
// 精确落在关键帧时采用该点值，继续向下一点插值时以上一命中点为起点。
// 旋转同样按数值走：350到370经过360，不自动改为绕远路的350到10。
// 这套算法只提供线性动画，没有速度曲线、贝塞尔手柄或自动缓入缓出。
function evaluateValue(base: number, points: readonly TransformKeyframe[], frame: number) {
  const sorted = [...points].sort((a, b) => a.frame - b.frame);
  let previous = { frame: 0, value: base };
  for (const next of sorted) {
    if (frame < next.frame) return interpolate(previous, next, frame);
    previous = next;
  }
  return previous.value;
}

function interpolate(from: TransformKeyframe, to: TransformKeyframe, frame: number) {
  if (to.frame <= from.frame) return to.value;
  const progress = Math.max(0, Math.min(1, (frame - from.frame) / (to.frame - from.frame)));
  return from.value + (to.value - from.value) * progress;
}

// 同一字段同一帧至多一枚标记，再点一次删除；别的字段和帧不受影响。
// 锁轨、帧号或数值非法时返回null，调用者不写历史也不改旧片段。
// 帧号相对片段起点，片段移动到另一秒不会要求改写所有标记。
// 终点不属于片段，四秒30fps允许0至119帧，120帧不能添加标记。
// 删除最后一枚点后移除该字段动画，恢复使用基础值，不留下空动画假状态。
// 某字段取消标记不会清掉其他字段；X与不透明度可在同一帧各有自己的值。
// 新点先通过同一属性范围校验，不能用菱形绕过输入框对NaN或越界值的保护。
export function toggleTransformKeyframe(clips: readonly LiveTimelineClip[], id: string, key: TransformKey, frame: number, value: number, project: EditorPreviewProject, locked: readonly string[]) {
  const clip = clips.find(item => item.id === id);
  if (!clip || clip.audioOnly || locked.includes(clip.track) || !Number.isInteger(frame) || frame < 0 || frame >= Math.round((clip.end - clip.start) * project.fps) || !TRANSFORM_KEYS.includes(key)) return null;
  const field = propertyField(key);
  if (!Number.isFinite(value) || value < field.min || value > field.max) return null;
  const points = clip.keyframes?.[key] ?? [];
  const exists = points.some(point => point.frame === frame);
  const nextPoints = exists ? points.filter(point => point.frame !== frame) : [...points, { frame, value }].sort((a, b) => a.frame - b.frame);
  const keyframes = { ...clip.keyframes, [key]: nextPoints };
  if (!nextPoints.length) delete keyframes[key];
  return clips.map(item => item.id === id ? { ...item, keyframes: Object.keys(keyframes).length ? keyframes : undefined } : item);
}

// 像把照片完整放进相框，先保持比例找到能容纳整张照片的最大尺寸。
// 这就是100%的基础适配尺寸；横竖源都有同一种解释，不预先裁掉边缘。
// 640×360放进1920×1080得到1920×1080；360×640得到607.5×1080。
// 宽高取真实源元数据，不能把素材卡片缩略图的尺寸当作源分辨率。
// 无效分辨率返回项目比例的安全布局，探测失败的源仍由播放器报告不可用。
// 返回的是项目像素，不包含窗口尺寸、系统DPR、导航宽度或画布黑边。
// 缩放50%会把这里的宽高各减半，不改变项目宽高或视频解码分辨率。
// 基础适配使用两个比值的较小者，这与铺满并裁边的cover策略不同。
// 源长宽比不等于项目长宽比时，一侧会留黑边，但实际画面本身不拉伸。
// 比如竖片在横项目内，黑边属于项目画布，不属于可拖动画面。
// 点击黑边不应被当成抓取竖片，命中层采用基础画面尺寸而非整个frame。
// 放大之后可能覆盖并越过项目边界，裁切由预览内容层完成而不是改变源尺寸。
// 100%不是源文件原始像素大小，因此小分辨率源也可能被适配放大。
// 用户若想让640宽源在1920工程占640宽，可设缩放约33.33%。
// 这只是构图显示大小，不做超分、不添加像素，也不改变ffprobe探测结果。
// 预览窗口缩小时仍先计算项目基础宽高，再按frame同比缩小。
// 不能先把源适配到屏幕，再把屏幕宽度存进transform，否则换窗口构图就漂移。
// 参数验证只负责避免NaN和除零，不把素材元数据的错误伪装为解码成功。
// 没有宽高时采用项目比例供占位布局，真实媒体可用性仍归导入和播放器判断。
// 默认项目宽高由正式工作区常量提供，必须保持正数才能建立有效画布。
// 如果未来允许修改项目尺寸，需明确已有中心坐标如何迁移，不能由此函数偷偷决定。
// 本方法没有缓存，源或项目参数变更后直接得到新基础尺寸，不持有旧DOM测量。
// 基础适配与旋转分开，旋转90度不会自动交换源尺寸并重新contain。
// 否则每次改变角度都可能突然缩小图片，违背固定缩放比例的操作预期。
export function fittedSize(width: number, height: number, project: EditorPreviewProject) {
  const valid = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
  const factor = valid ? Math.min(project.width / width, project.height / height) : 1;
  return { width: valid ? width * factor : project.width, height: valid ? height * factor : project.height };
}

// 默认中心随项目定义计算，不能把1920工程的960写死给竖屏项目。
// 每次返回独立对象，重置一个片段不会改变模块级模板或另一个安排。
// 省略覆盖值的旧片段按同一默认值解释，兼容静态样板和已有临时工程。
// 源像素尺寸只参与基础适配，不参与中心坐标，因此换源分辨率不改变默认中心。
// 角度零、透明度100和缩放100是一组明确的无额外变换，不是未处理完成标志。
// 重置返回项目中心而非源中心，竖片和横片处于同一工程时中心相同。
// 项目1920×1080的坐标范围以左上角为原点，但允许画面中心移出该范围。
// 位置取画面中心，避免用户缩放后X/Y突然因为左上角移动而改变含义。
// 默认旋转零保持源朝向；视频探测的显示宽高需要由素材适配先处理好。
// 默认透明度100意味着当前单层画面不额外变暗，不宣称任何混音或图层混合完成。
// 每次返回新对象还能保护复制后的记录，后续字段更新不复用同一可变模板。
// 调用此函数不会建立轨道、选择素材或播放媒体，显示默认值没有业务副作用。
export function defaultTransform(project: EditorPreviewProject): ClipTransform {
  return { x: project.width / 2, y: project.height / 2, scale: 100, rotation: 0, opacity: 100 };
}

// UI字段、画布拖动和重置最终都走这个入口，不能只在disabled外观上保护锁。
// patch是局部变更，未提供的值保留当前片段确认值，不回落成其他片段的默认值。
// 键经过白名单，速度和淡入淡出即使误调用此处也不能被写成“已生效”。
// 范围和小数精度复用检查器字段定义，拖动和输入不能各自采用一套限制。
// 先验证整份patch再返回新数组，X合法Y非法时不能留下半次位置提交。
// 音轨引用原视频也仍是音频安排，没有画面变换，拒绝给它写X/Y。
// 素材存在且类型为视频或图片才可提交，未知ID不能默认修改第一项。
// 不接时间参数，所以构图提交不会改变start/end、sourceIn或工程时长。
// 返回null表示拒绝，调用者保留旧快照，不用空数组把已有工程清掉。
// 校验先定位稳定ID，两个文件名完全相同也不会选错片段实例。
// 再根据assetId找到真实媒体类别，不能用.mp4等后缀代替视频/图片/音频类型。
// 独立音轨虽然仍指向视频源文件，但audioOnly标记让它没有画面变换权限。
// 锁表以轨道ID判断，不以当前工具栏高亮或属性名称推断锁定。
// 源锁在每次提交重查，菜单曾经打开或字段曾经可用都不构成持续授权。
// 字段范围来自inspectorFields，因此坐标、缩放和不透明度不能共享一个笼统的0到100限制。
// 旋转保留累计度数，360不自动归零，用户输入和字段显示保持同一种解释。
// 数值先检查有限性再取精度，否则Infinity.toFixed不会成为合法布局数值。
// 圆整到字段精度后生成确认记录，避免指针反复来回积累不可读的浮点尾数。
// 输入的patch对象不被修改，事件层仍可保留原候选用于取消和测试对照。
// 原clip对象也不被修改，正在渲染旧快照的预览不会半途读到另一个构图。
// 没有修改的其他实例原样保留，避免输入X时导致所有视频播放器重装源。
// 新transform是完整五个值，哪怕只提交X，也保留此前缩放、角度和透明度。
// 这比保存一份DOM矩阵更易解释，也不会把CSS transform字符串作为工程契约。
// 不接sourceUrl意味着此处没有磁盘访问、上传或媒体重编码权限。
// 不接start/end补丁意味着构图不会绕过已有时间轴碰撞和锁定规则。
// 失败返回null时不携带半成品数组，调用方只有成功才替换当前clips。
// 如果其中一项非法，前面暂存的数值只留在局部next对象，不会先写回源记录。
// 空patch没有新的效果意图，但仍必须验证身份、媒体类型和锁，不能成为绕过入口。
// 复制后的对象使用相同数值是正确继承，独立更新依靠新clip.id与新transform对象保证。
// 后续多轨合成应消费这组项目值，不能以当前选中对象的DOM顺序推断层级。
// 导出尚未接通，本方法不声称这些参数已经写入任何输出文件。
export function updateClipTransform(clips: readonly LiveTimelineClip[], assets: readonly EditorMediaAsset[], id: string, patch: Partial<ClipTransform>, project: EditorPreviewProject, locked: readonly string[]) {
  const clip = clips.find(item => item.id === id), asset = assets.find(item => item.id === clip?.assetId);
  if (!clip || clip.audioOnly || !asset || asset.kind === "audio" || locked.includes(clip.track)) return null;
  const fields = inspectorFields([{ id, asset, duration: clip.end - clip.start }]);
  const next = { ...(clip.transform ?? defaultTransform(project)) };
  for (const [name, value] of Object.entries(patch)) {
    if (!TRANSFORM_KEYS.includes(name as TransformKey)) return null;
    const field = fields.find(item => item.key === name);
    if (!field || typeof value !== "number" || !Number.isFinite(value) || value < field.min || value > field.max) return null;
    next[name as TransformKey] = Number(value.toFixed(field.precision));
  }
  return clips.map(item => item.id === id ? { ...item, transform: next } : item);
}

// 字段键属于更大的检查器集合，这个守卫只允许五个真实画面参数进入构图命令。
// 返回类型让调用方安全构造Partial，而不是用any跳过速度/音量能力判断。
// 重置组同样过滤这些键，不能顺带启用还没有接入的媒体处理效果。
export function isTransformKey(key: PropertyKey): key is TransformKey { return TRANSFORM_KEYS.includes(key as TransformKey); }

// 已启用动画的字段在当前帧落点，未启用的字段仍修改整段基础构图。
// 保留基础值很重要：在后面的帧改数值不能让前面的画面一起跳到新位置。
// 先走公共构图校验得到合法精度，再决定把值写到基础记录还是当前帧。
// 当前帧已有点就替换，没有点则插入；不会在同帧堆两个互相冲突的数值。
// 同一补丁里没有改的动画字段保持原曲线，不因修改X而重算Y。
// 已启用动画但播放头位于片段之外时拒绝，避免产生不可见的越界标记。
// 没启用动画的字段不需要当前帧落点，修改仍影响整段基础构图。
// checked只是本地候选，任何后续验证失败都不返回它，保持提交的原子性。
export function updateAnimatedTransform(clips: readonly LiveTimelineClip[], assets: readonly EditorMediaAsset[], id: string, patch: Partial<ClipTransform>, project: EditorPreviewProject, locked: readonly string[], time: number) {
  const checked = updateClipTransform(clips, assets, id, patch, project, locked);
  const old = clips.find(clip => clip.id === id), next = checked?.find(clip => clip.id === id);
  if (!checked || !old || !next || !next.transform) return null;
  const frame = Math.round((time - old.start) * project.fps), keyframes = { ...old.keyframes };
  const transform = { ...next.transform };
  for (const key of TRANSFORM_KEYS) {
    if (patch[key] === undefined || !old.keyframes?.[key]?.length) continue;
    if (time < old.start || time >= old.end) return null;
    keyframes[key] = [...old.keyframes[key]!.filter(point => point.frame !== frame), { frame, value: next.transform[key] }].sort((a, b) => a.frame - b.frame);
    transform[key] = (old.transform ?? defaultTransform(project))[key];
  }
  return checked.map(clip => clip.id === id ? { ...clip, transform, keyframes } : clip);
}

// 旋转整段包含它的角度动画，不能只改会被关键帧覆盖的基础值。
// 全曲线加相同角度保留绕圈方向，不对每个点独立取模造成359到0的反向跳转。
// 接近字段上限时整批拒绝，而不是截掉一部分动画点。
export function visualClipEdit(clip: LiveTimelineClip, action: "mirror" | "rotate"): LiveTimelineClip | null {
  if (clip.audioOnly) return null;
  if (action === "mirror") return { ...clip, mirrored: !clip.mirrored };
  if (!clip.transform) return null;
  const points = clip.keyframes?.rotation;
  if (clip.transform.rotation + 90 > 36000 || points?.some(point => point.value + 90 > 36000)) return null;
  const keyframes = points ? { ...clip.keyframes, rotation: points.map(point => ({ ...point, value: point.value + 90 })) } : clip.keyframes;
  return { ...clip, transform: { ...clip.transform, rotation: clip.transform.rotation + 90 }, keyframes };
}

