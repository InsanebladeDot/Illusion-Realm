"use client";

// 进度显示从真实媒体事件更新，不开定时器推算播放进度。
// 截帧复用工具箱的文件选择与 frame 作业，不使用上传按钮或网络接口。
import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslation } from "@/i18n";
import { pickOutputFile, runVideoEdit } from "@/utils/video/ffmpeg";
import { useVideoToolStore } from "@/stores/useVideoToolStore";
import { formatTime } from "@/utils/video/time";
import { CanvasIcon } from "./reference-ui/components";
import type { CanvasMedia } from "./canvas-media-import";

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
// 全屏使用浏览器请求，用户拒绝权限或环境不支持时显示失败。
// 全屏目标是媒体父容器，控件与实际视频一起显示。
// 没有将 app 主窗口切换成另一种全屏状态。
// 音频仍使用原生 controls，不为两种媒体复制这套 JSX。
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
export function CanvasVideoControls({ player, transport, media, ready, onSeek, onMute }: { player: RefObject<HTMLMediaElement | null>; transport: CanvasTransport; media: CanvasMedia; ready: boolean; onSeek: (time: number) => void; onMute: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
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
    catch { setMessage(t("canvas.mediaError")); }
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
// 成功后仅通知这张卡，不自动导入 PNG 变成新节点。
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
    setBusy(true); setMessage("");
    try {
      const target = await pickOutputFile(`${media.name.replace(/\.[^.]+$/, "")}_frame_${Math.round(frameTime * 1000)}ms.png`, "image");
      if (!target || !alive.current) return;
      await runVideoEdit({ mode: "frame", inputPath: media.path, outputPath: target, frameTime }, manualPath);
      if (alive.current) setMessage(t("toolBox.video.frameExported"));
    } catch { if (alive.current) setMessage(t("canvas.frameFailed")); }
    finally { if (alive.current) setBusy(false); }
  };
// 可选 ref 处理节点刚卸载时的空引用。
// 请求发生在用户动作内，保留浏览器的激活要求。
// 不在 effect 自动进入全屏，打开工程不会突然遮住桌面。
// 失败消息局限媒体卡，不把全屏权限问题说成工程损坏。
// 退出全屏沿用浏览器现有机制，不创建第二份媒体元素。
// 因此退出后播放时间、音量和解码会话仍保持同一来源。
  const fullscreen = async () => {
    try { await player.current?.parentElement?.requestFullscreen(); }
    catch { setMessage(t("canvas.fullscreenFailed")); }
  };
  return <>
    {/* 视频底栏：原图标、细滑条和当前帧动作，所有操作只作用于所属播放器。 */}
    <div className="hy-video-controls" data-canvas-media-control>
      <button type="button" disabled={!ready} aria-label={t(transport.playing ? "canvas.pauseMedia" : "canvas.playMedia")} onClick={() => { void play(); }}><CanvasIcon name={transport.playing ? "pause" : "play"} size={15} /></button>
      <input type="range" aria-label={t("canvas.mediaSeek")} min={0} max={transport.duration || 0} step={.01} value={Math.min(transport.time, transport.duration || 0)} disabled={!ready || !transport.duration} onChange={event => onSeek(Number(event.currentTarget.value))} />
      <span>{formatTime(transport.time)} / {formatTime(transport.duration)}</span>
      <button type="button" aria-pressed={transport.muted} aria-label={t("canvas.muteMedia")} disabled={!ready} onClick={onMute}><CanvasIcon name="volume" size={15} /></button>
      <button type="button" aria-label={t("canvas.fullscreen")} disabled={!ready} onClick={() => { void fullscreen(); }}><CanvasIcon name="expand" size={15} /></button>
      <button type="button" data-canvas-capture disabled={!ready || busy} onClick={() => { void capture(); }}>{t(busy ? "canvas.capturing" : "canvas.captureFrame")}</button>
    </div>
    {message && <div className="hy-video-message" role="status">{message}</div>}
  </>;
}
