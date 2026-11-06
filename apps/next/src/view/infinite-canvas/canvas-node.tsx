"use client";

// 此处只适配已有 React Flow 与资料包展示组件；卡片和参数面板不再各画一份。
// 世界坐标、命中和拖线交给图引擎，表单通过编辑器命令进入同一撤销路径。
// 生成结果与用户手写内容分开，没有服务结果时不会显示伪成品或播放成功。
import { memo, useRef, useState, type KeyboardEvent } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { useTranslation } from "@/i18n";
import { NODE_LABELS, type CanvasData, type CanvasNode as FlowCanvasNode } from "./canvas-model";
import { CanvasNode } from "./reference-ui/node-components";
import { GenerationPanel } from "./reference-ui/generation-panel";
import { CanvasIcon } from "./reference-ui/components";
import styles from "./canvas.module.css";
import { useCanvasEditorActions } from "./canvas-editor-context";
import { CanvasMediaPreview } from "./canvas-media";
import { CanvasChip } from "./reference-ui/components";

// Escape 只恢复当前输入草稿，失焦随后提交的仍是旧值。
function cancelDraft(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, value: string) {
  event.stopPropagation();
  if (event.key !== "Escape") return;
  event.currentTarget.value = value;
  event.currentTarget.blur();
}

// 键盘激活真实图引擎端口，不旁路连接校验。
function activatePort(event: KeyboardEvent<HTMLDivElement>) {
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
  const host = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState<"title" | "content" | null>(null);
  const writable = data.kind === "text" || data.kind === "note";
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
  // 原文件名和自定义标题可以不同，媒体预览负责显示原名，标题输入仍由本卡负责。
  // 有媒体引用但打不开时不回落到空卡按钮，错误引用必须留给用户看见并修复。
  // 同一路径更新通过内层引用身份开启新会话，换到不同路径则由此 key 立即卸载旧源。
  // 音频内容不生成假的波形；视频使用实际 video，不用缩略图充当正在播放。
  // 文本和便签仍优先显示手写正文，导入分支不会影响其双击输入生命周期。
  // 合成器保持自己的空态入口，不从单个节点有视频就推断多轨合成已经完成。
  const mediaContent = data.media ? <CanvasMediaPreview key={data.media.path} media={data.media} selected={selected} onReplace={pickMedia} /> : mediaKind ? <div className="hy-node-empty nodrag nopan"><CanvasIcon name={mediaKind} size={32} /><CanvasChip onClick={pickMedia}>{t(mediaKind === "image" ? "canvas.importImage" : mediaKind === "video" ? "canvas.importVideo" : "canvas.importAudio")}</CanvasChip></div> : undefined;
  const update = (patch: Partial<CanvasData>) => {
    if (Object.entries(patch).some(([key, value]) => data[key] !== value)) actions.updateNodeData(id, patch);
  };
  const action = (value: string) => {
    if (value === "target") void flow.fitView({ nodes: [{ id }], duration: 0, padding: .4 }).catch(() => undefined);
    if (value === "copy") actions.copySelected();
    if (value === "text") setEditing("content");
    if (value === "expand") setExpanded(value => !value);
    if (value === "open-composer") actions.openComposer(id);
  };
  const title = editing === "title" ? <input autoFocus className="nodrag nopan" aria-label={t("canvas.titleLabel")} defaultValue={data.title} maxLength={80} onKeyDown={event => cancelDraft(event, data.title)} onBlur={event => { update({ title: event.currentTarget.value.trim() || t(NODE_LABELS[data.kind]) }); setEditing(null); }} /> : <strong data-canvas-title role="button" tabIndex={0} title={data.title} onDoubleClick={() => setEditing("title")} onKeyDown={event => { if (event.key === "Enter") { event.stopPropagation(); setEditing("title"); } }}>{data.title.length > 20 ? `${data.title.slice(0, 20)}...` : data.title}</strong>;
  const content = writable && editing === "content" ? <textarea autoFocus className="hy-node-result nodrag nopan nowheel" aria-label={t("canvas.manual")} defaultValue={data.content} maxLength={8000} onKeyDown={event => cancelDraft(event, data.content)} onBlur={event => { update({ content: event.currentTarget.value }); setEditing(null); }} /> : writable && data.content ? <div className="hy-node-result">{data.content}</div> : undefined;
  const ports = data.kind === "note" ? null : <>{(["target", "source"] as const).map(type => <Handle key={type} className={`hy-node-port hy-node-port-${type === "target" ? "input" : "output"} ${styles.handle}`} type={type} position={type === "target" ? Position.Left : Position.Right} id={type === "target" ? "in" : "out"} role="button" tabIndex={0} onClick={() => actions.connectPort(id, type)} onKeyDown={activatePort} aria-label={t(type === "target" ? "canvas.input" : "canvas.output")}><CanvasIcon name="plus" size={14} /></Handle>)}</>;
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
  return <article ref={host} className={styles.node} style={data.card ? { width: data.card.width, "--canvas-card-height": `${data.card.height}px` } as import("react").CSSProperties : undefined} data-card={data.card?.style} data-canvas-node={id} data-kind={data.kind} data-selected={selected}>
    {/* 节点外壳：content 和 mediaContent 互斥，避免把原生媒体再套一层生成结果卡片。 */}
    {/* 选择由图引擎传入；预览不会通过播放事件改变节点的 selected 或世界位置。 */}
    {/* 参数面板仍读当前 data，替换媒体也不会重建独立的提示词表单。 */}
    <CanvasNode kind={data.kind} selected={selected} ariaLabel={t(NODE_LABELS[data.kind])} title={title} ports={ports} content={content || mediaContent} expanded={expanded} onAction={action} onDoubleClick={writable ? () => setEditing("content") : undefined} />
    {selected && data.kind !== "note" && <button type="button" className={`${styles.panelToggle} nodrag`} aria-label={t(expanded ? "canvas.collapse" : "canvas.expand")} onClick={() => setExpanded(value => !value)}><CanvasIcon name="chevron" size={12} /></button>}
    {selected && expanded && data.kind !== "note" && data.kind !== "composition" && <div className={styles.parameters}><GenerationPanel data={data} onChange={update} onToggle={() => setExpanded(false)} /></div>}
  </article>;
}, (previous, next) => previous.id === next.id && previous.data === next.data && previous.selected === next.selected);
