"use client";

/**
 * stage：像素合成与视图缩放分离，缓冲固定使用原图尺寸。
 * ResizeObserver 读取实际容器，nav 开合和系统缩放都能正确调整。
 * 显示颜色只给临时蒙版副本着色，不污染实际覆盖率。
 */
import { useEffect, useRef, useState } from 'react';
import { Maximize, Minus, Plus, SlidersHorizontal } from 'lucide-react';
import { useMaskWorkspaceStore } from '@/stores/use-mask-workspace-store';
import { maskContext } from '@/utils/mask-document';
import { useTranslation } from '@/i18n';
import { MaskBrushPanel } from './mask-brush-panel';
import { useMaskPointer } from './use-mask-pointer';
import { drawMaskChannel, drawMaskOverlay } from '@/utils/mask-preview';
// 完成区域和开放轨迹分开，预览虚线从不写入文档缓冲。
// 反选路径包含图片边界，不能沿用只支持点数组的旧路径。
// 快捷键只在局部 stage 焦点内接管，不影响提示词和数值框。
import { pixelSelectionPath } from '@/utils/image-editor';
import { useMaskCanvasInteractions } from './mask-canvas-interactions';

/**
 * 显示缓冲按原图、绘画、蒙版顺序合成。
 * 蒙版用 source-in 保留软边 alpha，再施加预览透明度。
 * 隐藏原图只影响预览，输出仍由独立的文档导出函数负责。
 * 设置面板浮于画布，最大高度受画布约束，内容在面板内滚动。
 * 缩放和位移不是像素操作，因此不写入撤销历史。
 * 适应按钮复位视图，旋转改变自然尺寸后重新计算缩放。
 * 空态仅提示导入，不用示例图片冒充已存在的素材。
 */
// 画布视口由父级固定高度分配，图片是内部绝对定位的观察对象。
// 图片放大后裁切在视口内，周围表单不重新排布，也不产生额外页面留白。
// 适应倍率同时使用可用宽高，竖图不会只按宽度填满后超出固定高度。
// ResizeObserver观察容器而非图片，避免缩放图片又反过来改变适应倍率。
// 倍率上限8和下限0.1相对于适应尺寸，不等于图片真实像素被放大缩小。
// 导出始终使用文档缓冲，观察到25%时下载也不会丢失四分之三像素。
// 缩放过程中Canvas绘制坐标仍是自然像素，指针换算读取实际DOM矩形。
// 按钮和设置浮层处于更高层级，图片不能覆盖用户恢复视图的入口。
// 选择轮廓绘入显示缓冲，虚线不会出现在实际蒙版或透明PNG中。
// 切到输出通道只替换显示，不更改文档、参数或当前任务。
// 没有文档时保留固定空态，导入后不会因为新建stage使整页结构跳动。
// 画布平移是CSS位移，恢复适应同时重置位移，允许找回移出视野的图像。
// 需要大图历史的工具只在手势边界读取像素，缩放无需复制三层快照。
// 组件卸载只断开观察和事件，不取消公共生成队列。
// 视口高度来自父布局，放大缩小操作不能更改该高度类或额外撑出滚动区域。
export function MaskCanvasStage({ locked }: { locked: boolean }) {
  // box 宽度由实际布局测量，不能拿 innerWidth 代替 nav 右侧的可用空间。
  // 初始宽度只用于首帧安全布局，Observer 交付后按真实宽度重新计算。
  // zoom 是相对于适应比例的倍率，百分比显示使用最终自然像素比例。
  // 16px 留给画布保护空间，极窄时仍夹到正比例避免负宽度。
  // 600×480 只作为测量前的视口占位，随后按真实宽高适应。
  // offset 属于视图，导出不会把移动造成的空白编码进图片。
  // 页面工具状态在 store，面板开关与缩放只作为当前展示偏好。
  // doc 身份变化会触发 effect，旋转只改变尺寸时 revision 也能触发更新。
  // 设置收起时不卸载文档，打开后参数从同一 store 恢复。
  // locked 包含任务锁，捕获入口会检查它，避免仅工具条禁用而画布仍可写。
  // effect 只更新外部 Canvas，没有把渲染结果重复 setState。
  // 局部 ResizeObserver 在卸载时断开，不让旧 DOM 继续触发测量。
  // 平移后的图像仍由同一个viewport裁切，不在主页面插入补偿空白。
  // 浏览器恢复尺寸时Observer会重新报告实际可用高度，不缓存上次窗口宽高。
  // zoom百分比是观察反馈，不作为导出或模型输入的宽高来源。
  // 主图和通道栏由父级同一行排列，缩放不会改变两者之间的间距。
  const state = useMaskWorkspaceStore(), { t } = useTranslation(), canvas = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 600, height: 480 }), [zoom, setZoom] = useState(1), [offset, setOffset] = useState({ x: 0, y: 0 }), [settings, setSettings] = useState(false);
  const doc = state.doc, scale = doc ? Math.max(0.01, Math.min((viewport.width - 16) / doc.original.width, (viewport.height - 16) / doc.original.height)) * zoom : 1;
  // stage 提供统一键盘焦点；右键菜单复用全项目的视口避让机制。
  // 图片 pointer capture 仍由原 hook 管理，不安装另一套绘制事件。
  // 快捷键不监听 window，切页后不会影响其他界面。
  const interactions=useMaskCanvasInteractions(box,locked);
  const pointer = useMaskPointer(canvas, locked, (x, y) => setOffset(value => ({ x: value.x + x, y: value.y + y })));
  // Observer 读取 clientWidth，边框与滚动条由浏览器布局统一处理。
  // 隐藏页可能短暂宽度零，scale 下限保持合法；显示后 Observer 会重新交付。
  // 不要求 requestAnimationFrame，窗口被遮挡仍可通过观察结果更新布局。
  // 订阅只建立一次，因为根容器的 React 实例在局部切换时保留。
  useEffect(() => { const node = box.current; if (!node) return; const observer = new ResizeObserver(() => setViewport({ width: node.clientWidth, height: node.clientHeight })); observer.observe(node); return () => observer.disconnect(); }, []);
  // 滚轮只在画布视口内接管，笔刷浮层仍保留自己的滚动。
  // passive=false 允许阻止页面滚动，平移和缩放都不会把整个编辑区向下推。
  // zoom 以适应倍率为基准；像素缓冲大小始终保持原图尺寸。
  // 光标处保持同一个图像点，放大时不会突然跳到画布中心。
  // 清理监听避免路由返回后同一次滚轮触发多次缩放。
  // wheel监听直接绑定本地视口，其他页面和右侧参数仍保留正常滚动。
  // 只有 Alt 滚轮按 deltaY 正负缩小或放大，指数倍率使连续变化更平滑。
  // 单事件幅度被限制，触控板的大delta不会瞬间把图片推到极端倍率。
  // 指针锚点相对视口中心计算，缩放前后同一个图像点保持在光标下方。
  // 平移偏移同步乘倍率，用户已经移动的视图不会在缩放时突然复位。
  // 命中按钮、表单或可编辑文本时不接管，设置面板内部仍正常滚动。
  // preventDefault只在真正处理画布滚轮时调用，不能阻断整个窗口输入。
  // 监听设置passive=false，否则浏览器可能忽略阻止页面滚动的请求。
  // 闭包依赖zoom，每次更新先清理旧监听，避免一个滚轮触发多次处理。
  // 没有等待动画帧提交后才改变倍率，因此遮挡窗口不会让输入处理悬挂。
  // 缩放只影响视图state，不刷新revision或清除已经导出的Blob。
  // 监听的目标始终是同一stage，图片尺寸改变不会导致处理区域一起移动。
  // 倍率计算使用上一轮显示值，视口resize则由独立Observer重新计算适应比例。
  // 上下文的自然像素缓冲不随倍率重新分配，避免大图放大时指数增长内存。
  // 不同缩放按钮采用相同比例边界，用户不会从一个入口突破另一个入口限制。
  // 适应按钮不受正在生成锁定，查看输入不会修改被冻结的工作流。
  // 显示尺寸字符串只用于反馈，不回写图片宽高或模型生成参数。
  // 右侧缩略图没有独立缩放状态，始终保持各自完整的通道概览。
  // 轮廓线宽除以scale，使低倍率的选区仍可见，而不改变真实选择区域。
  // 绝对定位的图像容器设overflow-hidden，防止大图引入浏览器页面滚动条。
  // 固定视口外的反向提示词仍由正常文档流排列，不因放大镜操作向下漂移。
  // 滚轮不会隐式切换当前工具，用户选定的蒙版笔或套索仍保持。
  // 空态滚轮只改变观察偏好，不创建空文档或任何导出结果。
  // 主画布context每次重新绘制前重置尺寸，旧clip、透明度或路径不会污染新帧。
  // 预览读取当前revision，输入笔迹刷新后主图和缩略图可观察到同一文档。
  // 图层隐藏仅跳过显示分支，生成输入不会因用户暂时藏起蒙版而消失。
  // readonly通道只读drawMaskChannel，画笔hook会在入口拒绝写入。
  // 画布右键取消浏览器菜单，保留当前工具交互，不额外触发内容动作。
  // 系统DPR只影响浏览器显示采样，不再次乘到Canvas CSS宽高。
  // 输出尺寸标签读取旋转和裁剪后的文档层，不显示导入File的旧尺寸。
  // 设置浮层最大高度跟随视口，短窗口可在浮层内滚动全部参数。
  // 浮层绝对定位且有自身背景，开关不会挤占固定通道栏的宽度。
  // 缩放和设置都是局部展示偏好，文档像素由独立store持有。
  // 普通滚轮沿竖轴平移，Ctrl 滚轮沿横轴平移，两者均不改变观察倍率。
  // 正 delta 表示向下滚动，图像向上移动；Ctrl 时对应图像向左移动。
  // Alt 优先于 Ctrl，两个键同时按住也只执行一次缩放，不叠加平移。
  // deltaMode 为行时按 16 CSS 像素换算，为页时按当前视口高度换算。
  // 平移距离保持 CSS 像素，不乘原图缩放率，放大后移动速度仍一致。
  // 平移使用函数式更新，浏览器合并多次滚轮时不会覆盖上一笔位移。
  // 平移分支提前返回，Ctrl 滚轮不会顺便触发浏览器页面缩放。
  // Alt 分支继续复用原鼠标锚点算法，已平移的图像也能围绕光标缩放。
  // 画布空白区域同样接收滚轮，因此图像移出中心后仍能找回。
  // 平移不夹到图像边界，观察范围由固定视口裁切，适应按钮可一键复位。
  // 只读通道也允许查看平移，生成锁只禁止写像素，不禁止观察输入。
  // 原图尺寸、蒙版覆盖率与撤销记录均不参与这三个视图快捷操作。
  // 表单后代先判断再 preventDefault，数值控件不会被错误当作画布手势。
  // 使用 closest 检查整个祖先链，点击按钮内的 SVG 也能正确避开。
  // 所有监听仍绑定局部 stage，离开编辑页后不会劫持其他页面滚轮。
  useEffect(() => {
    const node = box.current; if (!node) return;
    const wheel = (event: WheelEvent) => {
      if (event.target instanceof Element && event.target.closest('button,fieldset,input,textarea,select,[contenteditable]')) return;
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1);
      if (!event.altKey) { setOffset(value => event.ctrlKey ? { ...value, x: value.x - delta } : { ...value, y: value.y - delta }); return; }
      const factor = Math.exp(-Math.max(-100, Math.min(100, delta)) * 0.002);
      const next = Math.max(0.1, Math.min(8, zoom * factor)), ratio = next / zoom, rect = node.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2, y = event.clientY - rect.top - rect.height / 2;
      setOffset(value => ({ x: x - (x - value.x) * ratio, y: y - (y - value.y) * ratio })); setZoom(next);
    };
    node.addEventListener('wheel', wheel, { passive: false }); return () => node.removeEventListener('wheel', wheel);
  }, [zoom]);
  useEffect(() => {
    // 先设置属性尺寸清空旧缓冲与合成状态，避免前次 globalAlpha 泄漏。
    // painted 透明区域透出 original，没有先填背景色污染导出预览。
    // 蒙版临时副本用 source-in 着色，实际 mask canvas 保持白色加 alpha。
    // 最终 context 的 globalAlpha 只作用于叠加层，原图不被整体淡化。
    // 隐藏蒙版时跳过临时画布分配，RGB 与原图仍正常显示。
    // 所有读写发生在 effect，静态导出阶段不会访问 document 或 Canvas。
    // 预览画布只是合成输出，输入事件写的是文档层而不是这个显示缓冲。
    // 因而重新渲染不会擦掉用户笔迹，清空显示缓冲是安全操作。
    if (!doc || !canvas.current) return; const target = canvas.current; target.width = doc.original.width; target.height = doc.original.height; const context = maskContext(target);
    if (state.channel !== 'painting') { drawMaskChannel(target, doc, state.channel); return; }
    if (state.visible.original) context.drawImage(doc.original, 0, 0); if (state.visible.painted) context.drawImage(doc.painted, 0, 0);
    if (state.visible.mask) drawMaskOverlay(target, doc, state.color, state.displayOpacity);
    // 选框只画在显示缓冲，像素导出不包含虚线或裁剪遮罩。
    // 线宽按显示比例还原，低倍率时仍能看清选区边缘。
    // 双重黑白虚线在浅图和暗图上都提供可辨识轮廓。
    // 样式状态显式恢复，避免下一次叠加颜色继承虚线设置。
    // 黑白虚线段等长，第二次偏移半周期，深浅图片都能看清轮廓。
    // 自然坐标不变，线宽与段长按 scale 反解保持屏幕观感。
    // 轨迹绘制在展示层，PNG 导出仍读取独立三层文档。
    context.save(); context.lineWidth = 1.5 / scale; context.setLineDash([5 / scale, 5 / scale]);
    const path = state.selection ? pixelSelectionPath(state.selection) : new Path2D();
    // 拖动期间保持开放路径，松开并通过面积校验才创建完成选区。
    // 所有工具草稿共用自然坐标，窗口缩放不重采样轮廓。
    // 矩形和椭圆由拖动端点建立，套索保留采样顺序。
    // 拖动矩形/椭圆显示完整轮廓，只有自由套索保留尚未闭合的笔迹。
    // closePath 只是显示反馈，未抬起时 selectionDrawing 仍禁止破坏性操作。
    // 工具状态列入 effect 依赖，切换后不残留上一支工具的闭合规则。
    if(state.selectionDraft?.length) { const [first,...rest]=state.selectionDraft; path.moveTo(first.x,first.y); rest.forEach(p=>path.lineTo(p.x,p.y)); if(state.tool!=='lasso') path.closePath(); }
    if (state.crop) { const r = state.crop; path.rect(r.x, r.y, r.width, r.height); }
    context.strokeStyle = '#ffffff'; context.stroke(path); context.lineDashOffset = 5 / scale; context.strokeStyle = '#172033'; context.stroke(path); context.restore();
  }, [doc, state.revision, state.visible, state.color, state.displayOpacity, state.channel, state.selection, state.selectionDraft, state.crop, state.tool, scale]);
  // stage 的焦点边框只用于键盘反馈，不改变盒模型或实际图像尺寸。
  // 点阵采用屏幕固定网格，图像滚轮缩放与 pan 不修改底板比例。
  // 图片自身的透明格独立挂在 canvas 背景，不绘入 target context。
  // 左侧工具和右侧通道都在 stage 外，菜单提示不会推动它们的位置。
  // 键盘事件通过冒泡到此处理，输入和 Portal 菜单会由 hook 明确过滤。
  // onContextMenu 不修改 pointer capture，正在绘制的轮廓仍由手势结束逻辑决定。
  return <div ref={box} className="mask-editor-stage relative h-full min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-border/70 outline-none focus-visible:ring-1 focus-visible:ring-ring" data-mask-stage tabIndex={0} aria-label={t('create.maskStudio.canvas')} onKeyDown={interactions.onKeyDown} onContextMenu={interactions.onContextMenu}>
    {/* 右键菜单通过 Portal 避免 stage 裁切，不占用画布布局空间。 */}
    {/* 顶部提供同等动作，触屏用户不必使用右键。 */}
    {/* 图片棋盘与外部点阵分离，二者都不参与实际像素导出。 */}
    {interactions.menu}
    {/* 设置面板 absolute 定位，展开不改变画布或右侧参数栏宽度。 */}
    {/* 面板本身可滚动，完整参数在短窗口和窄屏仍可访问。 */}
    {/* settings 按钮始终可关闭，任务期间只锁设置字段。 */}
    {/* 图标使用本地 SVG，主题切换不依赖异步图片加载。 */}
    {/* 界面：画布内浮动设置，不占用固定侧栏宽度。 */}
    {/* 颜色浮层经 Portal 挂到 body，必须显式传递与 fieldset 相同的任务锁。 */}
    {/* 导入/导出 busy 也锁住自由色板，不能用浮层修改冻结的输入状态。 */}
    {/* 原设置滚动和固定画布尺寸保持原有职责，选色展开不重新布局。 */}
    {doc && state.channel === 'painting' && <><button type="button" data-mask-settings aria-expanded={settings} aria-label={t('create.maskStudio.brushSettings')} onClick={() => setSettings(value => !value)} className="absolute left-3 top-3 z-10 rounded-xl border border-border bg-background/95 p-2 shadow-sm"><SlidersHorizontal className="h-4 w-4" /></button>{settings && <fieldset disabled={locked || state.busy} className="absolute bottom-14 left-3 top-14 z-10 w-[min(240px,calc(100%-24px))] overflow-y-auto rounded-xl border border-border bg-background/95 shadow-lg"><MaskBrushPanel disabled={locked || state.busy} /></fieldset>}</>}
    {/* 颜色浮层经 Portal 挂到 body，必须显式传递与 fieldset 相同的任务锁。 */}
    {/* 导入/导出 busy 也锁住自由色板，不能用浮层修改冻结的输入状态。 */}
    {/* 原设置滚动和固定画布尺寸保持原有职责，选色展开不重新布局。 */}
    {doc && state.channel !== 'painting' && <p className="absolute left-2 top-2 z-10 rounded-lg bg-background/90 px-2 py-1 text-[10px] text-muted-foreground">{t('create.maskStudio.readOnlyChannel')}</p>}
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">{doc ? <canvas ref={canvas} data-mask-surface data-mask-revision={state.revision} {...pointer} onPointerDownCapture={()=>box.current?.focus({preventScroll:true})} style={{ width: doc.original.width * scale, height: doc.original.height * scale, transform: `translate(${offset.x}px,${offset.y}px)`, cursor: state.tool === 'pan' ? 'grab' : 'crosshair' }} className="mask-editor-image block max-w-none shrink-0 touch-none" /> : <p className="px-5 text-center text-sm text-muted-foreground">{t('create.maskEditor.empty')}</p>}</div>
    {/* canvas CSS 尺寸显式设置，DPR 不会把缓冲像素误当布局宽度。 */}
    {/* touch-none 让画笔手势由 pointer handler 接管，平移使用独立工具。 */}
    {/* 外层裁切视图，放大后不会撑大 main 或产生全页横向滚动条。 */}
    {/* footer 使用正常可点按钮，不让图像覆盖缩放与适应入口。 */}
    {/* 适应画布同时清平移，用户移动到画布外后仍有一键恢复方法。 */}
    {/* zoom 下限和上限只限制展示，不降低导出像素数。 */}
    {/* 自然尺寸标签与旋转后的文档一致，而不是导入时缓存的尺寸。 */}
    {/* 界面：实际尺寸与视图缩放，百分比不用于生成尺寸。 */}
    {doc && <footer className="absolute bottom-3 left-3 right-3 flex items-center gap-2 text-xs"><span data-mask-size className="mr-auto rounded-md bg-background/90 px-2 py-1 tabular-nums">{doc.original.width} × {doc.original.height}</span><div className="flex items-center rounded-lg border border-border bg-background/95"><button type="button" aria-label={t('create.maskStudio.zoomOut')} onClick={() => setZoom(value => Math.max(0.1, value / 1.25))} className="p-2"><Minus className="h-3 w-3" /></button><span className="min-w-12 text-center tabular-nums">{Math.round(scale * 100)}%</span><button type="button" aria-label={t('create.maskStudio.zoomIn')} onClick={() => setZoom(value => Math.min(8, value * 1.25))} className="p-2"><Plus className="h-3 w-3" /></button><button type="button" data-mask-fit aria-label={t('create.maskStudio.fit')} onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }} className="border-l border-border p-2"><Maximize className="h-3 w-3" /></button></div></footer>}
  </div>;
}
