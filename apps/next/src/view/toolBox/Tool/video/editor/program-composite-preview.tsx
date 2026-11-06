"use client";

// 节目容器、片段坐标和属性草稿继续复用原实现；这里只装配真实画面栈。
// 像透明胶片从下往上叠放：内容与操作分两摞，选框永远不会改变胶片顺序。
// 节目静音是明确业务边界，用户要试听原声音时仍切换到独立素材查看。
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pause, Play, VolumeX } from "lucide-react";
import { useTranslation } from "@/i18n";
import { ClipCanvas, type CanvasEdit } from "./clip-canvas";
import { EditorAction, EditorPlaceholder } from "./editor-controls";
import { ProgramPreview, type EditorMediaAsset, type EditorPreviewClip, type EditorPreviewProject } from "./editor-panels";
import { PreviewRateControl, type LivePreviewTransport } from "./live-source-preview";
import { activeProgramLayers } from "./program-clock";
import { useProgramPlayback } from "./use-program-playback";
// 可见性仅决定临时媒体是否挂载，不删除工程片段或改变图层顺序。
import { useProgramVisibility } from "./use-program-visibility";
import styles from "./editor.module.css";

// 每层只包含展示需要的素材、片段和画布意图；工程修改仍交回原timeline。
// clip.id决定实例身份，asset.id决定源文件身份，二者不能互换。
// asset元数据为基础contain适配提供源尺寸，不用缩略图尺寸猜真实视频画幅。
// edit.value来自原属性适配器，手势候选与属性字段读取同一份草稿。
// edit.selected只控制操作提示，不控制画面栈顺序。
// edit.locked只禁止写入，不能当成opacity零或隐藏处理。
// edit.preview只改候选，edit.commit才向共同变换方法提交确认。
// 合成器不自己定义第二套X/Y、单位或范围规则。
// 素材原件查看没有ProgramLayer，所以不会套用工程构图。
// 数据投影不保存另一个clips数组，也不会写到用户JSON。
export interface ProgramLayer { asset: EditorMediaAsset; clip: EditorPreviewClip; edit: CanvasEdit; }
// layers输入按时间线上方优先排列，真实tracks数组是唯一层级来源。
// 组件不根据挂载时间或最近点击推断层级，新增下轨也不会自动浮到上面。
// project提供唯一画幅和帧率，所有层都在同一个项目像素坐标中渲染。
// transport提供唯一播放头，标题、画面和走带条都读取同一工程时间。
// headerActions沿用工作区紧凑面板入口，与媒体选择生命周期分开。
// 传入隐藏过滤后的全部安排，使时钟能看到未来入场点。
// 全部安排不代表全部媒体常驻，实际节点只为活动区间挂载。
// 没有输出格式、码率或保存回调，避免把预览适配膨胀为导出框架。
// 多个实例各自调用useProgramPlayback，没有模块级媒体表共享状态。
// 外层路由仍由AppShell管理，本组件不重复导航或窗口控制。
interface CompositeProps {
  layers: readonly ProgramLayer[];
  project: EditorPreviewProject;
  transport: LivePreviewTransport;
  headerActions?: ReactNode;
}
// primary仅保留既有测试与观察标记，不赋予该video主时钟权限。
// 上层退出后primary可换到下层，但工程时钟不随之重建。
// register是源生命周期注入点，与ClipCanvas的空间绘制职责分开。
// 所有video都无原生controls，用户不能单独拖某一台源造成各层不同步。
// 源URL更改或clip实例更改才装源，属性旋转等样式变化不触发重读。
// 同一asset的多个clip分别登记，不把currentTime存在素材对象上。
// 节点默认muted，未等待effect也不会有一瞬间误放源音轨。
// preload只提示浏览器加载，实际读取仍走现有localfile协议。
// 媒体元素没有进入可持久化工程数据，也不会通过preload跨进程传递。
interface MediaProps {
  layer: ProgramLayer;
  project: EditorPreviewProject;
  register: (id: string, video: HTMLVideoElement, source: string) => () => void;
  primary: boolean;
}

// 节点key来自clip.id，同源多实例拥有各自解码器；构图变化不重新加载src。
// register回调每次装配可能更新，ref只更新最新方法，源生命周期只看id与URL。
// 清理复用attachSource的卸载流程，不留下后台播放、监听或localfile读取。
// picture平面只画真实内容，操作按钮放到另外一摞，不随媒体opacity变淡。
// ClipCanvas依旧计算contain、项目中心、旋转和镜像，合成器不复制坐标公式。
// edit传入picture层只为读取候选值，不在此创建第二个可拖拽目标。
// 每层canvasCrop只裁项目画面，透明区域不会刷一层不透明背景。
// video真实帧在canvasContent中，旋转和位移不能只作用于封面或选框。
// 首帧加载失败由节目整体错误槽表达，不用封面替代失败视频冒充成功。
// ref只指向自己的节点，register回调更新不使媒体每帧卸载重装。
// effect按clip.id与URL管理源，React严格模式的配对清理不会遗漏资源。
// 节点key包含attempt，用户重试才明确建立新生命周期。
// 旧节点卸载时源安装器停止播放、移除事件并释放src。
// 释放不依赖下一源成功，因此坏源切换也不会留下上一段音轨。
// 标题所需名称只是aria-label，不拿它当实例身份或重复判断。
// 主层和下层使用完全同样的安装器，没有一套主播放器和另一套低层伪同步。
// data标记用于自动观测，不授予测试或DOM排序修改工程的能力。
// 本轮视频由浏览器原生解码，不把整段视频绘成Base64或隐藏封面。
// 节目静音不删除源音轨数据，用户在素材查看仍能试听原件。
// 当前方案每个活动层各有一个解码器，默认轨道上限五条限制常见资源规模。
// 提高轨道上限也会增加解码与纹理成本，设置不是无限性能保证。
function CompositeMedia({ layer, project, register, primary }: MediaProps) {
  const ref = useRef<HTMLVideoElement>(null), latest = useRef(register);
  useEffect(() => { latest.current = register; });
  useEffect(() => {
    const video = ref.current;
    if (video) return latest.current(layer.clip.id, video, layer.asset.sourceUrl ?? "");
  }, [layer.clip.id, layer.asset.sourceUrl]);
  return <ClipCanvas clip={layer.clip} asset={layer.asset} project={project} edit={layer.edit} plane="picture">
    {/* 节目内容：真实视频静音播放，不混入封面、选框或音轨占位。 */}
    <video ref={ref} muted playsInline preload="auto" data-program-video={layer.clip.id} data-live-video={primary ? "" : undefined} data-composite-video={!primary ? layer.clip.id : undefined} className={styles.liveVideo} aria-label={layer.asset.name} />
  </ClipCanvas>;
}

// active按上轨优先输入；只反转临时绘制数组，绝不改变tracks或clips。
// 选择下层仍从同一个edit读取草稿，但不对其内容提高z-index。
// 播放头进入空隙时仍挂载走带控制，画面为空黑场，不退回选中片段。
// 任一当前源未就绪时隐藏整摞内容，不能把旧层帧当成当前合成成功。
// active按当前工程书签取半开区间，不使用selectedClip兜底。
// 空列表仍创建节目surface，使工程空隙能保持控制条和黑底。
// 底层先绘制，上层后绘制；反转的是新数组而不是正式轨道数据。
// 画面内容没有根据selected设置z-index，选择被遮挡片段不能改最终颜色。
// 操作平面也保持轨道层序，因此鼠标优先命中最上方的可编辑矩形。
// 锁定层按钮放行指针，下层仍可在命中范围内被选择。
// 完全透明层不阻挡鼠标，恢复其属性可通过时间线明确选择完成。
// 旋转后的矩形命中由同一个CSS变换实现，不另写近似包围盒算法。
// 真实源含透明像素时，显示按像素透明合成，命中目前按变换矩形而非逐像素alpha。
// 这一命中边界应在将来支持透明视频编码时单独验收，不能外推为alpha拾取。
// 被遮挡片段仍能从时间线选择，操作层不取消这条明确访问路径。
// 选框与内容分开，可以越过项目边缘提示被移出画面的对象。
// 视频内容仍由项目边界裁切，画面外的源部分不会溢入工具栏。
// 截图包含的操作提示不是合成像素，未来导出不能采集该DOM操作层。
// phase不是ready时整摞内容不可见，防止下层已ready但上层旧帧残留。
// 节点仍保持挂载来完成解码，遮住旧帧不等于取消这次读取。
// loading槽描述等待真实帧，error槽描述无法完成，二者不合并为同一提示。
// 错误提供显式重试，不能在后台无限刷新文件。
// 错误不会修改素材元数据或自动删除引用，用户仍能查看问题文件来源。
// 走带条time使用工程秒数，不能取上层视频的源秒数显示。
// 总duration使用工程末尾，存在黑场也不会缩成当前视频长度。
// 逐帧回调走原transport.onSeek，统一版本与最新请求优先规则。
// 在黑场也允许逐帧定位，不能因没有活动video就禁用工程书签。
// 工程无时长时不授权播放，防止空工程时钟无限运行。
// 播放按钮在等待且有既有意图时仍允许暂停，避免不可取消的加载播放。
// 节目声音按钮明确禁用并解释尚未混音，不提供误导的多源解除静音。
// 静音说明放标题栏，避免把播放按钮挤成窄条而无法命中。
// 窄窗标题沿用省略机制，紧凑面板入口仍由headerActions注入。
// 观看倍率复用PreviewRateControl，选择预设与手动输入写同一rate。
// rate只存在当前节目会话，切去素材再回来不会继承旧意图自动播放。
// PreviewRateControl的校验与单位来自公共数字字段，不复制数值草稿实现。
// 本轮不修改原片段速度入口，已有速度按共同源映射继续生效。
// 没有淡入淡出、转场或关键帧插值，透明度是片段自身的固定确认值。
// 没有媒体时的黑色来自节目底板，不能插入一张演示黑图伪装无内容。
// 节目标题显示当前最上层源名，只是说明，不作为层级或选中目标。
// 属性目标继续归外层timeline.selectedClip，播放经过其他片段不会串字段。
// 源查看切换会卸载整个节目控制器，媒体表与时钟一起释放。
// 返回节目重建解码器并定位当前书签，起始播放意图为暂停。
// 同源复制保留各自变换值，图层edit按clip.id找到确认对象。
// 删除某层后其key卸载，其余层的媒体身份不因列表重排而变化。
// 当前不搭建GPU离屏合成或编码管线，浏览器图层合成只服务即时预览。
// 未来导出可共享源时间与空间规则，但编码结果一致性尚未验证。
// 性能重负载可能使统一时钟等待或保守推进，不能保证任意多路高分辨率实时播放。
// 错误遮罩不会输出用户磁盘路径或解码堆栈。
// 浅深主题只影响操作UI，黑场与视频颜色不因主题改成浅色底。
// 窗口尺寸改变只影响项目百分比投影，不回写工程X/Y。
// 操作元素无真实媒体src，不会因每层多一个ClipCanvas而多占一台解码器。
// 素材与节目互斥挂载还确保不会同时创建两套有声播放器。
// 画面层和操作层各有多个定位壳，但只有内容壳内部有视频节点。
// 因此统计DOM壳数量不能拿来推断解码器数量，回归以video节点作证。
// 操作按钮没有背景填色，选框的细线不会盖住整块下层内容。
// 不透明度通过内容style作用于真实帧，上层容器本身保持透明以露出底层。
// 背景黑只在项目frame定义一次，不在每层canvasCrop上重新刷黑。
// 层序是源帧呈现契约，操作层DOM不能作为未来导出采样内容。
// 现有canvasStyle同时服务单图样板和节目视频，基础适配定义保持一致。
// 等比缩放并不改变源像素数量，只改变源在项目画幅中的几何位置。
// 镜像继续作用在画面内容内部，操作矩形本身仍使用未镜像的相同外框。
// 选框旋转与画面旋转相同，指针抓取偏移仍按项目坐标换算。
// 拖动中的草稿只影响该片段的edit.value，其他层读取自己的确认值。
// 松手后原timeline.transform复核锁与范围，不因进入合成模式跳过校验。
// 被上层遮挡的下层可以在时间线选中后输入X/Y，不需要临时置顶编辑。
// 恢复隐藏轨会重新装源并定位当前书签，不从源开头不受控自动播放。
// 锁定轨无论是否选中都继续解码，所以画面不会因无法编辑而停住。
// 素材列表搜索只过滤资源展示，不能从layers中删除已在工程引用的素材。
// 只有显式轨道隐藏才排除合成，不能根据素材面板是否看得到该卡决定画面。
// 当前活动片段缺少asset时显示错误，这是工程引用问题，不应显示最近素材代替。
// 节目标题与素材查看标题由共享ProgramPreview区别，模式切换语义保持可辨认。
// 静音说明属于界面状态，不绘制进视频画面，也不作为未来导出水印。
// 源预览中的声音授权只作用于该源节点，不存成所有视频默认可发声。
// 程序不尝试将多个video的源音量相加，因为没有混音路由就无法保证声音规则。
// 画面透明度不影响源音量，本轮静音不允许用opacity低来代替音频静音。
// 切源后旧play成功回执会自查并停下，不能因Promise稍晚完成而后台续播。
// 未来加入真实图片时应提供独立图片加载分支，不能把静态样例当成视频解码测试。
// 本轮层类型明确为视频，图片导入与图片实机异常仍在独立待办。
// 现有音轨分离只是工程引用，节目仍显示原视频的画面，不改源文件容器。
// 默认节目黑场可以处在工程内部，不能将它与错误遮罩等同处理。
// 错误遮罩有文字和重试，正常黑场没有故障提示，二者让用户能辨认。
// 减少动态效果不会改变视频内容本身，但公共UI动画继续沿用项目主题约定。
export function ProgramCompositePreview({ layers, project, transport, headerActions }: CompositeProps) {
  const { t } = useTranslation(), [rate, setRate] = useState(1);
  // 页面隐藏时暂停并卸载全部节目源，恢复后按原书签加载且保持暂停。
  const visible = useProgramVisibility();
  const playback = useProgramPlayback({ layers, transport, duration: project.duration, fps: project.fps, rate });
  const active = activeProgramLayers(layers, transport.time), bottomFirst = visible ? [...active].reverse() : [];
  const phase = playback.phase;
  const unavailable = project.duration <= 0 ? t("toolBox.editorUi.previewUnavailable") : phase === "error" ? t("toolBox.editorUi.decodeFailed") : phase === "loading" ? t("toolBox.editorUi.previewLoading") : undefined;
  const live = {
    asset: active[0]?.asset, time: transport.time, duration: project.duration, state: phase,
    step: project.duration > 0 ? (direction: -1 | 1) => transport.onSeek(transport.time + direction / project.fps) : undefined,
    rateControl: <PreviewRateControl rate={rate} onChange={setRate} />,
    surface: <div data-program-composite data-program-time={transport.time} data-program-phase={phase} data-program-order={active.map(layer => layer.clip.id).join(",")}>
      {/* 内容栈：所有图层共用项目边界裁切，未就绪时用黑底遮住过期帧。 */}
      <div className={styles.compositePlane} style={{ visibility: phase === "ready" ? "visible" : "hidden" }} data-program-pictures>{bottomFirst.map(layer => <CompositeMedia key={`${layer.clip.id}:${playback.attempt}`} layer={layer} project={project} register={playback.register} primary={layer === active[0]} />)}</div>
      {/* 操作栈：固定轨道顺序命中；锁层放行给下层，时间线仍可明确选择遮挡对象。 */}
      {phase === "ready" && <div className={styles.compositePlane} data-program-operations>{bottomFirst.map(layer => <ClipCanvas key={layer.clip.id} plane="operations" clip={layer.clip} asset={layer.asset} project={project} edit={layer.edit} />)}</div>}
      {phase !== "ready" && <div className={styles.playerOverlay}><EditorPlaceholder state={phase} message={t(phase === "error" ? "toolBox.editorUi.decodeFailed" : "toolBox.editorUi.previewLoading")} />{phase === "error" && <EditorAction label={t("toolBox.editorUi.retryPreview")} onClick={playback.retry} />}</div>}
    </div>,
    controls: <><EditorAction icon={playback.playing ? Pause : Play} label={t(playback.playing ? "toolBox.editorUi.pause" : "toolBox.editorUi.play")} compact disabledReason={playback.playing ? undefined : unavailable} onClick={playback.toggle} /><EditorAction icon={VolumeX} label={t("toolBox.editorUi.programMuted")} compact disabledReason={t("toolBox.editorUi.programMuted")} /></>,
  };
  return <ProgramPreview clip={active[0]?.clip ?? null} assets={[]} project={project} currentTime={transport.time} mode="program" live={live} headerActions={<><small className={styles.programMuted}>{t("toolBox.editorUi.programMuted")}</small>{headerActions}</>} />;
}
