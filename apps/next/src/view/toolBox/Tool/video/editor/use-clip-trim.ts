"use client";

/** 边缘手势只暂存修剪候选，真实入出点经同一个纯规则在松手时提交。 */
import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent, type RefObject } from "react";
import { trimClip } from "./timeline-track-model";
import type { LiveTimelineClip } from "./live-timeline-model";

// 修剪属于一个短手势，确认工程和临时轮廓分开保存，不能每次移动都写clips。
// options是当前工程入口，latest保存最近一次渲染参数，窗口监听不捕获旧锁表。
// range与lane实际宽度共同确定每秒像素数，不能拿整个窗口宽度代替时间内容区。
// scrollRef指向时间线唯一横滚区，轨道头和其他面板的scrollLeft不参与计算。
// commit仅表达实例、边缘和请求时间，源边界与邻居校验留给共同纯模型。
// TrimGesture保存原始边缘时间，不以每次更新后的临时边缘重新设零点。
// 工程秒数与CSS像素在这里只换算一次，不把窗口缩放当作片段速度。
// id是片段实例身份，同源多个片段不能用assetId一起修剪。
// edge区分start/end，两者使用同一事件流程但由模型执行不同区间更新。
// pointer用于匹配同一次操作，其他设备的移动事件不会改变这条片段。
// element用于释放捕获，不负责保存工程或取得本地文件路径。
// x与scroll记录起点的客户坐标和卷动量，二者共同保证横滚后位移仍准确。
// pixels在按下时冻结，避免候选边缘增长改变当前手势的尺子。
// origin是边缘的工程时间，time是最新请求，夹限后的草稿另存到draft。
// 保留未夹限的time让最终提交再次校验当前边界，不能仅信任上一次预览结果。
interface TrimOptions { clips: readonly LiveTimelineClip[]; fps: number; range: number; locked: readonly string[]; scrollRef: RefObject<HTMLDivElement | null>; commit: (id: string, edge: "start" | "end", time: number) => void; }
interface TrimGesture { id: string; edge: "start" | "end"; pointer: number; element: HTMLElement; x: number; scroll: number; pixels: number; origin: number; time: number; }

// Hook返回既有片段壳需要的start/key回调，不另造一套轨道或时间模型。
// window监听只服务当前页面实例，页面卸载后不能继续操作已移除的片段。
// 本地draft只替换时间线展示对象，项目信息与正式clips直到松手都维持原值。
// 像纸边先用铅笔标线：移动时看标记，确认才真正改变裁切范围。
// 取消先清ref再释放捕获，避免释放事件重入时又提交一次。
// 没有活跃手势时cancel仍安全，可供失焦、Escape和锁轨复用。
// Escape只拦截本Hook确实持有的手势，普通页面按键不被无条件吞掉。
// 窗口resize取消旧尺子，不能在新尺寸里继续使用旧pixels投放。
// 窗口blur取消，避免切去另一个程序再回来时沿用按下状态。
// 卸载先移除三个全局监听，再清理ref和pointer capture。
// 每次渲染更新latest，拖动期间父层选择变化不会让最终提交拿到旧权限。
// start会重新从当前clips查id，已经删除的片段不再获得捕获。
// 锁定轨道提前拒绝，最终commit还会复核，不能只依赖手柄视觉隐藏。
// 按下必须来自左键，右键菜单继续使用原来的片段菜单外壳。
// 用closest取得真实lane，不从手柄宽度或封面大小反推秒尺。
// focus带preventScroll，聚焦边缘不能让浏览器突然横滚并改变抓取基准。
// stopPropagation防止边缘按下同时触发整个片段的移动捕获。
// setPointerCapture把后续事件送回细手柄，鼠标离开十二像素热区仍可继续调整。
// 起点scrollLeft与指针位置一起记录，拖动中手动横滚会产生正确附加位移。
// 键盘左右代表边缘向前后一项目帧，Shift代表一秒，与片段平移快捷键分工明确。
// 键盘事件阻止冒泡，不让父片段同时平移造成“修剪加移动”的双重更新。
// 键盘没有临时拖动候选，直接调用与松手相同的commit入口。
// 没有对应片段时按键不写任何状态，切换目标后旧手柄不会改到新对象。
// Hook不修改媒体currentTime，源入点改变后播放器由新的定位版本完成更新。
// 左右边缘共用生命周期，只有模型知道start必须联动sourceIn而end不需要。
// 正式播放仍由真实媒体事件推动，修剪没有生成一个独立的假进度时钟。
// 修剪与主体HTML拖放各自有手势生命周期，但最终都回到同一工程模型。
// 开始时保存被抓边缘、源片段和实际时间尺密度，不用封面宽度推导秒数。
// 候选只影响展示区间，其他片段在松手前不能读取到已经裁短的确认记录。
// 指针移出轨道后仍由捕获节点收到事件，不要求鼠标始终停在十二像素热区。
// 取消恢复开始前的确认范围，不能把最近一帧候选误当恢复基准。
// 锁轨和窗口尺寸改变会取消旧手势，避免用失效密度提交位置。
// 最短一帧由工程fps决定，不能借源视频24fps改写30fps工程的最小单位。
// 键盘边缘调整也调用trimClip，鼠标与键盘在源边界、邻居和锁表上完全一致。
// 真实源入点随左边缘更新，播放器通过确认后的版本重新定位实际视频帧。
// 这个实现不是速率伸缩，左右拉边不改变speed字段。
// 也不是波纹修剪，拖长一个片段不会把后续邻居整体推走。
// 把手不创建新素材，不重编码文件，未保存工程状态继续由宿主展示。
export function useClipTrim(options: TrimOptions) {
  const active = useRef<TrimGesture | null>(null), latest = useRef(options), [draft, setDraft] = useState<LiveTimelineClip | null>(null);
  useEffect(() => { latest.current = options; });
  function cancel() {
    const gesture = active.current; active.current = null; setDraft(null);
    if (gesture?.element.hasPointerCapture(gesture.pointer)) gesture.element.releasePointerCapture(gesture.pointer);
  }
  // 失焦和Escape只移除候选；不以恢复命令覆盖另一入口刚确认的片段。
  useEffect(() => {
    const key = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape" && active.current) { event.preventDefault(); event.stopPropagation(); cancel(); } };
    window.addEventListener("keydown", key, true); window.addEventListener("blur", cancel); window.addEventListener("resize", cancel);
    return () => { window.removeEventListener("keydown", key, true); window.removeEventListener("blur", cancel); window.removeEventListener("resize", cancel); cancel(); };
  }, []);
  useTrimEvents(active, latest, setDraft, cancel);
  return { draft, start: (event: PointerEvent<HTMLElement>, id: string, edge: "start" | "end") => startTrim(options, active, event, id, edge), key: (event: KeyboardEvent<HTMLElement>, id: string, edge: "start" | "end") => trimByKey(options, event, id, edge), cancel };
}

// 窗口事件归手势生命周期拥有，捕获后离开细边缘仍可正常结束。
// 全局pointermove仍需匹配pointerId，捕获不是忽略身份检查的理由。
// 最新请求时间等于起始边缘时间，加鼠标位移和滚动位移除以每秒像素数。
// 例如鼠标不动而向右横滚一秒，边缘应在工程尺子上向右增加一秒。
// 只减客户坐标会漏掉滚动，因此此处显式把scrollLeft差额加回来。
// 使用最新正式clips校验，其他合法更新不能被拖动起点的旧数组覆盖。
// 纯模型返回null时取消候选，不显示一个已经失去权限的假合法边缘。
// 有效结果按实例id取出目标，仅把该片段的候选交给展示层。
// pointerup先执行最后一次move，覆盖鼠标最后一帧没有move通知的情况。
// 随后cancel清捕获和临时展示，再由commit复核正式数据写入。
// 即使最后一次move因锁定取消，最终commit同样有锁检查，不会迟到绕过。
// pointercancel不提交，系统中断与正常松手在语义上必须区分。
// 清理监听用原函数引用逐一移除，不能每次渲染生成一个无法取消的绑定。
// 该effect只绑定稳定ref拥有者，真正的数据依赖通过latest按事件读取。
// 不创建requestAnimationFrame循环，所以不可见窗口也能结束和取消手势。
// 这里也没有写入文件，单次修剪无须读取视频字节或重新生成封面。
function useTrimEvents(active: RefObject<TrimGesture | null>, latest: RefObject<TrimOptions>, setDraft: (clip: LiveTimelineClip | null) => void, cancel: () => void) {
  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      const current = active.current, context = latest.current;
      if (!current || current.pointer !== event.pointerId) return;
      current.time = current.origin + (event.clientX - current.x + (context.scrollRef.current?.scrollLeft ?? 0) - current.scroll) / current.pixels;
      const clips = trimClip(context.clips, current.id, current.edge, current.time, context.fps, context.locked);
      if (!clips) { cancel(); return; }
      setDraft(clips.find(clip => clip.id === current.id) ?? null);
    };
    const end = (event: globalThis.PointerEvent) => { const current = active.current; if (!current || current.pointer !== event.pointerId) return; move(event); cancel(); latest.current.commit(current.id, current.edge, current.time); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end); window.addEventListener("pointercancel", cancel);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", cancel); };
  // ref身份稳定；监听每次读取latest而不是挂载时的工程快照。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
 }

// 片段边缘屏幕位置会随横滚改变，但工程start/end不变，所以起点必须同时记录scroll。
// 以每秒32像素为例，向右拖16像素就是请求延长半秒，不读鼠标绝对屏幕坐标。
// 如果同时向右横滚32像素，用户相对工程的位移还多一秒，合计请求一秒半。
// 滚动补偿使用context.scrollRef的当前值减起点scroll，不把整个scrollLeft重复加两次。
// 开始时pixels从lane.width/range取得，轨道头不在lane矩形里，所以无需再扣头宽。
// 同一lane的百分比宽度也绘制片段和标尺，三者不能各用不同的可用宽度。
// 预览draft变宽不改变lane.width，用户拉长片段不能改变自己手里的尺子。
// 窗口改变取消手势，下一次重新抓取才读取新的pixels。
// start时当前clip必须存在，拖动期间删除则下一次pure trim返回null取消。
// 鼠标边缘捕获后不再依赖elementFromPoint，越过邻居仍会计算候选再由模型夹限。
// 这与主体HTML拖放需要命中目标轨的机制不同，两类手势不能合并成一个事件处理。
// 事件stopPropagation保护主体grab记录，不能把修剪起点误用为稍后平移的抓取偏移。
// 焦点设置用于键盘接续操作，不自动选中片段或改变时间书签。
// aria-slider由片段壳提供语义，这个Hook只处理事件和时间意图。
// 按下时的origin取clip[edge]，同一助手可服务左和右，避免两套坐标转换分叉。
// time初始也等于origin，按下立刻松手仍是合法不变请求而非零秒。
// 最后pointerup可能在轨道外，捕获仍交回当前手柄，源区间限制负责停在合法边。
// 若系统发pointercancel，不能将它当作位于当前位置的正常松手。
// 所有提交均经过commit的当前锁检查，不能信任按下那一刻轨道还没锁。
// 清理不会调用commit，所以切页、失焦或Escape不会意外确认未完成修剪。
function startTrim(options: TrimOptions, active: RefObject<TrimGesture | null>, event: PointerEvent<HTMLElement>, id: string, edge: "start" | "end") {
    const clip = options.clips.find(item => item.id === id), lane = event.currentTarget.closest("[data-editor-track-lane]");
    if (!clip || options.locked.includes(clip.track) || !lane || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true });
    active.current = { id, edge, pointer: event.pointerId, element: event.currentTarget, x: event.clientX, scroll: options.scrollRef.current?.scrollLeft ?? 0, pixels: lane.getBoundingClientRect().width / options.range, origin: clip[edge], time: clip[edge] };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

// 键盘替代只接受ArrowLeft/ArrowRight，其他按键继续留给手柄或上层正常处理。
// 左右方向描述的是工程时间，不随片段画面旋转角度改变。
// 当前左边缘按右键表示缩短头部，右边缘按右键表示延长尾部。
// 两个方向共享请求公式，edge决定最终影响start还是end。
// Shift步长为一秒，非Shift为一项目帧，不取源视频的帧率作工程步长。
// 例如24fps竖屏源放在30fps工程中，边缘仍以1/30秒移动。
// 原span滑块没有自己的字符串草稿，按键请求直接进入共同提交校验。
// preventDefault阻止浏览器把方向键用于页面滚动，用户调整边缘时视口不应突然移走。
// stopPropagation阻止父片段的moveByKey再次平移整段。
// 没有匹配clip时只消费本边缘按键，不默认操作另一个当前选中片段。
// 这避免隐藏或已删除手柄收到迟到事件后改到新目标。
// 锁表在commit模型复核，程序化键盘事件即使绕过DOM隐藏也不能写锁轨。
// 键盘请求可能超源边界，纯模型夹限到合法边缘，不用错误提示阻断每次重复按键。
// 每次键盘确认产生新工程区间，下一次按键从当前clip[edge]计算，连续按键不会复用旧起点。
// 事件回调由当前render绑定options，和窗口监听读取latest的生命周期不同。
// 两种入口最终只提交id/edge/time，没有打开任意更新clips的公共方法。
function trimByKey(options: TrimOptions, event: KeyboardEvent<HTMLElement>, id: string, edge: "start" | "end") {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const clip = options.clips.find(item => item.id === id);
    if (clip) options.commit(id, edge, clip[edge] + (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 1 : 1 / options.fps));
  }
