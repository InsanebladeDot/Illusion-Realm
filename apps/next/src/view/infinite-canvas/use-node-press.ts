"use client";

// 区分卡片短按与搬动；图引擎仍负责选择、捕获指针和写入世界坐标。
// 像先拿起纸张再决定是否翻开：按住或挪动只搬卡，快速松手才打开参数。
// 这里仅保存本卡的展示意图，不写工程，不增加撤销记录。
// 选择表示“接下来操作谁”，参数展开表示“现在是否要输入”，二者不是同一状态。
// React Flow 在按下时就可能选中节点，所以不能等 click 才拦截参数的首次出现。
// 识别从捕获阶段开始，早于图引擎在祖先上处理选择的那一步。
// 识别器不 preventDefault，原来的图引擎仍能收到完整指针序列。
// 也不 stopPropagation，否则卡片看起来能选中却不能正常搬动。
// 不使用 setPointerCapture，避免抢走图引擎已有的捕获所有权。
// 指针移动的屏幕距离只用于判断手势，不转换成工程节点的移动量。
// 真正的位置计算、取消恢复和历史提交仍由编辑器完成。
// 单次按压只属于开始时的这张卡，经过其他卡片不会让其他卡展开。
// 每个实例自己的闭包保存按压记录，不存在全局“正在长按的卡片”变量。
// 新增节点沿用原来的立即编辑体验，因此展示意图初值保持开启。
// 已有但未选中的节点不会因为这个初值就挂出参数，外壳仍检查 selected。
// 再次点击旧节点时，先抑制由选择造成的展开，再根据松手方式决定。
// 已展开节点的短按不先关再开，避免原有参数区域闪烁和布局跳动。
// 真正进入长按或发生移动时才收起它，给拖动留出干净的空间。
// 一个短按不会修改用户之前通过箭头收起参数的决定。
// 是否折叠仍由外壳的 expanded 负责，本 Hook 只补充手势允许条件。
// 按箭头是明确的展开动作，不需要等二百五十毫秒来识别。
// 因此外壳可以调用 showPanel，再使用同一面板开关更新显示。
// 键盘激活箭头也走这个明确动作，不伪造鼠标短按事件。
// 双击标题和正文保留原来的编辑业务，本识别器不会替它们提交文本。
// 视频播放、音量与进度控件继续使用浏览器自己的输入语义。
// 工程恢复不恢复按压到一半的临时状态，重新挂载后重新识别。
// 这避免保存文件里出现定时器编号、指针编号等不能重放的运行对象。
import { useEffect, useState, type RefObject } from "react";

// 表单、媒体控制和端口已经有自己的动作，不能把它们当作卡片短按。
// nodrag 是已有控件隔离契约，导入按钮和参数区都可以沿用这一标记。
// 这里不靠按钮文字判断，切换语言后仍能正确识别控件。
// 原生播放条独立操作；没有原生 controls 的视频画面则和图片一样识别长按搬动。
// contenteditable 供已有文字编辑入口隔离，不能按其中的文字就折叠编辑器。
const CONTROLS = "button,input,textarea,select,video[controls],audio,.nodrag,.react-flow__handle,[contenteditable=true]";

export function useNodePress(host: RefObject<HTMLElement | null>) {
  // React 状态只在手势类型确定时更新，不随每一像素移动重新渲染参数表单。
  // 外壳读取这一状态组合显示，不需要向页面动作 Context 增加热数据。
  const [panelActive, setPanelActive] = useState(true);
  // host 是稳定 ref，selected 或媒体播放更新不会重建这份识别会话。
  // Effect 返回安装器的清理函数，开发模式重放同样会先拆旧监听。
  useEffect(() => host.current ? trackPress(host.current, setPanelActive) : undefined, [host]);
  // 显式展开不会修改当前工程，返回的动作也不持有媒体文件或表单草稿。
  // 卸载由 Effect 清理按压，不靠调用方记得额外执行某个停止方法。
  return { panelActive, showPanel: () => setPanelActive(true) };
}

// 一次订阅覆盖本卡完整手势，选中重渲染不会重置尚未结束的长按判断。
// 指针编号如同领取的取件号，只接受这一轮按下对应的移动和松手。
// 第二个手指或另一种指针的松手不能替第一根指针打开参数。
// moved 同时代表“位移已超标”或“已按得太久”，两者都属于不展开。
// 一旦确认是搬动就不再恢复为短按，即使鼠标最后回到了起点。
// 这里不累计路径长度，正常手抖在四像素以内仍保留短按操作。
// 阈值用屏幕像素，因此放大画布不会让同样的手抖更容易误判。
// 长按计时只识别输入意图，不冒充媒体加载、导入或任务进度。
// 定时器没有等待外部结果，窗口隐藏时也不需要等下一帧才能清理。
// 每次开始先清理上一轮，快速重复点击不会留下多个迟到定时器。
// 指针取消和窗口失焦把当前记录作废，回来后旧松手没有业务含义。
// 记录设为 null 后移动处理立即返回，不测量 DOM 或计算节点布局。
// 只有一张正在按压的卡会处理距离，其余实例只经过空记录判断。
function trackPress(node: HTMLElement, show: (active: boolean) => void) {
    let press: { id: number; x: number; y: number; moved: boolean } | null = null;
    // x、y 是按下时的屏幕点，后续距离比较不能用节点左上角替代。
    // 用户可能从标题中间抓取，节点左上角离鼠标很远并不说明发生了移动。
    // 记录不包含 data，编辑正文或刷新媒体不会让这份闭包握住过期业务对象。
    // 也不记录 selected，捕获阶段会直接从当前 DOM 读取这一个显示标记。
    // timer 在本卡会话内保存，另一个节点的短按不会清掉这一张的长按判断。
    // 清理使用 clearTimeout(undefined) 也是安全的，不需要制造一个有效计时器占位。
    // 不把 timer 放 React state，创建和取消计时都不应该成为额外一次界面更新。
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => { clearTimeout(timer); press = null; };
    const start = (event: PointerEvent) => {
      // 右键在这里返回，之后继续交给现有公共菜单决定选择和展示。
      // 卡片外的工具条也返回，不能打开菜单时顺便收起正在编辑的参数。
      if (!isCardPress(event)) return;
      cancel();
      // 取消旧记录发生在填入新记录之前，旧回调不能再操作新一轮的 moved。
      // 松手回调不读取 event.detail，连续点击计数不能拿来判断按住时长。
      // 浏览器生成的双击依旧由原组件处理，这里只决定每次按压是否允许展开。
      press = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      // 读取实际挂载节点的选择标记，避免监听闭包保存旧 selected。
      // 这个读取发生在事件里，不在 React render 中读取或改 DOM。
      if (node.dataset.selected !== "true") show(false);
      timer = setTimeout(() => { if (press) { press.moved = true; show(false); } }, 250);
      // 二百五十毫秒是按压判定门槛，不是人为等待之后再生成一个成功结果。
      // 超过门槛时立即收起参数，直到新的短按或显式展开动作才允许回来。
      // 不需要等第一次移动才确认长按，原地按住也应该符合用户的拖动意图。
      // 定时器回调仍检查 press，取消后到达的过期任务不能再次修改界面。
    };
    const move = (event: PointerEvent) => {
      // 移动触发后立即清掉长按计时，避免同一手势第二次处理收起。
      // 已判定 moved 的后续事件不再调用状态更新，拖动不会反复设置同值。
      // 这只影响参数可见性，不终止 React Flow 正在执行的拖动。
      if (!press || press.id !== event.pointerId || press.moved) return;
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < 4) return;
      // 四像素使用直线距离，斜向各三像素也已超过容许的小幅手抖。
      // 若分别比较横纵方向，斜向移动更难被识别，会让同样幅度产生两种结果。
      // 相反，幅度不足的细微移动不清定时器，继续按住仍可进入长按。
      // 当前指针始终在窗外不再发事件时，blur 路径承担记录作废。
      press.moved = true;
      clearTimeout(timer);
      show(false);
    };
    const finish = (event: PointerEvent) => {
      // 参数由松手确认，按下尚未证明用户想输入，不能提前显示输入状态。
      // 长按之后浏览器生成的 click 没有绑定展开动作，所以不会再误开一次。
      // 右键松手即便碰巧共用指针号，也不能通过左键分支。
      // 清理放在确认后，同一轮迟到的其他事件不会重复打开。
      if (!press || press.id !== event.pointerId) return;
      // 松手点也核对距离，覆盖中间移动事件被系统合并或丢失的情况。
      // 从这里调用相同 move 判断，最终一次检查和拖动过程不会使用两套阈值。
      move(event);
      if (!press.moved && event.button === 0) show(true);
      cancel();
    };
    return listenForPress(node, { start, move, finish, cancel });
}

// 只识别正文与标题的左键，不接管控件和右键菜单，也不要求事件目标一定是 HTML。
// 图标的 SVG 和 path 也是 Element，点击标题小图标仍是有效短按。
// 如果只接受 HTMLElement，用户点字能开、点旁边图标却不开，会产生不一致。
// closest 只判断当前实例内已经冒泡到本卡的事件，不扫描其他节点。
// 端口本身有连接动作，所以即使它紧挨着卡片边缘也明确排除。
// title 的文本按钮保留双击重命名，普通单击仍允许选择和展开参数。
// 参数区不属于 card 或 label，编辑提示词不启动卡片长按计时。
function isCardPress(event: PointerEvent) {
  return event.button === 0 && event.target instanceof Element && !event.target.closest(CONTROLS) && Boolean(event.target.closest(".hy-node-card,.hy-node-label"));
}

// 松手可能发生在卡片外，因此只在按压期间读取全局移动，不捕获或阻断引擎事件。
// 取消、切窗和卸载都作废当前按压，避免迟到松手误开另一张卡的参数。
// 全局移动监听只读取识别器的记录，不全局查询当前选中节点。
// 监听使用捕获阶段，子控件后来停止冒泡也不会让按压记录卡住。
// 停止捕获传播不是这里的职责，所有监听都只观察和更新自己的显示意图。
// pointercancel 覆盖系统中断触控，blur 覆盖鼠标拖出窗口后失去活动焦点。
// Escape 只作废当前按压，图引擎仍会收到它并按原规则恢复世界坐标。
// Escape 监听不执行撤销，避免一次取消退回两份历史。
// removeEventListener 必须保留相同捕获参数，否则旧捕获监听会一直留在窗口上。
// 组件卸载时先取消定时器，再拆监听，不给定时器留下更新已卸载组件的机会。
// React 开发环境的安装、清理、重装也遵守这一顺序。
// 新媒体替换只更新 data，不重装按压识别，因此不会因解码事件丢失手势。
// 删除节点则真正卸载，本卡后续不会继续响应窗口中的任何松手。
// 实例之间虽然共用安装方法，但各自函数引用不同，清理不会误拆其他节点。
function listenForPress(node: HTMLElement, handlers: {
  // start 只在本卡挂载，不能按另一张卡时让全部卡片都开始计时。
  // move 和 finish 在窗口观察，指针离开本卡后依然能结束这一次识别。
  // cancel 不需要知道事件载荷，多种中断统一作废同一份按压记录。
  start: (event: PointerEvent) => void;
  move: (event: PointerEvent) => void;
  finish: (event: PointerEvent) => void;
  cancel: () => void;
}) {
  const escape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") handlers.cancel(); };
  // 此处使用浏览器 KeyboardEvent，与组件文件里的 React 键盘事件有意区分。
  // 原生事件没有 currentTarget 的组件泛型，不能为了复用类型引入不准确断言。
  // Escape 不调用 show(false)，因为取消一个尚未确定的动作应保持原面板决定。
  // 已经进入长按时面板此前已收起，取消也不会使它反过来打开。
  node.addEventListener("pointerdown", handlers.start, true);
  window.addEventListener("pointermove", handlers.move, true);
  window.addEventListener("pointerup", handlers.finish, true);
  window.addEventListener("pointercancel", handlers.cancel);
  // pointercancel 不是 pointerup，不能用 finish 处理，否则中断会被误算成短按成功。
  // 同理，窗口失焦不替用户作一次“确认松手”，只释放临时记录。
  window.addEventListener("blur", handlers.cancel);
  window.addEventListener("keydown", escape);
  return () => {
    // 清理函数不调用图引擎 cancel，卸载一张卡不应把其他卡的连线一起取消。
    // 图业务本身的结束由页面生命周期管理，这里只归还自己安装的输入观察器。
    handlers.cancel();
    node.removeEventListener("pointerdown", handlers.start, true);
    window.removeEventListener("pointermove", handlers.move, true);
    window.removeEventListener("pointerup", handlers.finish, true);
    window.removeEventListener("pointercancel", handlers.cancel);
    window.removeEventListener("blur", handlers.cancel);
    window.removeEventListener("keydown", escape);
  };
}
