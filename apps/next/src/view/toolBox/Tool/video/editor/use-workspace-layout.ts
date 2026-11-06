"use client";

// 编辑器局部布局：临时面板与上下分隔比例各自持有状态，不写工程或全局主题。
import { useCallback, useEffect, useRef, useState, type RefObject, type PointerEvent, type KeyboardEvent } from "react";

// 本模块有两份局部状态：上区临时打开哪一栏，以及上下区域怎么分配高度。
// 两者都只是工作台摆放，不能借布局调整重建工程或清掉素材列表。
// 比如把抽屉关起来不会扔掉里面的文件，面板收起也要保留搜索和高亮。
// 因而临时面板复用原节点，CSS负责显示，Hook只管理可见意图和焦点。
// 不使用全局store，是因为两个同时存在的编辑器不应共享开合或高度。
// 页面卸载时这些偏好随实例结束，当前没有跨会话恢复布局的约定。
// 也不读写用户JSON，避免把演示工作区的操作保存成正式设置。
// DOM测量仅放在事件或effect内，静态导出和首帧渲染不需要window尺寸。
// 所有ref都由拥有实际节点的EditorWorkspace提供，不查询全页面第一个面板。
// 这使同名R02、R03、R04在A/B实例中仍可保持各自的观察范围。
// 面板断点和CSS容器断点必须一起维护，不能一边按屏幕宽一边按main宽。
// 导航展开占用的宽度已经反映在upper矩形，不再减一次导航常量。
// ResizeObserver通知后重新读矩形，通知本身不携带这里可直接信任的旧宽度。
// 分隔的观察对象则是整个workspace，避免上区每次变高又触发自身的反馈循环。
// 两个观察器职责不同，不能为了共享回调把它们合成一个无限调整链。

type PanelName = "media" | "inspector";

// open为null表示没有临时层，不表示两个常驻面板都不可见。
// 宽容器下的素材和属性由CSS直接常驻，与临时open状态无关。
// media/inspector两枚ref各指向实际入口，返回焦点不能取页面上的同名按钮。
// trigger记录本次打开来源，因为切换到另一个面板后返回点也应随之改变。
// 不把trigger保存为字符串选择器，防止多个编辑器同名标签互相误命中。
// trigger不会持有媒体元素或视频数据，只有一个按钮节点引用。
// 关闭后focus使用preventScroll，避免上区或页面突然滚到入口的默认位置。
// 原生按钮即使文字被隐藏，也仍有aria-label可供读屏辨认。
// toggle用于入口二次点击关闭和不同入口互换，不制造两份布尔值组合。
// 两个布尔值可能同时为真，单一联合值从结构上排除了重叠展开。
// 从素材切属性时，先更新目标意图，旧素材仍挂载但被CSS移出布局。
// 不从toggle中调用素材选择，打开面板和改变业务目标是两回事。
// 宽度以真实上区为准，导航开合和父容器收缩都由ResizeObserver重新读取。
// 同一份素材与属性DOM仅切换布局，不复制第二套面板或因收起丢掉搜索草稿。
// 只保留当前工作区必要实例，路由卸载后整个面板与观察器一起清理。
export function useWorkspacePanels(upper: RefObject<HTMLDivElement | null>) {
  const [open, setOpen] = useState<PanelName | null>(null);
  const media = useRef<HTMLButtonElement>(null), inspector = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  function close() { setOpen(null); trigger.current?.focus({ preventScroll: true }); }
  // 重复点击当前入口相当于关闭；点击另一入口则更新本次返回位置。
  // 这里不先卸载再挂载面板，所以未提交的搜索文本也不会丢失。
  // reset供容器扩宽时结束临时状态，不走close的旧入口聚焦。
  // 原因是扩宽后入口可能已display:none，聚焦它会留下不可见键盘位置。
  function toggle(panel: PanelName) {
    if (open === panel) { close(); return; }
    trigger.current = panel === "media" ? media.current : inspector.current; setOpen(panel);
  }
  const reset = useCallback(() => setOpen(null), []);
  // 窄窗关闭与扩宽清理采用不同焦点规则，不能把reset直接等同用户按关闭按钮。
  // 例如素材临时开着时扩大到1100px，素材已经常驻，旧入口已隐藏。
  // 此时若close回到入口，键盘会丢在不可见按钮；生命周期改用预览回落槽。
  // 相反用户在960px主动关闭素材时，入口仍可见，应返回原入口方便再次打开。
  // 打开属性再切回素材会更新trigger，不能保留第一次打开属性的历史返回位置。
  // 这些返回点按实际按钮引用记录，不依赖当前语言的标签文字。
  // 语言切换导致按钮文字变化时，返回焦点仍指向同一个React按钮节点。
  // 属性字段禁用并不阻止打开面板，用户仍需要读取默认值与未接通原因。
  // 因而不能用“是否有可编辑字段”控制整个面板入口可用性。
  // 空素材库同样允许展开，用户需要看到导入入口和真实空库提示。
  usePanelLifecycle(upper, open, reset);
  return { open, close, toggle, media, inspector };
}

// 面板观察与聚焦属于同一显示生命周期，宽度变为常驻时结束临时展开。
// resize回调重新读取盒子，不依赖旧入口是否仍在屏幕上。
// 扩到三栏时入口已隐藏，焦点转到常驻预览，不能留在display:none按钮上。
function usePanelLifecycle(upper: RefObject<HTMLDivElement | null>, open: PanelName | null, reset: () => void) {
  // 观察器与聚焦分为两个effect：前者跟几何，后者跟打开意图。
  // 如果将焦点放在每次resize回调中，用户调整窗口就会被反复拉回第一个按钮。
  // reset用稳定回调传入，避免普通字段编辑导致观察器不断拆装。
  // upper是当前实例的引用对象，ref.current尚未挂载时直接结束本轮安装。
  // React挂载提交后effect才能读布局，不在render里从ref派生可见状态。
  // 初次observe会产生通知，所以已经足够宽的工作区不会保留过期临时标记。
  // 素材在1040起常驻，属性在1280起常驻，二者不能套同一个阈值。
  // 这对应两栏与三栏布局，而不是以文件类型或是否选中片段决定断点。
  useEffect(() => {
    const element = upper.current;
    if (!element) return;
    const observe = new ResizeObserver(() => {
      // 1279到1280是属性临时转常驻的分界，比较符号必须与CSS的width<1280一致。
      // 若Hook用大于而CSS用大于等于，恰好1280时会留下一个无入口的临时状态。
      // 素材的1039到1040也使用相同的半开断点约定。
      // 不是所有resize都reset，面板仍处于紧凑区间时必须保留用户当前展开意图。
      // 比如960变1000仍需要临时素材，不能只要窗口变化就把它关掉。
      // 宽度事件还可能来自nav动画，每次读当前盒子才能得到真实所属区间。
      // 函数不记录上一次事件给的宽度，丢掉某次中间通知也可按最终尺寸收敛。
      // 这里只处理仍为open的临时面板，null状态的正常常驻布局不触发焦点动作。
      const width = element.getBoundingClientRect().width;
      if (open && width >= (open === "media" ? 1040 : 1280)) {
        // 从临时变常驻只清开合标记，节点和数据仍然保留在原宿主中。
        // 焦点去节目面板的可编程焦点槽，它不会额外插进普通Tab顺序。
        // 不选择任意第一个input，否则扩宽时可能误进入尚未准备好的属性字段。
        reset();
        const preview = element.querySelector<HTMLElement>("[data-editor-region=R03]");
        preview?.focus({ preventScroll: true });
      }
    });
    observe.observe(element);
    // effect换open或卸载时配对断开，不让旧闭包继续判断上一次打开的面板。
    // 即使主题切换重渲染，只要依赖没变就不会重新订阅或抢走焦点。
    return () => observe.disconnect();
  }, [upper, open, reset]);
  useEffect(() => {
    // 打开后才进入面板首个有效控件，禁用的导入或效果输入不应该获得焦点。
    // 查找范围限定当前面板，不把节目走带按钮当作素材入口的第一个操作。
    // 若整个面板没有可用字段，外部关闭按钮仍在Tab路径中供用户退出。
    // 关闭按钮由workspace提供，所以这里不额外插入一枚重复的“返回”。
    // 此处不是焦点陷阱，用户仍可Tab到时间轴和应用导航。
    // 临时区没有aria-modal，不能以锁住全窗口焦点来掩盖隐藏内容问题。
    // 隐藏区display:none使其后代不参与浏览器正常Tab布局。
    // DOM仍在并不等于仍能操作，是否可聚焦应由运行测量和键盘路径验证。
    if (!open) return;
    const panel = upper.current?.querySelector<HTMLElement>(`[data-editor-region=${open === "media" ? "R02" : "R04"}]`);
    panel?.querySelector<HTMLElement>("button:not(:disabled),input:not(:disabled)")?.focus({ preventScroll: true });
    // 首控件可能是类型筛选按钮，也可能是属性折叠标题，不假定永远是input。
    // 禁用效果字段被排除，原生disabled节点不能成为可靠的焦点返回位置。
    // 如果目标在提交前卸载，可选链结束，不对另一个工作区的同名面板补聚焦。
    // 这里不使用setTimeout反复尝试focus，避免页面关闭后迟到抢焦点。
    // React提交后的effect与CSS容器查询属于同一次显示生命周期，先挂载再查询。
    // 页面切换时effect被卸载，当前模块没有持续保留document级焦点监听。
  }, [upper, open]);
}

// 分隔像两层抽屉之间的活动隔板：往下移动时，上层变高、下层变矮，总高度不变。
// 上区至少260px、时间轴至少202px；项目栏和信息条固定，不纳入拖动比例。
// 这个像素高度只在当前容器内使用，窗口变化时重新夹限，不能写成全屏fixed偏移。
// 工程片段时间与播放器状态不参与计算，调整布局不等于修改项目内容。
interface SplitContext {
  workspace: RefObject<HTMLDivElement | null>; origin: RefObject<number | null>;
  grab: RefObject<number>;
  setHeight: (height: number) => void;
}

// origin是本次指针调整前的上区高度，用于取消回滚，不是整个应用默认高度。
// grab是鼠标抓住分隔条的位置，在连续移动中保持不变。
// setHeight接收已经夹限的像素值，不能把负高度留给CSS处理。
// workspace引用提供总高度预算，上下限跟着当前真实宿主变化。
// 这些信息不包含start/end，因此分隔移动不可能直接改片段时间。
// context每次render重组，但ref对象稳定，正在捕获的指针仍读同一个origin。
// 回调只在用户事件发生后执行，不能靠初次render测DOM决定静态导出结构。
// 上下界取当前工作区，不能在窄窗后继续使用宽窗曾经的最大高度。
// 最小544px宿主内260+202的下限恰好占满，屏幕更矮则外层host整体滚动。
function splitLimit(workspace: RefObject<HTMLDivElement | null>, value: number) {
  // 1000px高工作台活动预算918，上区按原比例约571.58，时间轴约346.42。
  // 若把上区调到716，剩余时间轴正好202，信息条仍有自己的30px。
  // 720px高时上区上限436，旧1000px窗口留下的600会在Observer里收回436。
  // 用户刚开始调节时不需要先恢复默认比例，实测上区就是本次手势起点。
  // 拖出下边界会保持上界，拖回合法范围立即继续，不积累“超出距离债务”。
  // 这是绝对位置调节，不按每次pointermove的movementY累加，因此不会因漏事件漂移。
  // 固定支出共82px：项目栏44、分隔8、信息条30。
  // 要为时间轴至少留202px，上区最大高度就是total-82-202。
  // total为720时上区最大436，不能直接用720减去202忽略固定栏。
  // 上区最小260，保证预览标题和走带控制仍有布局空间。
  // 最低宿主544时，上区260与时间轴202正好用完462px活动预算。
  // 若可视主区比544矮，host滚动承接最小工作台，不让下界互相挤穿。
  // ref未就绪的544回退只用于安全边界，不宣称窗口实际测到了544。
  // Infinity是End键表达最大值的内部意图，Math.min会换成当前有限上界。
  // 正常指针值来自clientY减当前宿主top，不会受页面滚动坐标系混用影响。
  const total = workspace.current?.getBoundingClientRect().height ?? 544;
  return Math.max(260, Math.min(total - 284, value));
}
function splitStart(context: SplitContext, event: PointerEvent<HTMLDivElement>) {
  // 事件坐标不使用pageY，main内部滚动后page与客户区不一致会让抓手跳跃。
  // 抓取偏移同时扣除项目栏44与当前上区高，剩下的才是分隔条内部位置。
  // 指针若落在抓手SVG上，currentTarget仍是分隔div，捕获归属不被子节点改变。
  // origin为零不是合法起点，最小上区260保证取消始终有可恢复的实际高度。
  // 使用null表达未调整，不能用if(origin.current)混淆零和未开始两种状态。
  // 只接主按钮，右键不启动布局拖动，也不吞掉后续右键菜单意图。
  // preventDefault避免浏览器开始选中文字或触发本机触摸滚动。
  // 显式focus让键盘Escape与后续方向键都留在真实分隔条上。
  // 保存的是上区实测高度，默认fr和用户设置px都能采用相同起点。
  // 指针捕获后即使鼠标离开八像素细条，移动仍送回当前抓手。
  // 不安装document级mouse监听，释放资源由浏览器pointer capture管理。
  // 抓取偏移以CSS像素记录，不乘设备DPR，否则125%下会产生虚假跳动。
  // 例如抓在条内第4px，下一次移动1px只应改变高度1px，而不是5px。
  if (event.button !== 0) return;
  event.preventDefault(); event.currentTarget.focus();
  context.origin.current = context.workspace.current?.querySelector<HTMLElement>("[data-editor-upper]")?.getBoundingClientRect().height ?? 260;
  // 保留抓住八像素分隔条的具体位置，首次移动不把抓手顶边突然吸到鼠标下。
  context.grab.current = event.clientY - (context.workspace.current?.getBoundingClientRect().top ?? 0) - 44 - context.origin.current;
  event.currentTarget.setPointerCapture(event.pointerId);
}
// 只有当前指针拥有捕获时才处理移动和结束，其他指针不能接管已有调整。
// 指针取消恢复本次起点，普通松手保留新布局，二者都释放捕获。
function splitFinish(context: SplitContext, event: PointerEvent<HTMLDivElement>) {
  // 系统pointercancel可能来自触摸手势被系统接管，不能把它当作用户确认新布局。
  // 浏览器捕获检查防止路由销毁或捕获丢失后，迟到up又触发一次恢复。
  // 释放捕获之后浏览器可正常把鼠标交给素材、预览或下一次分隔手势。
  // 结束没有等待Promise，故没有需要跨页面保留的异步布局任务。
  // 该取消只回滚本次几何，不恢复素材选择、字段草稿或工程播放时间。
  // 多指针环境先核对当前节点是否拥有该pointerId，避免另一指松手结束本次拖动。
  // pointerup是确认，保留已经看到的新高度，不再重复计算一份布局。
  // pointercancel是取消，需要恢复起点，但恢复值仍按新窗口尺寸夹限。
  // 拖动期间窗口突然变矮时，原高度可能已不可放入，不能无条件写回。
  // origin清空后后续move成为无操作，迟到事件不能继续改变高度。
  // releasePointerCapture与按下时的pointerId配对，不影响页面上其他指针。
  // Escape清origin后仍可在up释放捕获，取消不会遗留永久拖动状态。
  if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
  if (event.type === "pointercancel" && context.origin.current !== null) context.setHeight(splitLimit(context.workspace, context.origin.current));
  context.origin.current = null; event.currentTarget.releasePointerCapture(event.pointerId);
}
function splitMove(context: SplitContext, event: PointerEvent<HTMLDivElement>) {
  // 指针沿水平方向移动只改变clientX，当前算法忽略它，上下比例不会误变。
  // 停在同一个clientY重复发move得到同一个高度，不会因事件频率越来越大。
  // 同理系统60Hz或120Hz输入不会影响最终几何，只影响中间显示的平滑程度。
  // pointercapture让越过素材列表滚动区时仍只调整分隔，不把手势变成列表滚动。
  // touch-action只限制抓手，用户在素材内容上仍能使用正常滚动。
  // origin为空说明当前没有活跃调整，普通悬停不能改变工作台。
  // 捕获检查同时保护多触点和已经取消的旧事件。
  // 总高度预算每次读取，窗口改变后继续拖动也不能越过新的上下界。
  // 从workspace.top减去44只排除项目栏，不减nav宽，也不减系统标题栏高度。
  // 因为clientY和矩形top本就在同一客户区坐标系，外壳位移已经被抵消。
  // 最后减grab，使细条内部哪一点被抓住在整个手势中保持一致。
  // 更新只写局部height，预览媒体的key和事件订阅不会随几何改变。
  // 也不通过缩放整个页面让节目更大，控件字号和点击区域保持原尺寸。
  if (context.origin.current === null || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
  const box = context.workspace.current?.getBoundingClientRect();
  if (box) context.setHeight(splitLimit(context.workspace, event.clientY - box.top - 44 - context.grab.current));
}
// 方向键只改变几何，不移动时间轴片段；组合系统快捷键不在这里截获。
// Escape仅在指针调整尚未完成时恢复；普通上下键可连续使用当前实测高度。
function splitKey(context: SplitContext, event: KeyboardEvent<HTMLDivElement>) {
  // Shift只影响ArrowUp/Down，不能让Shift+Home变成一个不确定的中间高度。
  // End传Infinity作为内部求上界意图，splitLimit会产生有限布局值再写state。
  // Escape在origin为空时不preventDefault，外部其他取消语义仍可按正常冒泡处理。
  // 指针期间Escape清空origin，之后move即便仍收到捕获事件也成为无操作。
  // up仍释放捕获，所以取消不会导致下一次点击被旧抓手永久截获。
  // 普通Tab没有处理分支，也不会被event.preventDefault意外阻止。
  // 键盘调节与指针调节都不生成撤销历史，当前范围未实现Undo系统。
  // Ctrl/Alt/Meta组合交给系统和应用，不把系统快捷键当普通箭头。
  // 上下键以10px步长提供细调，Shift时40px适合快速分配空间。
  // Home去上区最小值，End去当前最大值，不改变滚动位置或工程播放起点。
  // 按Escape仅取消尚未完成的指针会话，平时不会突然恢复默认布局。
  // 每次从真实upper测current，连续按键基于上一帧已经呈现的结果。
  // 未识别的按键返回null，Tab仍由浏览器移动焦点。
  // preventDefault只在实际处理的键上执行，防止箭头同时滚动外层页面。
  // 不stopPropagation到整个文档，其他已有键盘边界仍可按默认规则处理。
  // 改高度前统一splitLimit，鼠标和键盘不能各有一套不一致的边界。
  // origin取消后清空，下一次按箭头是新的调节意图，不继承旧回滚点。
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  const current = context.workspace.current?.querySelector<HTMLElement>("[data-editor-upper]")?.getBoundingClientRect().height ?? 260;
  const next = event.key === "Home" ? 260 : event.key === "End" ? Infinity : event.key === "ArrowUp" ? current - (event.shiftKey ? 40 : 10) : event.key === "ArrowDown" ? current + (event.shiftKey ? 40 : 10) : event.key === "Escape" ? context.origin.current : null;
  if (next === null) return;
  event.preventDefault(); context.setHeight(splitLimit(context.workspace, next));
  if (event.key === "Escape") context.origin.current = null;
}
export function useWorkspaceSplit(workspace: RefObject<HTMLDivElement | null>) {
  // height=null表示继续使用原来的比例布局，不代表上区高度为零。
  // 首次用户调节才转成明确px，避免初始视图与确认的设计比例不同。
  // total保存观察到的宿主高度，用于无障碍滑块范围和默认值说明。
  // 它不保存innerHeight，应用标题栏、状态栏和外壳间距已由宿主扣除。
  // origin和grab不是显示数据，用ref避免每个pointermove额外触发两次渲染。
  // React状态height才决定实际gridTemplateRows，aria值同步表达同一布局。
  // 调整过程中上下区域是此消彼长，信息条始终留在工作台底边。
  // 这里不缓存上区DOM节点到全局，路由卸载后React可正常释放布局树。
  const [height, setHeight] = useState<number | null>(null), [total, setTotal] = useState(544);
  const origin = useRef<number | null>(null);
  const grab = useRef(0);
  const context: SplitContext = { workspace, origin, grab, setHeight };
  // total只用于当前实例，嵌入不同main容器的A/B不能共用一个模块级高度缓存。
  // 初次Observer通知前用544给出合法aria范围，等待真实测量后再更新说明。
  // 这份回退不会给DOM写544px，实际高度仍由原grid和宿主填充规则决定。
  // 根节点卸载时Observer断开，但React ref清理仍由React自己处理，不能手动改父ref。
  // 不直接修改workspace.current属性，避免把Hook参数当作可变配置对象。
  // 真正布局变化通过setHeight回到渲染，再由EditorWorkspace写入样式声明。
  // 这样可从同一次渲染同时得到几何和aria值，不需要另订阅DOM属性变化。
  // 主题切换没有改变根尺寸时Observer不会强制重分配高度，用户调好的比例得以保留。
  // 容器高度改变时只修正已手动设置的布局；默认布局继续使用原比例。
  // 数值状态相同会自然跳过渲染，Observer不观察被自己调整的上区，避免反馈循环。
  // 路由卸载时断开，不把临时布局写入用户数据文件。
  useEffect(() => {
    const element = workspace.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      // 保存最新总高后夹已有手动值，默认null仍交给fr分配。
      // 不把当前上区高度再写回默认状态，否则观察会把响应式比例永久冻结。
      // setHeight的函数更新读最新值，避免resize闭包覆盖用户刚完成的拖动。
      // Observer只观察根尺寸，改上区与时间轴分配不改变根尺寸，不会自激。
      // 无须定时轮询宿主高度，页面被遮挡也不会留下永久等待任务。
      setTotal(element.getBoundingClientRect().height);
      setHeight(current => current === null ? null : splitLimit(workspace, current));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [workspace]);
  // 默认比例可能被minmax下界截住，aria值也要采用同样上下限。
  // 否则最矮工作台会实际显示260却向读屏报告287，甚至超过aria-valuemax。
  // max至少260，与上区下界一致；极矮窗口由外层最小高度和滚动处理。
  // 返回的是事件适配器，调用方不需要了解origin、grab和Observer内部结构。
  // 也不暴露任意setHeight，防止其他区域绕过共同范围校验。
  return { height, value: height ?? Math.max(260, Math.min(total - 284, (total - 82) * 1.65 / 2.65)), max: Math.max(260, total - 284), down: (event: PointerEvent<HTMLDivElement>) => splitStart(context, event), finish: (event: PointerEvent<HTMLDivElement>) => splitFinish(context, event), key: (event: KeyboardEvent<HTMLDivElement>) => splitKey(context, event), move: (event: PointerEvent<HTMLDivElement>) => splitMove(context, event) };
}
