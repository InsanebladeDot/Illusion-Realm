"use client";

/** 正式工程会话管理V1与分离音轨的安排；素材入库、媒体读取仍由LIVE-01拥有。 */
// 鼠标轮廓是便签草稿，松手盖章后才写进工程；取消只撕掉便签。
// 工程没有持久化插件，离开页面即释放，样板不会订阅此会话。
import { createElement, useEffect, useReducer, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type RefObject, type ReactNode, type PointerEvent } from "react";
import { DEFAULT_TRACKS, DEFAULT_TRACK_LIMITS, sameTrackKind, isVideoTrack, nextTrack, trimClip, type TrackId, type TrackLimits } from "./timeline-track-model";
import { timelineHistoryReducer, canStepHistory, type TimelineProjectState } from "./timeline-history";
import { useTimelineEditing } from "./use-timeline-editing";
import { basicClipEdit, updateClipCrop, type BasicClipAction } from "./clip-basic-edit-model";
import type { ClipCrop } from "./editor-timeline";
import type { TimelineTool, SectionEdit } from "./timeline-edit-model";
import { useClipTrim } from "./use-clip-trim";
import { changeClipSpeed } from "./clip-speed-model";
import { TimelineSettings } from "./timeline-settings";
import { defaultTransform, toggleTransformKeyframe, updateAnimatedTransform, type ClipTransform, type TransformKey } from "./clip-transform-model";
import type { EditorPreviewProject } from "./editor-panels";
import { t } from "@/i18n";
import type { EditorMediaAsset } from "./editor-panels";
import { resolveTimelineCommand, applyTimelineEdit, readTimelinePayload, TIMELINE_DRAG_TYPE, timelineDropTime, timelineDuration, type LiveTimelineClip, type TimelineCommand, type TimelinePayload, type TimelineEdit } from "./live-timeline-model";
// 右键锚点只属于当前页面，菜单关闭后不保留DOM或媒体引用。
// 展示复用公共菜单外壳，工程修改继续在本Hook的共同提交边界完成。
import type { LiveClipMenuAnchor } from "./live-clip-menu";

// 草稿显示位置和失败原因，不能让无效红框成为真正的工程片段。
// start与length使用工程秒数，拖动期间冻结的尺子不会追着候选缩放。
// track保存实际命中行，视频落到A1/A2时也能显示明确的拒绝反馈。
// length是取整后的占位长度，真实源时长始终留在素材与片段上。
// 轮廓的数据量与视频大小无关，一小时视频也只携带起点和长度。
// valid只是此时快照的结论，最终松手仍要重新计算并验证。
// reason已按当前语言翻译，用于轮廓内文本与固定status栏同步显示。
// 负起点轮廓可能部分被滚动边界裁切，固定status仍保留错误说明。
// track用实际命中行，能把A1拒绝反馈留在用户刚经过的位置。
// 草稿不持有asset对象，关闭轮廓不等于从素材库移除文件。
// length不是工程总长，宽度仍需除以统一视口range才能得到百分比。
export interface TimelineDraft { start: number; length: number; track: string; valid: boolean; reason: string; }
// 共同交互接口只表示意图，公共时间线不知道真实导入或文件路径。
// 拖动起止回调同时传给素材行和片段壳，避免复制原生拖放接线。
// keyDown留在片段按钮，不在搜索框输入时抢走方向键。
// range控制标尺、片段和播放头三者的同一个分母。
// scrollRef只交给唯一滚动体，不用第二个隐藏时间轴追赶scrollLeft。
// selectedId属于片段，和素材高亮没有共享状态。
// MediaItem只调用start，不读取项目片段数组，素材行保持领域中立。
// EditorClipShell调用相同start但kind为clip，表示移动已有安排。
// 轨道把over和drop交回同一拥有者，因此共享会话与碰撞规则。
// leave只撤掉当前落点轮廓，继续拖回轨道时手势身份仍有效。
// cancel则结束整个手势，区别于暂时离开一条轨道。
// selectedId是受控值，公共壳不会维护另一份可能过时的局部选择。
// scrollRef只接到唯一滚动节点，自动滚动不查询页面上第一个同名容器。
// keyDown接收片段ID，方向键不会依据素材列表的高亮猜测目标。
// range是当前手势使用的尺子，拖动期间保持不变。
// notice属于工程反馈，不能覆盖LIVE-01的导入结果摘要。
// 接口不提供保存或导出回调，公共时间线不能提前启用这些业务。
export interface TimelineInteraction {
  basicTools?: ReactNode; currentTime?: number;
  // 定位和锁定回调属于当前工程实例，视口组件不能直接改片段数组。
  tracks?: readonly TrackId[]; limits?: TrackLimits; settings?: ReactNode; draggingKind?: "V" | "A";
  grab?: (event: PointerEvent<HTMLButtonElement>, id: string) => void;
  trimDraft?: LiveTimelineClip | null;
  trimStart?: (event: PointerEvent<HTMLElement>, id: string, edge: "start" | "end") => void;
  trimKey?: (event: KeyboardEvent<HTMLElement>, id: string, edge: "start" | "end") => void;
  seek?: (time: number) => void;
  hiddenTracks?: readonly string[]; toggleVisibility?: (track: string) => void;
  lockedTracks?: readonly string[]; toggleLock?: (track: string) => void;
  // 多选只供工程批量操作，主选中继续服务原检查器；样板不传则保持原单选。
  selectedIds?: readonly string[];
  editing?: { tool: TimelineTool; setTool: (tool: TimelineTool) => void; undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean; canDelete: boolean; canSection: boolean; section: (action: SectionEdit) => void; remove: () => void };
  click?: (event: MouseEvent<HTMLButtonElement>, id: string) => void;
  selectedId: string | null; range: number; draft: TimelineDraft | null; notice: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  select: (id: string) => void;
  start: (event: DragEvent<HTMLElement>, kind: "asset" | "clip", id: string) => void;
  over: (event: DragEvent<HTMLDivElement>, track: string) => void;
  drop: (event: DragEvent<HTMLDivElement>, track: string) => void;
  cancel: () => void;
  leave: (event: DragEvent<HTMLDivElement>) => void;
  keyDown: (event: KeyboardEvent<HTMLButtonElement>, id: string) => void;
  // 可选入口保持样板兼容；键盘菜单键与右键绑定相同的实例身份。
  // 公共片段壳只转发事件，不持有菜单或实现工程编辑。
  contextMenu?: (event: MouseEvent<HTMLButtonElement>, id: string) => void;
}
// 手势快照包含工程与素材的引用，不复制视频或改动旧数组。
// 一次手势从同一个快照验证，只有drop才提交到当前会话。
// clips在拖动中不能被键盘并行修改，避免冻结快照覆盖另一条新命令。
// 指针最后位置供自动滚动重新换算，滚动后不会继续沿用旧DOM矩形。
// lane是当前实际行，不把轨道头或导航算进时间原点。
// updated是渲染侧最后一次dragover时间，停止事件后自动滚动会停止。
// 滚动不依赖rAF，后台或遮挡窗口也能按上限结束等待。
// payload只属于当前会话，drop会再次解析实际DataTransfer防伪造。
// 手势快照好比取号时的一张订单：原工程、源身份和抓取位置一起固定。
// clips保存的是开始时数组引用，hover不会把其中对象原地改写。
// assets同样保留引用，验证只查状态和时长，不重新探测文件。
// command预先固定新片段ID，鼠标经过十个位置仍是一份创建意图。
// range用于冻结展示刻度，pixels用于冻结实际换算，两者各司其职。
// pixels是每秒对应的CSS像素，不是设备像素，所以无需再乘DPR。
// offset来自片段按钮内部的实际抓取点，不能用片段中心默认替代。
// lane会随着鼠标进入V1/A1/A2更新，跨行反馈不会沿用旧轨道。
// x保存屏幕客户区坐标，和getBoundingClientRect属于同一坐标系。
// updated用于约束自动滚动的活跃期，不表示视频播放时间。
// 手势并不拥有文件句柄，清理时没有需要重复关闭的FFmpeg任务。
// 播放器属于LIVE-01实例，这个快照不会暂停或seek源视频。
// track在抓取时固定；音频副本也只能在它自己的A1或A2内水平移动。
// 鼠标跨行只得到无效反馈，不让轮廓跟着漂到另一条轨道。
// 一次内部拖放携带来源类型和来源轨道，两者不能混成同一个“当前轨”。
// track保留来源身份，目标从当前lane读取，拖到新层不能先把来源改成目标。
// locked是起点快照，手势中锁定操作会主动取消；提交仍读取实时锁表。
// 素材入轨属于add，没有源轨锁限制；移动属于move，来源和目标都必须可编辑。
// 例如V1锁住时仍可把素材直接放到空闲V2，但不能把V1已有片段拖出去。
// command不提前写目标轨，hover时按实际命中lane构造候选，避免草稿沿用旧轨碰撞结果。
// range和pixels冻结一次拖动的秒尺，新增候选行不应改变这条横向比例。
// 候选增加纵向内容时CSS预留滚动条槽，保证冻结比例的布局前提持续成立。
// 抓取偏移来自片段按下位置，不等于整个片段宽度或固定一半。
// DOM合成dragstart没有真实pointerdown时保留原事件坐标兼容路径。
// 原生DragEvent坐标可能是整数，提前保存PointerEvent的小数偏移可避免一帧漂移。
// 抓取记录属于手势ref，不渲染成工程数据，也不计入项目保存格式。
interface Gesture { payload: TimelinePayload; command: TimelineCommand; clips: LiveTimelineClip[]; assets: readonly EditorMediaAsset[]; fps: number; range: number; pixels: number; offset: number; length: number; lane: HTMLDivElement | null; x: number; updated: number; track: string; locked: readonly string[]; }

// 同一个函数同时服务dragover和自动横滚后的草稿更新。
// lane矩形已经反映滚动量，重复加scrollLeft会让落点越滚越偏。
// 位置先按帧取整，再交给真正提交也使用的纯校验函数。
// 视频源只能入V1；分离音轨只能沿原音轨移动，不通过跨轨暗中转换类型。
// 失败轮廓仍显示预计起点，用户可以看懂是重叠还是轨道不支持。
// assets只用于验证引用身份，不触发ffprobe或解码。
// 总长不会在这里提交，因此无效右拖不会拉长工程信息条。
// view的length来自起点快照，不随当前片段重新测像素宽度。
// pixels是手势开始的秒/像素比例，和本轮标尺保持一致。
// 没有lane意味着鼠标已离开轨道，不凭旧坐标继续画有效落点。
// 自动滚动改变的是lane矩形left，故每次草稿都重新读取该矩形。
// 读取布局只发生在事件或定时回调内，首帧渲染不依赖DOM。
// 先算start再构造候选命令，create和move复用完全相同的坐标入口。
// 候选命令只替换start，不能随鼠标跨行把V1改成音频轨。
// 业务校验成功还不够，实际命中行也必须等于起始轨道才显示有效样式。
// 这避免视频拖到A1或A1音轨拖到V1时误用原轨空隙而显示蓝框。
// 无效原因优先说明轨道限制，其次说明模型返回的碰撞或参数问题。
// 同一草稿既供固定状态栏也供轮廓消费，二者不各算一份时间。
// start保留项目帧精度，显示两位小数只是一种简短提示格式。
// 真正提交不从这段格式化文本读回秒数，避免两位小数丢帧。
// length来自起始快照，不根据CSS最小宽度反推媒体长度。
// 若已经leave使lane为空，就返回null，不在旧轨道继续画残影。
// 先读当前lane的轨道编号，再把该编号交给共同碰撞模型。
// 若先按旧轨计算再换目标，跨轨空位可能被旧轨邻居错误挤到末尾。
// 不同类型的目标仍可展示无效轮廓，但永远不能在drop时创建实例。
// 目标锁定的轮廓必须明确无效，不能等松手才悄悄拒绝一个显示合法的候选。
// reason优先显示锁定，再显示类型，再显示模型碰撞结果，与真实拒绝原因一致。
// start使用解析后的合法起点，遇到同轨障碍仍保留既有最近完整空位行为。
// 草稿track使用目标lane，让用户看见将要进入哪一层，而非留在原层画幽灵。
// length保持原片段时长，跨层移动不能通过缩短自己来伪造合法位置。
// 此方法供鼠标hover和自动滚动共同调用，不能让两者使用不同目标轨。
function gestureDraft(gesture: Gesture): TimelineDraft | null {
  // 起始track是抓取时的事实，不从当前鼠标经过的行推导通道变化。
  // 轮廓像滑在固定导轨上的尺子，横向可动，纵向始终留在原轨道。
  // 当前经过行仍用于判断valid，所以锁住纵坐标不代表跨轨经过可以提交。
  // 即使鼠标在错误轨道上，用户也能从原轨上的无效轮廓看出预计水平起点。
  // 自动滚动与dragover都从这里取同一个结果，不出现标尺动而候选不动。
  // 离开全部轨道时lane为null，轮廓清除而非继续显示一个过期有效落点。
  if (!gesture.lane) return null;
  const start = timelineDropTime(gesture.x, gesture.lane.getBoundingClientRect().left, gesture.pixels, gesture.offset, gesture.fps);
  const track = gesture.lane.dataset.editorTrackLane ?? "";
  const compatible = sameTrackKind(gesture.track, track);
  const locked = gesture.locked.includes(track);
  const result = resolveTimelineCommand(gesture.clips, gesture.assets, { ...gesture.command, track: track as TrackId, start }, gesture.fps);
  // 轮廓锁在所属行，跨轨经过也不会暗示可以垂直移动。
  // 新视频只允许V1，已有分离音频则只允许其当前音轨。
  // 横坐标继续使用真实滚动后的lane矩形，不复制第二套滚动层。
  return { start: result.ok ? result.clip.start : start, length: gesture.length, track, valid: compatible && !locked && result.ok, reason: locked ? t("toolBox.editorUi.trackLocked") : !compatible ? t(isVideoTrack(gesture.track) ? "toolBox.editorUi.videoTrackOnly" : "toolBox.editorUi.sameTrackOnly") : result.ok ? t("toolBox.editorUi.validPlacement") : t(`toolBox.editorUi.${result.reason}`) };
}

// 边缘自动滚动每次最多十八像素，不一次跳到工程末尾。
// 左边界取V1可见内容与滚动体的交集，sticky轨道头不是可落点区域。
// 鼠标停在边缘时仍重新读取lane矩形，所以候选和标尺一起向前。
// 超过一秒没有有效dragover就停，移出窗口不会无限滚动。
// scrollLeft天然受浏览器内容边界限制，不能越过负数或最大滚动量。
// 只有手势存在时调用，结束与卸载由effect清除定时器。
// 这段计时仅服务滚动，不伪造视频播放进度。
// 没有改变range或工程时长，横滚不会触发尺子缩放。
// 滚动区矩形描述可见窗口，lane矩形描述工程内容，两者不可互换。
// 左侧sticky轨道头覆盖内容，故可见边界至少从轨道头右边开始。
// 否则横滚后靠近“V1”文字时不会触发向左滚动，用户难以返回开头。
// 右侧阈值只决定速度方向，实际scrollLeft由浏览器限制到合法范围。
// 每次18px配合60ms节拍，速度有上限，不随视频帧率成倍加快。
// 当鼠标不在边缘32px内时step为零，手势可以停在中间精确落点。
// 没有lane表示不在任何可接收行，不能凭上次x继续自动滚。
// 最后over超过1秒也停止，防止窗口外不再派发事件时一直运行。
// 定时器仅更新视口和草稿，既不提交位置，也不推进源播放时间。
// 取消会清空gesture，下一次tick立即成为无操作，effect随后移除计时器。
function autoScroll(gesture: Gesture | null, scroller: HTMLDivElement | null) {
  if (!gesture?.lane || !scroller || Date.now() - gesture.updated > 1000) return;
  const box = scroller.getBoundingClientRect();
  const header = scroller.querySelector('[data-editor-track-head="V1"]')?.getBoundingClientRect();
  const left = Math.max(header?.right ?? box.left, gesture.lane.getBoundingClientRect().left);
  const step = gesture.x < left + 32 ? -18 : gesture.x > box.right - 32 ? 18 : 0;
  if (step) scroller.scrollLeft += step;
}

// 切换路由前仅提醒真实片段工程，不为仅导入素材伪造已保存状态。
// 普通导航链接在捕获阶段拦截，取消确认仍停在原实例，草稿与媒体保持。
// 新窗口、下载和同页链接不属于离开当前工程，不附加重复弹窗。
// beforeunload由浏览器显示系统提示，不能自造“已自动保存”的消息。
// 监听仅在已有片段时存在，空会话不会增加离开负担。
// 清理配对移除，不让下一个工具继续收到旧工程的确认。
// 确认只保护当前页面会话，没有偷偷写入localStorage或用户JSON。
// 应用主窗口强制退出的系统路径仍由Electron拥有，本层不扩展IPC。
// 页面内导航与系统关闭是两种事件，这里分别使用click和beforeunload。
// 点击监听用捕获阶段，能在Next链接执行路由切换前给用户取消机会。
// 从图标子节点点击也通过closest找到真实链接，不只判断事件target是a。
// Element判断排除纯文本等非元素target，避免对未知对象调用closest。
// Ctrl/Meta打开新页不离开当前工程，因此无需弹出未保存提醒。
// 带target或download的链接也不占用当前实例，保留其原生行为。
// 相同href不代表离开，不为重复点击当前导航制造无用确认。
// 取消时同时阻止默认行为与后续传播，路由不会绕过用户回答。
// 确认时不调用另一份导航API，继续交给原链接保持兼容。
// beforeunload只能请求浏览器显示离开提示，具体文案由浏览器决定。
// dirty只取是否已有片段，导入素材而未安排不会假装存在已保存工程。
// 监听在dirty变化时配对解除，空工程没有遗留的确认拦截。
// 这不是工程保存功能，确认离开后数据按本轮临时会话边界释放。
function useTimelineLeaveGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    // document订阅收到浏览器原生事件，片段右键收到React合成事件，二者不能混用。
    // 显式globalThis避免新菜单的类型import遮住原有DOM类型。
    // 注册与清理保留同一个函数引用，菜单扩展不改变离开确认的生命周期。
    const navigate = (event: globalThis.MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target || link.download || link.href === location.href || event.ctrlKey || event.metaKey || event.button !== 0) return;
      if (!window.confirm(t("toolBox.editorUi.unsavedTimeline"))) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [dirty]);
}

// 状态属于本次正式入口；静态样板只使用可选接口，不调用此Hook。
// 会话UUID不放在可见HTML中，预渲染和水合不会因随机文本不一致。
// selectedClipId与素材选择通过不同方法更新，筛选不会改变工程引用。
// viewed区分已选片段与正在查看源，返回节目只结束查看，不清除选择。
// scrollRef只在事件/effect中读，渲染不借ref推导首帧。
// range至少三十秒并留十秒空位，为末尾拖动提供可达空间。
// 空位只是视口，不参与ProjectInfoStrip的真实总长。
// 真实duration仍只按最晚end计算。
// clips、selectedId、viewed和notice构成一次工程界面的最小快照。
// clips描述安排事实，selectedId描述属性目标，两者不能由源播放器决定。
// viewed控制是否正在看该片段源，关闭查看不清除属性目标。
// notice只保存最后一次工程操作反馈，不与导入摘要互相竞争。
// update使用部分字段合并，单独选择不会意外清空已有clips。
// 空初始数组保证LIVE-01导入不会自动带入DEMO_CLIPS。
// 当前状态仅在页面实例内存在，返回正式页会从空工程重新开始。
// 没有把工程塞入素材对象，筛选或更新封面不会改写片段起点。
// tracks是正式轨道顺序，不能把候选行混进去影响画面覆盖。
// limits与clips归同一会话拥有者，设置和实际命令不能各读一份上限。
// dragKind只提供可见候选类型，手势结束后由frozen为空阻止继续绘制。
// 原clips仍是唯一工程安排表，多轨没有建立第二份播放专用时间数组。
// selectedId继续只代表属性目标，层序读取tracks，不再优先显示所选视频层。
// currentTime仍是节目秒数，修剪后源时间由sourceIn补偿，不改变这份时间单位。
// 锁表以轨道编号存储，新增V2不会继承V1的锁，也不反向解锁原轨。
// 工程初始化从DEFAULT_TRACKS复制数组，不能由某个实例修改全局默认列表。
// hiddenTracks属于当前工程会话，不放进全局素材或生成队列状态。
// 该表与lockedTracks分开，隐藏不等于锁定，也不改变原碰撞限制。
// 隐藏轨的片段仍保留在clips，工程总长仍包含它们的时间安排。
// 显隐回调只修改隐藏表，不触发源入点、片段移动或选择切换。
// 视频图层装配先过滤隐藏表，省去隐藏源真实解码资源。
// 音轨可见性不在此启用，音频不参与画面层级。
// 空初始隐藏表表示所有正式轨道可见，不把旧默认轨设成隐藏。
// 同轨禁止重叠仍由resolveTimelineCommand检查，隐藏不是绕过碰撞的理由。
// 锁轨仍由提交边界检查，显示开关不授予字段或右键编辑权限。
// 多轨上限与候选新增入口继续复用原轨道模型，本轮没有第二份加轨状态。
type ProjectSnapshot = TimelineProjectState;
// currentTime在工程中只有一份，标尺和节目时间码都观察这份书签。
// seekVersion不能由总时长或render次数推导，因为正常播放也会导致重渲染。
// lockedTracks保存轨道业务ID，不保存按钮DOM或某个片段的临时数组下标。
// 锁定V1意味着所有V1实例受保护，后续加进来的片段也需经过共同提交门槛。
// 上区布局不在这个快照里，分隔和临时面板不会改变工程未保存事实。
// viewed只决定是否查看工程源，不替代selectedId，返回节目仍保留属性目标。
// 素材sourceVisible由LIVE-01独立持有，两个领域通过有限回调协调优先级。
// snapshot不包含File或视频字节，复制片段只增加引用记录，不增加整段内存副本。
// reducer合并patch保留未涉及字段，所以锁轨不应把当前书签重置成零。
// currentTime的真实播放报告可以是非帧对齐的媒体秒数，显式seek才按项目帧舍入。
// 不能每次timeupdate都取整再seek媒体，否则会形成持续停顿。
// 工程时长仍从clips推导，不把currentTime当成片段最大结束时间。
export interface ProjectContext { step: (step: "undo" | "redo") => void; canUndo: boolean; canRedo: boolean; project: EditorPreviewProject; state: ProjectSnapshot; update: (patch: Partial<ProjectSnapshot>) => void; assets: readonly EditorMediaAsset[]; fps: number; onSelectClip: () => void; }
interface GestureContext { grab: RefObject<{ id: string; offset: number } | null>; project: ProjectContext; session: string; gesture: RefObject<Gesture | null>; scrollRef: RefObject<HTMLDivElement | null>; range: number; setRange: (range: number | null) => void; setDraft: (draft: TimelineDraft | null) => void; }

// 成功结果一次提交数组、选择和查看状态，失败只更新就地原因。
// 不先移动正式对象再回滚，重叠时工程始终保持原快照。
// 预览关闭与素材查看由宿主协调，本层不改素材高亮。
// 调用方可以传候选意图，但只有这个边界能够替换正式clips快照。
// 失败分支仅更新notice，保持当前选中实例和预览对象不变。
// 成功把新数组与新选择一起提交，避免出现选中尚未存在的片段。
// viewed同时开启，使预览引用的对象就是刚放置的实例。
// onSelectClip结束素材查看优先级，防止右侧预览仍停留在另一份素材。
// 这个回调不修改素材selectedId，列表的高亮不会被片段操作反向覆盖。
// notice通过有限翻译key输出，业务函数不返回磁盘路径或异常栈。
// 末尾添加与按键移动也从这里提交，不再各写一套状态更新。
// 不会调用播放方法，安排成功不等于用户同意开始播放或发出声音。
// 也不会写用户JSON，工程仍明确显示未保存。
// 最终提交重新确认来源与目标属于同一类型，hover通过不能替代这次校验。
// move检查源轨和目标轨，避免从锁轨移走，或往锁轨偷偷插入。
// add没有已有源轨，所以默认V1的锁不应封禁所有视频导入目标。
// 目标不存在时只允许当前nextTrack那一个编号，任意V999不能绕过数量设置。
// 两个条件分别守住已有轨权限和新轨分配权限，不能只看目标前缀。
// 解析结果通过后才插入新轨，任何拒绝或取消都不会留下空轨占名额。
// 源片段已有transform时直接保留，换层不重新套默认中心。
// 新创建片段才补默认构图，same-source的新实例仍得到独立对象。
// 选中与当前时间跟随新安排，素材列表高亮仍由其独立状态持有。
// 播放定位版本变化用于切到新安排起点，不表示保存或导出已经完成。
function commitTimeline(context: ProjectContext, command: TimelineCommand) {
  // 锁定检查放在提交入口，不只依赖片段按钮disabled，键盘末尾添加也需要保护。
  // add固定目标V1，move则从当前实例回查所属轨，不能根据鼠标当前经过行换轨。
  // 未知ID没有可绕过的默认轨道，后续resolve会明确拒绝未知移动。
  // 每次提交用当前state而不是旧gesture.clips，防止迟到事件覆盖最新工程。
  // resolve只产生候选数组，返回ok前不会写入任何正式片段位置。
  // 成功时把选择、预览意图、书签起点与新数组作为一个patch更新。
  // 这样属性和节目不会短暂指向尚未提交的新ID。
  // 书签跳到放置起点是显式查看意图，所以增加seekVersion，媒体随后保持暂停。
  // 选择源文件不在这个patch里，同源多实例移动不会改素材高亮。
  // 拒绝结果只更新notice，不把旧播放器卸载或把成功素材行标成error。
  // 位置提示只是工程内提交，没有磁盘保存、转码或视频文件移动含义。
  // 这一入口同时承接鼠标松手和键盘方向移动，不能给键盘保留旧重叠算法。
  const source = command.kind === "add" ? "V1" : context.state.clips.find(clip => clip.id === command.id)?.track;
  const track = command.track ?? source;
  if (!source || !track || !sameTrackKind(source, track) || context.state.lockedTracks.some(item => (command.kind === "move" && item === source) || item === track)) return;
  if (!context.state.tracks.includes(track as TrackId) && nextTrack(context.state.tracks, isVideoTrack(track) ? "V" : "A", context.state.limits) !== track) return;
  const result = resolveTimelineCommand(context.state.clips, context.assets, command, context.fps);
  if (!result.ok) { context.update({ notice: t(`toolBox.editorUi.${result.reason}`) }); return; }
  // 新安排初始化独立构图；移动只保留旧实例的构图，不按新时间重新居中。
// 新建可视片段才补默认构图，已有transform始终优先保留。
// 用item.transform存在性判断，不以其中x或opacity的真值判断是否初始化。
// 因此合法的x=0和opacity=0不会被当成缺省而恢复中心与不透明。
// audioOnly记录不补构图，即使其assetId仍指向含画面的视频素材。
// 默认对象每次独立创建，两次添加同一个源不共享可变模板。
// 项目尺寸取本工程参数，不从最近导入视频的宽高反推工程尺寸。
// 含已确认构图的复制或移动结果不会再次执行默认居中。
// 这个兼容补值发生在安排提交边界，不在每次render时改写已有数组。
// 失败的时间安排没有result，所以不会因先创建构图而留下半个片段。
// 演示DEMO常量不经过正式提交，不会被补值逻辑原地修改。
  const clips = result.clips.map(item => item.transform || item.audioOnly ? item : { ...item, transform: defaultTransform(context.project) });
  context.update({ tracks: context.state.tracks.includes(result.clip.track) ? context.state.tracks : insertTrack(context.state.tracks, result.clip.track), clips, selectedId: result.clip.id, viewed: true, currentTime: result.clip.start, seekVersion: context.state.seekVersion + 1, notice: t("toolBox.editorUi.placementDone") });
  context.onSelectClip();
}
// 选中现有片段不创建历史或另一份实例，未知ID不改变当前对象。
// 只打开该片段源查看，不把它的assetId写进素材列表的selectedId。
// 选择前检查ID仍在当前工程，过期DOM事件不会选中已不存在的对象。
// 选择只改变属性目标与查看状态，start/end不发生任何变化。
// 同源两个实例名称相同，选中仍由不同clipId分别表示。
// 宿主随后用assetId回查原素材，右侧头部显示实际文件名与封面。
// 素材列表可能正在筛选，片段选择不需要先让该素材行显示出来。
// 因此不会通过“点素材行”间接实现片段选择，避免污染另一套状态。
function selectTimeline(context: ProjectContext, id: string) {
  const clip = context.state.clips.find(clip => clip.id === id);
  if (!clip) return;
  context.update({ selectedId: id, viewed: true, currentTime: clip.start, seekVersion: context.state.seekVersion + 1 }); context.onSelectClip();
}
// 右键复制、分离和键盘删除共用一次工程提交，鼠标菜单没有第二份状态数组。
// 新身份由本会话生成，纯函数只负责检查与生成下一份快照。
// 失败只更新notice，选中对象和源播放器继续保留，不清空已有素材。
// 成功同时替换安排与选择，避免预览短暂引用不存在的音频实例。
// 删除成功没有选中项，因此关闭片段源查看；复制/分离选中新实例。
// onSelectClip只协调查看优先级，不改变素材列表的高亮。
// 分离是非破坏编辑，不调用文件删除、转码或新建输出目录。
// 在拖动结束后执行，避免菜单更新被尚未提交的旧手势快照覆盖。
// 工程时间仍由新数组的最大end计算，删除尾段后可以自然缩短。
// 操作不写用户JSON；关闭页面依旧有未保存提醒，不显示假保存成功。
// 相同动作重复点击会按当前状态重查，例如已分离视频不能再次产生音轨。
// 菜单在执行后关闭，错误原因仍留在时间线状态栏，便于用户换位置。
// 分离音频把当前tracks和limits交给原编辑命令，不再只查固定A1/A2。
// 已有空闲音轨优先使用；都占用时最多申请一个新的候选音轨。
// 结果成功后从实际clips收集新增轨，不能提前假设一定生成A3。
// 新轨插入仍走insertTrack，分离不会把音轨放进视频组破坏视觉层级。
// 删除片段不自动删除轨道，用户已有锁和轨道顺序不会突然消失。
// 复制留在源轨末尾，跨层移动能力不改变原复制菜单的语义。
// 每次编辑检查当前源轨锁，右键和键盘最终共用同一写入边界。
// 失败只更新就近状态提示，原片段的音频分离标记必须保持不变。
function commitTimelineEdit(context: ProjectContext, action: TimelineEdit, id: string) {
  // 菜单打开后可能已经有别的状态更新，因此在执行时重新读轨道锁和目标ID。
  // 复制后预览新副本起点，不沿用旧片段中的0.8秒进度冒充副本开始画面。
  // 分离后新音轨与原视频时间相同，但ID与媒体通道不同，预览生命周期必须独立。
  // 删除后selectedId为null，属性回项目事实，素材库原文件依然存在。
  // 如果被删的是末段，旧书签可能超过新总长，Math.min把它收回有效范围。
  // 如果工程被删空，总长零，书签也归零，不能留下悬在空轨上的旧蓝线。
  // 这里仍不自动恢复已分离视频的声音，音轨删除与视频静音是独立安排事实。
  // 错误分离不更新数组，禁止出现视频已静音却没有成功创建音轨的半次结果。
  // seekVersion增加让当前媒体知道这次查看是明确命令，不是正常进度回报。
  // 选择新对象不等于开始播放，真实play仍要由用户明确点击。
  // lockedTracks保持原值，复制或删除不能顺便解锁整个轨道。
  // 源预览优先级与素材高亮是两套状态；回调只结束素材查看，不改素材selectedId。
  // 选中新音轨后，宿主按该实例的audioOnly适配属性和真实媒体类型。
  // 删除后没有片段目标，属性头回空态，而不是退回上一次已删除的名字。
  // 复制成功的selectedId是新身份，使方向键下一次移动副本而非原片段。
  // 拒绝分离时不调用onSelectClip，原本正在查看的对象不会被无故切换。
  // 未保存提醒根据最终clips长度计算，删到空工程时不继续拦截离开。
  // 状态栏用editDone而非placementDone，删除操作不会误称为位置已移动。
  if (context.state.lockedTracks.includes(context.state.clips.find(clip => clip.id === id)?.track ?? "")) return;
  // 锁表与片段快照在同一次提交中读取，不能传菜单打开瞬间缓存的锁状态。
  // 源轨预检查负责快速退出，纯模型再次检查是最后一道共同门槛。
  // 分离会写目标音轨，所以必须把全部轨道锁交下去，不能只传源轨是否锁定。
  // 目标A1/A2的选择留在模型，菜单和键盘只表达分离意图，不自行猜落在哪一轨。
  // 模型拒绝只更新提示，后面的currentTime、seekVersion和选中实例均不会执行。
  // 这样锁住音轨的失败不会触发播放器切源，也不会把素材列表选中改为音频。
  // 原项目快照仍由会话持有，错误文案不能被当作已完成分离的替代结果。
  // trackLocked与overlap分开显示，让用户知道应解锁轨道还是调整同轨占用。
  // 新UUID只是候选身份，失败时不会插入数组，也没有待清理的媒体文件。
  // 本次仅补锁权限，没有启用多轨同时播放、跨轨移动或源文件提取。
  // 任何后续编辑入口继续调用这里，才能同时继承源轨和目标轨的限制。
  const result = applyTimelineEdit(context.state.clips, context.assets, action, id, crypto.randomUUID(), context.fps, context.state.lockedTracks, context.state.tracks, context.state.limits);
  if (!result.ok) { context.update({ notice: t(`toolBox.editorUi.${result.reason}`) }); return; }
  // 副本/新音轨从新实例起点查看；删掉末段则把书签收回新总长，不能悬在工程之外。
  const currentTime = result.clips.find(clip => clip.id === result.selectedId)?.start ?? Math.min(context.state.currentTime, timelineDuration(result.clips));
  const tracks = result.clips.reduce((current, clip) => current.includes(clip.track) ? current : insertTrack(current, clip.track), context.state.tracks);
  context.update({ tracks, clips: result.clips, selectedId: result.selectedId, currentTime, seekVersion: context.state.seekVersion + 1, viewed: result.selectedId !== null, notice: t("toolBox.editorUi.editDone") });
  context.onSelectClip();
}

// 右键锚点与工程状态分开，关闭菜单不会丢失选择、位置或真实媒体元数据。
// 菜单引用当前片段ID，执行时仍由共同提交函数重新校验，不信任旧菜单快照。
// 打开菜单先取消拖动，防止一个手势同时产生右键编辑和延迟松手两份提交。
// 右键按实例选中，与左键选中采用同一方法；素材选择仍保持独立。
// 客户区坐标直接交给ContextMenuShell，公共外壳会处理窗口四边与Portal裁切。
// Shift+F10和菜单键从按钮矩形定位，不假造鼠标事件或读取全局鼠标位置。
// Delete只在片段按钮聚焦时处理，搜索框里的删除键仍用于编辑文字。
// 组合键Ctrl/Meta/Alt不劫持，系统快捷键继续交给原应用或操作系统。
// Escape与点击外部由公共菜单外壳负责，本Hook只处理关闭后的焦点恢复。
// 触发按钮已被删除时不恢复到脱离DOM的节点，避免无效焦点请求。
// 鼠标点到外部输入框会按浏览器默认行为获得焦点，不添加模态遮罩。
// 各页面实例分别持有锚点，不以全局变量记“最近右键的片段”。
// 音频菜单和视频菜单共享开关流程，能力差异由片段参数与真实音轨信息决定。
// 内部没有网络请求或文件句柄，卸载时React释放锚点，公共外壳清理全局监听。
// 开始新的拖动也关闭旧菜单，防止菜单遮住轨道落点或保留旧目标。
// 键盘开菜单后焦点进入第一项，关闭后回到原按钮，保持可继续逐帧移动。
// 删除和复制回调不接受任意数组写入，只接受有限动作名称。
// 标尺与播放头都没有从右键菜单读位置，修改工程后仍由同一range驱动。
// 键盘入口只解释按键，锚点和焦点恢复继续交给拥有菜单状态的Hook。
// 菜单键按当前按钮矩形定位；Delete与方向键仍调用原工程命令，不复制时间模型。
// 单独保留这个事件边界，避免菜单状态编排把键盘分支和锁轨判断堆成过长函数。
// open由当前实例注入，不能通过全局“最近菜单”查找目标。
// 普通输入框不调用此方法，Delete不会误删正在输入的素材名。
// Shift只用于F10或原移动步长，Ctrl/Alt/Meta保留给应用和系统。
// 删除仍要求没有活跃手势，旧拖动结束不能覆盖刚完成的删除。
// 未识别按键由moveByKey继续判断，不添加全局preventDefault截断Tab路径。
function timelineClipKey(context: GestureContext, event: KeyboardEvent<HTMLButtonElement>, id: string, open: (id: string, x: number, y: number, trigger: HTMLButtonElement) => void) {
  if (event.target !== event.currentTarget || event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    open(id, rect.left, rect.bottom, event.currentTarget);
  } else moveByKey(context, event, id);
}
function useTimelineMenu(context: GestureContext) {
  // anchor.trigger保存的是被右键的按钮，不能用document.activeElement猜同名目标。
  // 片段右键可能发生在封面span上，绑定处提供currentTarget保证拿到完整按钮。
  // 打开菜单时选择片段会更新属性，但不会立刻播放或开启声音。
  // ContextMenuShell的聚焦发生在Portal布局后，菜单尚未挂载前不抢焦点。
  // 关闭恢复使用preventScroll，避免时间线突然横滚回触发按钮的默认位置。
  // 目标被删除时isConnected为false，跳过恢复，不向旧DOM发送方向键。
  // Shift+F10定位在片段左下角，公共外壳会在窗口底边自动向内调整。
  // Delete操作先检查是否有活跃手势，不能边拖边删再把旧快照提交回来。
  // 菜单打开动作主动取消旧手势，因此点击菜单不必再等待dragend。
  // perform执行有限动作后关闭锚点，迟到的第二次点击不能继续使用旧菜单实例。
  // 外部文件拖入不进入此菜单状态，继续由LIVE-01统一导入并逐文件反馈。
  // 左右方向键分支仍回到moveByKey，音轨没有一套独立的帧步长实现。
  const [anchor, setAnchor] = useState<LiveClipMenuAnchor | null>(null);
  const close = () => { setAnchor(null); if (anchor?.trigger.isConnected) anchor.trigger.focus({ preventScroll: true }); };
  const open = (id: string, x: number, y: number, trigger: HTMLButtonElement) => {
    if (context.project.state.lockedTracks.includes(context.project.state.clips.find(clip => clip.id === id)?.track ?? "")) return;
    // 先结束仍聚焦的字段草稿，再打开菜单；否则失焦提交可能在菜单挂载后触发滚动关闭。
    // preventScroll保留横向时间位置，右键选择不把片段强行滚回视口中心。
    trigger.focus({ preventScroll: true });
    cancelGesture(context); selectTimeline(context.project, id); setAnchor({ id, x, y, trigger });
  };
  const contextMenu = (event: MouseEvent<HTMLButtonElement>, id: string) => { event.preventDefault(); open(id, event.clientX, event.clientY, event.currentTarget); };
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>, id: string) => timelineClipKey(context, event, id, open);
  const perform = (action: TimelineEdit) => { if (anchor) commitTimelineEdit(context.project, action, anchor.id); close(); };
  return { anchor, close, perform, contextMenu, keyDown };
}
// reducer合并当前快照，避免近乎同时的选择和反馈互相覆盖。
// 正式数组初始为空，不读取DEMO或用户持久化工程。
// reducer使用当前快照合并patch，不依赖闭包里更旧的notice或viewed。
// 数组仍由命令函数产生，reducer不在合并时偷偷排序、去重或改时间。
// 初始选择为空，属性区由宿主显示未选片段而不是第二个演示素材。
// assets由LIVE-01会话传入，只读使用，不创建第二份媒体缓存。
// fps由工程配置传入，当前固定30，不跟随选中的24fps源改变。
// onSelectClip是宿主协调函数，Hook本身不认识素材列表的内部状态结构。
function useTimelineProject(assets: readonly EditorMediaAsset[], fps: number, onSelectClip: () => void, project: EditorPreviewProject): ProjectContext {
  const initial: ProjectSnapshot = { tracks: [...DEFAULT_TRACKS], limits: { ...DEFAULT_TRACK_LIMITS }, currentTime: 0, seekVersion: 0, hiddenTracks: [], lockedTracks: [], clips: [], selectedId: null, selectedIds: [], viewed: false, notice: "" };
  // 历史只截取确认的结构变化，播放回报和素材选择不会每帧占用撤销步骤。
  // 旧命令仍发原patch；reducer与快捷键/按钮共享一次恢复，保持媒体版本递增。
  const [history, dispatch] = useReducer(timelineHistoryReducer, { present: initial, past: [], future: [] });
  const update = (patch: Partial<ProjectSnapshot>) => dispatch({ patch });
  return { state: history.present, update, assets, fps, onSelectClip, project, step: step => dispatch({ step }), canUndo: canStepHistory(history, "undo"), canRedo: canStepHistory(history, "redo") };
}
// 结束只清理草稿和冻结比例，真实工程数组不需要恢复，因为尚未改写。
// ref先清空，迟到的drop和自动滚动就不能借旧手势提交。
// 取消不需要把片段从候选位置挪回来，因为候选从未写入正式数组。
// 先清ref再更新展示状态，迟到drop看到空手势就会拒绝。
// setRange(null)恢复正常工程视口计算，不把冻结的旧标尺留到下一次拖动。
// setDraft(null)同时移除轮廓与固定状态栏中的候选时间。
// 这里不改notice，已存在的操作结果仍可被用户阅读。
// 也不改选择，取消移动不会让属性面板突然换成另一实例。
function cancelGesture(context: GestureContext) {
  context.gesture.current = null; context.setRange(null); context.setDraft(null);
}
// 起点快照只取当前会话真实身份，拖动失败行或未知片段被原生取消。
// pixels来自V1内容列，不包含sticky头部的宽度。
// 抓取偏移以秒冻结，不能在移动中按新位置重新计算。
// 从真实滚动容器查V1内容列，样板或未挂载时间线无法启动有效手势。
// 素材行的id用于查assets，片段按钮的id用于查clips，两个查找不混用。
// ready检查在起点再做一次，不能只依赖draggable属性防止非法调用。
// 缺少lane或身份时preventDefault，浏览器不会继续一个无源拖动。
// asset创建命令生成新UUID，clip移动命令保留原UUID。
// pixels用内容列宽除range，避开全窗口宽度和轨道头宽度。
// 片段offset从当前按钮left计算，窄片段也保留真实抓取位置。
// 素材拖入没有既有工程位置，offset固定为零使鼠标代表新起点。
// 新建草稿长度向上对齐项目帧，与最终命令使用相同长度规则。
// lane初始为空，必须实际经过一条轨道后才产生可见候选。
// setData只写三项身份，不把路径、视频字节或整个工程暴露在拖动正文。
// effectAllowed分别为copy和move，让浏览器表达复制引用与移动安排的差别。
// 冻结range在发布手势后发生，随后的渲染使用同一标尺分母。
// 清空旧notice只结束上次工程反馈，LIVE-01导入信息不受影响。
// 原生抓取先保存PointerEvent偏移，再由dragstart写DataTransfer身份。
// 浏览器的整数dragstart坐标会丢小数，直接反算时会让细秒尺产生一帧漂移。
// 只对可信原生事件读取按下偏移，合成回归事件仍使用自己的明确坐标。
// 消费后立即清掉grab，下一次拖动不能误用上一次单击的位置。
// 来源视频、分离音频都按同一比例计算offset，不能把音轨固定从左端抓取。
// 新的候选轨只由dragKind显示，真实轨道此时仍未写入state.tracks。
// 来源锁定的move在写载荷前拒绝，不给后续drop留一个貌似合法的会话。
// 素材可拖时仍检查ready/video，加载或失败的行不能创建片段。
// 载荷只存session/kind/id，不包含原始磁盘路径或可执行代码。
// 隐藏原生拖影只是防止系统截图影子遮住时间轮廓，真实片段仍留在原位。
function startGesture(context: GestureContext, event: DragEvent<HTMLElement>, kind: "asset" | "clip", id: string) {
  const { state, assets, fps } = context.project;
  const lane = context.scrollRef.current?.querySelector<HTMLDivElement>('[data-editor-track-lane="V1"]');
  const clip = kind === "clip" ? state.clips.find(item => item.id === id) : undefined, asset = assets.find(item => item.id === id);
  if (clip && state.lockedTracks.includes(clip.track)) { event.preventDefault(); return; }
  if (!lane || (kind === "asset" ? asset?.state !== "ready" || asset.kind !== "video" : !clip)) { event.preventDefault(); return; }
  const payload = { session: context.session, kind, id }, command: TimelineCommand = kind === "asset" ? { kind: "add", id: crypto.randomUUID(), assetId: id, start: 0 } : { kind: "move", id, start: 0 };
  const pixels = lane.getBoundingClientRect().width / context.range, offset = kind === "clip" ? (event.isTrusted && context.grab.current?.id === id ? context.grab.current.offset : event.clientX - event.currentTarget.getBoundingClientRect().left) / pixels : 0;
  context.grab.current = null;
  context.gesture.current = { payload, command, clips: state.clips, assets, fps, range: context.range, pixels, offset, length: clip ? clip.end - clip.start : Math.ceil((asset?.duration ?? 0) * fps) / fps, lane: null, x: event.clientX, updated: Date.now(), track: clip?.track ?? "V1", locked: state.lockedTracks };
  // 浏览器默认影子会随鼠标上下漂移，隐藏它，只显示锁轨的真实位置轮廓。
  // 透明画布只用于本次dragImage，不挂到DOM，也不保留视频封面副本。
  // 正式片段仍在原位，只有有效松手才提交水平位置。
  event.dataTransfer.setDragImage(document.createElement("canvas"), 0, 0);
  event.dataTransfer.setData(TIMELINE_DRAG_TYPE, JSON.stringify(payload)); event.dataTransfer.effectAllowed = kind === "asset" ? "copy" : "move";
  context.setRange(context.range); context.project.update({ notice: "", dragKind: isVideoTrack(clip?.track ?? "V1") ? "V" : "A" });
}
// hover只发布轮廓与dropEffect，不写clips，红框不等于错误工程已经产生。
// DataTransfer在保护模式不能读正文，本轮只认本地已有的起点快照。
// 先识别专用MIME，外部Files会继续冒泡到宿主的统一导入流程。
// 匹配内部MIME才preventDefault，表示这条轨道愿意处理内部落点。
// stopPropagation避免宿主把内部安排再次解释成文件导入。
// 浏览器dragover阶段可能禁止读取正文，所以此处只用已有本地手势。
// 没有手势时给invalid反馈，不根据当前列表首项猜测源。
// 每次over都刷新lane、x和updated，自动滚动据此追踪最后有效位置。
// 草稿通过统一函数生成，hover本身不直接判断重叠区间。
// 只有当前所属轨道的有效落点显示copy或move，跨轨与非法位置显示none。
// 鼠标光标只是辅助，文本原因仍保留在轮廓和status中。
// 无效位置也保留草稿，用户移动一点就能看到是否已离开冲突区。
// 内部MIME由时间线拥有，外部Files继续冒泡给素材导入宿主。
// dragOver必须preventDefault才能接收drop，同时stopPropagation防止外层误当文件导入。
// 没有活跃起点就拒绝，不能仅凭一个格式正确的MIME创建工程对象。
// 每次更新lane、x和时间戳，自动滚动才能读取最近目标而非上一行。
// dropEffect根据目标类型与共同草稿valid一起决定，不把锁轨显示成可复制。
// 有效add显示copy，move显示move，让浏览器反馈和最终命令语义一致。
function hoverGesture(context: GestureContext, event: DragEvent<HTMLDivElement>, track: string) {
  if (!event.dataTransfer.types.includes(TIMELINE_DRAG_TYPE)) return;
  event.preventDefault(); event.stopPropagation();
  const current = context.gesture.current;
  if (!current) { event.dataTransfer.dropEffect = "none"; context.project.update({ notice: t("toolBox.editorUi.invalidPlacement") }); return; }
  current.lane = event.currentTarget; current.x = event.clientX; current.updated = Date.now();
  const next = gestureDraft(current); context.setDraft(next);
  event.dataTransfer.dropEffect = sameTrackKind(current.track, track) && next?.valid ? current.payload.kind === "asset" ? "copy" : "move" : "none";
}
// drop重新解析实际载荷并检查会话、类型、身份，不能只相信旧hover。
// 松手坐标再次计算，最后一帧鼠标移动没有dragover也不会使用过时轮廓。
// 无效或取消不进入commit，原片段和项目时长自然保留。
// 松手阶段允许读取DataTransfer正文，此时才做JSON字段与会话检查。
// 解析成功还要与起点快照比较kind和id，防止中途替换载荷。
// 命中非所属轨道报告限制，视频与音频都不能通过拖放隐式跨轨。
// 任一身份条件失败都会结束手势，不能留下可继续提交的旧草稿。
// 最后clientX重新写入快照，保证松手比最后一次dragover更准。
// 同样重新读取lane矩形，手动或自动横滚后的left变化被计入。
// start来自未格式化的帧值，不能从“4.03s”提示字符串反解析。
// commit再次使用当前工程上下文校验，不能只相信上次蓝色轮廓。
// 执行完统一cancel，成功与失败都释放冻结比例和轮廓。
// Files并不匹配专用MIME，因此不会进入这个片段提交分支。
// drop重新解析会话与id，不能把hover已展示合法当成载荷可以免检。
// 目标类型需要再次确认，拖过合法V2后松到A1不能继续提交旧目标。
// 最后一次位置用真正drop的clientX刷新，不能只采用上一个dragOver的位置。
// 只在next.valid为真时提交，锁定或错误类型都不允许走最近空位替代。
// 正式命令携带目标track，解析与最终插入不会退回默认V1。
// 无论成功失败最后都清手势，避免候选行、滚动计时器继续留在页面。
function dropGesture(context: GestureContext, event: DragEvent<HTMLDivElement>, track: string) {
  if (!event.dataTransfer.types.includes(TIMELINE_DRAG_TYPE)) return;
  event.preventDefault(); event.stopPropagation();
  const current = context.gesture.current, payload = readTimelinePayload(event.dataTransfer.getData(TIMELINE_DRAG_TYPE), context.session);
  if (!current || !payload || payload.id !== current.payload.id || payload.kind !== current.payload.kind || !sameTrackKind(current.track, track)) {
    context.project.update({ notice: t(current && !sameTrackKind(current.track, track) ? current.track === "V1" ? "toolBox.editorUi.videoTrackOnly" : "toolBox.editorUi.sameTrackOnly" : "toolBox.editorUi.invalidPlacement") }); cancelGesture(context); return;
  }
  current.lane = event.currentTarget; current.x = event.clientX;
  const next = gestureDraft(current);
  if (next?.valid) commitTimeline(context.project, { ...current.command, track: track as TrackId, start: next.start });
  cancelGesture(context);
}
// 方向键只在聚焦片段按钮生效，输入框和搜索框没有全局移动快捷键。
// 拖动中不允许键盘并行提交，避免旧手势快照覆盖键盘新位置。
// 左右键只在片段按钮上监听，焦点留在搜索框时仍是正常文字导航。
// Alt、Ctrl、Meta组合键交给系统或其他明确快捷键，不抢占组合行为。
// 普通左右移动乘1/fps，当前30fps对应一帧约0.0333秒。
// Shift只改变步长为一秒，不改变碰撞门槛或源视频帧率。
// preventDefault阻止方向键顺便滚动页面，让一次按键只表达一个意图。
// 拖动活跃时拒绝键盘提交，避免两种手势同时修改同一安排。
// 不存在的实例ID不会默认移动当前选中项，身份始终显式。
// 负起点与同轨冲突由共同resolve贴最近合法边缘，键盘和鼠标采用同一规则。
// 每次有效按键也是正常提交，工程总长和属性预览同步更新。
// Delete由上层菜单适配处理；本方法只移动，不接切分或修剪快捷键。
function moveByKey(context: GestureContext, event: KeyboardEvent<HTMLButtonElement>, id: string) {
  if (context.gesture.current || !["ArrowLeft", "ArrowRight"].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  const clip = context.project.state.clips.find(item => item.id === id); if (!clip) return;
  commitTimeline(context.project, { kind: "move", id, start: clip.start + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 1 : 1 / context.project.fps) });
}
// 生命周期只依赖冻结视口是否存在，hover不反复销毁并创建计时器。
// Escape、resize、失焦、dragend统一清草稿，不提交最后一帧。
// 清理解除所有监听，不留下跨页面自动滚动或过期源引用。
// 冻结range非空意味着一次手势已启动，此时才安装取消和自动滚动资源。
// 依赖不是draft，鼠标经过每个像素不会销毁又重建计时器。
// Escape监听在捕获阶段，轮廓内子节点不会截住取消意图。
// 取消不依赖当前鼠标所在元素，离开轨道后仍能用Escape结束。
// dragend监听挂在document，源从素材行变成片段按钮也走同一清理。
// resize取消是为了防止已冻结的像素比例在布局变宽后失真。
// blur取消是为了不在窗口外继续提交旧坐标，后台不保留活跃拖动。
// timer每次读取最新gesture.current，清理ref后就不能继续滚动。
// 返回清理函数同时移除四种监听与计时器，不能只清React轮廓。
// 卸载时清ref避免闭包继续持有旧素材和工程数组。
// setDraft由useState提供稳定身份，hover更新不会让此effect无意义重跑。
// 本轮定时器只服务拖动视口，真实媒体进度仍来自媒体事件。
function useGestureLifecycle(gesture: RefObject<Gesture | null>, scrollRef: RefObject<HTMLDivElement | null>, setDraft: (draft: TimelineDraft | null) => void, setRange: (range: number | null) => void, range: number | null) {
  useEffect(() => {
    if (range === null) return;
    const abort = () => { gesture.current = null; setDraft(null); setRange(null); };
    const key = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); abort(); } };
    const timer = setInterval(() => { autoScroll(gesture.current, scrollRef.current); if (gesture.current) setDraft(gestureDraft(gesture.current)); }, 60);
    const stopResize = watchTimelineWidth(scrollRef.current, abort);
    document.addEventListener("dragend", abort); document.addEventListener("keydown", key, true); window.addEventListener("resize", abort); window.addEventListener("blur", abort);
    return () => { clearInterval(timer); stopResize(); document.removeEventListener("dragend", abort); document.removeEventListener("keydown", key, true); window.removeEventListener("resize", abort); window.removeEventListener("blur", abort); gesture.current = null; };
  }, [range, gesture, scrollRef, setDraft, setRange]);
}

// 导航开合会改变工作区宽度，却未必触发window.resize。
// 拖动比例按起点冻结，容器变宽后继续沿用旧pixels会让落点发生偏移。
// 这里观察真实时间线视口，只在宽度变化时结束当前手势。
// 横向滚动只改变scrollLeft，不改变clientWidth，所以不会误取消正常横滚。
// 第一次ResizeObserver通知也会执行，但宽度相等时不触发取消。
// 观察对象是滚动视口，不是会随工程总长延长的内容grid。
// 因此合法放置后的工程边界更新不被误当成用户缩放窗口。
// clientWidth排除滚动条，反映真正可用于时间线的区域宽度。
// 宽度变化只取消草稿，不把候选写到旧比例对应的位置。
// 用户可在新布局下重新抓取，下一次手势会读取新的DOM像素比例。
// 回调使用同一abort，所以宽度取消与Escape具有一致的恢复语义。
// 没有scroller时返回空清理，尚未挂载的页面不会创建观察器。
// 每次手势只安装一个观察器，hover更新不额外创建一份订阅。
// 手势结束时disconnect，不能让旧观察器在新手势中误触取消。
// 页面卸载也通过同一清理路径解除，避免继续保留旧DOM引用。
// 此观察不修改全局导航状态，只响应实际容器几何变化。
// ResizeObserver属于浏览器能力，渲染层没有因此引入Node或Electron。
// 窗口resize监听仍保留，纵向缩窗也按既有策略取消当前手势。
// 该机制不表示实现时间线缩放工具，缩放滑条仍未接通。
// 它只保护一次拖动的坐标不变量，保证冻结尺子的前提成立。
// 相同宽度下的主题切换不会取消，颜色变化与工程坐标无关。
// 观察回调不推进播放头，也不读取源播放器currentTime。
// 返回的清理函数由生命周期拥有者调用，不交给素材行分别管理。
// 这样素材拖入与片段移动共享相同的布局变化取消门槛。
function watchTimelineWidth(scroller: HTMLDivElement | null, abort: () => void) {
  if (!scroller) return () => {};
  const width = scroller.clientWidth;
  const observer = new ResizeObserver(() => { if (scroller.clientWidth !== width) abort(); });
  observer.observe(scroller);
  return () => observer.disconnect();
}
// 手势状态与工程状态分开，setDraft不触发clips替换或元数据读取。
// UUID只用于DataTransfer身份，不渲染随机文本，不造成水合不一致。
// 会话UUID用一次性state初始化，普通重渲染不会让正在拖动的载荷失效。
// UUID只参与事件校验，不作为服务端HTML里的可见文字或节点key。
// frozen为空时读取baseRange，拖动开始后读取固定range。
// 草稿属于手势拥有者，公共素材行和片段外壳都不持有另一份副本。
// gesture ref不触发渲染，用于定时器读取最新活跃手势。
// scrollRef指向真实滚动节点，窗口有多个编辑器时不会查错实例。
// leave先用contains过滤内部子节点切换，经过封面文字不应让轮廓闪烁。
// 真正离开当前lane时只清lane和draft，保留原始抓取偏移以便拖回。
// 结束、取消和离开一条轨道是三个不同层级，不能共用“全部清空”。
// context把同一套状态和回调传给所有事件适配，避免各轨道建独立会话。
function useTimelineGesture(project: ProjectContext, baseRange: number) {
  const [session] = useState(() => crypto.randomUUID()), [frozen, setRange] = useState<number | null>(null);
  const [draft, setDraft] = useState<TimelineDraft | null>(null);
  const grab = useRef<{ id: string; offset: number } | null>(null);
  const gesture = useRef<Gesture | null>(null), scrollRef = useRef<HTMLDivElement>(null);
  useGestureLifecycle(gesture, scrollRef, setDraft, setRange, frozen);
  const context: GestureContext = { grab, project, session, gesture, scrollRef, range: frozen ?? baseRange, setRange, setDraft };
  const leave = (event: DragEvent<HTMLDivElement>) => { if (event.currentTarget.contains(event.relatedTarget as Node | null)) return; if (gesture.current) gesture.current.lane = null; setDraft(null); };
  return { context, draft, leave, draggingKind: frozen !== null ? project.state.dragKind : undefined };
}
// 装配的都是同一项目拥有者，鼠标与键盘最终落到commitTimeline。
// 视口至少三十秒并留十秒放置余量，真实总长不包含这段空位。
// 总时长每次从正式clips推导，不从草稿、素材总数或播放器进度累加。
// baseRange先为总长留十秒空间，再向上补齐到五秒刻度。
// 例如工程长21.27秒，视口补成35秒，信息条仍显示21.27秒。
// 最短视口30秒只服务编辑落点，空工程实际总长依然为零。
// selectedClip每次按ID从当前数组回查，移动后预览收到更新后的实例。
// viewed关闭时仍返回selectedClip，属性头与静态节目可以继续说明目标。
// interaction只暴露公共UI需要的意图，不暴露reducer写入能力。
// 末尾添加取真实duration，保证紧接最后片段而非30秒样例末端。
// 创建时使用新的UUID，即使连续添加同一素材也不会重用片段身份。
// 拖动期间禁用并行末尾添加，保护手势起点快照与当前工程的一致性。
// 未保存提醒根据真实clips数量启用，不对空库显示虚假工程警告。
// 这个Hook不导入DEMO数据，样板与正式会话的生命周期分开。
// 时间线装配复用原菜单、离开保护、视口与素材回调，没有新建第二个编辑器宿主。
// useClipTrim持有短手势，正式写入仍交给本工程的commitTimelineTrim。
// 切换锁时同时结束片段移动和边缘修剪，不能留一个看不见的旧草稿待松手提交。
// 同一个trimDraft注入所有轨道，只有id相等的片段替换显示，不影响同源其他实例。
// 设置面板通过ReactNode插槽注入，时间轴展示不需要理解用户数据存储。
// settings回调只改limits，不能因为展开设置重建clips或改变预览模式。
// interaction统一暴露grab/start/over/drop，素材行与片段外壳无需知道工程内部结构。
// 抓取ref只在事件里写，render不读取它作条件，符合React并发渲染边界。
// 节目层序由宿主按tracks装配，媒体共享唯一工程书签。
// 主画面挑最高视频层，属性仍按selectedId查找，两者可属于不同片段。
// 音轨显式选择仍保留独立试听模式，不能把它宣称为多音轨混音已经完成。
// 如果书签没有任何覆盖画面，宿主仍显示真实黑场，不用最后选中封面补洞。
export function useLiveTimeline(assets: readonly EditorMediaAsset[], fps: number, onSelectClip: () => void, dimensions: EditorPreviewProject) {
  const project = useTimelineProject(assets, fps, onSelectClip, dimensions), duration = timelineDuration(project.state.clips);
  const { context, draft, leave, draggingKind } = useTimelineGesture(project, Math.max(30, Math.ceil((duration + 10) / 5) * 5));
  // 菜单是临时UI状态，真实工程与手势仍只有原来的一个拥有者。
  // 键盘事件先处理菜单键/Delete，其余左右移动继续复用共同命令。
  // 不将右键菜单接入DEMO入口，所以样板的禁用能力不会被意外打开。
  const menu = useTimelineMenu(context);
  const seek = (time: number) => seekTimeline(project, time);
  const toggleLock = (track: string) => { menu.close(); cancelGesture(context); trim.cancel(); project.update({ lockedTracks: project.state.lockedTracks.includes(track) ? project.state.lockedTracks.filter(id => id !== track) : [...project.state.lockedTracks, track] }); };
  // 切锁先关闭菜单并取消草稿，避免旧菜单或旧手势在锁定后迟到提交。
  // 只按当前track增删一项，不把所有轨道一起锁住。
  // 解锁沿用原clips数组和ID，不通过重建工程“恢复”可编辑外观。
  // 空轨也能锁住，此后素材末尾添加会在共同提交入口被挡住。
  // 轨道锁是编辑保护，不是静音或可见开关，不能用它改变单源媒体声音。
  // interaction传递有限回调，公共时间轴拿不到任意修改工程快照的update。
  // reportTime仅接受播放器真实回报，不增加seekVersion，这一点与seek回调不同。
  // selectedClip只服务属性，节目按工程书签筛选全部有效图层。
  // 因此点标尺看另一段不会让属性目标偷偷跳成素材列表高亮项。
  // addAsset生成新的实例ID，素材ID不变，重复添加仍是两个独立安排。
  // 活跃手势期间不并行添加，保护冻结的抓取基准与最终提交的时序。
  // 这里不导入DEMO对象，正式会话为空数组开始，样板数据不混进真实工程。
  useTimelineLeaveGuard(project.state.clips.length > 0);
  const trim = useClipTrim({ clips: project.state.clips, locked: project.state.lockedTracks, fps, range: context.range, scrollRef: context.scrollRef, commit: (id, edge, time) => commitTimelineTrim(project, id, edge, time) });
  // 所有历史/剪贴板入口先结束旧手势，迟到的松手不能覆盖恢复后的工程。
  // 工具选择只保存在当前编辑实例，公共样板不创建可写命令。
  const editing = useTimelineEditing(project, () => { menu.close(); cancelGesture(context); trim.cancel(); });
  const interaction: TimelineInteraction = {
    currentTime: project.state.currentTime, selectedIds: project.state.selectedIds, editing: editing.controls, click: (event, id) => editing.click(event, id, context.range),
    tracks: project.state.tracks, limits: project.state.limits,
    settings: createElement(TimelineSettings, { tracks: project.state.tracks, limits: project.state.limits, onChange: limits => project.update({ limits }) }),
    draggingKind,
    grab: (event, id) => captureGrab(context, event, id),
    trimDraft: trim.draft, trimStart: trim.start, trimKey: trim.key,
    seek, toggleLock, lockedTracks: project.state.lockedTracks,
    hiddenTracks: project.state.hiddenTracks, toggleVisibility: track => project.update({ hiddenTracks: project.state.hiddenTracks.includes(track) ? project.state.hiddenTracks.filter(id => id !== track) : [...project.state.hiddenTracks, track] }),
    selectedId: project.state.selectedId, range: context.range, draft, notice: project.state.notice, scrollRef: context.scrollRef,
    select: id => selectTimeline(project, id), start: (event, kind, id) => { menu.close(); startGesture(context, event, kind, id); },
    over: (event, track) => hoverGesture(context, event, track), drop: (event, track) => dropGesture(context, event, track),
    cancel: () => cancelGesture(context), leave, keyDown: menu.keyDown, contextMenu: menu.contextMenu,
  };
  // 构图命令只更新片段数组，素材高亮、时间书签和预览模式都保持各自归属。
// 构图与安排共用同一clips数组，但提交补丁的权限互不混淆。
// transform入口只接受五个画面参数，不能顺便改起止秒数绕过碰撞检查。
// 每次调用都用当前assets和lockedTracks，不能缓存字段打开那一刻的权限。
// 模型返回null代表整次拒绝，保留现有数组而不是清空工程。
// 成功返回新数组，只有目标片段换引用，其他同源安排仍保持原确认对象。
// 工程时长由start/end计算，因此构图更新不会增长或缩短总时长。
// selectCanvas只改selectedId，区别于时间线select会定位到安排起点。
// 用户拖画面时正在看的帧不应跳回源开头，也不应开始播放。
// 回调不调用onSelectClip切换源查看，源查看根本不安装画布编辑层。
// 添加素材时初始化中心值，之后移动安排不会再次把已有构图重置。
// 复制已有安排则在纯模型内克隆变换，不在这里共享原对象。
// 分离音轨清除画面参数，音轨仍引用同一源但不再拥有画面。
// 时间轴锁同样约束字段和画布，不能通过另一个入口写入锁定轨道。
// 移除片段后旧ID无法通过查找，迟到的画布提交只会被拒绝。
// 同名文件不能作为查找键，唯一clip.id才代表本次工程安排。
// sourceIn、sourceDuration继续由原模型拥有，构图命令没有这些参数。
// 媒体回报只写currentTime，构图命令不改变seekVersion。
// 这避免输入X后播放器误认为收到新的定位指令而暂停。
// 播放器组件身份仍是clip.id，修改构图不生成新实例或重载源。
// 此处没有存储调用，临时工程变换不等于工程已经保存。
  const { transform, resetTransform, selectCanvas } = timelineTransforms(project, assets, dimensions);
  const { basic, crop } = timelineBasicCommands(project, () => { menu.close(); cancelGesture(context); trim.cancel(); });
  return { basic, crop, keyDown: editing.key, speed: (id: string, speed: number) => commitSpeed(project, id, speed), keyframe: (id: string, key: TransformKey, frame: number, value: number) => { const clips = toggleTransformKeyframe(project.state.clips, id, key, frame, value, dimensions, project.state.lockedTracks); if (clips) project.update({ clips }); }, transform, resetTransform, selectCanvas, lockedTracks: project.state.lockedTracks, seek, currentTime: project.state.currentTime, seekVersion: project.state.seekVersion, reportTime: (time: number) => project.update({ currentTime: time }), menu, clips: project.state.clips, duration, selectedClip: project.state.clips.find(clip => clip.id === project.state.selectedId) ?? null, viewed: project.state.viewed, closePreview: () => project.update({ viewed: false }), interaction, addAsset: (assetId: string) => { if (!context.gesture.current) commitTimeline(project, { kind: "add", id: crypto.randomUUID(), assetId, start: duration }); } };
}

// 工具栏与右键共享基础片段命令；先结束手势，再按当前锁表重新验证目标。
// 裁剪草稿在画布拥有，只有确认后的四边比例进入工程和历史。
function timelineBasicCommands(project: ProjectContext, cancel: () => void) {
  // 所有基础动作仍发共同工程补丁，一次确认只留一页历史。
  const basic = (action: BasicClipAction) => {
    cancel();
    const clips = basicClipEdit(project.state.clips, project.state.selectedId ?? "", action, project.state.currentTime, project.fps, project.state.lockedTracks, () => crypto.randomUUID());
    if (clips) {
      const inserted = action === "freeze" ? clips.find(clip => !project.state.clips.some(old => old.id === clip.id) && clip.freezeTime !== undefined) : undefined;
      project.update({ clips, selectedId: inserted?.id ?? project.state.selectedId, seekVersion: project.state.seekVersion + 1 });
      project.onSelectClip();
    }
    else project.update({ notice: t("toolBox.editorUi.sectionBlocked") });
  };
  const crop = (id: string, value: ClipCrop) => {
    const clips = updateClipCrop(project.state.clips, id, value, project.state.lockedTracks);
    if (clips) project.update({ clips });
  };
  return { basic, crop };
}

// 项目快照与手势快照的交接只发生在commit边界，不把事件对象放进状态。
// React合成事件不在定时器中保存，自动滚动只保留必要的坐标标量和lane引用。
// lane引用在取消或卸载时释放，避免页面销毁后仍读取旧节点布局。
// UUID只用于当前运行的身份判断，不作为持久工程格式或跨进程授权令牌。
// 伪造同会话载荷也不能凭空创建手势，drop要求与现有起点kind和id相符。
// 从浏览器其他页面拖入普通文本没有专用MIME，不会调用工程创建命令。
// Files入口由宿主处理，当前Hook没有原始文件路径读取或导入能力。
// 工程宽度变动的取消策略优先保证准确，用户需要在新宽度下重新开始抓取。
// 窗口暂时失焦同样取消，不能在重新激活后提交失焦前的过期落点。
// 末尾按钮在拖动中不会与旧快照竞争，用户先完成或取消当前手势再添加。
// 键盘方向事件也遵守此门槛，避免一份手势里出现两个不同工程版本。
// 显示时间四舍五入只影响文案，命令保存仍保留项目帧对应的精度。
// 总长收缩不会删除空隙中的片段，始终取所有已提交end的最大值。
// 页面会话销毁后返回新工程，当前实现没有隐式localStorage恢复路径。

// 播放头是独立工程秒数，定位不改片段起止、不改变素材库高亮或属性选择。
// 像把书签放到一页中间，再按播放应从书签处读，不能总从这一章开头重读。
// 整数帧舍入由项目fps决定；视口空白不等于工程时长，定位夹在真实总长内。
// 每次显式定位增加版本号，媒体timeupdate只回报时间，不应反过来触发seek。
// 这把用户定位与媒体时钟分开，避免一次真实播放事件反复暂停并重设currentTime。
function seekTimeline(context: ProjectContext, time: number) {
  // 先拒绝非有限秒数，防止aria位置与CSS百分比出现NaN。
  // 项目帧舍入集中完成，标尺按键与指针位置不各取不同精度。
  // 定位上界取正式clips的最晚end，不用留有编辑空白的range。
  // 当前片段选择不参与夹限，用户可以定位到别的片段或真实空隙。
  // selectedId保持不变，属性不会跟着每次播放定位跳目标。
  // viewed开启工程查看，不改变素材面板里已经高亮的素材ID。
  // onSelectClip只结束素材源查看优先级，避免点击标尺却仍看到素材时钟。
  // seekVersion即使定位到相同秒数也增加，允许用户明确暂停并回到该书签。
  // 媒体进度报告不经过这里，否则每次timeupdate都会触发新的暂停定位。
  // currentTime是书签位置，version是用户命令身份，两者分离防止反馈循环。
  // 显式定位将同一工程秒数交给所有覆盖视频层；独立音轨试听不进入视觉层。
  // 本函数没有媒体ref，工程状态更新不直接操作浏览器解码器。
  if (!Number.isFinite(time)) return;
  const currentTime = Math.max(0, Math.min(timelineDuration(context.state.clips), Math.round(time * context.fps) / context.fps));
  context.update({ currentTime, seekVersion: context.state.seekVersion + 1, viewed: true });
  context.onSelectClip();
}

// 同一时刻按视频轨头顺序查找画面；显式选中音轨时保留原独立试听。
function insertTrack(tracks: readonly TrackId[], track: TrackId): TrackId[] {
  return isVideoTrack(track) ? [...tracks.filter(isVideoTrack), track, ...tracks.filter(item => !isVideoTrack(item))] : [...tracks, track];
}

// 画面补丁与选择意图分开，复用同一工程快照但不改时间安排。
// 构图更新继续只接受Partial<ClipTransform>，换层没有开放任意片段字段写入。
// 更新函数读取当前clips/assets/locks，不能用播放层身份覆盖属性选择。
// selectCanvas只就地选中，不把节目时间跳回层起点，方便在当前帧调整下层。
// 选择下层不会重排tracks，也不会改变主要播放器属于最高覆盖层的规则。
function timelineTransforms(project: ProjectContext, assets: readonly EditorMediaAsset[], dimensions: EditorPreviewProject) {
  const transform = (id: string, patch: Partial<ClipTransform>) => {
    const clips = updateAnimatedTransform(project.state.clips, assets, id, patch, dimensions, project.state.lockedTracks, project.state.currentTime);
    if (clips) project.update({ clips });
  };
  const selectCanvas = (id: string) => { if (project.state.clips.some(item => item.id === id)) project.update({ selectedId: id }); };
  // 组重置清除该组动画，不能在每个关键帧位置逐次点重置才恢复默认构图。
  const resetTransform = (id: string, patch: Partial<ClipTransform>) => {
    if (project.state.lockedTracks.includes(project.state.clips.find(clip => clip.id === id)?.track ?? "")) return;
    const clips = project.state.clips.map(clip => {
      if (clip.id !== id || clip.audioOnly) return clip;
      const keyframes = { ...clip.keyframes };
      for (const key of Object.keys(patch) as TransformKey[]) delete keyframes[key];
      return { ...clip, transform: { ...defaultTransform(dimensions), ...clip.transform, ...patch }, keyframes };
    });
    project.update({ clips });
  };
  return { transform, resetTransform, selectCanvas };
}

// 修剪与移动都只在确认边界替换工程；更新定位版本让播放器读取新的源入点。
// 字段修剪和键盘修剪共用纯模型，轨道锁在提交时再次检查。
// 新的clips只在有效结果时替换，null不能被当作空工程写入。
// 工程总长变短时书签夹到新末端，不能显示已经不存在的节目时间。
// seekVersion增加让同源同实例的播放器也重新定位到更新后的sourceIn。
// 修剪不更换素材文件，也不改变选择对象，检查器仍显示同一个片段的新时长。
// 左修剪确认后当前书签若仍在新范围内，保持工程时间，仅重算真实源定位。
// 如果删去的头部包含当前书签，预览可能变黑，这是区间不再覆盖而非元数据丢失。
// 若未来要自动把书签移到新入点，应作为显式交互约定，不能在纯模型里偷偷实施。
// 本次只对总长上界夹限，保留其他片段与空隙时间的原定位语义。
// 设置seekVersion不同于媒体timeupdate，不能由播放每帧回报反复增加。
// trimClip返回新数组后同源其他实例仍保持原对象，构图草稿依引用可识别当前版本。
// 选中ID不变，检查器时长由end-start重新计算而非源duration。
// 没有修改sourceDuration，因此以后向回延长仍知道未使用源的完整边界。
// 锁轨过程中trim.cancel先执行，最终模型保护只是第二道门槛而非唯一用户反馈。
// 边缘键盘回调同样进入这里，不另写一个绕过锁定的快捷键分支。
// 修剪提交只接收边缘、工程目标时间和片段ID，不让手势直接传一整份新工程。
// 模型按速度换算源入点，视图无需知道哪一帧应被读取。
// 左修剪同时调整sourceIn，右修剪只调整工程out，二者不能共用错误的字段补丁。
// 成功才增加seekVersion，取消或无效输入不制造一次无意义的媒体定位。
// 工程时长来自所有片段最远出点，裁短前片段未必改变整个工程长度。
// 当前节目位置超出新工程末尾时夹限，但不会重置素材列表的高亮。
// 锁表由工程传给模型，程序事件不能因为跳过disabled手柄而写入锁轨。
// 同轨邻居限制和源剩余限制都在纯模型中，像先看道路边界再看油箱余量。
// 不支持凭空延长源文件，向右拖到源末尾后继续拖动只停在合法边缘。
// 一次松手只确认一份片段区间，拖动过程的候选不反复写回工程。
function commitTimelineTrim(project: ProjectContext, id: string, edge: "start" | "end", time: number) {
  const clips = trimClip(project.state.clips, id, edge, time, project.fps, project.state.lockedTracks);
  if (clips) project.update({ clips, seekVersion: project.state.seekVersion + 1, currentTime: Math.min(project.state.currentTime, timelineDuration(clips)) });
}

// 只在指针事件中记住抓取点，不修改Hook返回的工程数据对象。
// 该ref记录的是CSS像素偏移，不是源秒数或项目帧，换算留在startGesture。
// 事件currentTarget是整个片段壳，不能取内部封面span的left。
// 例如从片段三分之一处抓取，鼠标落点减去这个偏移才是片段工程起点。
// 不保留PointerEvent对象，React事件结束后只留下id和一个有限数值。
// 下一次startGesture只接受id相符的记录，别的片段上一次单击不会串入。
// 消费后清记录避免后续合成拖放误读取旧按下位置。
// HTML拖放有自己的阈值，pointerdown与dragstart不是同一时刻，不能简单互相替代。
// 这里不preventDefault，原生HTML拖放还需要浏览器继续处理按下意图。
// 修剪手柄会stopPropagation，因此不会顺便建立整段移动的grab。
// 这个函数只改手势ref，不修改Hook返回的工程快照对象或Zustand状态。
// 抓取偏移在pointerdown保留小数CSS像素，原生dragstart整数字段不能代替它。
// 这是屏幕像素距离，开始拖动时才除以当时实际密度换算成秒。
// 同类跨轨使用同一内容列密度，不能因轨道编号变化重新从片段左边抓起。
// 可信原生dragstart消费这份偏移，测试合成事件仍按自己的显式坐标计算。
// 记录与片段ID绑定，旧片段按下后换一个片段不会误继承抓取位置。
// 读取currentTarget确保封面或标题span不会让偏移从错误子节点左边起算。
// 边缘修剪已经阻止事件冒泡，所以这里不会把修剪抓取误记成主体移动。
// 指针坐标不乘DPR，避免系统缩放时又将浏览器CSS坐标放大一次。
function captureGrab(context: GestureContext, event: PointerEvent<HTMLButtonElement>, id: string) {
  context.grab.current = { id, offset: event.clientX - event.currentTarget.getBoundingClientRect().left };
}

// 倍速提交与修剪都回到同一工程数组，属性面板不另存一个只改显示的速度。
// 提交后重新定位源时间，避免播放器继续沿旧速度对应的工程位置推进。
// 冲突时保持片段和所有邻居不变，状态条解释原因；不伪装已经应用。
// 速度命令使用最新project.state，不接收从旧菜单缓存的片段快照。
// 失败只更新附近状态条，不清空素材库，也不把其他轨道记录重建成默认值。
// 更新clips后duration由同一个timelineDuration推导，信息条和标尺不另记总长。
// 当前播放位置可能落在缩短后的工程之外，因此成功后先夹到新总长范围。
// seekVersion使同一个媒体节点重新应用新源映射，不必卸载再导入原文件。
// 构图位置、透明度与画面中心不参与速度计算，改速度不能改变项目构图。
// 音频分离后的实例独立，后续编辑不偷偷改变关联的另一个实例。
// 错误文案同时覆盖锁、范围与碰撞，属于拒绝原因概述，不是所有失败都有重叠。
// 属性输入依然显示真实确认值，状态条不把拒绝描述成一次保存失败。
// 此处不另建历史，确认补丁交给会话的公共撤销栈；速度调整仍不做波纹推移或导出。
function commitSpeed(project: ProjectContext, id: string, speed: number) {
  const clips = changeClipSpeed(project.state.clips, id, speed, project.fps, project.state.lockedTracks);
  if (!clips) { project.update({ notice: t("toolBox.editorUi.speedBlocked") }); return; }
  project.update({ clips, seekVersion: project.state.seekVersion + 1, currentTime: Math.min(project.state.currentTime, timelineDuration(clips)), notice: "" });
}
