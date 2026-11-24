"use client";

import { fitCanvasAudioCard, fitCanvasCard } from "./canvas-fit-card";
import { HoverTip } from "@/components/hover-tip";

// 此处只适配已有 React Flow 与资料包展示组件；卡片和参数面板不再各画一份。
// 世界坐标、命中和拖线交给图引擎，表单通过编辑器命令进入同一撤销路径。
// 生成结果与用户手写内容分开，没有服务结果时不会显示伪成品或播放成功。
import { useStore } from "zustand";
import { CanvasNodeLoading } from "./canvas-node-loading";
import { memo, useRef, useState, type KeyboardEvent } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { useTranslation } from "@/i18n";
import { NODE_LABELS, type CanvasData, type CanvasNode as FlowCanvasNode } from "./canvas-model";
import { CanvasNode } from "./reference-ui/node-components";
import { CanvasWritingPanel } from "./canvas-writing-panel";
import { CanvasAnnotationList } from "./canvas-annotation-list";
import { GenerationPanel } from "./reference-ui/generation-panel";
import { UpscalePanel } from "./reference-ui/upscale-panel";
import { CanvasIcon } from "./reference-ui/components";
import styles from "./canvas.module.css";
import { useCanvasEditorActions, useCanvasFixedSize } from "./canvas-editor-context";
import { CanvasMediaPreview } from "./canvas-media";
import { CanvasChip } from "./reference-ui/components";
import { canvasNodeTitle } from "./canvas-media-name";
import { useNodePress } from "./use-node-press";
import { usePortMotion } from "./use-port-motion";
import { SceneNodeContent } from "./scene-node-content";
import { CanvasImageResizer } from "./canvas-image-resizer";
import { CanvasCompareNode } from "./canvas-compare-node";
import { useVideoCardSize } from "./use-video-card-size";

// Escape 只恢复当前输入草稿，失焦随后提交的仍是旧值。
function cancelDraft(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, value: string) {
  event.stopPropagation();
  if (event.key !== "Escape") return;
  event.currentTarget.value = value;
  event.currentTarget.blur();
}

// 端口和展开箭头共用键盘激活，先消费按键，防止图引擎把 Enter 当作节点选择。
// 原生按钮若先失去焦点，浏览器可能不再产生 click；明确激活可避免这一冲突。
// preventDefault 防止原生默认动作再补一次点击，鼠标仍直接走原 onClick。
// Enter 在按下时激活，Space 也沿用相同路径，松开时不会再执行浏览器的第二次动作。
// 不匹配的方向键和 Tab 不在此消费，原来的节点移动与焦点导航仍然可达。
// 只有事件到达当前按钮或端口才调用本方法，没有安装全局按键拦截。
// 点击回调由 currentTarget 获取，因此按在 SVG 内部也不会试图激活一个 path。
// 这个助手不决定展开还是连接，两种真实业务仍由各自 onClick 注入。
// 修复范围只覆盖本轮涉及的端口与箭头，不批量更改整个应用的键盘规则。
// 当前按钮没有自定义 disabled 分支，因为它只在已选中节点上提供可执行的面板切换。
function activateControl(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.click();
}

// 世界位置由 React Flow 外层容器绘制，卡片正文无需为每个像素位移重新生成 JSX。
// 本组件实际只读取身份、内容和选中态，比较器也只比较这三个显示输入。
// data 必须不可变更新，参数、更换文件或卡片尺寸变化仍会触发正常渲染。
// 内部展开/输入状态和 Context 更新仍遵循 React，自定义比较不冻结用户操作。
// 音视频的本地 state 独立推进，不会因父卡片 memo 而停止真实进度显示。
export const CanvasNodeCard = memo(function CanvasNodeCard({ id, data, selected = false }: NodeProps<FlowCanvasNode>) {
  const { t } = useTranslation();
  const flow = useReactFlow<FlowCanvasNode>();
  const actions = useCanvasEditorActions();
  const fixedSize = useCanvasFixedSize();
  const generating = useStore(actions.generationStore, state => state.nodeIds.includes(id));
  const host = useRef<HTMLElement>(null);
  const videoSize = useVideoCardSize(data);
  // 首次导入或生成音频默认适应播放器，已有手动尺寸继续优先。
  const card = data.card ?? (data.media?.kind === "audio" ? fitCanvasAudioCard() : undefined);
  const { panelActive, showPanel } = useNodePress(host);
  // 按压和端口各有局部生命周期：收起参数不卸载端口，也不取消正在拖出的连线。
  // 卡片 selected 仍由 React Flow 提供，手势 Hook 没有生成一份影子选择集。
  // 面板可见性保存在节点组件实例，复制节点得到新的实例而不是共享开关引用。
  // data 与媒体引用没有参与这两个 Hook 的参数，播放器进度不重启手势识别。
  // 卡片删除时两者跟随同一个 host 卸载，不需要页面遍历节点逐个停止动画。
  usePortMotion(host, id);
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState<"title" | null>(null);
  const [writingFocus, setWritingFocus] = useState(0);
  const writable = data.kind === "text" || data.kind === "note";
  // 展开意图与选择独立：搬动可以选中卡片，但不会同时弹出提示词输入区。
  // 箭头和工具条复用同一开关，长按隐藏后也能明确用键盘重新打开。
  const panelOpen = (data.kind === "note" || expanded) && panelActive;
  // 双击、键盘工具条共用书写入口；增加焦点请求后，已打开的输入框也能重新聚焦。
  const openWriting = () => { setExpanded(true); showPanel(); setWritingFocus(value => value + 1); };
  // expanded 表示显式折叠意图，panelActive 表示本次手势允许打开，缺一都不挂表单。
  // 使用这个组合值更新箭头与工具条，不分别从两个状态推导不同的展开文案。
  // 参数关闭时直接卸载输入区，而非用透明度隐藏，Tab 不会落到看不见的草稿上。
  // 表单变更仍通过原 update 回调写 data，不把输入草稿交给手势 Hook 保存。
  // toggle 使用当前真实显示值，所以长按关闭后按箭头可以直接打开而不是再关一次。
  // showPanel 只解除手势抑制，不单独负责选择；未选中时不会偷开其他节点表单。
  // 文本工具条 expand 和右上角箭头执行同一方法，避免两个入口逐渐产生不同语义。
  // 便签只显示正文书写框，单击和长按仍共用同一手势判断。
  // composition 的独立编辑器仍由 openComposer 管理，不改造成生成参数表单。
  const togglePanel = () => { setExpanded(!panelOpen); showPanel(); };
  // 两个显示状态在同一用户事件内更新，由 React 一次提交，不先画一个中间面板。
  // 历史栈不包含这些切换，所以撤销节点移动不会反过来撤销参数展开次数。
  // 取消媒体导入也不会重置 expanded，导入生命周期与参数显示继续各自独立。
  // 卡片正在播放时短按标题只影响选择和参数，不在这里改 currentTime。
  // 锁定或禁用控件的边界仍由各业务入口维护，本助手没有绕过媒体错误处理。
  // 文件替换只能回到图片、视频或音频卡；文本与合成节点不借导入暗中改变类型。
  // 引用改变后重新挂载预览，旧文件的迟到 load/error 不污染新素材。
  const pickMedia = () => {
    // 事件发生时使用本卡 ID，不读取全局当前选中项，避免快速切卡后换错文件。
    // 一张未选中的媒体卡也可以明确点击自己的更换按钮，不必先修改其他选择。
    // 类型保护和导入边界各守自己的职责，不能仅靠按钮看上去位于图片卡就放宽类型。
    // 文件选择不会在此同步写数据，用户取消时原来这张卡仍然完整保留。
    if (data.kind === "image" || data.kind === "video" || data.kind === "audio") actions.importMedia({ id, kind: data.kind });
  };
  // 缺少引用时展示真正可用的导入入口；有引用但文件丢失时由预览保留错误和更换入口。
  // kind 通过已校验数据确定，不能因为图片加载失败就把音频播放器塞进原卡。
  const mediaKind = data.kind === "image" || data.kind === "video" || data.kind === "audio" ? data.kind : null;
  // 只把媒体作为原 CanvasNode 的 content 插槽，标题、选框和端口继续引用共享外壳。
  // 没有复制“导入版节点”组件，否则将来调整选中样式会出现两套实现不同步。
  // 空卡按钮使用 CanvasChip，和参数控件保持相同主题、焦点与悬停规范。
  // 真实图片标题显示文件主体；修改时交给工作区完成实际文件改名与引用同步。
  // 有媒体引用但打不开时不回落到空卡按钮，错误引用必须留给用户看见并修复。
  // 同一路径更新通过内层引用身份开启新会话，换到不同路径则由此 key 立即卸载旧源。
  // 音频内容不生成假的波形；视频使用实际 video，不用缩略图充当正在播放。
  // 文本和便签显示同一份正文；双击与工具条进入书写，不再打开节点网预览。
  // 合成器保持自己的空态入口，不从单个节点有视频就推断多轨合成已经完成。
  const mediaContent = data.media ? <CanvasMediaPreview key={data.media.path} media={data.media} selected={selected} fit={card?.style === "fit" ? "contain" : "cover"} onDimensions={videoSize.onDimensions} onExpand={data.media.kind === "video" ? () => actions.openPreview(id) : undefined} onReplace={pickMedia} /> : mediaKind ? <div className="hy-node-empty nodrag nopan"><CanvasIcon name={mediaKind} size={32} /><CanvasChip onClick={pickMedia}>{t(mediaKind === "image" ? "canvas.importImage" : mediaKind === "video" ? "canvas.importVideo" : "canvas.importAudio")}</CanvasChip></div> : undefined;
  const update = (patch: Partial<CanvasData>) => {
    if (Object.entries(patch).some(([key, value]) => data[key] !== value)) actions.updateNodeData(id, patch);
  };
  const action = (value: string) => {
    if (value === "fit" && !data.resizeLocked && !fixedSize) {
      const card = data.media?.kind === "audio" ? fitCanvasAudioCard(data.card?.width)
        : videoSize.frame ? fitCanvasCard(videoSize.frame.width, videoSize.frame.height, data.card?.width) : null;
      if (card) { flow.updateNode(id, { width: undefined, height: undefined }); update({ card }); }
    }
    if (value === "target") void flow.fitView({ nodes: [{ id }], duration: 0, padding: .4 }).catch(() => undefined);
    if (value === "copy") actions.copySelected();
    if (value === "text") openWriting();
    if (value === "expand") togglePanel();
    if (value === "open-composer") actions.openComposer(id);
    if (value === "open-director") actions.openDirector(id);
  };
  // 文件主体决定真实图片标题；空卡继续显示用户手写的工作标题。
  // 输入草稿仍属于本卡，不在每次键入时重命名磁盘文件。
  // Enter 通过失焦提交，Escape 恢复旧值后失焦，因此不会触发实际改名。
  // 其他节点也使用同一标题输入，原动作入口在工作区按媒体类型保留业务差异。
  // 文件操作异步失败时展示原名和真实错误，不先把未确认草稿伪装成新文件名。
  // 主体里的多个点保留，只省略最后格式后缀，完整名字仍通过 title 可查看。
  // 二十字省略仅是显示限制，输入和实际改名使用完整主体而不是省略后的文字。
  // 节点 id、端口、连线和媒体内容不依赖可修改名称，改名不重建节点身份。
  const displayTitle = canvasNodeTitle(data);
  const title = editing === "title" ? <input autoFocus className="nodrag nopan" aria-label={t("canvas.titleLabel")} defaultValue={displayTitle} maxLength={80} onKeyDown={event => { cancelDraft(event, displayTitle); if (event.key === "Enter") event.currentTarget.blur(); }} onBlur={event => { actions.renameNode(id, event.currentTarget.value); setEditing(null); }} /> : <HoverTip asChild label={(displayTitle) || ""}><strong data-canvas-title role="button" tabIndex={0} onDoubleClick={() => setEditing("title")} onKeyDown={event => { if (event.key === "Enter") { event.stopPropagation(); setEditing("title"); } }}>{displayTitle.length > 20 ? `${displayTitle.slice(0, 20)}...` : displayTitle}</strong></HoverTip>;
  const content = writable && data.content ? <div className="hy-node-result">{data.content}</div> : undefined;
  // 真实 Handle 保留固定命中位置，移动的是内部圆圈，避免连线坐标随装饰漂移。
  // 两侧共用相同视觉层，类型、语义名称和连接回调仍由原端口参数决定。
  // 内层 span 没有 tabIndex，键盘只经过一次真实 Handle，不多停一个装饰目标。
  // aria-label 仍落在 Handle 上，读屏读到的是输入或输出，而不是无意义的加号。
  // 加号 SVG 路径继续复用 CanvasIcon，没有为了跟随效果复制一份图标资源。
  // 相同的回调签名继续走原连接动作，类型兼容和回环校验不在此另写一套。
  // 即便视觉圆圈移动到外侧，稳定的 Handle id 仍是 in 或 out，旧连线不丢失。
  // 端口装饰不进入 data.card，自定义正方形、长方形与手动尺寸继续共用原插槽。
  const portTypes = data.mode === "compare" ? ["target"] as const : ["target", "source"] as const;
  const ports = data.kind === "note" ? null : <>{portTypes.map(type => <Handle key={type} className={`hy-node-port hy-node-port-${type === "target" ? "input" : "output"} ${styles.handle}`} type={type} position={type === "target" ? Position.Left : Position.Right} id={type === "target" ? "in" : "out"} role="button" tabIndex={0} onClick={() => actions.connectPort(id, type)} onKeyDown={activateControl} aria-label={t(type === "target" ? "canvas.input" : "canvas.output")}><span className={styles.portFace}><CanvasIcon name="plus" size={14} /></span></Handle>)}</>;
// 节点实例把 data.card 转成自己外壳的宽度与高度变量。
// 没有 card 时不写内联尺寸，继续使用资料组件默认方案。
// --canvas-card-height 只传局部几何，不成为全局主题变量。
// 节点缩放由图引擎 transform 完成，不再次乘屏幕 zoom。
// data-card 供稳定样式与运行断言识别当前方案。
// 媒体内容、标题和端口仍在同一 CanvasNode 内，没有复制另一套结构。
// 自定义标题文本太长时仍由原省略机制处理。
// 改尺寸不会把文本节点转成媒体节点。
// 选中参数面板在卡片外，卡片高度不包含展开后的参数区。
// 媒体节点的真实播放控件可换行，不用裁掉截帧入口迁就小卡。
// 端口按新壳高度居中，连接关系仍按原节点 id 保留。
// 各节点分别读取 data.card，同源卡片也能使用不同展示形状。
  return <article ref={host} className={styles.node} style={card ? { width: card.width, "--canvas-card-height": `${card.height}px` } as import("react").CSSProperties : videoSize.style} data-auto-video={videoSize.automatic} data-card={card?.style} data-canvas-node={id} data-kind={data.kind} data-selected={selected}>
    {!data.resizeLocked && <CanvasImageResizer selected={selected} />}
    <CanvasAnnotationList values={data.annotations} onEdit={annotationId => actions.openAnnotation(id, annotationId)} />
    {/* 节点外壳：content 和 mediaContent 互斥，避免把原生媒体再套一层生成结果卡片。 */}
    {/* 选择由图引擎传入；预览不会通过播放事件改变节点的 selected 或世界位置。 */}
    {/* 参数面板仍读当前 data，替换媒体也不会重建独立的提示词表单。 */}
    <CanvasNode kind={data.kind} noteAppearance={data.noteAppearance} selected={selected} onDoubleClick={writable ? openWriting : undefined} ariaLabel={t(data.mode === "compare" ? "canvas.compareImage" : data.mode === "upscale" ? "canvas.upscale" : NODE_LABELS[data.kind])} title={title} fitAvailable={(data.media?.kind === "audio" || !!videoSize.frame) && !data.resizeLocked && !fixedSize} ports={ports} content={data.mode === "compare" ? <CanvasCompareNode nodeId={id} /> : data.mode === "upscale" ? <><UpscalePanel value={data.upscale} video={data.kind === "video"} onChange={upscale => update({ upscale })} busy={generating} onSubmit={() => actions.generateImage(id)}>{data.media ? mediaContent : undefined}</UpscalePanel>{generating && <CanvasNodeLoading upscale cancel={() => actions.cancelGeneration(id)} />}</> : data.kind === "scene" ? <SceneNodeContent scene={data.scene} onOpen={() => actions.openDirector(id)} /> : generating ? <>{content || mediaContent}<CanvasNodeLoading upscale={false} cancel={() => actions.cancelGeneration(id)} /></> : content || mediaContent} expanded={panelOpen} onAction={action} />
    {selected && data.kind !== "note" && data.mode !== "upscale" && data.mode !== "compare" && <button type="button" className={`${styles.panelToggle} nodrag`} aria-expanded={panelOpen} aria-label={t(panelOpen ? "canvas.collapse" : "canvas.expand")} onKeyDown={activateControl} onClick={togglePanel}><CanvasIcon name="chevron" size={12} /></button>}
    {selected && panelOpen && data.mode !== "upscale" && data.mode !== "compare" && data.kind !== "composition" && data.kind !== "scene" && <div className={writable ? styles.writingParameters : styles.parameters}>{writable ? <CanvasWritingPanel nodeId={id} value={data.content} focusRequest={writingFocus} onChange={content => update({ content })} /> : <GenerationPanel nodeId={id} busy={generating} onSubmit={data.kind === "image" || data.kind === "video" || data.kind === "audio" ? () => actions.generateImage(id) : undefined} data={data} onChange={update} onToggle={() => setExpanded(false)} />}</div>}
  </article>;
}, (previous, next) => previous.id === next.id && previous.data === next.data && previous.selected === next.selected);
