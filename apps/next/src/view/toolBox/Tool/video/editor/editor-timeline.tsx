"use client";

// 时间轴骨架复用一套工程时间坐标，先不挂载旧源片段修剪轴。
// TimelineScrubber 是视频/GIF 的单源 trim，不能改名冒充多轨工程模型。
// 同一竖向滚动容器放置轨道头和内容，避免未来内容增多后上下行错位。
// 刻度与片段的横坐标都相对内容列，不从整页左边计算播放头。
// 正式视频内嵌音轨与分离音轨共用真实源包络，样板保留独立占位。
// 声音槽读取失败只影响波形，不把元数据成功的素材改成导入失败。
// 音轨与视频使用同一片段外壳，水平定位继续由真实start/end驱动。
// 右键事件与选择事件注入到同一个按钮，按图像或文字不会产生不同目标。
// 菜单操作使用clipId，封面和标题仍通过assetId取素材内容。
// 同一视频多次入轨时，右键其中一段不能批量作用于所有相同文件名。
// 音轨kind用于视觉和预览适配，不把原素材库里的video类型改成audio。
// 音频行可以在同轨水平拖动，但轨道头的加轨与锁定业务依旧未接通。
// 片段两端的装饰把手继续不接收修剪事件，不给用户虚假的可修剪交互。
// 标尺、音轨与播放头仍由同一滚动内容驱动，不追加第二个隐藏滚动容器。
// 竖向移过别轨时只展示原轨上的无效轮廓，不把被抓片段的真实top改到别轨。
// 外壳显示选中边框不会改变占位帧数，边框宽度不参加时间换算。
// transform属于每个安排的可选扩展，不是源素材或轨道头的公共状态。
// 保持可选可以兼容原样板，正式新建视频安排会在命令边界补完整默认值。
// 类型只描述数值，不携带DOM矩阵或播放器引用，避免数据层扣住媒体资源。
// 时间线展示仍按start/end布局，不把X/Y误用于片段的横向位置。
// 缩放视口改变每秒像素，与画面scale百分比是两种不同含义。
// 复制片段需要克隆嵌套transform，而移动安排只改变时间位置。
// 音轨类型不因为可选字段存在就开放构图，业务入口仍检查audioOnly。
// 不在时间线外壳内自动解释opacity，以免让片段卡片淡掉冒充画面效果。
// 工程数据传向预览时保留相同clip.id，画布选中才能定位到正确实例。
// 未来合成读取这些值，但当前类型扩展本身不证明多源已经同时渲染。
import { DEFAULT_TRACKS, displayTracks, isVideoTrack, type TrackId } from "./timeline-track-model";
import type { ClipKeyframes, ClipTransform } from "./clip-transform-model";
import { AudioLines, Eye, EyeOff, Link2, Lock, LockOpen, Magnet, Minus, Plus, Volume2, MonitorPlay, Music2, ScanLine } from "lucide-react";
// 翻译只解释展示名称，工程秒数和素材身份不受语言变化影响。
// DEMO_CLIPS 不含事件处理器，布局渲染不会触发切分或写盘。
// 时间轴按钮与项目栏共享 EditorAction，禁用原因和尺寸只维护一份。
// 原帧带与波形都读取sourceIn/span，候选与确认共用源时间尺。
// 工程时间码仍用项目fps，不按各源帧率生成不同标题单位。
// 获取波形只读摘要，片段选择、排列和播放继续归原会话管理。
import { TimelineEditTools } from "./timeline-edit-tools";
import { ClipWaveform } from "./clip-waveform";
import { formatEditorTimecode } from "./editor-timecode";
import { useTranslation } from "@/i18n";
import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { EditorTimeRuler } from "./editor-time-ruler";
import { useTimelineViewport } from "./use-timeline-viewport";
import { DEMO_ASSETS, DEMO_CLIPS, DEMO_PROJECT } from "./editor-demo";
import { EditorAction } from "./editor-chrome";
import { DemoWaveform, type EditorMediaAsset } from "./editor-panels";
import { VideoFilmstrip } from "./video-filmstrip";
import { EditorClipShell } from "./editor-clip-shell";
import styles from "./editor.module.css";
// 交互由真实会话注入，静态入口不创建手势状态或媒体读取。
// 两个入口继续共享轨道、片段壳和同一滚动坐标，不复制LIVE版时间线。
// 这里只消费意图接口，不引入真实素材导入Hook。
import type { TimelineInteraction } from "./use-live-timeline";
import { EditorPlaceholder } from "./editor-controls";

// R06 工具栏在时间轴滚动视口外固定，轨道内容滚动不会把加轨入口带走。
// 选择、切分、吸附与链接选择全部禁用，不能只画成可点击按钮。
// 吸附未接通时不显示 aria-pressed=true，避免暗示执行层已经启用吸附。
// “适合全部”属于工程时间轴，这里与预览“适应”分开显示。
// 缩放滑条保持固定样例值，disabled 明确说明没有实际视口缩放行为。
// 加减按钮复用同一 EditorAction，不复制图标 hover 和禁用主题色。
// 一组工具可在窄宽度内横向滚动，不缩小为难以命中的图标。
// 工具名称来自双语词条，不靠 title 代替所有可见文案。
// 后续 UI-06 只需注入动作和视口状态，宿主上下区无需重新装配。
// 本阶段不接 keyboard 全局快捷键，文字输入时不会误切分或播放。
// 编辑工具和缩放工具分组，宽度足够时缩放组自然靠右。
// 不实现虚假的 undo 栈，点击样例片段也不会产生项目修改记录。
function TimelineToolbar({ pixels, onZoom, editing, basicTools, settings }: { pixels: number | null; onZoom: (pixels: number | null) => void; editing?: TimelineInteraction["editing"]; basicTools?: import("react").ReactNode; settings?: import("react").ReactNode }) {
  // 工程视口的放大缩小入口不会复用生成页的分辨率缩放滑条。
  // 因为两个操作改变的对象不同，本轮只共享按钮外壳而不共享执行方法。
  // range 的 40 是滑条外观样例，不表示项目只能显示到 40% 或当前在 12 秒。
  // “适合全部”没有默认开启标记，避免让用户误判页面已算出真实素材范围。
  const { t } = useTranslation();
  return <header data-editor-region="R06" className={styles.timelineToolbar}>
    <EditorAction appearance="plain" icon={Plus} label={t("toolBox.editorUi.addTrack")} compact /><TimelineEditTools editing={editing} />{basicTools}<EditorAction appearance="plain" compact icon={Magnet} label={t("toolBox.editorUi.snap")} /><EditorAction appearance="plain" compact icon={Link2} label={t("toolBox.editorUi.linked")} />{settings}
    <div data-timeline-view-controls className={styles.timelineZoom}><EditorAction appearance="plain" icon={ScanLine} compact label={t("toolBox.editorUi.fitAll")} onClick={() => onZoom(null)} /><EditorAction appearance="plain" icon={Minus} label={t("toolBox.editorUi.zoomOut")} compact onClick={() => onZoom((pixels ?? 32) / 1.5)} /><input data-timeline-zoom type="range" min="8" max="256" value={pixels ?? 32} onChange={event => onZoom(Number(event.target.value))} aria-label={t("toolBox.editorUi.timelineZoom")} /><EditorAction appearance="plain" icon={Plus} label={t("toolBox.editorUi.zoomIn")} compact onClick={() => onZoom((pixels ?? 32) * 1.5)} /></div>
  </header>;
}

// R08 轨道头只根据明确轨道类型组合有效图标，不把音频“可见”当作静音。
// V1 展示可见与锁定，A1/A2 展示音量、独奏和锁定的未启用状态。
// 锁图标使用打开形状，对应默认未锁定，不复刻概念稿的错误锁状态。
// 轨道名在紧凑模式截断，track 编号始终保留便于定位。
// 同一个模板被三条轨道使用，不为配音与背景音乐复制头部 JSX。
// 所有状态动作暂时禁用，UI-01 不维护三套虚假 muted/solo/locked 状态。
// 独奏 S 是行业缩写，但 accessible label 使用完整翻译名称。
// V1不负责独立音频控制，有内嵌音轨的真实视频仍作为一个视频实例安排。
// 该头部与其内容行是同一个 grid 的相邻单元，纵向滚动天然同步。
// sticky 只固定横向位置，不另建纵向滚动容器或手动同步 scrollTop。
// 视频Eye接入当前实例的隐藏表，按下表示正在参与节目合成。
// 锁图标仍连接原锁表，隐藏和锁定是两份不同工程状态。
// A轨的静音与独奏尚未接混音，所以不能因为视频Eye可用就一起启用。
// 没有onVisibility的静态样板继续禁用该动作，不给假成功反馈。
// 所有视频轨共用TrackHeader，新增V2不会遗漏显隐或误用音量按钮。
// 显隐不删除片段，时间线仍能看到隐藏轨中的安排并重新显示。
// 按钮沿用EditorAction的pressed、焦点、主题和禁用说明。
// 轨道头顺序与内容行仍来自同一tracks，不按Eye状态重新排序。
function TrackHeader({ track, locked, onLock, hidden, onVisibility }: { track: TrackId; locked?: boolean; onLock?: () => void; hidden?: boolean; onVisibility?: () => void }) {
  // A1/A2 的 Volume2 表示当前没有静音，不使用 VolumeX 误画默认静音状态。
  // V1 的 Eye 对应可见状态，而不是音频的静音/独奏替代图标。
  // 当前名称从轨道编号得到确定值，不让未知轨道名回落成虚假的视频轨。
  // 后续增加轨道时应扩展明确模型，不能仅复制一份 V1 模板改显示字。
  const { t } = useTranslation();
  const video = isVideoTrack(track);
  const name = t(video ? "toolBox.editorUi.video" : track === "A1" ? "toolBox.editorUi.voice" : "toolBox.editorUi.music");
  // 轨道编号保留在可访问名称与悬停提示里，窄头部只展示同一排紧凑图标。
  // 锁和显隐仍走原工程回调；音量与独奏尚未接混音，不能仅换图标就开放。
  return <div data-editor-region="R08" data-editor-track-head={track} className={styles.trackHeader} aria-label={`${track} · ${name}`} title={`${track} · ${name}`}>
    {video ? <MonitorPlay size={14} aria-hidden="true" /> : <Music2 size={14} aria-hidden="true" />}
    <EditorAction appearance="plain" icon={locked ? Lock : LockOpen} label={t("toolBox.editorUi.lock")} pressed={onLock ? !!locked : undefined} compact onClick={onLock} />
    {video && <EditorAction appearance="plain" icon={hidden ? EyeOff : Eye} label={t("toolBox.editorUi.visibility")} pressed={onVisibility ? !hidden : undefined} onClick={onVisibility} compact />}
    <EditorAction appearance="plain" icon={Volume2} label={t("toolBox.editorUi.mute")} compact />
    <EditorAction appearance="plain" compact glyph="S" label={t("toolBox.editorUi.solo")} />
  </div>;
}

// R09 所有片段共享位置、选中外框和手柄，内部通过媒体类型换封面或波形。
// 百分比只取 start/end 与项目 duration，不使用素材列表中的源时长。
// 主视频 0–8 与 10–18 秒严格等宽，图片 20–30 秒则更宽。
// 片段主体由可选interaction接入选择和拖动，两端把手仍保持装饰。
// aria-current 表达局部演示选择；选中边框与两侧把手提供额外视觉线索。
// 播放头由外层统一绘制，不在每个片段中单独计算 12 秒的位置。
// 源素材查不到时不伪造视频名称，返回空内容交给后续缺失素材状态接管。
// 音频波形来自 DemoWaveform，只呈示意，不报告采样或 RMS 数据。
// name 一行截断，片段过短时不会挤出自己的工程时间宽度。
// 把手为 aria-hidden 的装饰，不产生未实现的可聚焦拖动入口。
// 素材图片复用背景图资源地址，不在每次渲染复制或重新解码文件字节。
// selected 的比较使用 clip id，素材相同的其他实例未来可独立选择。
// 音轨分离只改变实例的通道用途，不把源素材的kind全局改成audio。
// 可选字段保持静态样板和原视频/GIF调用契约兼容。
// audioDetached属于视频实例；同源其他安排仍可保留自己的声音。
export interface EditorTimelineClip { id: string; assetId: string; track: TrackId; speed?: number; sourceIn?: number; mirrored?: boolean; reversed?: boolean; freezeTime?: number; crop?: ClipCrop; transform?: ClipTransform; keyframes?: ClipKeyframes; start: number; end: number; audioOnly?: boolean; audioDetached?: boolean; }
// 裁剪四边用源画面比例，窗口尺寸变化不会让裁剪范围改变。
export interface ClipCrop { left: number; top: number; right: number; bottom: number; }

// 真实调用传interaction后，片段壳得到选择、拖动和方向键三个独立入口。
// 没有interaction的样板保留原静态选择，不会创建真实工程会话。
// 选择比较clip.id，不能用assetId使同源所有实例同时亮起。
// asset只提供文件名和封面，工程位置只读取clip.start/end。
// 传给壳的duration实际是统一视口范围，不是当前源的时长。
// 这样同长片段即使引用不同帧率素材也具有相同工程宽度。
// 视频缺图复用missing占位，不能错误显示音频波形暗示已抽取音轨。
// 普通视频仍只占V1；只有用户明确右键分离才建立独立A1/A2音轨安排。
// 片段按钮内只放展示节点，播放器按钮仍在预览区，避免嵌套交互冲突。
// 回调绑定明确clip.id，排序或横滚后不会拿数组下标移动错误实例。
// 时间线的横向长度仍来自end减start，连续帧带不参与片段尺寸计算。
// 有真实sourceUrl的视频才启动VideoFilmstrip，样板与缺失源保持原回退。
// sourceIn指向源文件读入点，速度把工程跨度换算成抽样源跨度。
// 仅传入span与sourceIn让平移尽量复用帧缓存，整段移动不意味着内容换了。
// span舍入只用于辅助展示的依赖稳定，不能覆盖工程中的帧精度数据。
// 音频片段不渲染视频帧带，即便它来自带画面的同一个原视频。
// 原素材的metadata保留源帧率，不能为了显示工程帧率而改写该数据。
// 片段实际速度来自记录，未设置时按1倍，旧创建入口不必先补默认字段。
// 是否选中仍按clip.id比较，不能用asset.id让同源所有片段同时描边。
// 修剪候选替代本次渲染的clip范围，但确认工程数组在松手前保持不变。
// 正式回调通过interaction注入；静态样板不能因共享壳增加真实编辑能力。
// 新展示没有第二个onDrop，素材入轨、同类跨轨和碰撞继续沿原一条流程。
// 缺图占位复用EditorPlaceholder，辅助帧带失败也不创建新的错误弹窗体系。
function TimelineClip({ clip, asset, project, pixelsPerSecond, selected = false, interaction }: { clip: EditorTimelineClip; asset: EditorMediaAsset; project: { duration: number; fps: number }; pixelsPerSecond: number; selected?: boolean; interaction?: TimelineInteraction }) {
  // 0 秒从内容列 left 开始，不能再加素材区或固定轨道头的像素宽度。
  // start=10/end=18 得到 left=33.333…%、width=26.666…%，保留小数精度。
  // bg_01 从 20 秒开始，直到 30 秒末尾，终点就是内容列的 100%。
  // voice 的 10–16 秒宽度为 20%，与视频 10–18 的 26.666…% 不相等。
  // 背景音乐 0–30 秒覆盖整条音频内容，不能为名称额外加一个最小片段宽度。
  // 描边采用 border-box，选中不会把工程范围往左右各扩 1px。
  // 封面 backgroundImage 使用静态打包 URL，不接收用户任意 CSS 字符串。
  // span 名称与波形是同一片段的组合内容，删除片段逻辑不会分散到两个组件。
  // 将来修剪需要明确的 commit/cancel 契约，本轮没有提前更改 DEMO_CLIPS 数值。
  // 正式V1通过interaction接入LIVE-02；没有该参数的样板仍保持原边界。
  const { t } = useTranslation();
  // 分离音轨只改变当前安排的展示通道，素材行仍是原来的视频类型。
  // 真实音频使用源包络，图标只用于原静态样板，不能用装饰线替代采样。
  // 静态音频素材继续使用原DemoWaveform，避免更改历史样板视觉。
  const kind = clip.audioOnly ? "audio" : asset.kind;
  const marks = [...new Set(Object.values(clip.keyframes ?? {}).flatMap(points => points?.map(point => point.frame) ?? []))].filter(frame => frame >= 0 && frame < Math.round((clip.end - clip.start) * project.fps));
  return <EditorClipShell trimming={interaction?.trimDraft?.id === clip.id} timecode={asset.sourcePath ? formatEditorTimecode(clip.end - clip.start, project.fps) : undefined} onPointerDown={event => interaction?.grab?.(event, clip.id)} onTrimStart={interaction?.trimStart ? (event, edge) => interaction.trimStart?.(event, clip.id, edge) : undefined} onTrimKey={interaction?.trimKey ? (event, edge) => interaction.trimKey?.(event, clip.id, edge) : undefined} locked={interaction?.lockedTracks?.includes(clip.track)} onContextMenu={interaction?.contextMenu ? event => interaction.contextMenu?.(event, clip.id) : undefined} onSelect={interaction ? event => interaction.click ? interaction.click(event, clip.id) : interaction.select(clip.id) : undefined} onDragStart={interaction && (!interaction.editing || interaction.editing.tool === "select") ? event => interaction.start(event, "clip", clip.id) : undefined} onDragEnd={interaction?.cancel} onKeyDown={interaction ? event => interaction.keyDown(event, clip.id) : undefined} id={clip.id} label={asset.name} start={clip.start} end={clip.end} duration={Math.max(30, project.duration)} kind={kind} selected={selected}>
    {asset.sourceUrl && !clip.audioOnly && asset.kind === "video" && <VideoFilmstrip asset={asset} sourceIn={clip.sourceIn} span={(clip.end - clip.start) * (clip.speed ?? 1)} speed={clip.speed ?? 1} pixelsPerSecond={pixelsPerSecond} reversed={clip.reversed} freezeTime={clip.freezeTime} />}
    {marks.map(frame => <i key={frame} data-clip-keyframe={frame} data-active={Math.round(((interaction?.currentTime ?? -1) - clip.start) * project.fps) === frame} className={styles.clipKeyframe} style={{ left: `${frame / project.fps / (clip.end - clip.start) * 100}%` }} />)}
    {/* 声音槽：仅真实探测素材接入，同源分离音轨与视频复用源峰值，不复制解码。 */}
    {/* sourceIn保持源秒数，跨度乘speed，左右修剪的草稿也走这两个参数。 */}
    {/* 无声源不请求采样；有声但失败与静音分别显示，不能补装饰起伏冒充音频。 */}
    {asset.sourcePath && asset.metadata && <ClipWaveform reversed={clip.reversed} sourcePath={asset.sourcePath} hasAudio={asset.metadata.hasAudio && clip.freezeTime === undefined} sourceIn={clip.sourceIn} span={(clip.end - clip.start) * (clip.speed ?? 1)} />}
    {clip.audioOnly ? <AudioLines size={20} aria-hidden="true" /> : asset.cover ? <span className={styles.clipCover} style={{ backgroundImage: `url("${typeof asset.cover === "string" ? asset.cover : asset.cover.src}")` }} /> : asset.kind === "audio" ? <DemoWaveform /> : <EditorPlaceholder state="missing" message={t("toolBox.editorUi.missing")} compact />}
  </EditorClipShell>;
}

// 轨道头和内容行共同装配，保证两列每行使用同一高度。
// 过滤只选择本轨的片段，不改变 DEMO_CLIPS 或原工程秒数。
// 轨道的 ID 就是业务编号，不以数组索引作为身份。
// R09 的实际起点由 grid 第二列决定，CSS 不能叠加导航偏移。
// 对空隙不添加占位片段，底色显露的宽度才是真实时间空隙。
// 样例轨道均解锁，禁用控件用于未接通状态，不表示轨道已经锁定。
// 分片组件使用 clipId 作为 key，未来重排不会串用选中节点。
// 这个组合没有私有 scrollTop，整个 timelineScroll 是唯一滚动所有者。
// 每一行复用同一TrackRow，轨道限制通过track参数交给共同手势拥有者。
// 音频行也接over，目的是显示不允许放置，而非宣称支持跨轨移动。
// 内部MIME由interaction识别，Files会继续交给外层导入宿主。
// 草稿放在真实片段之后绘制，固定状态栏同时保留文本反馈。
// 轮廓不加入clips数组，所以不会被属性区或总时长误当成新片段。
// 轮廓的left和width除以project.duration，此处传的是同一个range。
// 不同轨道复用坐标公式，不能给音频行另加一段轨道头偏移。
// 片段封面解码失败不改变DOM时间坐标，缺图仍占正确的工程宽度。
// 轨道头与内容行成对返回Fragment，不能把所有头和所有lane拆成两个独立纵向列表。
// 否则动态增加V2时行高、滚动和锁按钮可能错位，用户会锁错轨道。
// 同一个scroll节点拥有横纵滚动，sticky头只固定水平方向，不另设头部scrollTop。
// 候选行也包括同样轨道头，用户能在松手前看见将新增的轨道编号。
// 候选头显示锁按钮但还不是正式轨道，不应借此把候选写入轨道列表。
// TrackRow筛选按track完整编号，不能只按前缀把所有视频片段画到每条视频行。
// 同一素材多次入轨时key仍用clip.id，跨层不会因assetId相同复用错误选中状态。
// 选中判定使用interaction.selectedId，DEMO的clip-02默认只在未接正式交互时使用。
// 新增V2不表示每个视频都复制到V2，只移动或创建用户真正投放的那条实例。
// clip.audioOnly优先于asset.kind决定音轨外观，分离音频仍引用video源元数据。
// 分离音轨与原视频复用同源包络，不能拿DemoWaveform替代采样失败状态。
// 源cover缺失时共享placeholder仍占满同一片段壳，不改变其时间宽度。
// trimDraft只替换目标的start/end显示，正式assets元数据和sourceDuration不因此变短。
// 目标行通过data-editor-track-lane向共同手势提供身份，CSS类名不承载业务权限。
// locked数据属性供展示与证据，实际锁检查仍在共同命令，不能只让背景变灰。
// 目标错误类型也接收hover用于解释不能放置，而drop会再验证类型并拒绝。
// Files不会被timeline内部MIME处理，继续到外层导入，不能自动创建时间线实例。
// 草稿轮廓pointer-events none，避免它挡住下一次dragOver导致落点抖动。
// 轮廓不加入正常片段map，不提供右键菜单或选择，不能误被当成已提交剪辑。
// 轮廓文本显示解析后的合法start，最近空位策略不会缩短其length。
// 同轨碰撞只约束实际目标轨，V1与V2同一时刻覆盖是合法合成需求。
// 视口range至少三十秒是UI留白，不等于工程真实时长增加到三十秒。
// 项目信息条仍从真实clips最大end计算，候选和空轨不参与计时。
// 动态grid行的尺寸与CSS一致，轨道多时由timelineScroll承担纵向滚动。
// scrollbar-gutter stable保留纵滚槽，新增候选行不应改变横向每秒像素数。
// 父层播放头叠层跨所有行，时间位置只有一个，不为每条视频轨各画一个书签。
// 所有轨道头与内容行是同一grid的两列，纵滚时不需要监听器追赶位置。
// 轨道ID决定类型组，V类候选插在视频组末端，A类候选插在音频组末端。
// 候选轨在拖动中可见不等于已经写入工程，取消后不消耗五轨名额。
// 鼠标drop仍将实际目标track传给共同校验，不能只更新DOM所属父节点。
// 碰撞检查限定目标同轨，不把相邻视频层的覆盖当作时间重叠错误。
// 锁轨状态从工程锁表读取，轨道按钮与所有片段不能各自维护一份真假锁。
// 候选轮廓显示解析后的合法位置，默认贴邻居完整边缘，不缩短被拖片段。
// 不同媒体类型的无效落点继续说明原因，不能为显示绿色轮廓跨类型写入。
// 片段名称是展示文字，碰撞与移动始终使用稳定ID与工程区间。
// 真实声音槽读取源峰值，静态样板的DemoWaveform继续与真实素材隔离。
// 横向滚动只移动时间列，轨道头保持在自己的固定列中。
// 纵向候选行增加时预留滚动条空间，避免改变横向密度后丢掉抓取偏移。
// 长工程需要横滚时标尺和片段仍在同一滚动体，不各自同步一份scrollLeft。
function TrackRow({ track, clips, assets, project, pixelsPerSecond, interaction }: { track: TrackId; clips: readonly EditorTimelineClip[]; assets: readonly EditorMediaAsset[]; project: { duration: number; fps: number }; pixelsPerSecond: number; interaction?: TimelineInteraction }) {
  return <><TrackHeader track={track} hidden={interaction?.hiddenTracks?.includes(track)} onVisibility={interaction?.toggleVisibility ? () => interaction.toggleVisibility?.(track) : undefined} locked={interaction?.lockedTracks?.includes(track)} onLock={interaction?.toggleLock ? () => interaction.toggleLock?.(track) : undefined} /><div data-editor-region="R09" data-editor-track-lane={track} data-track-type={isVideoTrack(track) ? "video" : "audio"} data-locked={interaction?.lockedTracks?.includes(track) || undefined} onDragOver={event => interaction?.over(event, track)} onDragLeave={interaction?.leave} onDrop={event => interaction?.drop(event, track)} className={styles.trackLane}>{clips.filter((clip) => clip.track === track).map((clip) => { const asset = assets.find(item => item.id === clip.assetId); return asset ? <TimelineClip key={clip.id} clip={interaction?.trimDraft?.id === clip.id ? interaction.trimDraft : clip} asset={asset} project={project} pixelsPerSecond={pixelsPerSecond} selected={interaction ? (interaction.selectedIds ?? [interaction.selectedId]).includes(clip.id) : clip.id === "clip-02"} interaction={interaction} /> : null; })}
    {/* R09：轮廓只显示候选，不插入真正片段；失败原因随落点就近展示。 */}
    {/* 百分比与真实片段、标尺和播放头使用同一个视口范围。 */}
    {interaction?.draft?.track === track && <div data-timeline-draft data-valid={interaction.draft.valid} data-start={interaction.draft.start} className={styles.timelineDraft} style={{ left: `${interaction.draft.start / project.duration * 100}%`, width: `${interaction.draft.length / project.duration * 100}%` }}><span>{interaction.draft.start.toFixed(2)}s · {interaction.draft.reason}</span></div>}
  </div></>;
}

// R07–R09 共享一个内容列：刻度、播放头和片段没有独立左右 padding。
// 为完整 30 秒保留右端刻度，0 与 30 秒标签分别向内对齐避免被裁掉。
// 12 秒播放头位于内容宽度的 40%，不能从整个时间轴含轨道头的宽度计算。
// 播放头叠层 pointer-events:none，后续片段点击不会被竖线拦截。
// 轨道头和刻度分别 sticky，在同一个横纵滚动区内维持共同坐标。
// 内容最小宽度由 CSS 控制，窄容器滚动查看，不把 30 秒片段压到难以辨识。
// 正式行由会话注入片段和视口范围，静态样板继续使用默认DEMO数据。
// 表达工程时间的数值不作为用户可编辑输入，不需要本轮新增全局 store。
// 工具栏固定在滚动视口外，轨道再多也不会带走缩放与适合全部入口。
// section 名称用于读屏和自动化定位，不依赖当前语言的显示文本。
// 标尺的背景细分刻度只是装饰，主刻度标签由明确秒数生成。
// ruler 与 lanes 的 100% 都指同一 grid 列宽，这是布局的关键不变量。
// 真实总长和可编辑视口分开：总长给信息条，range给刻度与所有横坐标。
// 统一range同时决定主刻度、细分背景、片段和播放头，不能只更新标签。
// 固定密度默认32px/s，可在8至256之间调整；适合全部使用真实内容宽。
// minWidth保持至少填满当前时间线容器，宽窗口不会右侧留下未铺满区域。
// 实际lane宽度可能大于32px每秒，手势从真实矩形读取比例以保持准确。
// 轨道头在同一个grid内sticky，内容移动时无需脚本追赶另一条滚动轴。
// 冻结手势期间range不因候选越过末端而改变，鼠标不会追着缩放的尺子跑。
// 松手提交后才重新算工程边界，下一次手势读取新的实际比例。
// 主刻度step随长视口增加，避免大量文字标签拥挤重叠。
// 细分背景用同一个CSS变量，所以35秒视口仍是一秒一格而非30格均分。
// 空工程不画播放头，不能把演示的12秒混入真实空会话。
// currentTime是宿主书签，工程单源播放按真实媒体事件推进；素材试听不推进。
// 轨道由interaction.tracks提供，未接正式交互的样板继续使用默认三条。
// 候选行也经过displayTracks分组，不在音轨下面临时插一个视频层。
// 相同TrackRow同时渲染原轨与候选，不复制轨道头和片段列表结构。
// 新轨候选没有clips，因此不会增加工程时长或显示一段假视频。
// 所有轨道共享project.duration作为显示range，横滚后标尺、片段与落点仍同一坐标。
// 修剪draft只替换同clip.id的显示记录，未松手的候选不流入项目统计。
// TrackHeader用isVideoTrack判断图标，V2等新增视频不能误显示成音频独奏工具。
// 原轨道锁按钮接同一个toggleLock，新增轨道也不会因为名字不是V1而缺保护。
// 设置使用slot注入，展示组件不自行保存名额或读取用户JSON。
// 滚动容器保持唯一，动态增加行交给grid-auto-rows，不增加每轨自己的scrollTop。
// grid首行仍给标尺36像素，其后每轨68像素，头和内容在同一网格行里。
// 原min-height填满剩余空间，但不能再把三个固定轨道高度写进模板。
// 主播放头继续从工程秒数换算，不按轨道数量或选择位置重新定位。
// 剪辑修剪只改变某条区间，viewport zoom仍不改工程时间。
export function EditorTimeline({ clips = DEMO_CLIPS, assets = DEMO_ASSETS, project = DEMO_PROJECT, currentTime = DEMO_PROJECT.currentTime, interaction }: { clips?: readonly EditorTimelineClip[]; assets?: readonly EditorMediaAsset[]; project?: { width: number; height: number; fps: number; duration: number }; currentTime?: number; interaction?: TimelineInteraction }) {
  // ownScroll给静态工程提供同样的视口机制，正式工程则复用手势拥有者的scrollRef。
  // 两者都只把ref接到下面同一个滚动体，不能让缩放和拖动测量不同容器。
  // viewport只管理显示密度，不复制clips或构造另一个时间线store。
  // layoutEffect在新网格提交后恢复左端秒数锚点，不在render同步写scrollLeft。
  // Toolbar接effectivePixels，在适合全部模式也能反映真实视口密度。
  // range在拖动期间由原LIVE手势冻结，候选越过右端不会不断撑长尺子。
  // 正常固定缩放宽度是轨道头加range乘密度，再由minWidth保证填满视口。
  // fit宽度直接百分之百，不靠缩短片段起止消除滚动条。
  // grid第二列为minmax(0,1fr)，长文件名不能凭最小内容宽反向撑大整条时间轴。
  // 三条轨道由同一TrackRow映射，锁定和落点状态通过track参数注入。
  // 轨道头sticky只固定横向位置，和lane仍在同一行里纵向滚动。
  // 因此无需监听两个scrollTop互相同步，避免事件延迟造成上下错位。
  // EditorTimeRuler与所有TrackRow共用range，不能仅修改主刻度标签密度。
  // Playhead也除以相同range，1000px宽的尺子与片段不会采用不同时间分母。
  // 真正可交互的是标尺滑块，贯穿线只是定位显示，不覆盖片段按钮。
  // 空工程没有实际duration，不画一根来自DEMO的十二秒蓝线。
  // 选中描边只在border-box内部增加视觉，不能额外挤宽工程占位。
  // 草稿轮廓不进入clips，所以不会把临时位置统计成正式总时长。
  // 锁定时片段事件与提交门槛都阻止编辑，不能仅靠一层灰色背景。
  // 静态波形仍来自DemoWaveform，仅存在明确的演示数据路径。
  // 正式分离音轨通过ClipWaveform展示真实源包络，采样状态独立于节目播放状态。
  // 可见/静音/独奏按钮尚未接轨道效果，没有回调仍由公共按钮原生禁用。
  // 已有复制、删除、分离音频继续走LIVE菜单，不在工具栏另写一套工程命令。
  // 这里没有启用修剪把手或切刀，选中状态可见不等于具备剪辑业务。
  // 时间轴缩放不影响上区面板布局，容器响应式由workspace独立管理。
  // toolbar固定在滚动体之外，横滚或纵滚都不会带走适合全部入口。
  // tabIndex 只赋给滚动视口，装饰刻度和播放头不会逐个进入 Tab 顺序。
  // 轨道头 sticky 的左边界属于本滚动视口，不是窗口最左侧。
  // 同一列中的 R07/R09 横向滚动完全一致，未来无需用 scroll 事件追赶另一层。
  // 标尺的 30 秒标签向内排版，但定位仍为 end=30，避免末尾多出空白时长。
  // UI-01 只有三条轨道，纵滚机制以容器为边界，未来增加行不会压缩每行高度。
  // 项目信息条在本组件外，不会随着轨道滚动离开可见底部。
  const { t } = useTranslation();
  const range = interaction?.range ?? Math.max(30, project.duration);
  const ownScroll = useRef<HTMLDivElement>(null), scrollRef = interaction?.scrollRef ?? ownScroll;
  const viewport = useTimelineViewport(scrollRef, range, interaction?.cancel);
  useLayoutEffect(() => { viewport.restore(); });
  return <section data-editor-timeline data-timeline-tool={interaction?.editing?.tool} className={styles.timeline} aria-label={t("toolBox.editorUi.timeline")}><TimelineToolbar pixels={viewport.effectivePixels} onZoom={viewport.zoom} editing={interaction?.editing} basicTools={interaction?.basicTools} settings={interaction?.settings} />{interaction && <p data-timeline-notice role="status" className={styles.timelineNotice}>{interaction.draft ? `${interaction.draft.start.toFixed(2)}s · ${interaction.draft.reason}` : interaction.notice || t("toolBox.editorUi.timelineHint")}</p>}<div ref={scrollRef} data-editor-timeline-scroll className={styles.timelineScroll} tabIndex={0} aria-label={t("toolBox.editorUi.timeline")}><div className={styles.timelineGrid} style={{ "--timeline-range": range, minWidth: "100%", width: viewport.pixels === null ? "100%" : `calc(var(--track-header) + ${range * viewport.pixels}px)`, gridTemplateColumns: "var(--track-header) minmax(0, 1fr)" } as CSSProperties}>
    <div className={styles.rulerCorner} /><EditorTimeRuler range={range} duration={project.duration} fps={project.fps} currentTime={currentTime} onSeek={interaction?.seek} />
    {displayTracks(interaction?.tracks ?? DEFAULT_TRACKS, interaction?.draggingKind, interaction?.limits).map((track) => <TrackRow key={track} track={track} clips={clips} assets={assets} project={{ duration: range, fps: project.fps }} pixelsPerSecond={viewport.effectivePixels} interaction={interaction} />)}
    {project.duration > 0 && <div data-editor-playhead data-time={currentTime} data-interactive={!!interaction?.seek} className={styles.playheadColumn}><i style={{ left: `${currentTime / range * 100}%` }} /></div>}
  </div></div></section>;
}
// 共用边界包括片段外壳和时间线，真实数据由正式会话通过参数注入。
// TimelineClip 把图片或波形作为 children 注入，不能重画另一套选中边框。
// 音频和视觉片段的 start/end 都使用同一总时长，样式提取不改坐标算法。
// 样板未传interaction时对应固定clip-02，正式时间线按实例ID驱动属性与预览。
// 不允许只把选中边框移走却保留右侧旧属性，这会给用户错误的编辑目标。
// 正式选择覆盖V1和分离音轨；多选属性组合由独立样板验证，未接时间线多选。
// 刻度与片段共同放在 timelineGrid，外壳替换不增加第二个横向滚动体。
// 样板的音频封面仍用示意图；正式音轨使用源峰值，不把两种来源混在一起。
// 原生button按回调决定可用性，实际修剪始终未接通，悬停不会改变源入点。
// 锁定由正式会话注入，静态样板未传回调时保持原禁用边界。
// trimStart/trimEnd 继续是装饰，不提供 draggable 或 pointer handler。
// 后续真实修剪应通过命令与撤销边界，不在公共 CSS 中修改时长。
