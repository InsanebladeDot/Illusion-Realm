"use client";

// 视频、图片和音频共享工程坐标与选择外框，内容通过 children 注入。
// 秒数像一把共同的尺子：left 用开始时间，width 用片段时长，不能按文件名撑宽。
// 正式V1与样板通过各自回调驱动选择，未接通入口不传回调。
// 本外壳不持有素材、撤销栈、碰撞规则或解码器，避免 UI 抽象吞并业务。
import type { ReactNode, DragEvent, KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { useTranslation } from "@/i18n";
import styles from "./editor.module.css";

// clipId 与素材身份分开，同源片段也能各自选中，不用数组下标当身份。
// locked 只控制当前实例，公共组件不查询其他轨道的全局锁。
// start/end/duration 由工程模型给出，组件不回写修剪或拉长工程时长。
// label 同时作为 title 和无障碍名称，窄片段隐藏文字也不会丢失名称。
// children 表达媒体内容，视频封面和音频波形不复制外框与把手。
// 没有 onSelect 即原生禁用，不以透明度假装阻止真实剪辑操作。
// 本轮新增的是可选事件契约，不另造一个“真实片段Card”。
// onDragStart接收原生按钮事件，currentTarget才是完整片段外框。
// 若从内部封面或标题抓取，事件target可能是span，不应用它计算偏移。
// onDragEnd不接收业务参数，因为结束只需通知拥有者清理手势。
// onKeyDown把事件和实例身份在调用处绑定，公共壳不查全局选中项。
// 没有拖动回调时draggable为false，静态样板不会变成半接通编辑器。
// locked优先于拖动能力，未来传入锁定片段也不会仅禁用点击却允许拖动。
// 壳不生成clipId，身份来自创建命令，在重渲染和滚动时保持稳定。
// 选中只改变边框和装饰把手，CSS宽度始终由end-start确定。
// 按钮保留原生焦点能力，方向键替代不需要增加一组隐形控制器。
// 把手接收独立pointerdown，主体仍走原HTML移动载荷，两种手势不能同时启动。
// ARIA名称是源文件名，数据属性另存clipId，自动化不靠名称区分同源实例。
interface ClipShellProps {
  id: string; label: string; start: number; end: number; duration: number;
  // 正式时间线注入时长时间码，静态样板仍沿用原布局和状态。
  // 帧率由调用方提供，外壳不从源文件名推算时间或改变边缘。
  // label保留完整源名称，时间码只是另一段可见信息。
  timecode?: string;
  // 修剪草稿只加边缘操作反馈，不把正在预览的范围写入确认工程。
  // edge区分当前抓取的左右边；它不参与片段left/width时间换算。
  trimming?: boolean;
  kind: "video" | "image" | "audio"; selected: boolean;
  children: ReactNode; locked?: boolean; onSelect?: (event: MouseEvent<HTMLButtonElement>) => void;
  // 真实V1注入手势，样板不传仍是原来的选择或禁用行为。
  // 壳只转发当前按钮事件，碰撞与源身份归工程层校验。
  // 键盘动作也由调用方注入，不在公共壳里猜测一帧多少秒。
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void;
  onPointerDown?: (event: PointerEvent<HTMLButtonElement>) => void;
  onTrimStart?: (event: PointerEvent<HTMLElement>, edge: "start" | "end") => void;
  onTrimKey?: (event: KeyboardEvent<HTMLElement>, edge: "start" | "end") => void;
  onDragEnd?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  // 右键与菜单键由工程层绑定目标，外壳不保存全局“最近右键片段”。
  // 可选回调让原样板继续维持静态能力边界，GIF不受影响。
  // 事件使用currentTarget定位完整片段，封面子节点不会改变目标身份。
  onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void;
  // currentTarget由按钮本身确定；文字span和音符都只承担展示，不绑定另一份菜单。
  // 公共壳不阻止默认右键，只有注入真实回调的正式工程才将其替换为片段操作。
  // KeyboardEvent仍交给同一实例回调，菜单键不会靠文件名去寻找目标。
  // 音频片段与视频片段的百分比定位不变，因此锁轨只属于手势规则，不写到外壳坐标里。
  // 选中状态由会话注入，右键聚焦另一个实例不会让全部同源安排一起高亮。
}
// start 和 end 使用同一个工程单位秒，组件不接受混杂的像素和帧值。
// duration 由调用方提供总时长，不用素材自己的长度充当工程分母。
// 0–8 秒和 10–18 秒由相同长度得出等宽，真实空隙不会被布局均分。
// kind 只决定视觉表面，音频内容由插槽插入，外壳不生成波形数据。
// image 使用视觉片段规则，但不暗示图片有原生音视频时长。
// selected 从外部传入，多个同源片段可以表达不同的选择状态。
// id 是片段身份，不能用 label 当 key，重名媒体也可能有不同片段。
// 锁定优先于 onSelect，即使调用方忘记移除回调也不能激活。
// 没有回调时保留静态选中外观，不能通过外框自行建立另一份选择状态。
// 手柄随悬停或键盘焦点显露，修剪由可聚焦slider与指针捕获共同实现。
// 片段壳内不嵌套button；修剪边缘使用slider语义并隔离父级键盘事件。
// left/width 采用百分比以共享标尺列，不包含轨道头或全局导航宽度。
// 主时间轴横滚时外壳和标尺在同一滚动体内，不需要事件追赶位置。
// 片段边框位于 border-box 内，选中不会改变 start/end 对应的宽度。
// 不在外壳里注册 document 键盘事件，避免每个片段都监听空格或删除。
// 后续真实拖动需要独立命令边界，不能在此直接修改素材描述。
// 锁定片段保留外观和提示，但不接收鼠标与键盘选择。
// 把手携带可访问名称和当前秒数，锁定时不挂载，避免伪装仍可编辑。
// 所有媒体用同一个 box-sizing 与边框，选择时坐标不会增宽两个像素。
// aria-pressed 表达可选状态，aria-current 保留既有几何回归的定位契约。
// data 属性提供稳定时间信息，不暴露磁盘路径或项目存储格式。
// 时间轴与样板页都引用同一个类，深浅主题不需要复制 JSX。
// 边缘把手现在通过onTrimStart/onTrimKey注入真实能力，不再是假装可拖的装饰线。
// 左右分别提供slider语义和独立标签，键盘用户可以明确操作入点或出点。
// 把手仅在有回调且未锁定时挂载，独立静态样板不意外获得真实修剪。
// 主体仍沿用原button壳和选择/右键行为，不新增“多轨专用片段组件”。
// 手柄按下阻止冒泡，由上层修剪Hook捕获；主体按下只记录移动抓取点。
// 点击手柄不重新选中或定位到片段头，避免一次边缘操作把节目书签偷换。
// 原生dragstart若来自手柄就阻止，不能同时启动HTML拖放和pointer修剪。
// 左右箭头由onTrimKey处理并阻止冒泡，父片段的左右平移不会重复执行。
// aria-valuenow使用实际工程边缘时间，不用显示像素反推一个近似值。
// 选中样式保持一像素，选择和鼠标悬停不能改变片段百分比宽度。
// 标签和把手都不参与区间长度计算，长文件名省略不会让时间线片段变长。
// 锁定仍使用原生disabled，右键与键盘提交另有共同模型复核。
// 轨道ID不在外壳内部硬编码，调用方可把相同片段壳用于任意合法V/A编号。
// 片段壳保留真实button语义，选中高亮从外部注入，不在点击时临时改DOM边框。
// 按钮整体承接选择与右键，内部胶片带只是当前片段源内容的缩略展示。
// 透明修剪热区贴在左右工程边界，不能让封面遮住热区造成只能拖主体。
// 左右热区使用各自slider名称与当前边缘秒数，读屏能够区分入点和出点。
// slider的值域使用工程范围，实际源剩余长度仍由修剪模型最终约束。
// 键盘事件在边缘处隔离，按一次方向键不能同时修剪和整段平移。
// 鼠标按下边缘后由修剪Hook捕获，不让HTML原生dragstart再启动主体移动。
// 片段内容较窄时热区可能接近，视觉仍是一像素边框而不是两块厚把手。
// 当前没有对极端小于热区总宽的片段提供放大手柄浮层，用户可先放大时间轴。
// 时间线缩放只改变百分比投影的屏幕宽度，不能改变aria-valuenow的工程值。
// 长文件名通过标签省略，完整名称仍作为按钮可访问标签与title。
// 同源片段共用文件名时，data-editor-clip仍用独立实例ID。
// 锁轨关闭主体拖动与修剪热区，不靠一个覆盖层假装禁止编辑。
// 取消修剪后外壳重新读取确认区间，不留一个看似已裁掉的局部CSS宽度。
// 音频复用相同边界机制，不能另算一套按波形像素决定的时间模型。
export function EditorClipShell({ id, label, timecode, trimming, start, end, duration, kind, selected, children, locked = false, onSelect, onDragStart, onDragEnd, onKeyDown, onContextMenu, onTrimStart, onTrimKey, onPointerDown }: ClipShellProps) {
  // 右键仍受原生disabled保护，锁定或未接回调的样板不会获得工程编辑能力。
  // data-kind使真实音频安排可观察，不需要从封面颜色猜通道类型。
  // 所有通道继续使用相同start/end百分比，音频与视频不各画一把尺子。
  const { t } = useTranslation();
  return <button type="button" disabled={locked || !onSelect} onClick={onSelect} onPointerDown={onPointerDown} draggable={!locked && !!onDragStart} onDragStart={event => { if ((event.target as HTMLElement).closest('[data-clip-trim]')) event.preventDefault(); else onDragStart?.(event); }} onDragEnd={onDragEnd} onKeyDown={onKeyDown} onContextMenu={onContextMenu} data-editor-kind={kind} data-editor-clip={id} data-editor-start={start} data-editor-end={end} data-editor-trimming={trimming || undefined} data-editor-locked={locked || undefined} aria-label={label} aria-current={selected ? "true" : undefined} aria-pressed={selected} title={label} className={`${styles.timelineClip} ${kind === "audio" ? styles.audioClip : styles.visualClip} ${timecode ? styles.referenceClip : ""}`} style={{ left: `${start / duration * 100}%`, width: `${(end - start) / duration * 100}%` }}>
    {/* 时间轴片段：标题、连续帧和真实波形仍共享同一按钮与原修剪事件。 */}
    {/* 时间码只改变信息排布，left/width继续来自工程区间，样板不传时保持原样。 */}
    {/* 文件名可收缩省略，时间码不收缩；完整文件名仍由父按钮title保留。 */}
    {children}<span className={styles.clipName}><span>{label}</span>{timecode && <span data-clip-timecode>{timecode}</span>}</span>{onTrimStart && !locked && (["start", "end"] as const).map(edge => <span key={edge} role="slider" tabIndex={0} aria-label={t(edge === "start" ? "toolBox.editorUi.trimStart" : "toolBox.editorUi.trimEnd")} aria-valuenow={edge === "start" ? start : end} aria-valuemin={0} aria-valuemax={duration} data-clip-trim={edge} className={edge === "start" ? styles.trimStart : styles.trimEnd} onClick={event => event.stopPropagation()} onPointerDown={event => onTrimStart(event, edge)} onKeyDown={event => onTrimKey?.(event, edge)}>{edge === "start" ? "<|" : "|>"}</span>)}
  </button>;
}
