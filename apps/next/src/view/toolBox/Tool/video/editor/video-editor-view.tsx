"use client";

// LIVE-02页面装配：真实素材和V1安排分别管理，工程持久化仍未接通。
// 各区域像同一工作台上的抽屉，外框固定，内容多时在各自抽屉内滚动。
// 上区、分隔条、时间轴和信息条的高度交给同一个 grid，避免各算窗口高度。
// 路由上方已有 AppShell，不重复创建导航、标题栏、品牌或系统按钮。
// 文案订阅现有语言状态，不为编辑器再建 Context 或另一套 locale。
// 临时工程状态归本页面会话，不把它写入全局生成或旧版剪辑store。
// 后续 UI-02–08 在这些区域边界接入局部状态，不整体复制页面装配。
import { useClipTransform } from "./use-clip-transform";
import { ClipInspector, MediaPanel, ProgramPreview } from "./editor-panels";
import { EditorWorkspace } from "./editor-workspace";
import { useLiveVideoSession } from "./use-live-video-session";
// 菜单共用现有Portal外壳，正式工程只注入当前目标与有限编辑意图。
// 样板和原视频/GIF入口没有这个会话，不会被自动开启右键编辑。
import { LiveClipMenu } from "./live-clip-menu";
import { useState, type DragEvent } from "react";
import { ProgramCompositePreview } from "./program-composite-preview";
import { isVideoTrack } from "./timeline-track-model";
import { LiveSourcePreview } from "./live-source-preview";
import { useLiveTimeline } from "./use-live-timeline";
import { ClipBasicTools } from "./clip-basic-tools";
import styles from "./editor.module.css";

// 正式项目从0秒开始，宽高和帧率是工程设置，不从素材元数据暗中修改。
// 当前一律30fps对齐时间线，24fps素材仍保留自身帧率供源播放器显示。
// 工程常量中没有DEMO素材引用，真实导入和静态样板完全分开。
// 时长在装配时由正式片段数组覆盖，未安排任何素材时总长保持零。
const LIVE_PROJECT = { width: 1920, height: 1080, fps: 30, duration: 0, currentTime: 0 } as const;

// 编辑器 host 只建立容器查询边界，布局读取可用主区而非浏览器完整宽度。
// 默认保留三栏上区；空间不足时先隐藏属性，再隐藏素材，节目预览优先。
// UI-07临时入口由共享workspace注入，素材和属性复用原常驻节点。
// R05保留八像素命中槽，拖动和键盘布局调整由workspace统一处理。
// separator报告实测高度范围，媒体和工程状态不参与布局调节。
// 后续分隔逻辑只能改变 grid 比例，不能改项目或片段选择。
// host 高度不足时允许工作区整体纵向滚动，避免信息条被 overflow:hidden 吞掉。
// 正常高度下素材列表、属性内容和时间轴各自滚动，宿主 main 不产生第二条滚动条。
// 最小高度在本轮仅为骨架安全边界，UI-07 还须验证真实系统缩放和最低可用高度。
// 不在正式界面堆“当前为样例”的调试说明，未接通状态由动作禁用与原因表达。
// 静态占位也保留 R01–R10 编号数据属性，验收可逐区定位而不污染视觉原图。
// 正式入口从空库开始；源播放器卸载时停止读取，静态样板另有入口。
// LIVE-01拥有导入批次、素材选择和源读取，LIVE-02只拥有工程安排。
// 两者通过最小意图协调，片段选择结束素材查看优先级但不改素材高亮。
// previewAsset先尊重用户主动打开的素材，再考虑当前片段源查看。
// 返回节目同时关闭两种源查看意图，避免旧优先级让画面又跳回素材。
// clipAsset按assetId回查，不用标题匹配，支持重名文件和同源多实例。
// 属性头只绑定选中片段，用户浏览素材不会隐式生成安排或改属性目标。
// currentTime是独立工程书签，正式单段播放通过transport回报时间。
// 素材播放器key为assetId，片段播放器key为clipId，生命周期边界清楚。
// 外部Files即使落在V1也只调用统一startImport，不自动创建时间线片段。
// 内部载荷由轨道接管，不触发“正在导入文件”的全区覆盖提示。
// 宿主不读取File.path，路径解析仍走既有preload的getPathForFile。
// 新增会话没有存储副作用，离开确认仅提醒数据未保存，不假装已保存。
export function VideoEditorView() {
  const [cropId, setCropId] = useState<string | null>(null);
  const live = useLiveVideoSession();
  // 工程安排与素材库各自拥有选择，只有片段意图会更新右栏和节目对象。
  // 点片段先结束素材查看，再打开该实例引用的源，列表高亮保持不变。
  // 同源实例的播放器key仍不同，旧源先清理，不继承另一实例的播放位置。
  const timeline = useLiveTimeline(live.assets, LIVE_PROJECT.fps, live.returnToProgram, LIVE_PROJECT);
  const project = { ...LIVE_PROJECT, duration: timeline.duration };
  const transform = useClipTransform(timeline, project);
  const sourceAsset = live.assets.find(asset => asset.id === timeline.selectedClip?.assetId) ?? null;
  // 音轨安排需要音频属性头，但素材库仍保留原始视频卡片和元数据。
  // 这里只适配当前查看对象，不修改assets数组，也不新增虚构音频文件。
  // 源路径仍使用同一localfile地址，由单源播放器选择音频媒体元素。
  const clipAsset = sourceAsset && timeline.selectedClip?.audioOnly ? { ...sourceAsset, kind: "audio" as const, cover: null } : sourceAsset;
  // 全部视频层按明确tracks顺序装配，播放头由合成器筛选半开区间。
  // 这里不读取selectedId或素材高亮，选中下层不会使它浮到上层。
  // 隐藏轨道在进入解码器前排除；锁层继续参与显示，只禁止写入。
  // 缺失源仍交给合成器显示错误，不能悄悄把坏层跳过当成成功。
// tracks数组显式决定节目优先级，不读取素材导入顺序。
// 片段列表的DOM顺序也不作为图层契约；先按轨道分组后再按时间过滤。
// 即使选中音轨，节目仍按书签显示有效视频，不切成单源audio占位。
// 音轨选择只影响检查器，节目声音总线仍未接通。
// 缺失素材引用保留一个无源层，让预览准确报错而非悄悄漏掉一层。
// 正常素材失败批次不清空已有数组，所以引用不因另一次导入失败丢失。
// sourceVisible拥有独立优先权，但进入素材查看会卸载节目，不隐藏后台合成。
// 空工程仍复用原黑画布分支，没有媒体元素也不需要启动工程定时器。
// 有片段但书签在空隙时使用合成器，不能回退成选中片段单源预览。
// 检查器继续从selectedClip查asset，当前节目层名不会覆盖属性目标。
// 多个同源安排绑定各自transform.canvas，候选位置不按assetId共享。
// 源试看返回只改变查看模式，原素材高亮、片段选中和工程书签都保留。
// 本轮没有改变公共工作区外壳，导航与窗口控制仍由AppShell管理。
// 时间线动作仍使用原interaction，不向合成器复制移动或碰撞业务。
// 图层规则可供未来导出适配，但当前只有预览消费者，保存导出继续禁用。
  const currentTime = timeline.currentTime;
  const layers = (timeline.interaction.tracks ?? []).filter(track => isVideoTrack(track) && !timeline.interaction.hiddenTracks?.includes(track)).flatMap(track => timeline.clips.filter(clip => clip.track === track && !clip.audioOnly).map(clip => {
    const edit = transform.canvas(clip);
    if (cropId === clip.id && timeline.selectedClip?.id === clip.id && !edit.locked) edit.crop = { cancel: () => setCropId(null), confirm: value => { timeline.crop(clip.id, value); setCropId(null); } };
    return { clip, edit, asset: live.assets.find(asset => asset.id === clip.assetId) ?? { id: clip.assetId, name: clip.assetId, kind: "video" as const, duration: null, cover: null } };
  }));
  const selected = timeline.selectedClip;
  const keyframeFrame = selected && currentTime >= selected.start && currentTime < selected.end ? Math.min(Math.ceil((selected.end - selected.start) * project.fps) - 1, Math.round((currentTime - selected.start) * project.fps)) : null;
  const inspectorValues = selected ? transform.value(selected) : undefined;
  // 裁剪入口就地定位到选中片段，避免在空隙中打开一个没有真实画面的框。
  const openCrop = () => {
    if (!selected || selected.audioOnly || transform.locked) return;
    timeline.menu.close(); live.returnToProgram();
    timeline.seek(Math.max(selected.start, Math.min(currentTime, selected.end - 1 / project.fps)));
    setCropId(selected.id);
  };
  // 只有时间线的画面主体被选中才挂载这组工具，素材库高亮不能冒充工程选区。
  // 锁定后保留所选主体的上下文，但各按钮仍由真实锁状态禁用。
  const basicTools = selected && !selected.audioOnly ? <ClipBasicTools enabled={!transform.locked} onAction={action => { setCropId(null); timeline.basic(action); }} onCrop={openCrop} /> : null;
  const interaction = { ...timeline.interaction, basicTools };
  // 两种预览互斥显示，但共用同一组窄窗入口，不复制按钮体系。
  // 动作放在标题流内，文件名会让出实际宽度，英文标签也无需猜宽。
  // 入口回调由workspace提供；媒体播放与面板开合没有共享业务状态。
// 窄窗入口原先绝对定位在右上，会与长文件名占用同一块空间。
// 现在让它们参与标题行排版，文件名可压缩，按钮不覆盖文字。
// ProgramPreview和LiveSourcePreview接收同一个React片段，返回节目不更换控件外观。
// 这只是两种互斥预览中的插槽复用，不会把两个播放器一起隐藏挂载。
// 静态工程也注入相同布局入口，但不获得正式会话的导入或工程编辑回调。
// 素材与属性入口只控制显示，不启用面板中原本未接通的业务字段。
// 开合入口不会清空当前片段，也不会替用户切换素材高亮。
// 此处不按文件名长度估算宽度，中文和英文都交给真实flex几何处理。
// 标题区的滚动归属仍在共享预览容器，不创建独立横向滚动条。
// 外层nav开合改变可用宽度时，标题行会随容器重新分配空间。
  // 外部文件像送到货架的新包裹，只在真正松手时进入统一导入流程。
  // 内部片段拖动像挪动安排表，不是重新搬运视频文件，不能触发导入提示。
  // 不再记录整页dragging布尔值：子轨道会截住事件，外层未必收到对应的离开通知。
  // 取消遮罩后没有需要配对清除的视觉状态，Escape或离开窗口也不会留下提示。
  // dragOver只允许外部Files落下，不读取其中的路径或提前调用探测。
  // 路径仍在drop时经preload解析，不使用浏览器File.path或Node文件接口。
  // 真实导入的加载与错误继续由素材行表达，不靠全区覆盖模拟处理中。
  // 已有媒体节点不会因内部拖过轨道而卸载，播放时钟和当前画面因此保持原归属。
  function acceptDrop(event: DragEvent<HTMLDivElement>) {
    // 只有Files走既有导入链；内部身份拖放由时间线处理，不能误报非法文件。
    // 外部文件即使落在V1也只入库，后续明确添加才会产生片段。
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    const paths = Array.from(event.dataTransfer.files).map(file => window.electronAPI?.getPathForFile(file) ?? "");
    if (!paths.length) paths.push("");
    void live.startImport(paths);
  }
  return <div data-video-editor-ui="LIVE-02" data-live-video-session className={styles.host} onKeyDown={timeline.keyDown} onDragOver={event => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDrop={acceptDrop}><EditorWorkspace project={project} clips={timeline.clips} assets={live.assets} currentTime={currentTime} timeline={interaction} onImport={() => { void live.startImport(); }} busy={live.importBusy} onCancelImport={live.cancelImport}>
    {headerActions => <>

      {/* 素材区：正式会话传真实数组，样板组件默认数据保持独立。 */}
      <MediaPanel library layout="cards" assets={live.assets} selectedId={live.selectedAssetId} onSelect={live.selectAsset} onAssetDragStart={(event, id) => timeline.interaction.start(event, "asset", id)} onAssetDragEnd={timeline.interaction.cancel} onAddToTimeline={timeline.addAsset} onImport={() => { void live.startImport(); }} onCancelImport={live.cancelImport} importBusy={live.importBusy} importNotice={live.importNotice} />
      {/* 素材预览只读源媒体时钟，返回节目后不改时间线片段选择。 */}
      {live.sourceVisible && live.selectedAsset ? <LiveSourcePreview key={live.selectedAsset.id} asset={live.selectedAsset} project={project} onBack={live.returnToProgram} headerActions={headerActions} /> : timeline.clips.length ? <ProgramCompositePreview layers={layers} project={project} transport={{ time: currentTime, version: timeline.seekVersion, onTime: timeline.reportTime, onSeek: timeline.seek }} headerActions={headerActions} /> : <ProgramPreview clip={null} assets={[]} project={project} currentTime={currentTime} emptyPresentation="black" headerActions={headerActions} />}

      <ClipInspector project={project} live editableKeys={transform.editable} locked={transform.locked} currentFrame={keyframeFrame} onToggleKeyframe={(key, frame, value) => selected && timeline.keyframe(selected.id, key, frame, value)} onCommit={transform.commitField} onReset={transform.reset} targets={selected && clipAsset ? [{ id: selected.id, asset: clipAsset, duration: selected.end - selected.start, values: inspectorValues, keyframes: selected.keyframes }] : []} />
      {/* 片段菜单：一次只绑定当前工程的实例，关闭或切页由公共外壳清理。 */}
      {timeline.menu.anchor && <LiveClipMenu anchor={timeline.menu.anchor} clip={timeline.clips.find(clip => clip.id === timeline.menu.anchor?.id)} asset={live.assets.find(asset => asset.id === timeline.clips.find(clip => clip.id === timeline.menu.anchor?.id)?.assetId)} onClose={timeline.menu.close} onAction={timeline.menu.perform} onBasic={timeline.basic} onCrop={openCrop} />}
  </>}</EditorWorkspace></div>;
}
