"use client";

// 时间轴视口只持有像素比例，改变比例不写片段start/end，也不改变工程总时长。
import { useEffect, useRef, useState, type RefObject } from "react";

// 视口状态与工程状态分离，像把地图放大，地图上两站之间的公里数不会改变。
// pixels控制一秒占多少CSS像素，range仍是公共时间轴给出的可编辑秒数。
// scroller指向当前时间轴唯一滚动容器，不能通过document查第一个相似节点。
// 同页面多个工作区各自持有pixels、anchor和fitWidth，缩放不会互相串用。
// null用来表示适合全部，和数值零完全不同，不能用真假判断合并这两种状态。
// 默认32保留既有LIVE拖动密度，用户选择放大后不会修改源文件帧率。
// 缩放也不改变项目宽高，时间轴每秒像素与节目画布项目像素是两种单位。
// 当前Hook不处理播放位置，不会因放大视口而把媒体seek到新的时间。
// 工程保留空白编辑余量，适合全部会适应该range，而不改写真实工程总长。
// 因此信息条的duration不能从当前滚动内容宽度反推。
// 视口调整不参与工程未保存判断，布局动作不生成片段或工程历史。

// 缩放像放大纸上的刻度尺，纸上写的时间不会因为尺子变长而被改写。
// 默认32px/s沿用LIVE拖动的旧密度；null表示适合全部，让网格填满滚动视口。
// 每次操作先取消旧拖动，防止拿旧比例抓取后在新比例下松手造成位移。
// 点击缩放时保留当前视口左端时间，下一帧DOM布局后再换回像素scrollLeft。
// 不用定时器等待布局，浏览器回调ref之外的恢复在layoutEffect由宿主执行。
export function useTimelineViewport(scroller: RefObject<HTMLDivElement | null>, range: number, cancel?: () => void) {
  // anchor保存缩放前左端所见的工程秒数，不保存一个在缩放后失效的像素值。
  // 原scrollLeft为320、密度32时，左端对应10秒；密度64时应恢复为640px。
  // fitWidth是滚动视口扣除真实轨道头后的宽度，只用于显示适合全部后的密度。
  // 不依赖CSS中曾经写过的轨道头常量，因为紧凑容器可能使用不同头宽。
  // 720只是挂载前的显示回退，Observer安装后立即用实际布局修正。
  // 首帧不读取ref.current，因此静态导出不会因缺少DOM而报错。
  const [pixels, setPixels] = useState<number | null>(32);
  const anchor = useRef<number | null>(null);
  // 固定缩放模式仍允许网格因minWidth填满宽窗口，pixels表示最低目标密度。
  // 因此恢复anchor读取实际lane密度，而不是直接用pixels相乘。
  // fit模式窗口继续变宽只更新fitWidth，不改变null标记，保持自适应语义。
  // nav开合可能经过多个中间宽度，观察器最终读取新的可见内容宽即可收敛。
  // 轨道纵向滚动条占宽已由clientWidth扣除，不应再次减一个假设的滚动条常量。
  // 用户在fit后手动拖滑杆将明确切回固定密度，不把这次值写入工程fps。
  // cancel可选支持静态调用方，不提供时只管理视口，不假造手势状态。
  // 显式取消在setPixels之前，旧轮廓不会拿新布局宽度重算并误显示已提交。
  // 缩放恢复用scrollTo浏览器方法，不修改传入ref对象的归属或current指针。
  // 方法默认即时定位，没有添加平滑滚动让拖放坐标在过渡期间继续漂移。
  // 恢复步骤发生在layoutEffect，截图读到的实际位置应与当前密度一致。
  // 当前没有缩放持久化，重新打开编辑器回到默认密度是明确会话边界。
  const fitWidth = useFitWidth(scroller);
  function zoom(next: number | null, clientX?: number) {
    changeZoom(scroller, anchor, range, fitWidth, next, clientX);
    cancel?.();
    setPixels(next === null ? null : Math.max(8, Math.min(256, next)));
  }
  useWheelZoom(scroller, range, pixels, fitWidth, zoom);
  // 读取当前渲染宽度而非缓存窗口宽，导航与紧凑轨道头变化也使用真实内容列。
  // 恢复只消费一次anchor，用户后续手动横滚不会被下一次渲染强制拉回。
  function restore() {
    // 宿主在layoutEffect调用，新的内容宽度已经提交，才能把秒数换回新scrollLeft。
    // 在zoom事件里立刻写scrollLeft会基于旧宽度，浏览器随后布局又改变可滚范围。
    // 消费后清anchor，后续播放进度重渲染不会把用户手动滚动拉回旧位置。
    // 浏览器自身会限制最大scrollLeft，缩小到全览时自然回到合法范围。
    // lane不存在时不强行设置另一个容器，仍清理本次恢复意图以免迟到重放。
    // 这个方法没有setState，layoutEffect每次调用也不会制造渲染循环。
    // restore与zoom共用range，不从标尺文字解析秒数，避免格式化造成精度损失。
    const lane = scroller.current?.querySelector<HTMLElement>("[data-editor-region=R07]");
    if (anchor.current !== null && scroller.current && lane) scroller.current.scrollTo({ left: anchor.current * lane.getBoundingClientRect().width / range });
    anchor.current = null;
  }
  // pixels为null时滑杆显示实际fitWidth/range，不能继续假显示默认32。
  // 但布局仍保留null模式，让窗口继续变宽时自动填满，不冻结为此时的计算值。
  // 用户再次拖滑杆才切回固定密度，fit模式和固定模式边界因此清楚。
  // 返回接口没有任意片段写入能力，调用方只能提出视口意图。
  // 该密度只用于时间轴，不给节目预览加CSS scale，字号与焦点命中保持原尺寸。
  return { pixels, effectivePixels: pixels ?? fitWidth / range, zoom, restore };
}

// 尺寸观察只负责可见内容列，不观察会因自身缩放变化的滚动总宽度。
// 像量相框内框，不能把画卷全部展开的长度拿来当窗口大小。
function useFitWidth(scroller: RefObject<HTMLDivElement | null>) {
  const [fitWidth, setFitWidth] = useState(720);
  useEffect(() => {
    // 观察滚动视口宽度，导航开合和容器变化都能触发重新测量。
    // 内容列宽度会随缩放变化，不能观察它再反向更新自己的缩放输入形成循环。
    // 轨道头通过当前scroller内的V1定位，获取同一grid的实际占位宽度。
    // clientWidth排除滚动条，匹配可见内容空间，不用窗口innerWidth代替。
    // 下限一像素避免初次隐藏状态出现除零，正常几何仍由CSS最小宽保护。
    // Observer只负责fit显示信息，不自动切换用户已经选择的固定密度。
    // effect卸载配对disconnect，旧页面不再收到尺寸回调或持有节点。
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const header = element.querySelector<HTMLElement>("[data-editor-track-head=V1]");
      setFitWidth(Math.max(1, element.clientWidth - (header?.getBoundingClientRect().width ?? 0)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [scroller]);
  return fitWidth;
}

// 缩放锚点计算与事件订阅分开：滑杆、按钮和滚轮调用同一个坐标变换。
// ref只在实际事件处理时读取，不在渲染过程中读取DOM或把ref.current当记忆依赖。
// null明确表示适合全部；它回到工程起点，普通缩放则保留当前左端时间。
// 滚轮额外提供clientX，保持鼠标下的时间位置，不把轨道头当作时间内容。
// lane.left已经包含实际横向滚动的位移，不能再次减一次全局导航宽度。
// scroller.scrollLeft是画卷已经滚走的像素，pointer是鼠标距可见内容起点的像素。
// 旧密度将两者合成工程秒数，新密度再把同一秒数放回鼠标下方。
// 缩放后恢复的scrollLeft等于锚定秒数乘新密度，不能直接沿用旧像素值。
// 固定轨道头由grid独立占位，不参加range乘密度这部分内容宽度。
// 适合全部会令滚动起点归零，明确与围绕鼠标的手动缩放区分。
// 最小宽可能把内容列撑得比目标pixels更大，计算必须认实际DOM密度。
// fitWidth已经扣除纵向滚动条，不能再次按固定17px扣除。
// 窗口导航开合会更新fitWidth，但不会改变片段的真实start/end。
// anchor只是待消费的视口意图，恢复一次后清空，正常播放不持续回拉滚动。
// 最左边界夹到零，不能请求负scrollLeft让画面定位依赖浏览器各自行为。
// 最右端由浏览器滚动范围夹限，极靠边缩放时不承诺鼠标时间点永不移动。
// slider和加减按钮不传clientX，因此继续保留原先左端时间锚点约定。
// 滚轮传clientX时才进入图钉逻辑，不把键盘缩放误当成一次鼠标操作。
// 变化前取消旧拖放草稿，已确认片段仍保留，避免用旧抓取偏移提交新比例。
// 这里不处理媒体seek，改变时间尺密度不能改变播放器当前源秒数。
// 指针位置采用客户区CSS像素，不乘devicePixelRatio，浏览器负责设备像素映射。
// 举例：32px每秒时滚走320px表示十秒，改64px每秒后左端应滚到640px。
// 鼠标若位于内容视口200px处，缩放前锚点是十秒再加200除32秒。
// 新scrollLeft需从该锚点的像素位置减回200px，而不是直接把整个旧scrollLeft乘倍率。
// 这种计算同时覆盖横向滚动与导航开合，前提是取当前lane真实矩形。
// range仍包含工程编辑余量，不把fit解释成裁掉所有空轨或修改工程时长。
// 滚轮达到最小密度后lane可能仍铺满窗口，effective密度因此与目标pixels不同。
// 观察宽度与设置缩放解耦，避免Observer读取自身内容宽又触发无限放大循环。
// 竖向新增候选轨不应让滚动条宽度改变横向密度，CSS预留gutter负责稳定这部分几何。
// 用户滚动后anchor保持null，不会因为下一次播放事件重新调用restore而倒退。
// 这里不保存历史视口队列，连续缩放始终以最新DOM与最后待恢复意图计算。
function changeZoom(scroller: RefObject<HTMLDivElement | null>, anchor: RefObject<number | null>, range: number, fitWidth: number, next: number | null, clientX?: number) {
    const lane = scroller.current?.querySelector<HTMLElement>("[data-editor-region=R07]");
    anchor.current = next === null ? 0 : lane && scroller.current ? scroller.current.scrollLeft / (lane.getBoundingClientRect().width / range) : 0;
        // 以鼠标下的秒数为图钉缩放：纸变宽，图钉仍留在同一个屏幕位置。
    // 鼠标到内容视口左沿的距离不能包含固定轨道头，否则横滚后会偏一截。
    // minWidth可能撑满宽窗口，新的有效密度取目标密度与填满密度的较大值。
    if (lane && scroller.current && next !== null && clientX !== undefined) {
      const density = lane.getBoundingClientRect().width / range;
      const pointer = clientX - lane.getBoundingClientRect().left - scroller.current.scrollLeft;
      anchor.current = Math.max(0, (scroller.current.scrollLeft + pointer) / density - pointer / Math.max(next, fitWidth / range));
    }
 }

// 原生非被动事件才能阻止浏览器把整个应用放大；普通滚轮保留原滚动行为。
// listener每次更新使用当前参数，离开页面成对移除，不留下隐藏编辑器快捷操作。
// 回调只改视口，工程时间和源区间继续由时间线模型独立持有。
// 事件只在时间线滚动容器内生效，其他输入区的Ctrl滚轮不被编辑器截走。
// Ctrl松开后普通滚轮仍纵向滚动，不能把用户浏览轨道变成无意缩放。
// 非被动监听是浏览器preventDefault生效的前提，不是增加全局键盘监听。
// 有deltaY才计算比例，纯横向触控板手势不伪造一档时间缩放。
// 放大乘1.2，缩小除1.2，两种方向采用互逆比例，连续往返不会故意漂移。
// 上下限与滑杆一致，达到边界后仍阻止浏览器整页放大。
// 读取实际lane.width适配fit模式，不能把null当成零像素或默认32。
// listener闭包更新当前range，工程时长增长后不会继续用旧范围换算。
// 卸载时移除同一个wheel函数引用，旧工程不会截获新页面输入。
// 每个工作区绑定自己的scroller，A实例滚轮不能修改B实例的密度。
// 回调更新视口后由layoutEffect恢复scrollLeft，不能在旧布局里立刻写新像素。
// 这属于显示缩放，不是源重采样、片段倍速或画布构图缩放。
function useWheelZoom(scroller: RefObject<HTMLDivElement | null>, range: number, pixels: number | null, fitWidth: number, zoom: (next: number, clientX: number) => void) {
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey || !event.deltaY) return;
      event.preventDefault();
      const lane = element.querySelector<HTMLElement>("[data-editor-region=R07]");
      const density = lane ? lane.getBoundingClientRect().width / range : pixels ?? fitWidth / range;
      zoom(Math.max(8, Math.min(256, density * (event.deltaY < 0 ? 1.2 : 1 / 1.2))), event.clientX);
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [scroller, range, pixels, fitWidth, zoom]);
 }
