"use client";

import { HoverTip } from "@/components/hover-tip";

// 画布图片设置使用参考图的紧凑右侧面板，内容由已有创建组件注入。
// 外壳不持有图片参数，也不复制导演台的图层列表和对象属性。
// 同一工作区只挂载一份，切换节点由宿主更换稳定 key。
// 像打开桌边的工具柜：柜子负责空间，工作单仍留在原节点总账。
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { useTranslation } from "@/i18n";
import { X } from "lucide-react";

// selecting 表示内部资源选择页正在展示，外层 Escape 必须等它先结束。
// label 是节点标题，可长于一行；样式只做视觉省略，不截改作品名称。
// children 只承载当前图片参数，不改变外壳的焦点与滚动职责。
// onClose 是关闭 UI 的意图，不是清空节点、保存工程或提交生成。
// 面板不是全窗口模态，应用导航和画布仍可明确选择其他对象。
// 因此不设置 aria-modal，也不强行把 Tab 锁在侧栏形成无法离开的循环。
// 关闭或换节点会卸载表单，隐藏输入不会留在键盘导航中。
interface Props { returnFocus?: RefObject<HTMLElement | null>; label: string; children: ReactNode; selecting: boolean; onClose: () => void }

// 焦点来源在挂载前已是触发按钮，退出后尽量回到同一个真实控件。
// 若节点已经删除或失去选择，原按钮可能断开，此时不调用失效 DOM。
// focus 只表示键盘位置，不替用户选择另一个节点。
// 不使用延迟定时器抢焦点，主进程遮挡或窗口不可见也不会无限等待。
// effect 清理只处理界面资源，没有自动保存成功通知。
// 嵌套资源弹窗有自己的焦点恢复，侧栏在它关闭前不会同时退回画布。
// 外壳始终使用原图标按钮，悬停不新增厚边框，键盘仍保留焦点提示。
// 标题独立于关闭按钮，长文件名不会扩大点击目标或盖住右上角入口。
// 内容区的滚动归属在此明确，根画布不会因长表单产生整体页面滚动。
// 侧栏停靠使用主区矩形，不拼接应用导航宽度或屏幕偏移。
// 深浅主题使用同一份节点数据，不按主题分两棵不同业务组件树。
// 仅键盘冒泡在侧栏中停止，底层不会把 Delete 解释成删除选中节点。
// Ctrl+S 仍允许宿主捕获阶段保存当前真实节点，避免独立一套快捷保存。
// Escape 遇到内层选择会话时交给原资源组件，不关闭整个配置。
// 在普通字段上按 Escape 先遵守子控件处理；已阻止默认就不再关侧栏。
// 按关闭按钮不会还原已经确认的参数，撤销继续交给作品原历史。
// 资源列表通过门户挂到外面，实际事件仍按 React 父树回到本侧栏。
// 所以 onKeyDown 只处理未消费的 Escape，内层已处理的事件必须保持原结果。
// 表单中的普通字符键与箭头键不会交给底层画布移动节点。
// 外层主区捕获 Ctrl+S 是已有保存约定，侧栏不安装 document 级快捷键监听。
// 这样离开页面后也没有残留的全局 Delete 或 Escape 响应器。
// Tab 保留浏览器自然顺序，可以离开非模态面板，不为模仿弹窗而锁住导航。
// 第一个焦点放关闭按钮，用户无需经过所有长表单字段才能退出。
// 返回目标由宿主在打开动作中记录，避免资源菜单收起后只能读到 body。
// 关闭时目标仍连接才聚焦，节点删除后的旧 DOM 不应抢走新选择焦点。
// 外部切换节点会卸载旧侧栏，其清理逻辑不对新节点发送参数 patch。
// 标题省略只影响视觉，title 属性能查看完整节点名，数据没有被裁短。
// 根 aside 不声明 dialog 模态语义，因为画布和应用导航仍然可交互。
// 右侧停靠不参与 React Flow 世界坐标，画布缩放不会放大表单文字。
// 导航收起改变主区宽度时，右侧 inset 由布局重新计算，无需监听固定偏移。
// 内容区有自己的 min-height 和 overflow，低窗口仍可以滚到采样和禁用生成说明。
// 截图对比应包含导航和主区边界，单独截一张面板无法发现定位越界。
// 空模型、缺封面、长名和折叠项都保留原组件状态，外壳不伪造替代内容。
// 侧栏没有轮询、媒体元素或 GPU 对象，释放范围仅为 DOM 和一次焦点交接。
// 不注册独立 ResizeObserver，几何直接交给 CSS，减少面板开关的额外监听开销。
// 视觉目标是参考图的单列紧凑参数柜，不沿用图层树或导演台对象字段。
// 完整表单的指南在本 DOM 中渲染，而资源选择器可能用 portal，二者不能混判。
// document 存在 dialog 时先交给子功能的关闭机制，侧栏不抢先收起。
// Portal 目标不在 aside 的 DOM 子树内，但 React 事件可能仍经过这里。
// 必须先检查真实 contains，再决定是否隔离画布快捷键。
// 这个检查使用 Node 只在事件处理中，静态预渲染不会访问浏览器构造函数。
// 没有弹窗时侧栏内 Delete 仍阻断，按钮获得焦点也不能删除底层节点。
// 用户在画布外部导航操作不经过 aside，这个局部处理不影响应用全局快捷键。
// 内层字段 preventDefault 过的 Escape 保留它的草稿恢复动作，不关闭配置。
// 真实关闭仍使用既有 onClose，并由原 effect 处理返回焦点。
// 事件分层不改变业务保存时机，已确认字段不会因为关弹窗而撤销。
// 侧栏内容不再使用画布 neutral 外观，主题直接来自原创建页语义变量。
// create-workspace 是原创建页已经定义的主题域，生成按钮继续读取它的渐变变量。
// 复用这个域比复制一套蓝色值可靠，用户自选强调色也会跟随原机制。
// 这里只把原组件放进外壳，不提供“画布版模型卡”或“画布版提示词输入”。
// 原扩展入口的左对齐来自它自己的类，不再被画布按钮的 justify-content 覆盖。
// 原按钮边框也由它自己的类决定，不在本外壳统一改成透明。
// 原 switch 的轨道和圆点都是原表单 DOM，不能只补一个看起来相同的圆形图标。
// 原生成底栏是完整表单的一部分，不能被这个外壳替换成另一个空白提交按钮。
// 数据不可执行时仍使用原底栏的 disabled 参数，而不是写一个假生成回调。
// 标题与关闭属于侧栏外壳，文生图字段和工具都来自 children 中的原表单。
// 头部关闭不承担模型选择或参数应用，不缓存一份未确认的整表单副本。
// 外壳不指定表单字体族，原创建页字体回退自然继承应用主题。
// 不能加 color-scheme:dark 固定值，否则白色主题下原输入和下拉框会错误绘制。
// 表单正文自身滚动，头部关闭与底部生成各自固定，不新增第二层可滚动字段区。
// 内容是纵向 flex，原整块表单按宿主宽度伸展，不被一个横向 flex 子项撑出边界。
// 这种几何约束属于外壳职责，不需要去改原输入组件的宽度和圆角。
// 外壳没有蒙版遮罩，用户仍可明确点击另一张节点切换配置目标。
// 多选或无选择如何选择节点仍由原画布宿主决定，本外壳不擅自默认第一张。
// returnFocus 是打开时记录的真实触发器，不根据标题或可见文字重新查找。
// 关闭还原焦点不会重新选择另一个模型，也不触发生成。
// 资源门户继续由原对话框组件挂载，它们不再需要画布字段专属样式。
// 只需要阻止键盘命令穿透，不需要把原表单所有鼠标事件重新解释成画布拖动。
// 表单和图引擎是兄弟，普通滚轮不会推进画布视口，原字段滚动保持自然。
// 这层不引入状态共享，两个节点使用同一个表单组件仍保留各自确认数据。
// 源页面和侧栏的视觉差异应先检查宿主继承，不能继续追加越来越多的控件补丁。
export function CanvasImageSidebar({ returnFocus, label, children, selecting, onClose }: Props) {
  // 与主区模态资源页不同，这里不把整个画布 inert，否则用户无法直接切换节点。
  // 模型/LoRA 资源页仍采用自己的模态规则，selecting 只负责外层先别抢 Escape。
  // portal 中的事件沿 React 组件树冒泡，不能只按 DOM 是否在 aside 内判断来源。
  // 因此键盘隔离挂在组件根，资源页和普通字段都不会顺带执行图节点快捷命令。
  // 宿主捕获阶段识别 data-canvas-popover，这一标记和冒泡阻断承担不同阶段的保护。
  // 普通字段消费了 Escape 后不再关闭侧栏，允许数值输入先恢复自己的临时草稿。
  // 首次聚焦关闭按钮是可预期的退出路径，不会全选正文导致用户误覆盖已有文字。
  // preventScroll 避免聚焦使浏览器把世界坐标中的节点滚进视口，打乱画布观察位置。
  const { t } = useTranslation();
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = returnFocus?.current ?? document.activeElement;
    root.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, [returnFocus]);
  return <aside ref={root} data-canvas-workflow-settings data-canvas-popover className="hy-image-sidebar create-workspace" aria-label={t("canvas.settings")} onPointerDown={event => event.stopPropagation()} onKeyDown={event => {
    // 完整创建表单会打开指南、预设和工具门户，不只有模型选择器。
    // 门户虽然位于 React 子树，真实 DOM 属于外部弹层；键盘交给原弹层先处理。
    // 不能在这里阻断 document 的 Escape，否则资源页和菜单会无法关闭。
    if (event.target instanceof Node && !event.currentTarget.contains(event.target)) return;
    if (document.querySelector('[role="dialog"]')) return;
    event.stopPropagation();
    if (event.key === "Escape" && !selecting && !event.defaultPrevented) { event.preventDefault(); onClose(); }
  }}>
    {/* 侧栏头部：仅展示当前节点名称和收起入口，不带导演台的图层内容。 */}
    <header><HoverTip asChild label={(label) || ""}><strong>{label}</strong></HoverTip><button type="button" aria-label={t("canvas.close")} onClick={onClose}><X className="h-4 w-4" /></button></header>
    {/* 侧栏表单：复用创建页的受控文生图控件，参数归属由调用方决定。 */}
    <div className="hy-image-sidebar-body">{children}</div>
  </aside>;
}
