"use client";

// 时间线声音槽复用源包络，按片段源入点/跨度映射，不生成装饰随机波形。
// SVG只有实际读取后的振幅轮廓，取消、加载和失败不会冒充静音成功。
import { useTranslation } from "@/i18n";
import { memo, useMemo } from "react";
import type { VideoWaveformResult } from "@/types/electron-api";
import { useSourceWaveform } from "./source-waveform";
import styles from "./editor.module.css";

// 声音条属于片段内容，鼠标在它上面按住时仍应拖整个片段而非选中SVG文字。
// 组件没有button、tabIndex或自建菜单，不增加与原片段壳冲突的交互入口。
// 图片片段没有声音来源，不因共享片段壳就请求一条假的波形。
// 分离音轨引用原视频路径，既可共享采样结果，也保留原文件不变的语义。
// 视频已分离声音时这里仍展示源声音摘要，不表示该视频实例仍会播放音轨。
// 真正静音由播放器的audioDetached规则控制，波形颜色不参与声音路由。
// 一条源可以有很多片段，各自的入点与源跨度在调用方明确传入。
// 文件名、时间码和选择边框继续由EditorClipShell提供，声音组件不复制标题层。
// sourceIn默认零用于未修剪实例，已经修剪的副本必须显式带自己的入点。
// span包含速度映射但不包含项目时间线空隙，空白轨道不会凭空显示声音。
// 同源两段即使工程位置相隔很远，源区间相同就应具有相同轮廓。
// 只改变不透明度、旋转或X/Y不会重算声音，因为这些是画面变换。
// 只改变文件名显示文本也不触发读取，声音身份来自sourcePath。
// 两个路径字符串即使指向硬链接同内容，当前也按不同源处理，不计算文件哈希。
// 这是避免读取大文件指纹的取舍，不宣称全磁盘内容级去重。
// hasAudio变false时hook会释放该订阅，不能保留上一源的ready图形。
// 辅助图失败不能阻断主体拖动，否则缺少FFmpeg会令有效视频不能排列。
// 数组只读用途由当前调用契约维护，没有用冻结拷贝制造每片段一份全源峰值。

// 画布采用1000单位宽的局部坐标，与工程帧或像素无关，外壳负责时间轴宽度。
// sourceIn是源秒数，span已经乘片段速度，不能把工程start当成声音数组下标。
// 采用窗的真实secondsPerPeak，尾部AAC填充不会把之前的声音整体挤压。
// 起止都截到源包络有效范围，不能从不存在的峰值补出装饰图形。
// 每个点的位置由源时间相对入点决定，裁掉头部后声音特征相应左移。
// 用一条封闭路径画上下包络，不为每个峰值创建一个DOM节点。
// 振幅开方只压缩视觉动态范围，让轻声可见，不写回音量或播放效果。
// 全静音峰值仍是零高度直线，不给静音随机添加起伏。
// 中心线高度是16，上下最大14，给细边框保留两像素空隙。
// 端点延到片段边缘，最后不足一采样窗不产生肉眼可见空洞。
// 负入点、非法跨度或空数组不绘图，工程写入校验仍由原共同模型负责。
// 返回路径仅用于展示；不能用波形高度推断音高、音色或语音识别结果。
// 同源实例即使共享result，也只创建各自路径字符串，不修改peaks数组。
// 1000单位横向缩放不会重新采样源音频，Ctrl滚轮只影响轮廓的屏幕密度。
// 窗口覆盖的平均时间分辨率受2048窗预算约束，不声称逐音频样本可见。
export function waveformPath(data: VideoWaveformResult, sourceIn: number, span: number) {
  if (!data.peaks.length || !Number.isFinite(span) || span <= 0 || sourceIn < 0) return "";
  const first = Math.max(0, Math.floor(sourceIn / data.secondsPerPeak));
  const last = Math.min(data.peaks.length - 1, Math.floor((sourceIn + span) / data.secondsPerPeak));
  const upper: string[] = [], lower: string[] = [];
  for (let index = first; index <= last; index += 1) {
    const x = Math.max(0, Math.min(1000, (index * data.secondsPerPeak - sourceIn) / span * 1000));
    const height = Math.sqrt(data.peaks[index]) * 14;
    upper.push(`${x.toFixed(2)},${(16 - height).toFixed(2)}`);
    // 先顺序收集，结束后一次反转，避免每个点都搬动已有数组。
    // 反转的是本次局部字符串数组，不会修改同源片段共享的 peaks。
    // 输出顺序仍与原来的逐点 unshift 完全相同，SVG 闭合方向不变。
    lower.push(`${x.toFixed(2)},${(16 + height).toFixed(2)}`);
  }
  return upper.length ? `M0,16 L${upper.join(" L")} L1000,16 L${lower.reverse().join(" L")} Z` : "";
}

// 例如0.5秒入点、1秒源跨度，数组0.5秒附近的峰值应出现在条带左端。
// 若片段2倍速，1秒工程跨度覆盖2秒源声音，父级把span乘速度后再传入。
// 工程start只决定片段摆在哪一秒，不能拿它去裁源数组，否则移动会改变声音图形。
// 横坐标0到1000像一把伸缩直尺，同一时间占比可以投影到任意屏幕片段宽度。
// 上边界按时间正序收集，下边界逆序收集，闭合后形成一条连续包络。
// 如果下边界也按正序连接，会画出交叉多边形，声音高低看起来会错乱。
// 起点与终点夹在0/1000内，部分采样窗覆盖边缘时也不会越出片段。
// floor选择入点所在采样窗，允许这一窗跨过入点，这是概览采样精度的边界。
// 每窗只保留最高振幅，窗内具体哪一毫秒发生声音已经不可从摘要反推。
// 因此此图适合辨认大致静音和节奏，不能替代逐样本音频编辑。
// 如果入点超出包络末端，循环没有有效窗口，返回空路径而非制造全幅声音。
// 开方使0.01振幅可显示为最大高度的十分之一，便于在16px槽里看到轻声。
// 这个视觉比例不是分贝刻度，界面不提供基于它的响度读数。
// toFixed只缩短SVG坐标文本，原数据与片段时间没有被四舍五入写回。
// 每次绘图建立局部字符串数组，不反转或修改多个片段共享的peaks。
// 显示上半包络并以16为底线，真实峰值向上生长；下半轮廓由视窗裁掉。
// SVG使用一条轮廓路径，4096个点不会变成4096个独立React子组件。
// 最多保留源摘要预算内的点，缩放时间线不会触发无限增长的采样数组。
// 单个窗口内有多个音节时只见最高峰，不能据此推算精确音节数。
// SVG横向拉伸只影响显示密度，返回的源秒坐标仍可与帧带逐项比对。
// 视频边框采用border-box，1000单位局部坐标不需要再扣导航或轨道头宽。
// 原始峰值没有颜色或主题字段，同一组结果可在浅深两种主题下复用。
// 减少动态效果不改变波形形状，本实现没有根据音量添加闪动动画。
// 路径生成是同步小数组转换，不再等待音频播放到相应位置才填图。
// 因而暂停节目也能查看整段轮廓，辅助展示不会驱动播放进度。
// 当前只有整体振幅包络，左右声道的相位差或单独电平没有可编辑控件。
// 如果未来接入声道编辑，需要独立扩展数据契约，不能从本单声道数组臆造。
// 这份轮廓不会成为导出内容，导出仍应读取原始源声音而非SVG或峰值摘要。
// 中线用于区分真实零振幅与整个槽没有绘制，加载与失败则用文字说明。

// 倒放仅反转已采样包络的显示顺序，不重新解码一份声音，也不代表混音已接通。
// 冻结片段由调用方传hasAudio=false，因为静帧插入段没有源音频播放区间。
// 视频内嵌音轨与分离后的音频安排共用同一个波形组件，不重复读取同源内容。
// hasAudio由真实探测给出，无声源不发IPC；音轨分离只是改变安排，不删除源音轨。
// loading与error文字沿用i18n，本槽位永远不向素材库写入失败状态。
// pointer-events在CSS关闭，波形不截获片段移动、边缘修剪或右键。
// sourceIn/span随原trimDraft变化，因此鼠标候选与确认结果读取相同源区间。
// aria-hidden只隐藏装饰SVG，状态文本仍可访问，片段名称由父按钮提供。
// 无音轨使用独立标记，测试可以区别静音源与读取失败，但不会创建可播放节点。
// waveform数据就绪才加ready标记，不把挂载了SVG当成真实采样已经完成。
// ready路径为空仍保留中心线表示真实静音包络，而不是创建随机起伏。
// 组件本身不控制播放，也不自动启动声音，扬声器试听仍需另行人工验证。
// 样板不传sourcePath时不发真实请求，避免静态资产意外触发系统文件能力。
// 同一组件的源切换由hook的key保护，旧源包络不会闪到新片段上。
// 时间线继续使用原片段样式；播放器通过参数复用同一份源包络与绘图逻辑。
// player 模式仅改变展示，不新开音频元素，也不参与视频编辑器的工程时钟。
// progress 是当前可见窗口内的百分比，不是整份文件已经下载的比例。
// sourceIn 和 span 仍以源秒数表示，播放时滑动窗口不修改源文件或片段入点。
// 不传新参数的已有调用方保持原来高度、方向和状态文案。
export const ClipWaveform = memo(function ClipWaveform({ sourcePath, hasAudio, sourceIn = 0, span, reversed, presentation = "clip", progress = 0 }: { sourcePath?: string; hasAudio: boolean; sourceIn?: number; span: number; reversed?: boolean; presentation?: "clip" | "player"; progress?: number }) {
  const { t } = useTranslation();
  const data = useSourceWaveform(hasAudio ? sourcePath : undefined);
  // 播放头移动不改变源声音，波形无需跟着工程时钟重复构造字符串。
  // 只有真实采样结果、源入点或源跨度改变时重新计算。
  // 修剪会改变入点/跨度，因此拖动候选依旧即时显示正确的源区间。
  // memo 只挡住相同参数的父级刷新，采样 hook 自己完成时照常更新。
  // 倒放仍通过原 SVG 变换呈现，没有修改包络、声音播放或节目时钟。
  // 每个片段保留自己的 memo，两个不同源区间不会互相借用路径。
  const path = useMemo(() => data?.result ? waveformPath(data.result, sourceIn, span) : "", [data?.result, sourceIn, span]);
  // 没有读到包络时仍显示原加载/失败文案，不拿缓存路径冒充当前源就绪。
  // 同源多个片段仅共享采样结果，入点和跨度各自参与路径计算。
  // 更换音源时 hook 的 result 会改变，旧波形不会因 memo 被强行保留。
  // 改主题只更新 CSS 颜色，无需再计算同一组峰值几何。
  // 播放器展示完整上下包络，时间线仍使用既有的紧凑声音槽。
  // 已播区域用相同路径裁出亮色，不重新采样，也不拿随机条形冒充声音。
  // 像在长胶卷上开一扇小窗：窗口随源时间移动，标记只说明当前看到哪一秒。
  // 同一封闭路径同时用于两种配色，避免已播和未播轮廓出现不同的声音形状。
  // 指示线属于播放反馈，不带独立焦点；键盘定位由宿主已有进度字段承担。
  // 数据失败时保留共享错误提示，不能把一个空 SVG 当成采样成功。
  // 加载期间没有移动标记，媒体解码和波形读取各自报告真实状态。
  // CSS 只负责把真实轮廓分隔成细柱，不改变播放音量、峰值或保存数据。
  return <span data-clip-waveform data-waveform-presentation={presentation} data-waveform-source-in={sourceIn} data-waveform-span={span} data-waveform-state={!hasAudio ? "silent" : !data ? "loading" : data.status} className={presentation === "player" ? styles.waveformPlayer : styles.clipWaveform}>
    {hasAudio && data?.status === "ready" ? <svg style={{ transform: reversed ? "scaleX(-1)" : undefined }} aria-hidden="true" viewBox={presentation === "player" ? "0 0 1000 32" : "0 0 1000 16"} preserveAspectRatio="none"><path d={path} /><path d="M0,16H1000" />{presentation === "player" && <path d={path} style={{ clipPath: `inset(0 ${100 - progress}% 0 0)` }} />}</svg> : <small>{t(!hasAudio ? "toolBox.editorUi.noAudioTrack" : data?.status === "error" ? "toolBox.editorUi.waveformError" : "toolBox.editorUi.waveformLoading")}</small>}
    {presentation === "player" && hasAudio && data?.status === "ready" && <i aria-hidden="true" style={{ left: `${progress}%` }} />}
  </span>;
});

// data-waveform-source-in/span是只读验收信息，不作为未来保存文件的工程结构。
// ready必须来自有结果的IPC响应，挂一个空SVG本身不能证明采样成功。
// 无音轨状态直接由ffprobe元数据决定，不因请求成功null就推断源静音。
// error保留原名称与连续帧，辅助音频读取失败不会令视频片段失去选择能力。
// 小字提示走双语词条，未支持桥接的普通浏览器不会显示未翻译的内部错误。
// 波形状态在每个槽位独立渲染，分离音轨与原视频可以同时处于同源ready。
// 细窄片段可能省略状态文字，但原片段可访问名称和工程属性不因此丢失。
// SVG隐藏于读屏是因为它没有独立操作语义，周围的状态说明仍保留文本内容。
