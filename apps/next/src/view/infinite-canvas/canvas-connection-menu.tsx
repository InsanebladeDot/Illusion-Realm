"use client";

// 图片输出拖到空白处沿用原添加菜单，图与历史仍由原编辑器拥有。
// 临时菜单像尚未签收的转接单，关闭只丢意图，不创建节点或写文件。
import { useCallback, useEffect, useRef, useState } from "react";
import { useReactFlow, type OnConnectEnd, type XYPosition } from "@xyflow/react";
import type { CanvasNode, CanvasAddKind } from "./canvas-model";
import { AddNodeMenu } from "./reference-ui/canvas-chrome";

// 菜单只记稳定源ID与落点，不缓存source.data或复制整张作品。
// screenToFlowPosition在确认时换算，避免导航宽度和画布缩放被重复扣除。
// 每个画布实例持有自己的menu、取消标记和事件清理，不能跨工作区接错源。
// 节点列表来自当前画布，而不是创建页的素材高亮。
// 图片源身份始终是节点ID，不通过可修改标题寻找源。
// 两个同名图片也必须连接到实际起手的那一个。
// 菜单保存客户区落点，滚动画布后的世界位置交由引擎决定。
// 客户区坐标不包含浏览器窗口外部的系统标题栏坐标。
// XYPosition描述作品位置，不拿菜单宽度当作节点宽度。
// add回调属于编辑器，展示组件没有自己的作品副本。
// editable来自工程持久化状态，读取失败时不能创建新内容。
// 菜单不会携带API密钥、模型权重或浏览器File对象。
// sourceId只传引用身份，不能把上游媒体复制成目标的输出。
// 图片生成卡的输出仍为空，输入引用不冒充生成结果。
// 视频生成卡同样只有配置，菜单选择不开始后台视频任务。
// cancelConnection只结束图引擎临时连线，不删除已经存在的边。
// 同一图片可以多次起手，是否允许连接由目标输入规则判断。
// 没有起手图片时，普通添加入口依然创建独立节点。
interface Props { nodes: CanvasNode[]; editable: boolean; add: (kind: CanvasAddKind, position: XYPosition, sourceId?: string) => void; cancelConnection: () => void }
interface Pending { sourceId: string; video: boolean; x: number; y: number }

// 坐标只取浏览器屏幕客户区，鼠标与触控都交给同一个图引擎换算。
// touchend的touches已空，必须读取changedTouches中的松手位置。
// 不接收任意外部文件路径或媒体，连接菜单本身没有导入权限。
function point(event: MouseEvent | TouchEvent) {
  const value = "changedTouches" in event ? event.changedTouches[0] : event;
  return value ? { x: value.clientX, y: value.clientY } : null;
}

// Escape既取消橡皮筋也取消待选菜单，迟到的mouseup不能重新弹出菜单。
// 起手才清取消标记；普通重绘不能把用户刚按的Escape变成新连接意图。
// 只有未命中任何节点的图片输出拖动才有菜单，非法目标仍由原校验报错。
// 已连成功不会再打开菜单；输入端反拖、视频源和空白普通拖动均保持原语义。
// 选择生成目标不执行模型，提交能力仍受原按钮和真实队列契约约束。
// 当前源被删后显示层会隐藏菜单，确认时reducer还会再次核对源是否存在。
// Escape由原工作区捕获入口显式转交，不建立会拦其他页面输入的全局监听。
export function useCanvasConnectionMenu({ nodes, editable, add, cancelConnection }: Props) {
  const [menu, setMenu] = useState<Pending | null>(null);
  const cancelled = useRef(false);
  const flow = useReactFlow();
// close保持引用稳定，避免作品无关重绘重新聚焦菜单首项。
// 菜单的外部点击监听依赖close，因此稳定回调也避免反复拆装监听。
// setMenu只影响局部意图，不向工程自动保存发出一个空修改。
// 取消标记放在ref，按Escape时立即生效，不等下一次渲染提交。
// 浏览器可能先报告Escape再报告mouseup，这时end必须读取最新标记。
// 开始新手势才复位标记，旧手势不能借重绘重新获得提交权。
// 两个画布实例的ref分别存在，不使用模块级共享取消开关。
// ReactFlow上下文属于当前Provider，不能换算到其他工作区的镜头。
// 菜单关闭不会清除原节点高亮，保持用户先前的对象选择。
// 离开页面时本hook卸载，局部待选意图自然丢弃。
// 没有把菜单序列化，因此重开不会弹出上次未确认的选择。
// 所有实际作品修改都由add事件入口分配稳定的新ID。
// 工作区只转交Escape，普通输入和方向键继续交给原控件。
  const close = useCallback(() => setMenu(null), []);
  // 取消必须先立屏障再通知图引擎，避免取消动作回送结束事件时重新出现菜单。
  // 原页面先接收快捷键，再进入editor业务键盘分派，因此不依赖文档监听顺序。
  // 工作区卸载后回调自然失效，不需要留存跨页面document订阅。
  const cancel = () => { cancelled.current = true; setMenu(null); cancelConnection(); };
// 连接结束同时核对源存在和类型，不能仅凭手势开始时缓存的类型创建。
// 源已被删或工程替换后，旧的图引擎回调只能丢弃。
// isValid为真代表已有目标接线完成，不能额外再创建第二个目标。
// toNode存在而无效时保留原拒绝语义，不把错误连接改成新建卡片。
// 输入端向外拉属于反向连接，不应出现图片输出专属菜单。
// 视频、音频、文本端口继续沿用原来的连接结束行为。
// 只有pane命中被认为是空白，节点正文与工具栏不算空白。
// 检查Element后才调用closest，避免事件目标并非DOM元素时报错。
// 背景点阵位于pane内，用户松手在点阵仍是合法空白落点。
// 客户区坐标只记录一次，不叠加页面导航宽度或画布平移。
// 触摸结束读取变化触点，无法读取触点时宁可不弹菜单。
// 连接临时线在菜单出现时收起，不让用户看到一条未确认的永久边。
// 结束临时连接不提交历史，也不把菜单当成一条有效边。
// 确认时再次检查editable，避免保存或导入期间提交迟到选择。
// 目标位置在确认时由当前镜头换算，不使用手算比例缩放。
// 选择后立即清菜单，重复事件没有第二个待确认意图。
// 真正的连接规则仍在reducer执行，展示层过滤不是安全校验。
// 即使有键盘事件绕过菜单可见性，业务层也必须拒绝失效源。
  const end: OnConnectEnd = (event, state) => {
    const source = nodes.find(node => node.id === state.fromNode?.id);
    if (cancelled.current || !editable || state.isValid || state.toNode || state.fromHandle?.type !== "source" || source?.data.mode === "compare" || (source?.data.kind !== "image" && source?.data.kind !== "video")) return;
    const position = point(event);
    if (position && event.target instanceof Element && event.target.closest(".react-flow__pane")) setMenu({ sourceId: source.id, video: source.data.kind === "video", ...position });
    cancelConnection();
  };
  const select = (kind: CanvasAddKind) => {
    if (!menu || !editable) return;
    add(kind, flow.screenToFlowPosition({ x: menu.x, y: menu.y }), menu.sourceId);
    setMenu(null);
  };
  return { start: () => { cancelled.current = false; setMenu(null); }, end, menu: editable && nodes.some(node => node.id === menu?.sourceId) ? menu : null, close, cancel, select };
}

// UI只负责菜单落点与焦点，节点、连线和历史提交都由上面的既有add命令完成。
// 原AddNodeMenu注入sourceImage后只列两个生成目标，不带无关占位和导入项。
// 使用fixed客户区坐标，不能把客户区点当作画布世界坐标再多缩放一次。
// 菜单开合不进入保存快照，Escape与外部点击都不会生成空撤销步骤。
// clamp仅限制菜单可见位置，新节点仍按真实松手世界坐标创建，不被菜单避让位移。
// 缺少源时父级传null卸载，监听与局部焦点引用随之释放。
export function CanvasConnectionMenu({ menu, close, select }: { menu: Pending; close: () => void; select: (kind: CanvasAddKind) => void }) {
// 菜单局部host用于判断内部点击，不依赖按钮文字或语言。
// 内部按钮pointerdown先到达document，但contains保证菜单不提前卸载。
// 外部点击只关闭待选菜单，原画布点击仍能继续选择或取消选择。
// 监听随菜单卸载移除，不积累闭包引用或影响后续窗口。
// 初次挂载聚焦第一个有效生成项，方向键复用原添加菜单实现。
// 聚焦禁止自动滚动，避免打开菜单时画布或页面突然跳位。
// 按下Escape时原菜单自身也关闭，两条关闭路径都是无作品副作用。
// 固定定位使用鼠标客户区坐标，与世界节点位置是两种单位。
// 右下角clamp只移动菜单，不能顺带移动新生成节点。
// 窄窗口仍保留八像素留边，不能让菜单整体落在屏幕外。
// zIndex只用于操作层，不能改变节点或媒体的图关系优先级。
// nodrag与nopan防止在菜单上按住时移动底层画布。
// 菜单没有全窗口遮罩，应用导航仍按原外壳工作。
// AddNodeMenu负责按钮、图标与键盘规则，此处不复制第二份菜单结构。
// 原全添加菜单还负责导入，图片连接模式不显示无关导入入口。
// 生成类型使用英文稳定值，中文文案改变不会改写工程kind。
// 菜单外观继续读取同一主题变量，不添加单独的浅深开关。
// 操作结束没有假成功toast，实际新卡和边是提交结果。
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    host.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !host.current?.contains(event.target)) close(); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [close]);
  return <div ref={host} data-canvas-connection-menu className="nodrag nopan" style={{ position: "fixed", left: `clamp(8px, ${menu.x}px, calc(100vw - 210px))`, top: `clamp(8px, ${menu.y}px, calc(100vh - 180px))`, zIndex: 50 }}><AddNodeMenu sourceVideo={menu.video} sourceImage onSelect={select} onClose={close} /></div>;
}
