"use client";

// 加号负责导入参考素材；当前结果预览与输入列表分开，避免下次自动回传结果。
// 直接导入和图连线在这里一起显示，张数限制仍由原业务校验器执行。
// 子组件只订阅连接源的数据，不订阅整个画布坐标，搬卡片不会重建所有缩略图。
import Image from "next/image";
import { HoverTip } from "@/components/hover-tip";
import { useNodeConnections, useNodesData } from "@xyflow/react";
import { useTranslation } from "@/i18n";
import { buildLocalFileUrl } from "@/utils/localFileUrl";
import { CanvasIcon } from "./reference-ui/components";
import { useCanvasEditorActions } from "./canvas-editor-context";
import { canvasInputRule, canvasIsTextToImage } from "./canvas-input-rules";
import type { CanvasData, CanvasNode } from "./canvas-model";

// 无法构造本地地址时保留图片占位，不向 Image 传空地址而反复请求当前页面。
function ReferenceImage({ path, name }: { path: string; name: string }) {
  const source = buildLocalFileUrl(path);
  return source ? <Image unoptimized src={source} alt={name} width={48} height={48} /> : <CanvasIcon name="image" size={22} />;
}

export function CanvasReferenceInputs({ nodeId, data, onChange }: { nodeId: string; data: CanvasData; onChange: (patch: Partial<CanvasData>) => void }) {
  const { t } = useTranslation(); const actions = useCanvasEditorActions();
  const connections = useNodeConnections({ id: nodeId, handleType: "target" });
  const sources = useNodesData<CanvasNode>(connections.map(item => item.source));
// 缩略图排列必须与 @ 候选、实际提交一致，不能让三处各按自己的遍历顺序。
// 排序只发生在 filter 产生的新数组上，不改变图引擎持有的连接数据。
// 场景预览和普通图片都计入顺位，场景未回写时保留占位而不是删除编号。
// 图片解码失败也不应重排后续缩略图，序号由来源关系决定，不由 onLoad 决定。
// 同一个路径出现在两处代表用户两次明确输入，本层不擅自按路径去重。
// 删除手动项用它的列表下标，连线项必须删除原边，不能混用同一个删除动作。
// 输入名额按完整 linked 加 images 计算，显示缩略图不是绕开张数约束的旁路。
// 文本上游不会显示一个假图片占位，只有可作为图片的节点种类进入该列表。
// 没有真实路径时使用图标，不给 Next Image 传空 src 引发额外页面请求。
// 这个列表是节点提示词的附件，不是全局资产库；它不拥有源节点的文件删除权。
// 更换主题只改变底色，不能重建输入顺序或让引用正文失效。
// 缩略图固定四十八像素属于 UI，不参与原图上传和输出尺寸计算。
// 图片名作为可访问提示保留，受管磁盘安全名不必等于用户文件名。
  // 音频模板只有一个参考槽；与图片共用加号和附件壳，不保留侧栏的大块上传区。
  // 连线占用名额，即使来源尚未生成也不能再导入一份悄悄替代它。
  const audio = data.kind === "audio";
  const linked = connections.flatMap(connection => sources.filter(item => item.id === connection.source && (audio ? item.data.kind === "audio" : item.data.kind === "image" || item.data.kind === "scene")));
  const images = audio ? data.audioParameters?.reference ? [data.audioParameters.reference] : [] : data.inputImages ?? [];
  const maximum = audio ? 1 : canvasInputRule(data)?.max ?? 0;
  const addLabel = t(audio ? "canvas.insertAudio" : "canvas.addReference");
  if (canvasIsTextToImage(data) || !maximum && !images.length && !linked.length) return null;
  return <div className="hy-reference-inputs" data-canvas-reference-inputs>
    {/* 引用附件区：文件名作提示，直接导入项可移除；连线项由原连线菜单删除。 */}
    {linked.map(source => <HoverTip key={source.id} asChild label={source.data.media?.name ?? source.data.title}><div className="hy-reference-thumbnail">
      {source.data.media?.kind === "image" ? <ReferenceImage path={source.data.media.path} name={source.data.title} /> : <CanvasIcon name={audio ? "audio" : "image"} size={22} />}
    </div></HoverTip>)}
    {images.map((image, index) => <HoverTip key={`${index}-${image.path}`} asChild label={image.name}><div className="hy-reference-thumbnail">
      {audio ? <CanvasIcon name="audio" size={22} /> : <ReferenceImage path={image.path} name={image.name} />}
      <button type="button" aria-label={t("canvas.removeReference", { name: image.name })} onClick={() => onChange(audio ? { audioParameters: { ...data.audioParameters, reference: undefined } } : { inputImages: images.filter((_, item) => item !== index) })}><CanvasIcon name="close" size={12} /></button>
    </div></HoverTip>)}
    {images.length + linked.length < maximum && <HoverTip asChild label={addLabel}><button type="button" className="hy-reference-add" aria-label={addLabel} onClick={() => actions.importMedia({ id: nodeId, kind: audio ? "audio" : "image", reference: true })}><CanvasIcon name="plus" size={18} /></button></HoverTip>}
  </div>;
}
