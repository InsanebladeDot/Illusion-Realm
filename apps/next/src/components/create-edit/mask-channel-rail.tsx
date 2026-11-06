"use client";
/**
 * 界面：主图右侧纵向通道栏，第一张返回编辑，其余只读预览。
 * 小 Canvas 随文档 revision 刷新，PNG 只在显式导出时编码。
 * 下载统一从顶部导出当前通道；缩略图本身不再附加下载按钮。
 */
import { useEffect, useRef } from 'react';
import { useMaskWorkspaceStore } from '@/stores/use-mask-workspace-store';
import { drawMaskChannel, type MaskChannel } from '@/utils/mask-preview';
import { useTranslation } from '@/i18n';
import { cn } from '@/utils/cn';

// 导出图片 DOM 只在已经有 Blob 时存在，保持已有导出验证的入口。
// URL 严格跟随这一份 Blob，重绘清除导出后立即释放。
// hidden 图片不占布局，用户实际看见的是持续更新的 Canvas。
// 文件名固定为通道键，不包含用户本地路径。
// 切换预览不改变像素或图层，顶部导出才编码当前通道。
// effect 直接管理 src，避免设置 URL 又引起一轮 React 渲染。
// 这里创建的URL仅供这一份导出Blob显示，不能与公共任务缩略图共用所有权。
// 每次画笔刷新会清空旧exports，因此相关img卸载后由effect释放旧URL。
// 下载函数拥有自己的短期URL，不依赖hidden图片继续挂载。
// Blob属性变化先清理前一次effect，再为新字节创建URL。
// hidden图片提供正式导出字节的可解码表面，视觉缩略图仍由Canvas即时绘制。
// 文件名使用稳定通道键，不泄漏源文件的本地路径。
// 此处不渲染下载动作，卡片只用于观察和返回编辑。
// 无 Blob 不挂载隐藏预览，不能将旧输出误作最新像素。
// alt 区分导出通道，隐藏图片仍对应真实独立 Blob。
// 失败交由现有下载边界处理，不能借下载动作创建生成结果。
function ChannelPreview({ kind, blob, label }: { kind: MaskChannel; blob: Blob; label: string }) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => { const url = URL.createObjectURL(blob); if (image.current) image.current.src = url; return () => URL.revokeObjectURL(url); }, [blob]);
  // Blob 预览只保留可解码图片，下载入口统一放在顶部工具栏。
  // 移除卡片按钮后，选择通道与下载不再争抢同一缩略图区域。
  // 生成用的合成数据保留在导出对象中，不作为第四个可见通道。
  return <img ref={image} data-mask-preview={kind} alt={label} hidden />; // eslint-disable-line @next/next/no-img-element -- Local PNG bytes.

}
// 三张预览共用同一组件和像素路径，不复制各自的缩放实现。
// 缓冲最长边 112px，UI 的 56px 预览在常见高 DPI 上仍清楚。
// 缓冲比原图小但纵横比一致，不裁掉主体来填充卡片。
// useEffect 只更新 Canvas，不回写业务状态。
// 通道选择是视图偏好，不增加撤销、清蒙版或改变生成参数。
// 未导入时仍保留占位，右侧布局不会因首次选图忽然跳动。
// 每个通道的buffer独立，不会因切换选中项覆盖其他缩略图。
// 最长边112只用于预览；导出像素尺寸始终来自文档。
// 最短边至少一像素，极端长宽比不会把Canvas缩成非法零尺寸。
// 按钮aspect-square定义卡片，内部图像保持原比例，不裁切内容。
// 选中边框与aria-pressed共同反馈当前通道，不能仅依赖颜色。
// painting首项返回可编辑状态，其余项都只读观察输出。
// 没有文档时按钮禁用但卡片保留，工具栏与stage的宽度不发生二次布局。
// 标签过长截断并保留title，窄栏不会因中文说明撑大。
// 通道状态写入同一工作区，切页返回不会神秘恢复到另一张预览。
// revision是像素变化通知，选择通道不产生新的内容版本。
// 缩略图不显示临时套索框，避免把虚线当作已经写入蒙版。
// 蒙版通道采用黑底白覆盖率，而非用户所选的辅助紫色。
// image与composite都使用反向alpha，区别仅在RGB是否包含绘画。
// 源文档File仅供元数据读取，不参与这次实时预览。
// Readonly画布不接收pointer工具事件，点击缩略图不能在图像上添一笔。
// show/hide图层属于编辑观察选项，独立通道仍按既定输出含义显示。
function Channel({ kind }: { kind: MaskChannel }) {
  const state = useMaskWorkspaceStore(), canvas = useRef<HTMLCanvasElement>(null), { t } = useTranslation();
  const label = t(kind === 'painting' ? 'create.maskStudio.editingChannel' : kind === 'mask' ? 'create.maskEditor.mask' : kind === 'image' ? 'create.maskEditor.alphaImage' : 'create.maskStudio.composite');
  useEffect(() => { const target = canvas.current, doc = state.doc; if (!target || !doc) return; const scale = 112 / Math.max(doc.original.width, doc.original.height); target.width = Math.max(1, Math.round(doc.original.width * scale)); target.height = Math.max(1, Math.round(doc.original.height * scale)); drawMaskChannel(target, doc, kind); }, [state.doc, state.revision, kind]);
  // 观察通道仍实时重绘，下载入口收敛到工具栏不会增加一次导出前置操作。
  // 隐藏 img 只提供已编码 Blob 的可解码预览，不参与主区排版。
  // 首张保持绘画 RGB，原图透明通道仍与生成合成输入分开保存。
  return <div className="min-w-0 space-y-1"><button type="button" data-mask-channel={kind} disabled={!state.doc} aria-label={label} aria-pressed={state.channel === kind} title={label} onClick={() => state.patch({ channel: kind })} className={cn('flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border bg-background/50 p-1 focus-visible:ring-2 focus-visible:ring-ring', state.channel === kind ? 'border-primary/60 ring-1 ring-primary/20' : 'border-border/70')}><canvas ref={canvas} className="max-h-full max-w-full rounded object-contain" /></button><p className="truncate text-center text-[9px] text-muted-foreground" title={label}>{label}</p>{state.exports && <ChannelPreview kind={kind} blob={state.exports[kind]} label={label} />}</div>;
}
// 固定窄栏只占用通道所需的空间，不扩展成第二个模型参数侧栏。
// 纵向只保留编辑图像、独立蒙版、原图透明；合成透明仅供生成。
// 缩略图始终存在，用户无需先导出才能查看当前像素状态。
// aria-label 给出整个分组含义，按钮提供具体通道名。
// 这里不提供多图加号，工作区仍限定一张原图。
// 纵向栏有自己的overflow，短窗口仍可向下找到最后一张通道。
// 栏宽56/64像素固定，右侧模型表单不会被它挤成多列。
// flex-shrink-0防止主图放大时通道栏被压到不可见。
// 通道列表固定为单图文档的三种可见输出，不作为额外素材列表使用。
// 首项编辑图用于回到画笔，其余项没有独立编辑历史。
// 普通模式切换与生成不需要用户先点击导出查看缩略图。
// 缩略图不附加下载按钮，统一从导入图片旁导出当前观察通道。
// 此栏不负责开始生成或验证服务器连接，避免观察通道带来网络副作用。
// 父组件统一提供与主图的间距，栏内部只定义通道之间的gap。
export function MaskChannelRail() {
  const { t } = useTranslation(), exports = useMaskWorkspaceStore(state => state.exports);
  // 合成 PNG 继续可解码，但没有第四张按钮、标签或布局占位。
  // 生成始终使用此数据，不跟随用户正在查看的黑白蒙版通道。
  // 三种可见通道与内部生成输入共享一次导出 revision，防止版本混用。
  return <aside data-mask-results aria-label={t('create.maskStudio.channels')} className="flex w-14 shrink-0 flex-col gap-2 overflow-y-auto sm:w-16">{(['painting', 'mask', 'image'] as const).map(kind => <Channel key={kind} kind={kind} />)}{exports && <ChannelPreview kind="composite" blob={exports.composite} label={t('create.maskStudio.composite')} />}</aside>;
}
