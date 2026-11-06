/** 属性展示模型：从片段、项目和明确覆盖值组合字段，不把样例参数写进正式工程。 */
import type { EditorMediaAsset, EditorPreviewProject } from "./editor-panels";
import type { ClipKeyframes } from "./clip-transform-model";

// 本模块接收的是检查器目标，不把素材库的一行直接当作工程片段。
// 同一素材在时间线上可以安排两次，两次的id和安排时长都可能不同。
// asset只提供媒体类别和显示信息；duration由该次安排的end-start取得。
// 因此改变素材列表的高亮不应该重新生成这里的目标集合。
// 正式宿主只在片段选中变化后适配目标，样板则从演示选择生成目标。
// 数据适配放在边界，可以让检查器不认识导入批次、拖动载荷和文件系统。
// 这里的类型没有DOM引用，也没有播放器实例，读取默认值不会开始解码。
// 默认值是展示约定，不是已应用滤镜或已完成转码的证明。
// 后续接入真实效果时，需要另行确定效果存储和预览提交契约。
// 不能因为输入框已能编辑，就把样板覆盖值搬到正式工程当作完成效果。

// values 只保存对象已经确认的覆盖值，没有值时读取项目约定的默认值。
// 就像表格中留空表示沿用模板，不能把模板数值伪装成已经处理过的效果。
// 正式片段的五种画面变换已由宿主适配为values，其他效果仍只读默认值。
// 样板可以持有自己的覆盖值，验证输入而不改变真实片段或源文件。
export type PropertyKey = "scale" | "x" | "y" | "rotation" | "opacity" | "speed" | "volume" | "fadeIn" | "fadeOut" | "duration";
export type PropertyValues = Record<PropertyKey, number>;
// 完整PropertyValues适合表示一份默认参数，目标上的Partial只记录覆盖部分。
// 例如只改缩放的对象无需复制一份项目中心，切换项目尺寸时仍能读到正确默认位置。
// undefined代表没有覆盖；零是有意义的值，例如完全透明或没有淡入。
// 后面用空值合并而不用逻辑或，避免把合法零误替换为默认值。
// values不能存字符串“—”，混合状态由比较过程单独报告。
// 类型允许未来调用方带确认值，但这个模块不负责给未知外部JSON做安全校验。
// 当前样板写入来自同一个数值字段的有限数字，正式目标不传效果覆盖。
// 片段身份使用id，不用文件名；重名素材不会互相覆盖检查器状态。
export interface InspectorTarget { id: string; asset: EditorMediaAsset; duration: number; values?: Partial<PropertyValues>; keyframes?: ClipKeyframes; }
export interface PropertyField { key: PropertyKey; unit: string; min: number; max: number; precision: number; }

// 数值精度与单位在字段定义处共用，视频与图片不各写一套 X/Y 输入规则。
// 位置以项目像素表达画面中心，默认中心由项目尺寸决定，与预览 CSS 尺寸无关。
// 限制只在提交时检查，输入负号、小数点和第一位数字都属于合法草稿过程。
// 时长上限不是源探测事实；图片样板允许设置安排长度，正式工作区仍禁止编辑。
// 淡入淡出上限随后按最短选中片段限制，不能只用一个固定30秒样例上限。
// 字段范围是输入与纯模型共同遵守的约定，不是只有表单显示的建议。
// 速度0.25–4保证本轮实际HTML媒体预览可以按映射执行，不接受负倍速假倒放。
// 两位精度允许1.25等手动值，不把手动输入限制为几个预设档位。
// 项目位置以像素计，缩放与透明度用百分比，速度则是无量纲倍率。
// 字段的min/max在提交时生效，不能在onChange抢先把用户第一位数字矫正掉。
// 图片时长与视频速度使用不同键，不能把静态图片套入视频源时钟。
// 音频没有画面构图字段，分离后不会遗留X/Y或旋转输入。
// 多选采用字段交集，混合值只能通过明确统一提交改变，不把首项值当全部。
// 默认值只提供缺省来源，正式片段已有确认值时必须优先读取该值。
// 淡入淡出范围仍随片段时长派生，UI定义不意味着真实效果已经接通。
const FIELDS: Record<PropertyKey, PropertyField> = {
  // 正式构图以100为contain基础适配尺寸，最小值大于零，避免退化平面。
  // 放大只改变单源显示几何，不提高解码分辨率；过大部分由项目边界裁切。
  // 两位精度是提交显示规则，不是在每个按键时把草稿强行补成两位。
  scale: { key: "scale", unit: "%", min: .01, max: 10000, precision: 2 },
  // X以项目左边为零；允许负位置，为将来的画面移出画布保留表达能力。
  // 单位px指项目像素，预览容器宽度和系统DPR都不能参与默认坐标计算。
  // Y同理采用项目顶部为零，默认画面中心在项目高度的一半。
  // 正负十万是有限输入边界，防止无穷数进入以后的位置计算。
  x: { key: "x", unit: "px", min: -100000, max: 100000, precision: 2 },
  y: { key: "y", unit: "px", min: -100000, max: 100000, precision: 2 },
  // 旋转保留累计角度，输入360不被悄悄改写成零，当前仅验证表单契约。
  // 不透明度零与一百都有效，分别表示透明和完整可见的参数含义。
  // 样板改变这些数字不改变视频标签的CSS，也不声称正在执行画面变换。
  rotation: { key: "rotation", unit: "°", min: -36000, max: 36000, precision: 2 },
  opacity: { key: "opacity", unit: "%", min: 0, max: 100, precision: 1 },
  // 速度用倍率显示，默认一倍；不能把百分数100直接交给倍率字段。
  // 音量可表达超过原声的目标值，实际限幅和混音留给未来音频处理任务。
  // 这两项的最大值不同，不能仅因都是数字输入就共用一套范围。
  speed: { key: "speed", unit: "×", min: .25, max: 4, precision: 2 },
  volume: { key: "volume", unit: "%", min: 0, max: 400, precision: 1 },
  // Infinity只在配置中充当待收窄上界，真实输入仍必须是有限数字。
  // 后面的选择适配会把淡入淡出最大值换成最短安排长度。
  // 淡入和淡出各自不能长过片段；两者之和的效果策略尚未接入。
  // 不在这里凭空实施交叉淡化或调整别的片段来满足某个值。
  fadeIn: { key: "fadeIn", unit: "s", min: 0, max: Infinity, precision: 2 },
  fadeOut: { key: "fadeOut", unit: "s", min: 0, max: Infinity, precision: 2 },
  // 图片本身没有源播放长度，时长字段指它在工程中被安排多久。
  // 一天上限属于样板输入保护，不会反向写成图片探测的媒体事实。
  // 视频源时长不会复用这个可编辑字段，避免让UI看似具备修剪能力。
  duration: { key: "duration", unit: "s", min: .01, max: 86400, precision: 2 },
};

// 业务模型与数值控件共用同一字段范围，关键帧不能绕过属性校验。
export function propertyField(key: PropertyKey): PropertyField { return FIELDS[key]; }
// 共有字段取交集：视频和图片能共同调整变换，视频和音频只能共同展示淡入淡出。
// 不取并集，否则图片会出现音量、音频会出现没有意义的画面位置。
// 分离音轨的 asset.kind 由正式宿主适配成 audio，不由文件扩展名猜测。
const KIND_FIELDS = {
  video: ["scale", "x", "y", "rotation", "opacity", "speed", "fadeIn", "fadeOut"],
  image: ["scale", "x", "y", "rotation", "opacity", "duration"],
  audio: ["volume", "fadeIn", "fadeOut"],
} satisfies Record<EditorMediaAsset["kind"], PropertyKey[]>;

// 交集的顺序沿用首种媒体的字段顺序，布局不会因为选中顺序随机打散分组。
// 两视频能共同展示速度和画面变换，因为它们属于相同有效字段集合。
// 视频加图片只能展示画面变换，视频速度不适用于静态图片。
// 视频加音频只保留淡入淡出，不给音频显示画面中心。
// 图片加音频没有共同字段，外壳会显示没有共有属性的说明。
// 三种类型一起选也可能没有共有字段，空交集不是探测失败。
// 这里不按文件后缀分类，分离出的音轨仍可能引用原来的mp4文件。
// 当前适配后的asset.kind是有效依据，避免音轨意外出现缩放字段。
// satisfies检查配置覆盖每种媒体，但不会把数组中的字段键扩大成任意字符串。
// 新媒体类型若要加入，需要显式决定字段集合，而非默认借视频整套属性。

// 默认值来自工程坐标和对象安排长度，不读取另一个对象的草稿。
// 源视频帧率不改变项目中心，移动片段也不改变画面 X/Y。
// 覆盖值最后合并，明确区分默认来源与样板已确认值。
// 本函数没有写入、解码或保存副作用，可供重置与显示共同调用。
export function propertyDefaults(target: InspectorTarget, project: EditorPreviewProject): PropertyValues {
  return { scale: 100, x: project.width / 2, y: project.height / 2, rotation: 0, opacity: 100, speed: 1, volume: 100, fadeIn: 0, fadeOut: 0, duration: target.duration };
}

// 1920×1080工程中心为960、540；1080×1920工程应改为540、960。
// 这两个例子是项目坐标，不能依据画布在屏幕上的600px宽来返回300。
// 默认duration来自目标，不来自整个工程最大end，十秒图片不是三十秒项目。
// 重置调用这个函数逐个目标计算，所以不同长度对象可以恢复不同默认时长。
// 重置后的混合显示仍有可能存在，这是来源不同而非重置失败。
// 工程没有选中片段时不应创建虚构target来凑这些参数。

// 混合判断比较确认后的数值，不比较格式化文本，1和1.00视为同一数值。
// 返回首项只作为字段代表值，mixed=true 时输入必须显示横线而不是首项。
// 空选择不会到这里，外层用项目参数视图表达没有片段的状态。
// 不把混合值写成NaN，避免校验、精度格式化和范围组件收到无效数字。
export function propertyValue(targets: readonly InspectorTarget[], project: EditorPreviewProject, key: PropertyKey) {
  const values = targets.map(target => target.values?.[key] ?? propertyDefaults(target, project)[key]);
  return { value: values[0] ?? 0, mixed: values.some(value => value !== values[0]) };
}

// 比较后的代表值和mixed是两个独立信息，数值100与混合的首项100不能等价。
// 公共输入框收到mixed后保留空文本和横线占位，不让用户误读首项为统一结果。
// 主动输入100仍须通知整个选择集合，不能因为代表值也为100而跳过其他对象。
// 尚未输入直接失焦则没有统一意图，不应替全部对象填入零。
// 浮点比较针对已确认数值；显示精度不参与比较，避免格式化文本隐藏真实差异。
// 本函数只读目标，不会替任何对象补写默认参数，调用多次仍没有数据迁移副作用。

// 淡入淡出上限取最短片段，统一输入不能超过其中任意一个安排。
// 字段定义复制后再调整，不能污染下一个样板或另一类型的最大值。
// 这里返回展示与校验参数，不负责改变源时长或实际音视频处理。
export function inspectorFields(targets: readonly InspectorTarget[]): PropertyField[] {
  if (!targets.length) return [];
  const keys = KIND_FIELDS[targets[0].asset.kind] as PropertyKey[];
  return keys.filter(key => targets.every(target => (KIND_FIELDS[target.asset.kind] as PropertyKey[]).includes(key)))
    .map(key => ({ ...FIELDS[key], max: key === "fadeIn" || key === "fadeOut" ? Math.min(...targets.map(target => target.duration)) : FIELDS[key].max }));
}

// 例如选中三秒和八秒两段，统一淡入上界是三秒，而不是八秒或工程总长。
// 拷贝定义后换max，保护模块常量不被这一轮多选污染。
// 如果直接原地改FIELDS，随后单选四十秒对象也会残留上次三秒上限。
// 返回空数组有两个合法原因：没有目标，或所有目标没有公共字段。
// 两种文案在检查器外壳按选择数量区分，不让纯模型携带翻译或显示组件。
// 结果保留key，UI以key定位回调，不能以翻译后的标签猜测效果种类。

// 分组只决定字段排列，不让 UI 根据翻译文字推断写入哪种业务。
// 两类淡入淡出共用同一组键，目标与写入回调仍由检查器调用方拥有。
export function propertyGroup(key: PropertyKey) {
  return key === "fadeIn" || key === "fadeOut" ? "fades" : key === "speed" ? "playback" : key === "volume" ? "volume" : key === "duration" ? "duration" : "transform";
}
