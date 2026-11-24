"use client";

// 进度显示从真实媒体事件更新，不开定时器推算播放进度。
// 截帧复用工具箱的文件选择与 frame 作业，不使用上传按钮或网络接口。
import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslation } from "@/i18n";
import { useToastStore } from "@/stores/useToastStore";
import { pickOutputFile, runVideoEdit } from "@/utils/video/ffmpeg";
import { useVideoToolStore } from "@/stores/useVideoToolStore";
import { formatTime } from "@/utils/video/time";
import { CanvasIcon } from "./reference-ui/components";
import type { CanvasMedia } from "./canvas-media-import";
import { CanvasAudioWaveform } from "./canvas-audio-waveform";

// transport 是播放器事件的只读展示快照。
// time 表示当前源文件秒数，不是视频编辑器的工程秒数。
// duration 只有有限值才进入快照，未知时界面显示零。
// playing 来自实际 paused 状态，不由点击按钮提前翻转。
// muted 来自实际媒体元素，不使用一份独立静音 store。
// 快照不进入工程文档或撤销栈。
// 恢复工程从头预览，不自动继续上次的声音。
// 两个同源视频各有自己的 transport。
// 互斥播放由父媒体容器通知，不依赖这个展示对象同步时间。
// 数值变化不会改变节点位置、选择或连线。
export interface CanvasTransport { time: number; duration: number; playing: boolean; muted: boolean }

interface MediaMuteButtonProps {
  muted: boolean;
  ready: boolean;
  onMute: () => void;
}

/** 音视频底栏共用视频卡片的扬声器按钮，图标随所属播放器的静音事件更新。 */
function CanvasMediaMuteButton({ muted, ready, onMute }: MediaMuteButtonProps) {
  const { t } = useTranslation();
  return <button type="button" className="hy-media-mute" aria-pressed={muted} aria-label={t("canvas.muteMedia")} disabled={!ready} onClick={onMute}>
    <CanvasIcon name={muted ? "volume-off" : "volume"} size={15} />
  </button>;
}

// 视频底栏复用现有 CanvasIcon，不引入另一套图标字体。
// 按钮是原生 button，disabled 会阻止键盘和指针激活。
// 播放失败给真实错误，不把按钮点击当作已播放。
// 进度条仅在数据就绪且时长已知时可用。
// range 的上限来自真实 duration，不是固定样例时长。
// 拖动进度通过 onSeek 通知拥有媒体 ref 的父层。
// 静音通过 onMute 注入，展示层不复制一份媒体源。
// 这也避免子组件直接修改传入 ref 而绕过 React 的属性边界。
// 事件状态与显示值都由同一个 HTMLMediaElement 产生。
// 当前时间显示使用已有 formatTime，与工具箱秒数格式一致。
// 表头的源名与节点标题分开，截帧默认名使用源名。
// 移除最后一个扩展后追加 frame 和毫秒定位，避免生成双后缀。
// 手动 FFmpeg 路径读取原 useVideoToolStore，不新增配置入口。
// 因此用户在工具箱配置的二进制对画布截帧同样生效。
// 截帧有自己的 busy，不能把卡片解码状态改成 loading。
// 截帧提示只属于这张视频卡，不覆盖画布工程状态。
// 页面卸载后不会把旧导出消息写进下一张卡。
// 系统框还开着就卸载时，不在返回后继续启动 FFmpeg。
// FFmpeg 已启动时属于真实文件作业，不假装卸载已撤销输出。
// 本组件没有进度订阅，不需要注册另一组全局监听。
// 视频本身的暂停与 src 清理由父会话负责。
// 控制栏卸载不应擅自删除用户已导出的 PNG。
// 视频放大交给所属工作区的大预览；不调用系统全屏，也不另建播放器外壳。
// 音视频共用此处的真实播放动作；音频只注入更紧凑的波形与底栏布局。
// 所有可见名称从既有 i18n 获取，图标本身也有可读标签。
// 播放与暂停标签随真实事件变化，读屏可以知道当前动作。
// 静音按钮 aria-pressed 表达持续状态，悬停不会清掉静音。
// 截帧成功必须等作业 Promise 完成，选好保存位置不是成功。
// 取消保存不会运行 frame 作业，也不会发已导出消息。
// 任务失败保留播放器，用户仍可继续预览或重新选择路径。
// 输出是本地 PNG，没有上传或云端资源引用步骤。
// 这不是视频编辑器导出，不渲染整个无限画布成图片。
// 输出不包含节点边框、工具条、选框或其他覆盖层。
// 实际捕获点采用源时间，不根据 UI 文本反解析秒数。
// 源文件与导出图是不同文件，FFmpeg 任务不改写原视频。
// 一个控制栏只接受所属 player，不查找 document 中第一个 video。
// 因此同源多个节点截帧不会误导出另一张卡的当前帧。
// 控制栏的键盘由媒体区隔离，不将 Delete 传给画布删除节点。
export function CanvasVideoControls({ player, transport, media, ready, onSeek, onMute, onExpand }: { player: RefObject<HTMLMediaElement | null>; transport: CanvasTransport; media: CanvasMedia; ready: boolean; onSeek: (time: number) => void; onMute: () => void; onExpand?: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const notify = useToastStore.getState().show;
// 生命周期示例：用户打开截帧保存框，然后从导航离开画布。
// 旧组件卸载会把 alive 置为 false。
// 保存框返回后发现旧会话已结束，就不再启动文件作业。
// 如果文件作业早已启动，主进程仍负责它自己的完成和失败。
// 旧组件不会在 Promise 结束后显示一条已经无处归属的消息。
// 再次进入画布建立新的 ref，不复用上一次导出的 busy。
// 播放器也由新的 MediaPreviewSession 重新创建。
// 这保证旧视频的异步导出不会把新视频卡标成完成。
// 这里只保护 UI 寿命，不宣称拥有 FFmpeg 的中途取消能力。
// 现有 runVideoEdit 的进程管理仍归工具箱服务。
// 因此没有额外注册一套 child_process 或 IPC 事件。
// 页面不持有 Node 句柄，renderer 仍是浏览器边界。
// 将来增加作业取消需要明确 job 身份，不能用当前选中节点猜任务。
// 当前截图输出只受用户明确保存位置与真实源时间控制。
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
// FFmpeg 配置沿用工具箱已有偏好。
// 空 manualPath 让原服务查找随包二进制，不在画布硬编码机器路径。
// 自定义路径改变由原设置页面负责，不复制第二个选择二进制按钮。
// 这份配置不是工程内容，导出包不会携带用户本机可执行文件位置。
// 另一台机器打开包使用自己的 FFmpeg 环境。
// 浏览器预览不依赖 FFmpeg 成功配置，截帧失败不影响原生播放。
// 反过来，FFmpeg 能读视频也不证明 Chromium 支持该编码。
// 两种解码路径的错误必须分别反馈。
// 源画面 loadeddata 与 frame 任务写出 PNG 是不同成功条件。
// 卡片加载完成不会提前显示“当前帧已导出”。
  const manualPath = useVideoToolStore(state => state.ffmpegPath);
// 先读本次点击时的媒体元素，避免 Promise 返回后误操作新 ref。
// 未 ready 的卡片不尝试播放，不能用 play 推动假加载完成。
// video.play 的拒绝可能来自权限或解码，必须明确捕获。
// 暂停使用同步 pause，最终图标仍等 pause 事件更新。
// 连续切卡导致旧播放请求失败时不会生成一张成功结果卡。
// 这条动作不修改源时间，播放从用户当前定位点继续。
  const play = async () => {
    const video = player.current;
    if (!video || !ready) return;
    try { if (video.paused) await video.play(); else video.pause(); }
    catch { if (alive.current) notify(t("canvas.mediaError"), "error"); }
  };
  // 读取源时间而非工程时间；打开系统框前暂停，避免保存的帧随等待漂移。
  // 仅在真实像素已就绪时导出，取消不发成功消息，作业失败保留当前媒体。
// readyState 至少为 HAVE_CURRENT_DATA 才具备可导出的源画面。
// 只知道元数据不足以证明首帧已经可用。
// 先 pause，再读取 currentTime，系统框等待不会改变捕获意图。
// 取值下界为零，不能向 FFmpeg 传负时间。
// 上界留极小余量，避免恰好落到文件终点而没有下一帧。
// 毫秒后缀只用于建议名，实际 frameTime 保留浮点精度。
// setBusy 在打开框前设置，用户不会重复提交同一张卡的截帧。
// 每次先清掉上一次消息，取消不能继续显示上次的成功。
// pickOutputFile 的 image 参数复用工具箱图片输出过滤器。
// 用户可自行选择输出位置，不强制上传到工程资源服务。
// 作业 mode 明确是 frame，不能误调用视频剪辑导出。
// 输入采用受管路径，外部原文件移走后仍能导出。
// 输出使用用户确认的 target，不在渲染层自行拼完整系统目录。
// manualPath 直接传给现有执行封装，探测与进程管理继续由原服务承担。
// 截帧保存后弹出轻提示，文件留在用户指定的目录中。
// 错误不改变媒体引用，无法写输出目录也不该清空视频。
// finally 结束截帧禁用状态，取消和失败都允许再次操作。
// alive 检查区分旧会话与当前会话，不靠 setTimeout 延后更新。
// 没有注册媒体结果轮询，也没有伪造百分比。
// 同名输出覆盖确认沿用现有系统选择框与 FFmpeg 契约。
  const capture = async () => {
    const video = player.current;
    if (!video || video.readyState < 2 || busy) return;
    video.pause();
    const frameTime = Math.max(0, Math.min(video.currentTime, Math.max(0, video.duration - .001)));
    setBusy(true);
    try {
      const target = await pickOutputFile(`${media.name.replace(/\.[^.]+$/, "")}_frame_${Math.round(frameTime * 1000)}ms.png`, "image");
      if (!target || !alive.current) return;
      await runVideoEdit({ mode: "frame", inputPath: media.path, outputPath: target, frameTime }, manualPath);
      if (alive.current) notify(t("toolBox.video.frameExported"), "success");
    } catch { if (alive.current) notify(t("canvas.frameFailed"), "error"); }
    finally { if (alive.current) setBusy(false); }
  };
  // 音频用中央圆形播放按钮，左侧时间与右侧真实文件格式保持固定位置。
  // 文件格式只取导入文件的后缀，不将 WAV 等标签写死为假元数据。
  // 播放被拒绝时弹出轻提示，图标由媒体事件同步。
  // error 不删除音频引用，用户仍能通过节点更换与重试恢复。
  // 音频不展示截帧与全屏按钮，避免把视频专有动作错误应用到声音文件。
  // 两种布局拥有同一播放器 ref，渲染 UI 不会再创建一个自动发声的 audio。
  // 波形读取失败不影响已可解码的声音，辅助图和播放状态继续分别报告。
  // 切换选择和卸载的暂停与清理仍由父媒体会话负责。
  // 仅波形进度和播放栏拦截拖动，周围留白仍可用来搬动节点。
  // 格式和时间在浅深主题中读取卡片语义色，不沿用浏览器固定白色控件皮肤。
  // 长文件名仍由节点标题与原有 caption 省略规则处理，不挤占中央播放位置。
  if (media.kind === "audio") return <div className="hy-audio-player">
    {/* 音频波形：拖动中的预览与实际跳转由波形控件管理。 */}
    <CanvasAudioWaveform player={player} sourcePath={media.path} duration={transport.duration} time={transport.time} ready={ready} onSeek={onSeek} />
    <div className="hy-audio-transport nodrag nopan nowheel" data-canvas-media-control>
      <span>
        {formatTime(transport.time)} / {formatTime(transport.duration)}
        <CanvasMediaMuteButton muted={transport.muted} ready={ready} onMute={onMute} />
      </span>
      <button type="button" data-canvas-audio-play disabled={!ready} aria-label={t(transport.playing ? "canvas.pauseAudio" : "canvas.playAudio")} onClick={() => { void play(); }}>
        <CanvasIcon name={transport.playing ? "pause" : "play"} size={16} />
      </button>
      <small>{media.name.split(".").pop()?.toUpperCase()}</small>
    </div>
  </div>;
  return <>
    {/* 视频底栏：原图标、细滑条和当前帧动作，所有操作只作用于所属播放器。 */}
    <div className="hy-video-controls nodrag nopan nowheel" data-canvas-media-control>
      <button type="button" disabled={!ready} aria-label={t(transport.playing ? "canvas.pauseMedia" : "canvas.playMedia")} onClick={() => { void play(); }}><CanvasIcon name={transport.playing ? "pause" : "play"} size={15} /></button>
      <input type="range" aria-label={t("canvas.mediaSeek")} min={0} max={transport.duration || 0} step={.01} value={Math.min(transport.time, transport.duration || 0)} disabled={!ready || !transport.duration} onChange={event => onSeek(Number(event.currentTarget.value))} />
      <span>{formatTime(transport.time)} / {formatTime(transport.duration)}</span>
      <CanvasMediaMuteButton muted={transport.muted} ready={ready} onMute={onMute} />
      {onExpand && <button type="button" aria-label={t("canvas.fullscreen")} disabled={!ready} onClick={onExpand}><CanvasIcon name="expand" size={15} /></button>}
      <button type="button" data-canvas-capture disabled={!ready || busy} onClick={() => { void capture(); }}>{t(busy ? "canvas.capturing" : "canvas.captureFrame")}</button>
    </div>
  </>;
}
