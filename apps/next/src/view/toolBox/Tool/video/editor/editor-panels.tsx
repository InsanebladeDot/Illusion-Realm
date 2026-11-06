"use client";

// R02–R04 只负责上区的独立展示，不导入 useClipEditor 或 FFmpeg 服务。
// 旧 PreviewStage 绑定真实源视频事件和 trim，本轮不改它与 GIF 共用的契约。
// 样板仍映射静态封面；正式单源时钟和解码通过插槽注入，节目合成未接入。
// 素材列表和属性面板各自滚动，节目预览保留固定的标题与走带控制条。
// 静态图片与真实视频共用ClipCanvas的项目几何，媒体解码各由原适配负责。
// ProgramPreview仍负责frame尺寸，不让源宽高把整个预览容器撑变形。
// 图片节点保留原来的缺图与onError处理，构图不能把坏图改报成成功。
// 源查看分支继续返回原始图片节点，避免把片段的X/Y带回素材库。
// 节目图片分支才包裹构图层，调用者可以只读显示已确认变换。
// 没有编辑回调时不创建操作按钮，样板查看不冒充正式工程编辑。
// 传给真实媒体的surface槽仍优先，不在公共容器额外挂一个封面播放器。
// 这保证视频首帧成功后画面来自video，静态封面不覆盖真实帧。
// 基础图片尺寸优先真实元数据，其次构建期静态资源尺寸。
// 封面只是URL字符串时不能从文件名推测源分辨率。
// picture几何采用项目比例，不继承素材卡片的裁切样式。
// 单源透明度让黑色项目底透出，这只是当前片段效果，不是多个视频相互混合。
// 选框不放在NextImage内部，图片加载和交互焦点不互相控制。
// 缺素材引用仍走现有missing状态，不默认使用DEMO第一张图片补位。
// 同一ProgramPreview继续服务正式视频、独立图片样板和素材查看。
// 因此公共标题和控制条的改动无需三个调用场景分别维护。
// 真实图片导入尚未接通，当前图片能力是模型和共享渲染支持。
// 自动图片样例只验证构图几何，不声称已经完成用户磁盘图片导入。
// 图片没有音轨或播放进度，构图层也不能替它生成假时间事件。
// 真实视频的播放时钟仍由LiveSourcePreview拥有，不移到图片展示组件。
import { MediaLibraryTabs, type LibraryCategory } from "./media-library-tabs";
import { LayoutGrid, List, Plus } from "lucide-react";
import { ClipCanvas, type CanvasEdit } from "./clip-canvas";
import type { ClipTransform } from "./clip-transform-model";
import Image, { type StaticImageData } from "next/image";
import { useState, type ReactNode, type DragEvent } from "react";
import type { VideoProbeResult } from "@/types/electron-api";
import { EditorPlaceholder } from "./editor-controls";
// 图标包含音视频类型与实际动作，音频不借用“可见”图标表达静音。
// 所有未接通动作复用 EditorAction，不额外创建可点击的伪菜单。
// 装饰图标用 aria-hidden，让文件名和文本标签承担可访问含义。
import { AudioLines, Camera, ChevronDown, ImageIcon, Play, Search, SkipBack, SkipForward, Upload, Video } from "lucide-react";
import { useTranslation } from "@/i18n";
// 默认资源来自演示模块，正式调用方显式注入真实数组和项目参数。
// 素材行用联合类型约束媒体种类，静态封面可以为空但名称始终存在。
// 行只接收静态图片或已生成的小封面，不直接读取用户视频路径。
import { DEMO_ASSETS, DEMO_PROJECT } from "./editor-demo";
import { EditorAction } from "./editor-chrome";
import styles from "./editor.module.css";
import { formatEditorTimecode } from "./editor-timecode";
// 素材时长复用旧视频工具的分秒格式；它是源总长，不随片段修剪或倍速改变。
// 未知时长不补零，只有已探测出的数字才显示在封面右上角。
// 超过一小时自动带小时位，不能用截取字符串丢掉长素材的真实时长。
import { formatTime } from "@/utils/video/time";

// 音频行、时间轴音频片段共用同一个占位图形，减少两套伪波形样式。
// 这里绘制的对称竖线只是视觉占位，不从任何音频读取采样值。
// aria-hidden 防止读屏把装饰线当作需要逐项阅读的音频采样数据。
// 规律长度用于稳定截图，不使用 Math.random 导致服务端与客户端不一致。
// 图形继承 currentColor，主题切换只改变容器颜色而不染节目画面。
// width/height 交给容器，素材行与片段可以用同一 DOM 适配不同宽度。
// wave 的坐标固定，不参与工程秒数到时间轴宽度的换算。
// 后续真实波形接入时替换此内容组件，不改素材或片段的外壳几何。
export function DemoWaveform() {
  // viewBox 中点为 16，每根竖线围绕中点摆放，不对应实际声道数。
  // preserveAspectRatio=none 只伸展装饰波形，不作用于节目图片。
  // SVG 不生成 base64 图片副本，两个音频素材和两个轨道可以共享同一内容模板。
  // strokeLinecap 的圆头使小尺寸音频封面仍可辨认，深色不需换另一张贴图。
  return <svg viewBox="0 0 120 32" preserveAspectRatio="none" className={styles.waveform} aria-hidden="true"><path d="M3 14v4m5-9v14m5-11v8m5-15v22m5-17v12m5-19v26m5-17v8m5-11v14m5-20v26m5-22v18m5-12v6m5-14v22m5-25v28m5-19v10m5-14v18m5-22v26m5-18v10m5-14v18m5-12v6m5-17v28m5-20v12m5-9v6m5-12v18m5-15v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
}

// 同一个素材行同时呈现视频、图片、配音与音乐，尺寸与截断规则只维护一份。
// 这里只改变素材选择，点击不会暗中修改片段属性或节目画面。
// duration=null 的图片不显示秒数，避免误把时间轴实例长度当成源时长。
// Next Image 复用项目已有图片组件链路，静态导出不引入图片处理服务。
// 每张封面占用相同槽位，无封面的音频用明确波形图形而非破损图片。
// 名称拥有 title，长文件名只在视觉上省略，完整名称仍可查看。
// 列表保留细框和浅底，卡片只在封面画细框；aria-current始终跟随调用方状态。
// 素材行不是时间轴按钮，未来 onSelect 只通知素材区，不自动控制播放头。
// 未接通原因沿用共享词条，不输出测试脚本或内部技术信息。
// 原生按钮支持键盘选择；加载或错误行禁用，不产生假文件导入。
// id 用作 React key，列表排序变化后不会复用另一素材的 DOM 身份。
// 字段参数只传当前素材，不把整个全局 store 注入行组件。
// 素材描述只承载行需要的信息，不包含时间轴位置或片段属性。
// 同一个源素材可以被多个片段引用，不能把片段 ID 填进这里的 id。
// name 是显示与搜索的原始文件名，搜索时不修改这个值。
// kind 来自已知演示数据，不通过后缀猜测媒体是否可播放。
// duration 为 null 表示没有源时长，图片不会因此多出一个虚构秒数。
// cover 同时支持打包静态图片与导入适配器生成的小封面，不读取整个视频。
// state 可随素材内容注入，让正式面板和样板复用同一行。
// 缺封面仍可选择，探测中和不可用行则保持禁用。
// 行状态不自动推进，也不代表已经执行了真实媒体探测。
// 这份接口不带删除、导入或播放方法，避免展示组件获得业务副作用。
// readonly 数组可由外部传入，面板不会改写调用方的素材对象。
// 新增状态字段是可选的，UI-02 的已有调用仍默认 ready。
// 独立 state 参数保留兼容性，显式传入时覆盖素材自带状态。
// 这样异常夹具无需复制一份带特殊样式的素材行。
export interface EditorMediaAsset {
  id: string;
  name: string;
  kind: "video" | "image" | "audio";
  duration: number | null;
  cover: StaticImageData | string | null;
  state?: "ready" | "loading" | "missing" | "error" | "cancelled";
  sourcePath?: string;
  sourceUrl?: string;
  metadata?: VideoProbeResult;
  notice?: string;
}
export function MediaItem({ layout = "list", asset, selected = false, onSelect, state = asset.state ?? "ready", onDragStart, onDragEnd }: { layout?: "list" | "cards"; asset: EditorMediaAsset; selected?: boolean; onSelect?: () => void; state?: EditorMediaAsset["state"]; onDragStart?: (event: DragEvent<HTMLButtonElement>) => void; onDragEnd?: () => void }) {
  // 视频的小摄像图标与图片山景图标来自明确 kind，防止把 png 当成有时长视频。
  // 音频同用 AudioLines，不根据 voice/music 名称猜测是否内嵌视频。
  // alt 为空是因为相邻文件名已标识素材，避免一行被读屏重复念两遍。
  // fill 的父容器有已知比例和 position:relative，不会先塌陷再加载跳动。
  // 每个媒体只创建一个封面槽，缺封面不会再留一个空图片重叠加载。
  // duration 使用显式 null 判断，合法的零秒探测结果未来也不会被误当成图片。
  // `s` 为数值单位符号，媒体类型文字本身由 i18n 负责。
  // asset.id 不拼进文件路径，不存在把用户输入转成任意磁盘读取的路径。
  const { t } = useTranslation();
  const [failedCover, setFailedCover] = useState("");
  // 波形只属于音频，图片或视频没有封面时不能用波形冒充预览。
  // 缺图仍可选择；读取中和不可用素材才由下方按钮规则禁用。
  // 失败按 URL 记忆，后续同一行换封面后可以加载新图。
  // 显式 loading/error 优先于封面判断，错误素材不能被降级为普通缺图。
  // 音频的 null 封面是正常数据，并不表示音频缺失或加载失败。
  // displayState 只是视图结果，不写回 asset，其他实例仍读自己的封面状态。
  // 占位替换只发生在固定缩略图槽，名称、时长与素材 ID 不会跟着换掉。
  // 因此加载失败不需要重新生成列表 key，也不清空外层已选素材。
  // 不在这里尝试探测媒体或补做解码，缺封面的真实恢复留给后续素材业务。
  const missingCover = asset.kind !== "audio" && (!asset.cover || (typeof asset.cover === "string" ? asset.cover === failedCover : asset.cover.src === failedCover));
  const displayState = state === "ready" && missingCover ? "missing" : state === "cancelled" ? "missing" : state;
  const metadata = asset.metadata;
  const Icon = asset.kind === "audio" ? AudioLines : asset.kind === "image" ? ImageIcon : Video;
  return <li><button type="button" disabled={!onSelect || state === "loading" || state === "error" || state === "cancelled"} onClick={onSelect} draggable={state === "ready" && !!onDragStart} onDragStart={onDragStart} onDragEnd={onDragEnd} data-editor-asset={asset.id} aria-current={selected ? "true" : undefined} aria-busy={state === "loading" || undefined} title={asset.name} className={`${styles.mediaItem} ${layout === "cards" ? styles.mediaCard : ""}`}>
    {/* 素材封面：cards与list共用同一个图片和失败状态，不为紧凑卡片另建播放器。 */}
    {/* 源首帧已由导入层读取，选中或播放素材不会重新截图替换封面。 */}
    {/* cards保留完整横竖画幅并留边，list继续沿用原行缩略图裁切。 */}
    {/* 时长跟随封面定位，文件名长短不应把它挤到下一行。 */}
    {/* 数字只是源时长展示，不提供修剪入口；真正修剪仍只在时间线。 */}
    {/* 图片的duration为null，因此不会凭空出现一段视频时长。 */}
    {/* 封面失败也保留已探测时长，不能把缺图和缺元数据混为同一失败。 */}
    <span className={styles.mediaCover}>{displayState && displayState !== "ready" ? <EditorPlaceholder state={displayState} message={asset.notice || t(`toolBox.editorUi.${displayState}`)} compact /> : asset.cover ? <Image src={asset.cover} onError={() => setFailedCover(typeof asset.cover === "string" ? asset.cover : asset.cover?.src || "")} alt="" fill sizes="112px" unoptimized={typeof asset.cover === "string"} className={layout === "cards" ? "object-contain" : "object-cover"} /> : <DemoWaveform />}{layout === "cards" && asset.duration !== null && <span data-editor-asset-duration className={styles.mediaDuration}>{formatTime(asset.duration)}</span>}</span>
    {/* 文件名：紧凑卡片只保留这一行可见文字，完整名称仍由按钮title提供。 */}
    {/* 探测详情以无障碍文本保留，不删除metadata，也不改变搜索、入轨载荷和属性来源。 */}
    {/* 列表版式继续展示原详情，两处共享同一份字段映射，避免以后增加字段时漏改一套。 */}
    {/* 错误原因保留原占位与notice；隐藏的只是卡片正常辅助信息，不屏蔽失败反馈。 */}
    <span className={styles.mediaDescription}><strong>{asset.name}</strong><span className={layout === "cards" ? "sr-only" : undefined}><small><Icon size={14} />{t(`toolBox.editorUi.${asset.kind}`)}{asset.duration !== null && ` · ${metadata ? asset.duration.toFixed(2) : asset.duration}s`}</small>{metadata && <small className={styles.mediaMetadata}>{metadata.width}×{metadata.height} · {metadata.fps}fps · {metadata.hasAudio ? t("toolBox.editorUi.audioTrack") : t("toolBox.editorUi.noAudioTrack")}</small>}{asset.notice && <small className={styles.mediaNotice}>{asset.notice}</small>}</span></span>
  </button></li>;
}
// 封面失败按 src 记录，调用方换成另一张图片时不会继承上一张的缺图状态。
// 失败只改变当前素材行，不能使另外四份资源一起显示不可用。
// 显式 state 的优先级高于图片事件，loading 不会因旧图已经解码就变 ready。
// 组件不在失败后无限请求同一个 URL，用户不会被无意义重试占用资源。
// 没有封面的音频默认显示波形占位，不把正常音频归为 missing。
// 缺图只说明封面问题，未来业务是否允许选中由 onSelect 明确决定。
// state 为 error/loading 时即使传入回调也禁用，避免无效素材触发后续动作。
// aria-current 只跟随外部选择，公共行不决定哪份素材属于当前节目。
// 选择素材和选择片段的身份分开，一份素材可以对应时间轴多个实例。
// data-editor-asset 记录素材稳定 ID，文件名重命名不会改变测试定位身份。
// 文件名作为可见主要文本，title 提供被省略部分，不再额外弹出自制提示框。
// 封面 alt 为空因为文字已描述同一资源，减少辅助阅读重复信息。
// loading 的 aria-busy 位于行按钮，局部等待不会误标整个编辑器正在处理。
// 错误占位使用 alert，而缺图使用 status，让状态变化语义不同。
// 无回调的状态样例仍保留完整名称和媒体类型，不出现无法解释的空灰行。
// kind 的联合限制为三种媒体，不根据 name 后缀猜测用户改名文件的类型。
// 样例用静态图片；真实封面在导入边界生成，行无需另建媒体加载流程。
// 不为这个控件直接调用 readFile 或上传缩略图，保持渲染层隔离。
// 浮点字段复用只改变输入外壳，原复合“位置”展示仍不伪装成可编辑数值。
// 属性行解析失败时保留原显示路径，不能把复合值错误转成 NaN。
// 正式属性没有 onCommit，说明当前只是样例参数，不向工程状态写入。
// 属性折叠归每个 EditorGroup，两个分组不因同名而共用 open。
// 重置动作仍是禁用 EditorAction，不能清空数值制造已经接通的错觉。
// 预览与素材选择继续独立，UI-02 不负责切换静态节目图或时钟。

// R02 顶部导入、搜索和分类固定，只有列表占据剩余高度并独立滚动。
// 搜索与筛选只处理调用方传入的数组，面板自身不启动文件探测。
// 同一面板用于默认五项素材和独立状态样板，不复制列表 JSX。
// 有导入回调才启用系统入口，演示工程不传回调，避免读入用户文件。
// 搜索框有独立名称，placeholder 不是唯一的可访问提示。
// 类别文案来自双语词条，不按当前语言手拼视频类型。
// 类型按钮的 pressed 反映实际筛选条件，不再固定高亮“全部”。
// 素材面板的区域名称与 R02 对应，测试可核对区域而不用依赖中文选择器。
// 该区不添加第二个关闭窗口按钮，侧栏展开收起由后续布局任务明确。
// min-height 由工作区统一定义，长列表不能把节目预览推到页面外。
// assets、整库状态和选择回调是面板的最小注入边界。
// 不接收片段列表，因此选素材没有通路修改时间轴或属性面板。
// 搜索与类型取交集，先选音频再搜 voice 只会留下匹配音频。
// 搜索两端空格与英文大小写不影响匹配，原文件名用于显示和 title。
// 选中 ID 像图书馆的书签，筛选只遮住书架，不把书签移到第一本可见书。
// 对应机制是独立保存 selected，不在筛选结果变化时重设选择。
// 取消条件后原选中行重新出现，不自动选中结果首项。
// 两个面板分别执行 hooks，不使用模块级变量或共享工程 store。
// 初始 scene-02 仅当输入中存在同 ID 时才显示高亮。
// onSelect 是素材意图通知，调用者不能从这里误收到片段位置。
// 状态变为 loading/error 时旧数组也不渲染，避免继续操作过期素材。
// 输入和分类在整库不可用期间禁用，不把错误误报成“搜索无结果”。
// 空库表示输入原本无素材，无结果表示有素材但不符合当前条件。
// 两者分别使用不同文字，只有后者提供清除条件的纯 UI 操作。
// 清除条件不会清除选中 ID，也不会制造新的素材或片段。
// 状态播报位于列表之外，结果从一项变成零项时仍可读到数量。
// 所有提示复用 EditorPlaceholder，不另画四套空态外壳。
// 加载是调用方传入的固定状态，不启动定时器假装探测完成。
// 错误说明指向素材来源不可用，本轮没有空函数重试按钮。
// 默认素材仍保持原图的顺序和五个名称，筛选不做隐式排序。
// 只有滚动列表占据剩余高度，控件不会被长列表带走。
// 键盘沿用搜索输入和原生按钮行为，Enter/Space 可选素材。
// Escape 只清当前搜索词，不改变分类或触发播放器快捷键。
// 没有注册 document 快捷键，离开页面无需额外清理监听器。
// 演示实例不提供导入回调；正式实例的回调由自己的会话管理。
// 提供选择回调不会意外启用导入、播放或媒体探测。
// 空库时仍能编辑搜索条件，恢复素材数据后会应用用户保留的条件。
// 样板切换数据时使用新的实例 key，让每个显式场景有确定起点。
// 素材库排列方式是展示参数，正式工程选择cards，独立状态样板默认list。
// 同一个MediaItem仍负责文件名、真实元数据、缺图、加载和选中样式。
// 切换排列不创建或销毁素材业务记录，也不能因卡片排序重用错误的选中身份。
// 布局参数只决定外观，导入回调仍绑定本会话的同一个startImport。
// 卡片里的名字来自原始文件名，不用模型名、路径前缀或占位文案替代。
// 元数据占独立槽，分辨率、源fps和有无音轨不从封面推断。
// 网格列数由素材容器宽度决定，导航开合时不另算一套窗口断点。
// 长文件名单行省略，title保留完整内容，不能让长文本挤小节目预览。
// 卡片点击只选择源查看，拖入轨道才创建独立工程片段。
// 素材区和片段属性仍采用不同选中id，卡片排列不能合并两份状态。
interface MediaPanelProps {
  // 正式素材库启用参考版顶栏；原列表与A/B样板继续共享内容而不强制改版。
  library?: boolean;
  layout?: "list" | "cards";
  assets?: readonly EditorMediaAsset[];
  state?: "ready" | "loading" | "error";
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onImport?: () => void;
  onCancelImport?: () => void;
  importBusy?: boolean;
  importNotice?: string;
  // LIVE-02只给真实ready视频注入拖动；样板不会自动获得文件或工程能力。
  // 添加末尾是拖入的键盘替代，业务回调在外部共享碰撞校验。
  // selectedId仍属于素材，添加片段不能反向替换本行高亮。
  onAssetDragStart?: (event: DragEvent<HTMLButtonElement>, id: string) => void;
  onAssetDragEnd?: () => void;
  onAddToTimeline?: (id: string) => void;
}

// LIVE-02沿用这份素材行，不为入轨拖动复制搜索、筛选和封面布局。
// onAssetDragStart只在ready素材上注入，失败行仍保持禁用原因。
// 外部文件导入归onImport，内部入轨归onAssetDragStart，不能混用回调。
// 素材选中归selectedId，拖动成功不会通过onSelect把它改成另一行。
// “添加到V1末尾”读取当前可用视频选择，没有选择时说明为何不可执行。
// 此按钮传assetId给工程拥有者，不在面板内推算工程末尾秒数。
// 因此鼠标落点创建与末尾添加使用同一个命令校验和UUID规则。
// 素材duration仍是ffprobe事实，面板不显示片段取整后的工程占位长度。
// 筛选只影响可见行，不删除已在时间线中引用的素材。
// 样板不传入轨回调，仍只演示纯UI，不会生成真实工程安排。
// 导入busy与片段拖动分别显示，不把“正在探测”当成“正在移动”。
// 列表的滚动区继续只包结果，新增按钮不会跟随素材一起滚走。
export function MediaPanel({ library = false, layout = "list", assets = DEMO_ASSETS, state = "ready", selectedId, onSelect, onImport, onCancelImport, importBusy = false, importNotice = "", onAssetDragStart, onAssetDragEnd, onAddToTimeline }: MediaPanelProps) {
  // 分类条件不是排序规则，输入相同就保留调用方提供的行顺序。
  // 名字匹配包含扩展名，用户可以用 wav 查音频，也可以单独用类型按钮。
  // 空白查询相当于未搜索，不能因为误输入空格把整库藏起来。
  // 清除条件恢复 all，而 Escape 保留当前类型，两种操作有意不同。
  // 后者方便只改查询词继续查同类素材，不需要重新点分类。
  // 面板 ready 不表示每一行 ready；个别探测/失败由行自己的 state 表达。
  // 因而一个损坏素材不会禁用同库的其他可用项。
  // 整库失败时不读结果行的可用性，必须先恢复来源再允许操作旧内容。
  // 结果数量只统计匹配行，包括能看见但不能选的异常项。
  // 不把数量播报写成“可播放数量”，避免把 UI 匹配误称为解码验证。
  // 选择回调在明确点击后触发，不在首帧或输入每个搜索字符时触发。
  // 这使未来调用方可监听素材意图，而不误收筛选引起的工程编辑事件。
  const { t } = useTranslation();
  const [localSelected, setLocalSelected] = useState("scene-02");
  // 类别、排列与文字筛选只属于当前库实例，不随工程撤销回放。
  // 资源卡与列表仍走同一个MediaItem，切换排列不重新探测或生成封面。
  const [category, setCategory] = useState<LibraryCategory>("media"), [display, setDisplay] = useState(layout);
  const availableCategory = category === "media" || category === "audio";
  const resetFilters = () => { setQuery(""); setKind("all"); setCategory("media"); };
  const [query, setQuery] = useState(""), [kind, setKind] = useState<"all" | EditorMediaAsset["kind"]>("all");
  const selected = selectedId === undefined ? localSelected : selectedId;
  const results = assets.filter(asset => (category === "audio" ? asset.kind === "audio" : kind === "all" || asset.kind === kind) && asset.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const placeholder = state !== "ready" ? state : "empty";
  const message = state === "loading" ? t("toolBox.editorUi.mediaLoading") : state === "error" ? t("toolBox.editorUi.mediaError") : assets.length === 0 ? t("toolBox.editorUi.empty") : t("toolBox.editorUi.noMediaResults");
  return <section data-editor-region="R02" className={styles.mediaPanel} data-media-library={library || undefined} aria-label={t("toolBox.editorUi.media")} aria-busy={state === "loading" || importBusy || undefined}>
    {library ? <MediaLibraryTabs value={category} onChange={setCategory} /> : <h2 className={styles.panelTitle}>{t("toolBox.editorUi.media")}</h2>}
    {/* 库入口：未接通的内容显示说明；不挂不可见列表，隐藏类别不参与键盘操作。 */}
    {!availableCategory ? <div className={styles.libraryUnavailable}><EditorPlaceholder state="empty" message={t("toolBox.editorUi.libraryUnavailable")} /></div> : <>
    {/* R02：按钮和文件拖入只注入不同入口，最后都走调用方的同一个批次导入方法。 */}
    <div className={styles.mediaTools}><EditorAction icon={Upload} label={t("toolBox.editorUi.import")} onClick={onImport} busy={importBusy} disabledReason={category === "audio" ? t("toolBox.editorUi.audioImportUnavailable") : !onImport && !importBusy ? t("toolBox.editorUi.mediaImportUnavailable") : undefined} accent={!library} /><label className={styles.search}><Search size={15} aria-hidden="true" /><input type="search" disabled={state !== "ready" || importBusy} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setQuery(""); } }} aria-label={t("toolBox.editorUi.search")} placeholder={t("toolBox.editorUi.search")} /></label>{library && <><EditorAction icon={display === "cards" ? List : LayoutGrid} label={t(display === "cards" ? "toolBox.editorUi.listView" : "toolBox.editorUi.gridView")} compact onClick={() => setDisplay(display === "cards" ? "list" : "cards")} />{onAddToTimeline && <EditorAction icon={Plus} label={t("toolBox.editorUi.addToV1")} compact onClick={() => { if (selected) onAddToTimeline(selected); }} disabledReason={!assets.some(asset => asset.id === selected && asset.kind === "video" && asset.state === "ready") ? t("toolBox.editorUi.selectReadyVideo") : undefined} />}</>}</div>
    {/* R02：末尾添加不打开文件选择器，禁用时明确要求先选择就绪视频。 */}
    {/* 和鼠标拖动共用同一个创建方法，素材列表选中不等于已创建片段。 */}
    {!library && onAddToTimeline && <EditorAction label={t("toolBox.editorUi.addToV1")} onClick={() => { if (selected) onAddToTimeline(selected); }} disabledReason={!assets.some(asset => asset.id === selected && asset.kind === "video" && asset.state === "ready") ? t("toolBox.editorUi.selectReadyVideo") : undefined} />}
    {importBusy && <EditorAction label={t("toolBox.editorUi.cancelImport")} onClick={onCancelImport} />}
    {importNotice && <p className={styles.mediaNoticeBar} role="status">{importNotice}</p>}
    {/* 筛选像遮住货架的帘子，导入不会替用户改条件；隐藏项提供明确恢复入口。 */}
    {onImport && assets.length > results.length && <p className={styles.mediaNoticeBar} role="status">{t("toolBox.editorUi.hiddenMedia", { count: assets.length - results.length })}<EditorAction label={t("toolBox.editorUi.clearMediaFilters")} onClick={resetFilters} /></p>}
    {onImport && !library && <p className={styles.dropHint}>{t("toolBox.editorUi.dropHint")}</p>}
    {/* 分类与搜索共同生效，pressed 只由本实例 kind 决定。 */}
    <div className={styles.filters} role="group" aria-label={t("toolBox.editorUi.mediaTypes")}>{(["all", "video", "audio", "image"] as const).map(type => <EditorAction key={type} label={t(`toolBox.editorUi.${type}`)} pressed={kind === type} disabledReason={state !== "ready" ? message : undefined} onClick={() => setKind(type)} />)}</div>
    <span className="sr-only" role="status">{state === "ready" ? t("toolBox.editorUi.mediaResultCount", { count: results.length }) : message}</span>
    {/* 素材区滚动体：行选择不写片段属性，不向时间轴添加实例。 */}
    <div className={styles.mediaList} data-editor-media-results>
      {state === "ready" && results.length > 0 ? <ul className={`${styles.mediaRows} ${display === "cards" ? styles.mediaCards : ""}`}>{results.map(asset => <MediaItem layout={display} key={asset.id} asset={asset} selected={asset.id === selected} onDragStart={onAssetDragStart && asset.kind === "video" && asset.state === "ready" ? event => onAssetDragStart(event, asset.id) : undefined} onDragEnd={onAssetDragEnd} onSelect={() => { setLocalSelected(asset.id); onSelect?.(asset.id); }} />)}</ul> : <EditorPlaceholder state={placeholder} message={message} />}
      {state === "ready" && assets.length > 0 && results.length === 0 && <EditorAction label={t("toolBox.editorUi.clearMediaFilters")} onClick={resetFilters} />}
    </div>
    </>}
  </section>;
}

// R03 沿用原预览容器，参数只描述选中片段和静态展示，不持有播放资源。
// 片段像节目单上的一条记录，assetId 是回到素材货架查原件的号码。
// 此处根据号码读取封面，而不是拿素材区当前高亮项冒充节目选中片段。
// 同一素材可被多个片段引用，预览仍保留片段自身的 id 和工程起止时间。
// 默认工作区与独立样板共享这个映射，不能各写一套封面查找逻辑。
// 主时间轴的交互选择属于 UI-06，本轮默认传入确定的 clip-02。
// 样板用已有片段壳切换参数，验证映射，不开启真实播放或时间线剪辑。
// 预览片段额外携带sourceIn，明确区分工程放置位置与源文件读取位置。
// sourceIn可省略以兼容只读样板，省略时使用源零点，不制造另一套默认片段。
// 真实工程从修剪模型提供入点，封面时长或文件名不能推导这份源区间。
// 预览接收轻量片段契约，不获得任意更新工程的能力。
// 节目预览接收源区间和速度的只读映射，不拥有时间线数组的写权限。
// sourceIn使用源秒，start/end使用工程秒，两个时钟不得直接相加减而忽略speed。
// 未设置speed的片段按1倍兼容，源查看不传clip，因此始终保留原素材语义。
// mirrored是当前片段的画面处理状态，不能写进共享asset或覆盖原文件。
// 同源副本可各自镜像、各自变速，选中哪个副本不会影响另一个实例。
// 音轨只使用时间映射，不能因为接口允许镜像就展示画面变换字段。
// 静态样板可以没有源入点，不伪造一个可以真实播放的媒体对象。
// 预览组件通过参数得到已确认值，不从属性输入字符串反向解析工程。
// 变换草稿仍由CanvasEdit提供，不能把未提交拖动写进这里的确认片段。
// 这些只读数据不代表已经支持工程保存、编码导出或多轨音频混合。
export interface EditorPreviewClip {
  sourceIn?: number;
  speed?: number;
  mirrored?: boolean;
  reversed?: boolean;
  freezeTime?: number;
  crop?: import("./editor-timeline").ClipCrop;
  transform?: ClipTransform;
  id: string;
  assetId: string;
  start: number;
  end: number;
  // 通道标记属于片段，不改源素材类型；省略时保留原静态与视频预览。
  // 分离视频静音，音频实例单独试听，两者不会偷偷开始多轨合成播放。
  // 这两项不是源文件元数据，也不通过IPC写回磁盘。
  audioOnly?: boolean;
  audioDetached?: boolean;
}
// 画布与时间码使用项目参数，不从缩略图的像素尺寸猜测输出分辨率。
// 宽高只决定节目画布比例，不把源封面拉伸到任意容器比例。
// 帧率必须是正整数；格式化函数对非法演示输入仍有明确回落。
// duration 是整个工程的长度，不等于一段素材的原始时长。
// 这些参数没有输出路径或解码句柄，不开放真实媒体处理能力。
// 对象按最小展示需要定义，不把整份工程 store 注入公共预览。
export interface EditorPreviewProject {
  width: number;
  height: number;
  fps: number;
  duration: number;
}
// 预览状态与媒体类型分开，音频没有图片不是“封面加载失败”。
// black 用于明确黑场样例，不伪造一张黑色图片当作已解码视频帧。
// empty 由 clip=null 表达，没有选中对象与选择了缺失素材不是同一状态。
// missing 可由显式场景或真实图片错误触发，loading/error 优先于封面判断。
// source 只是静态素材查看形态，必须有标题和明确的返回入口。
// onBack 由调用方注入，只通知返回，不在公共预览里猜测应跳到哪个路由。
// 两个实例可以共用相同 assets，但失败记忆和样板选择不能共用状态。
// currentTime 由调用方提供，不用计时器每秒推进来伪装播放成功。
// 不接收 onPlay、onSeek 或 onExport，因此不可能因参数遗漏而误启用处理。
// 长文件名保持 title，标题区采用省略，不把节目区域推到时间轴外。
// state 可由未来业务适配，但本轮没有请求、解码器或媒体事件订阅。
// assets 缺少引用时进入 missing，而不是错误使用第一张封面作为替代。
// 该接口仅用于渲染，不作为工程保存格式或跨进程类型。
// 切 source 不改素材选择与片段选择，只改变展示名称和时间范围。
// 真实文件来源仍由后续业务适配，本轮只允许现有静态图片契约。
interface ProgramPreviewProps {
  canvasEdit?: CanvasEdit;
  // 空画布的呈现由入口决定，状态样板仍需用文字解释正在演示哪一项。
  // 正式工作区则像未点亮的监视器，只保留黑色画布，不显示未选择的提示。
  // 该参数不影响加载、缺图和错误，不能用安静画布掩盖解码失败。
  // 默认message兼容原调用方，真实入口显式选择black，不靠路由字符串猜测。
  // 这只是同一预览容器的展示差异，不创建第二套播放器或媒体状态。
  emptyPresentation?: "message" | "black";
  // 标题行的局部动作由宿主注入，源查看与节目查看使用同一排版。
  // 例如窄窗面板入口需要占据真实宽度，不能悬浮在文件名上方。
  // 不传时保留静态样板原有标题，不让样板拥有真实会话业务。
  headerActions?: ReactNode;
  // 这是标题局部插槽，不接受整个工作区替换，素材行与时间线仍保留原有结构。
  // 返回按钮始终属于预览自身，宿主只补充与该标题同行的面板入口。
  // 静态节目、素材查看和真实单源都走这一处header，修复压字能同步生效。
  // 文件名使用专属previewName类，避免把EditorAction外层span误当文件名伸缩。
  // 这样英语按钮变宽时名称自动缩短，不需要维护另一组语言专属宽度。
  // 不设置固定像素占位，所以三栏模式隐藏临时入口后不会留下无用空白。
  // clip=null 是明确无选择，不自动找时间轴第一个片段顶替。
  // 引用存在但素材不存在时应是 missing，方便后续区分失联与空工程。
  clip: EditorPreviewClip | null;
  // 素材数组是查询来源，不包含当前素材高亮，也不被本组件排序或修改。
  // readonly 保留调用方共享静态资源对象的能力，避免不同样板互改数据。
  assets?: readonly EditorMediaAsset[];
  // 项目维度控制相框，帧率控制时间码，二者不取源缩略图的默认值。
  // 对同一封面传入竖屏项目时仍 contain，剩余黑边属于项目画布的一部分。
  project?: EditorPreviewProject;
  // currentTime 是工程秒数，即使在 source 形态也先接收工程位置。
  // source 显示时才减去片段起点，调用方不必维护第二份局部时间。
  currentTime?: number;
  // 显式状态优先于封面是否已存在，防止等待时显示旧图造成误解。
  // ready 仍需检查引用与封面，不能绕过真实图片错误回落。
  state?: "ready" | "loading" | "missing" | "error" | "black";
  // mode 是查看形态，不切换工程选择，也不改变文件是否能被读取。
  // program 保留工程总时长，source 只显示当前片段可查看的范围。
  mode?: "program" | "source";
  // 未提供返回回调时按钮原生禁用，不能用一个空函数假装可以返回。
  // 返回目标归宿主决定，所以这里没有硬编码路由或 window.history 操作。
  onBack?: () => void;
  live?: LivePreviewSource | null;
}

// 公共预览只拿渲染插槽、控制插槽和已经确定的时间数据，不直接操作工程数组。
// rateControl是一个独立可选插槽，静态样板不传就不会出现可编辑假倍速。
// step回调存在才启用逐帧按钮，解码失败或源尚未ready时仍说明禁用原因。
// 媒体底栏使用项目fps格式化节目时间码，源查看则优先使用源fps。
// 时间码显示精度不能反过来作为工程数据来源，不能从00:00:01:15字符串解析写回。
// 适应与导出帧仍保持原能力边界，增加倍速不顺带启用没有回调的动作。
// 窄播放器允许底栏内部横向滚动，控制不会因素材区变宽而从DOM中丢失。
// 控制条与surface共享当前播放器实例，不能控制一个不可见的旧video节点。
// 节目空隙没有asset，但仍需要走带控制，因此live.asset现在允许缺省。
// 素材查看仍传真实asset，原文件名、源时长与源fps展示保持独立。
// 可选asset不等于允许假封面，真实surface仍由调用方注入。
// 黑场节目也提供真实工程time与duration，不读取上一次素材的时钟。
// 静态样板没有live插槽，继续沿用原占位与演示数据分支。
// 该接口变化不授予公共容器媒体加载或工程写入能力。
export interface LivePreviewSource {
  asset?: EditorMediaAsset;
  surface: ReactNode;
  controls: ReactNode;
  state: "ready" | "loading" | "error";
  time: number;
  // 工程单段播放显示工程总长，素材查看仍使用源时长。
  duration?: number;
  rateControl?: ReactNode;
  step?: (direction: -1 | 1) => void;
}
// 状态到文案的映射只承担显示，不根据翻译文字决定媒体是否可用。
// ready 的回落文案仅防御缺少图片的输入，不能把缺图误标为已完成。
// empty 对应未选择片段，black 对应明确黑场，二者不能共用含糊的“无内容”。
// audio 说明没有画面且播放未接通，不暗示音频文件损坏。
const PREVIEW_MESSAGES = { ready: "previewMissing", empty: "previewEmpty", loading: "previewLoading", missing: "previewMissing", error: "previewError", black: "previewBlack", audio: "previewAudio" } as const;
export { formatEditorTimecode } from "./editor-timecode";

// 原节目区三行布局保持：标题、可收缩画布、固定走带工具栏。
// 画布内另有项目比例框，源图片 contain，不让宽屏或窄屏截掉原图边缘。
// 所有状态占用同一画布槽位，错误或长文字不能改变工具栏的纵向位置。
// 图片错误按 src 记忆，只影响当前预览实例；换新封面地址可正常显示。
// loading/error 不挂图片，防止旧封面继续看起来像已完成的新预览。
// 整个面板只在 loading 标记 busy，错误和缺图不冒充仍在等待。
// 无片段、引用缺失、无封面、音频、黑场分别有准确提示。
// 音频不伪造一幅节目画面，也不显示假的播放进度或解码波形。
// 素材查看使用片段局部时间，节目查看使用工程时间，两者标题明确区分。
// 只在 source 显示返回按钮，没有回调时由共享按钮保持禁用。
// 播放、逐帧、适应和帧导出继续没有回调，原因明确静态预览边界。
// 标题中的文件名不参与查找，稳定 assetId 才是选中片段到封面的连接。
// 只有一个图片节点，缺图回落不会另开隐藏播放器或重复画面。
// asset.state 若为 loading/error，预览也不能把已存在的封面当作可用帧。
// currentTime 限制仅用于展示范围，不回写播放头或触发 seek。
// 当未选片段时仍显示项目总时长，当前时间回到起点。
// 无效项目宽高回落 16:9，避免样板非法参数撑坏布局。
// 时间码在 source 模式限制到片段长度，不展示负数局部时间。
// 正式音视频接入需要独立生命周期；这里没有需要取消的媒体会话。
// 独立样板的状态控制留在预览之外，默认编辑器不出现调试选项。
export function ProgramPreview({ clip, assets = DEMO_ASSETS, project = DEMO_PROJECT, currentTime = DEMO_PROJECT.currentTime, state = "ready", mode = "program", onBack, live = null, headerActions, canvasEdit, emptyPresentation = "message" }: ProgramPreviewProps) {
  // 查不到 asset 不能继续访问 cover，后面的状态解析负责说明缺失原因。
  // 显式 error/loading 比图片 onError 更高优先级，封面失败不改写业务输入。
  // failedCover 只保存当前实例见过的失败地址，不往素材对象添加全局坏图标记。
  // 同一实例切换到新 src 时与旧失败地址不同，正常图片可以自然恢复。
  // 切回原坏地址不无限重试，后续真实修复应由业务提供新的封面地址。
  // 没有选择时不借用上一张封面，避免用户误以为仍在编辑那个片段。
  // 音频的 null 封面不经过图片错误分支，视觉缺失和音频无画面分别提示。
  // source 的 duration 取片段实例范围，不把图片的 null 源时长转换成零秒。
  // 当前展示时间最多到总长，不允许传入的样例越界把时间码画到终点之外。
  // 这个限制仅影响显示数字，绝不调用定位播放器或回写项目时间。
  // ratio 需为有限正值，不能把除零结果塞给容器单位计算。
  // fallback 的 16:9 是无效输入的安全布局，不会覆盖调用方有效竖屏值。
  // 操作禁用原因集中为同一个静态预览边界，图标名称仍保留各自意图。
  // 原图片预览没有 video 节点，装配工具栏也不会启动解码或声音输出。
  // 区域仍标 R03，默认工作区只有一份；样板的重复实例在各自作用域里。
  // 各状态保留同样三行几何，切换时不需要测量后手动修改父布局高度。
  const { t } = useTranslation();
  const [failedCover, setFailedCover] = useState("");
  const asset = assets.find(item => item.id === clip?.assetId);
  const liveAsset = live?.asset;
  const assetState = (liveAsset ?? asset)?.state;
  const unavailable = assetState === "loading" || assetState === "error" || assetState === "missing" ? assetState : undefined;
  const staticMissing = !asset || (asset.kind !== "audio" && (!asset.cover || (typeof asset.cover === "string" ? asset.cover === failedCover : asset.cover.src === failedCover)));
  const liveState = live?.state;
  const displayState = state !== "ready" ? state : liveState ?? (!clip ? "empty" : unavailable ?? (staticMissing ? "missing" : asset.kind === "audio" ? "audio" : "ready"));
  const title = t(mode === "source" ? "toolBox.editorUi.sourcePreview" : "toolBox.editorUi.program");
  const duration = live?.duration ?? liveAsset?.duration ?? (mode === "source" && clip ? Math.max(0, clip.end - clip.start) : project.duration);
  // live传入的duration可切换工程总长和源长度，不能始终套用当前源duration。
  // source形态显示源内时钟；program形态显示工程书签，两者共用同一时间码外观。
  // 没有clip也可能有合法工程书签，例如用户定位在两段之间的黑场。
  // 因此这里不因clip为空强行归零，空样板要由它的调用方明确传零。
  // live.time已经由适配层决定时钟归属，不应再减一次clip.start。
  // 静态source仍接工程位置，所以仅这条路径需要换算成片段局部时间。
  // 显示夹限保护控制条，不能把夹限后的数值写回工程或声称完成媒体seek。
  // 黑场保留工程时间和项目fps，用户才能知道蓝线位于哪一段真实空隙。
  // 片段属性选择不在这个计算里更新，预览对象和编辑目标可以各自明确。
  // 固定宽度时间码使用共享格式化函数，不把30fps与源24fps混作同一来源。
  // 本页tabIndex=-1只供关闭紧凑面板后回落焦点，不增加正常Tab路径中的停靠项。
  // 主题切换只影响公共表面颜色，live媒体槽和静态图片都保持原来比例与内容。
  const time = live ? Math.min(Math.max(0, live.time), Math.max(0, duration)) : Math.min(Math.max(0, currentTime - (mode === "source" && clip ? clip.start : 0)), Math.max(0, duration));
  const ratio = project.width > 0 && project.height > 0 && Number.isFinite(project.width / project.height) ? project.width / project.height : 16 / 9;
  // empty与black仍保留各自data状态和时间码，只省略画布里的可见说明。
  // 像显示器的黑场与关机画面看上去相同，背后的工程时钟并不因此相同。
  // 有片段但引用丢失属于missing，不进入这条安静分支。
  // 真实源传入live时由其媒体槽接管，安静分支不吞媒体自身的错误反馈。
  // 不挂占位节点也就不会留下图标、隐藏的旧封面或会抢焦点的提示按钮。
  // 无障碍状态仍可从预览区域的状态属性与标题识别，时间码继续显示工程位置。
  // 背景覆盖只作用于frame内部，周围主题表面仍使用现有语义色。
  const quiet = emptyPresentation === "black" && (displayState === "empty" || displayState === "black");
  const reason = t("toolBox.editorUi.previewUnavailable");
  // 图片仍复用同一帧节点与错误回落，只有节目形态套片段构图；素材查看保持原图。
  const image = asset?.cover ? <Image src={asset.cover} alt={`${title} · ${asset.name}`} fill sizes="(min-width: 1280px) 60vw, 90vw" unoptimized={typeof asset.cover === "string"} className="object-contain" onError={() => setFailedCover(typeof asset.cover === "string" ? asset.cover : asset.cover?.src || "")} /> : null;
  const picture = clip && asset?.kind === "image" && mode === "program" ? <ClipCanvas clip={clip} asset={asset} project={project} edit={canvasEdit}>{image}</ClipCanvas> : image;
  // aria-label 命名的是当前查看形态，文件名通过图像 alt 和标题各自表达。
  // aria-busy 仅覆盖当前 R03，A 等待时不能让整个应用或 B 被标记忙碌。
  // 状态提示保留公共组件的 status/alert 语义，不用单独颜色表达错误。
  // 画布内占位可滚动，完整反馈不依赖被裁掉的 title 才能阅读。
  // 场景没有传入播放回调，因此禁用边界不依赖测试或运行环境是否安装 FFmpeg。
  return <section tabIndex={-1} data-editor-region="R03" data-editor-preview-state={displayState} data-editor-preview-clip={clip?.id} data-editor-preview-asset={liveAsset?.id ?? asset?.id} data-editor-preview-mode={mode} className={styles.previewPanel} aria-label={title} aria-busy={displayState === "loading" || undefined}>
    {/* R03：节目与素材查看共用标题栏，文件名省略但保留全名提示。 */}
    {/* 返回是查看层动作，不能把它绑到素材库选中或时间轴片段写入。 */}
    {/* 画布标题保持可见，长文件名只消费标题与返回之后剩余的宽度。 */}
    {/* R03：标题、返回、名称与局部动作同排分配空间，名称优先省略。 */}
    <header className={styles.previewHeading}><h2 className={styles.panelTitle}>{title}</h2>{mode === "source" && <EditorAction label={t("toolBox.editorUi.backToProgram")} onClick={onBack} />}<span className={styles.previewName} title={(liveAsset ?? asset)?.name}>{(liveAsset ?? asset)?.name}</span>{headerActions}</header>
    <div className={styles.previewSurface} data-editor-preview-surface>
      {/* surface 测量可用空间，frame 保留项目比例，图片在 frame 内完整放入。 */}
      {/* 占位也放进同一 frame，不能在缺图时把节目画布变成不同比例。 */}
      {/* Image 错误只记录 src，不回调外部选择，避免解码事件覆盖用户操作。 */}
      <div className={styles.previewFrame} style={{ width: `min(100cqw, calc(100cqh * ${ratio}))`, aspectRatio: ratio, ...(quiet ? { background: "#000" } : {}) }} data-editor-preview-frame>
        {quiet ? null : live ? live.surface : displayState === "ready" && asset?.cover ? picture : <EditorPlaceholder state={displayState === "audio" || displayState === "black" ? "empty" : displayState === "ready" ? "missing" : displayState} message={t(`toolBox.editorUi.${PREVIEW_MESSAGES[displayState]}`)} />}
      </div>
    </div>
    {/* 走带区只显示参数映射后的时间码，业务按钮没有播放或导出回调。 */}
    <div className={styles.transport}><span className={styles.timecode}><b>{formatEditorTimecode(time, (mode === "program" ? project.fps : liveAsset?.metadata?.fps) || project.fps)}</b><span>/</span>{formatEditorTimecode(duration, (mode === "program" ? project.fps : liveAsset?.metadata?.fps) || project.fps)}<small>{(mode === "program" ? project.fps : liveAsset?.metadata?.fps) || project.fps}fps</small></span><div className={styles.transportActions}><EditorAction icon={SkipBack} label={t("toolBox.editorUi.previousFrame")} onClick={live?.step ? () => live.step?.(-1) : undefined} disabledReason={live?.step ? undefined : reason} compact />{live ? live.controls : <EditorAction icon={Play} label={t("toolBox.editorUi.play")} disabledReason={reason} compact />}<EditorAction icon={SkipForward} label={t("toolBox.editorUi.nextFrame")} onClick={live?.step ? () => live.step?.(1) : undefined} disabledReason={live?.step ? undefined : reason} compact /></div>{live?.rateControl}<EditorAction icon={ChevronDown} label={t("toolBox.editorUi.fit")} disabledReason={reason} /><EditorAction icon={Camera} label={t("toolBox.editorUi.exportFrame")} disabledReason={reason} /></div>
  </section>;
}

// 属性检查器实际实现只维护一份，旧导入路径继续转发同一组件。
export { ClipInspector } from "./editor-inspector";
