"use client";
/* eslint-disable @next/next/no-img-element -- 本地只读协议交给浏览器解码，不走静态导出不存在的图片优化服务。 */

// 本地媒体在原有节点内容插槽中显示，不另建第二套节点或生成结果模型。
// 图片按完整内容适配；视频使用真实媒体驱动底栏，音频保留原生控件。
// 文件可能被移动或编码不受支持，元数据引用仍保留，让用户可以更换原文件。
// 成功只来自真实加载事件；十五秒无结果进入可重试错误，不伪造进度。
// 片段更换时由 key 重新挂载，旧源事件不会覆盖新源状态。
// 预览不回写生成状态、时间线或原媒体文件，也不会把选择当作播放命令。
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import { buildLocalFileUrl } from "@/utils/localFileUrl";
import type { CanvasMedia } from "./canvas-media-import";
import { CanvasVideoControls, type CanvasTransport } from "./canvas-video-controls";
import { CanvasChip } from "./reference-ui/components";

// 每张卡拥有自己的 DOM 与状态；只有播放互斥通知在同一画布宿主传播。
// 像会议室递话筒：开始一个声音时才通知其他卡片暂停，不共享播放时间或错误。
// 同源副本各有独立元素，切换选择会暂停旧卡，不产生同时响多个音轨的意外。
// 原生 controls 的键盘事件停在控件内，不让 Space 和方向键推动整个画布。
// source 只从已保存路径构造，禁止将用户字符串直接当作远程 URL 自动请求。
// 不创建 Blob URL，因此卸载没有临时 URL 泄漏；媒体缓冲仍需明确释放。
interface MediaPreviewProps { media: CanvasMedia; selected: boolean; onReplace: () => void }

// 重试是一份新的解码会话，清理旧资源后重新读取同一个只读文件。
// 不改节点身份或媒体引用，因此不会制造无意义的作品历史与未保存提示。
// 对象引用变化表示用户重新选过文件，同一路径也要重新加载，不沿用旧错误。
// 为每次引用更换保留本地序号，序号不保存、不广播，也不依赖时间戳碰巧不重复。
export function CanvasMediaPreview(props: MediaPreviewProps) {
  // 引用对象由作品事务整体替换，原对象内容不会被节点自己就地修改。
  // 同一路径重新导入也可能意味着磁盘内容变了，因此比较引用身份而不是只比较路径。
  // session 保存引用和解码序号，既不缓存文件正文，也不把播放器放进 React state。
  // 此处有条件同步更新派生状态，React 会在提交 DOM 前重算，不向 effect 连发状态。
  // key 变化会完整清理旧会话；不能只清掉一行错误文字继续复用坏的播放器。
  // 重试序号只服务当前组件，保存时不会让相同作品因为“重试过”变成未保存。
  // 外层卡片选择不改变序号，单击选中不会重新下载或解码整个视频。
  // 复制节点创建另一组件实例，即便 media 是同一引用也有独立播放与重试状态。
  const [session, setSession] = useState({ media: props.media, revision: 0 });
  if (session.media !== props.media) setSession({ media: props.media, revision: session.revision + 1 });
  return <MediaPreviewSession key={session.revision} {...props} onRetry={() => setSession(value => ({ ...value, revision: value.revision + 1 }))} />;
}

// 状态与真实 DOM 同时重新创建，不能先清掉错误文字却继续展示上一个坏源。
// 图片事件和媒体事件只更新当前会话，React 卸载旧会话后不会再覆盖新源的状态。
function MediaPreviewSession({ media, selected, onReplace, onRetry }: MediaPreviewProps & { onRetry: () => void }) {
  // 只有渲染时的标签依 kind 分流；加载、错误、替换外壳不分出三套实现。
  // 音频和视频共用 HTMLMediaElement 契约，图片则用自己的 load/error 事件。
  // ref 接收实际挂载的元素，首次 effect 在提交后才能得到可暂停和释放的对象。
  // root 将互斥范围限定到当前工作区，不在 document 上暂停其他页面的播放器。
  // 初始 loading 是尚未得到成功事件，不等同于服务端任务开始或转码开始。
  // localfile URL 每次按引用构造，不保存包含查询编码的派生字符串。
  // source 不接受用户输入的 http 地址，画布不会自动访问文件名中藏的网络链接。
  // 浏览器会根据真实文件响应决定解码；卡片类型只是选择正确的原生标签。
  const { t } = useTranslation();
  const player = useRef<HTMLMediaElement | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const source = buildLocalFileUrl(media.path) ?? "";
  const [transport, setTransport] = useState<CanvasTransport>({ time: 0, duration: 0, playing: false, muted: false });
// failed 是当前解码会话的终止屏障。
// 超时或真实 error 后，迟到 canplay 不应突然把错误清成 ready。
// 用户明确重试才建立新会话，避免加载提示与旧事件反复闪烁。
// ready 只处理真实 load、loadeddata、canplay，绝不由播放按钮推断。
// 图片 onLoad 和视频 onLoadedData 共用就绪意图，来源事件各自真实。
// fail 会暂停媒体，错误状态下不能在后台继续发声。
// 原 media 引用没有删除，用户可以重试或更换而保留节点连接。
// 播放器元数据还在时也显示预览错误，不将探测完成当成解码完成。
// status 不写入工程，重新打开会重新实际加载。
// 复制来的节点有独立 failed ref，不继承另一张卡的错误。
// 重试 revision 也不持久化，不制造作品未保存状态。
// 选中节点不会重置这道屏障，单击不能冒充已修复文件。
  const failed = useRef(false);
  const ready = () => { if (!failed.current) setStatus("ready"); };
  const fail = () => { failed.current = true; setStatus("error"); player.current?.pause(); };
  // 解码可能永远没有 loadeddata/error；给它真实的失败边界，不能让用户无限等。
  // 超时只表示当前会话没有读出画面，不抹掉文件引用；重试会建立新会话。
// 十五秒是等待结果的上界，不是模拟读取过程的时长。
// 只在 loading 期间安装一次 watchdog。
// 收到真实成功或失败后 cleanup 释放该计时器。
// 页面不可见时普通 setTimeout 仍能结束等待，不只依赖 rAF。
// 超时消息没有伪造具体百分比或服务器异常。
// 慢文件可以由用户重试，不自动无限循环重新读取。
// 超时不会重写 media.path，找回文件后仍可按原引用恢复。
// 重试会清掉旧会话资源，不能只隐藏错误文字继续用坏播放器。
// 因计时器而进入 error 后仍保留原文件名，方便定位问题。
// 当前超时不触发后台转码，不承诺所有编码都能被 Chromium 播放。
// 已 loadedmetadata 但无首帧的情况仍会被 watchdog 收尾。
// 因此截图中的“正在读取”不会在没有事件时永久悬挂。
  useEffect(() => {
    if (status !== "loading") return;
    const timer = setTimeout(() => { failed.current = true; setStatus("error"); player.current?.pause(); }, 15000);
    return () => clearTimeout(timer);
  }, [status]);
// 事件到来时读取当前元素实际数值，不用预期值代替播放器反馈。
// 未知或无限 duration 显示零，避免 range 接到非法上限。
// currentTime 保持源秒数，formatTime 只负责展示。
// paused 为 false 才显示正在播放，不在点击时预先置真。
// muted 与媒体元素一致，切换节点不会共用静音状态。
// onVolumeChange 也刷新快照，原生全屏控制可反馈到同一底栏。
// onEnded 刷新后正确回到播放动作，不让按钮一直显示暂停。
// 时间更新不派发 editor 命令，试听不会消耗撤销历史。
// 不使用 interval 推进数字，暂停或缓冲时进度不虚假前进。
// 元素不存在时直接忽略事件，卸载的旧会话不构造假数据。
  const syncTransport = () => {
    const element = player.current;
    if (element) setTransport({ time: element.currentTime, duration: Number.isFinite(element.duration) ? element.duration : 0, playing: !element.paused, muted: element.muted });
  };
  // localfile 的 Range 和读取流由原协议实现，本组件不再创建一套视频文件服务。
  // 图片直接使用原生 img 是静态导出与本地协议的明确适配，不依赖 Next 图片服务端。
  // 不设置 crossOrigin 去请求第三方媒体，也不把绝对路径上报任何远程分析服务。
  // 文件有空格或 # 时由统一构造器整体编码，不能在这里手拼 URL 后再重复编码。
  // 路径和媒体大小只说明来源，实际载入尺寸由浏览器解码结果决定。
  useEffect(() => {
    // effect 捕获的是这次挂载的元素，清理时不能拿新 ref 误停下一份文件。
    // 切换引用靠 key 卸载，因此一个会话只拥有一个来源与一组监听。
    // 即使错误文件从未开始播放，清理仍要 remove src 和 load 以释放读取任务。
    // 这里不会 revokeObjectURL，因为本流程从来没有创建 object URL。
    // 文件读取由主进程协议管理，清理媒体元素不等于删除或改名磁盘文件。
    const element = player.current;
    const host = root.current?.closest("[data-infinite-canvas]");
    // 开发模式会像试开关一样执行“安装→清理→再安装”，DOM 却仍是同一个。
    // 上一次清理已移除 src；React 的属性值没变，不会自动把它重新写进去。
    // 因此每次安装都确认来源仍在，避免已有路径却永远读不到首帧。
    // 只在 src 缺失时恢复，正常重渲染不会反复 load 打断播放。
    // key 已隔离换源，source 始终属于本次会话，不会把旧文件装回新播放器。
    // 卸载时依旧释放来源，不能以取消清理来掩盖这个生命周期问题。
    if (element && !element.getAttribute("src")) { element.src = source; element.load(); }
    // 比较 getAttribute 而不是 element.src：后者可能把空地址解析成当前页面 URL。
    // 不能因此误判播放器已经拥有来源，继续展示一个零时长的黑色元素。
    // DOM 已有 src 时保留浏览器缓冲，播放器 timeupdate 引起的渲染不会重置位置。
    // source 的依赖只在地址改变时更新，不把播放时间或是否选中加入资源安装条件。
    // 普通选择变化只暂停，不释放文件，因此再点播放可以继续当前源时间。
    // 真实离开节点才移除来源，避免每次打开参数面板都重新读取大视频。
    // 图片没有 player ref，此安装分支不会为图片创建隐藏 video 或多余声音。
    // 音频使用同一 HTMLMediaElement 生命周期，资源恢复不会仅修好视频而留下音频问题。
    // 首帧 ready 必须等到加载事件，重新设置 src 本身不能直接把状态写成 ready。
    // 来源找不到时仍保留原路径；恢复来源不是回落到另一份示例视频。
    // 如果编码不受 Chromium 支持，error 仍会进入原来的可重试失败边界。
    // 生命周期修复不通过放宽错误或无限延长超时来隐藏解码失败。
    // 本地协议继续处理字节 Range，组件不会下载一份 base64 塞进 React state。
    // 旧监听在清理中移除，再安装时每种事件只有本会话的一份回调。
    // 切换路由与删除节点都走同一资源释放，不需要浏览器等到文件自然播放结束。
    // DOM 释放后的事件不回写画布数据，播放状态不是作品快照的一部分。
    // 收到其他卡片的播放通知就暂停自己；此事件只在当前画布内生效。
    // 页面不可见也暂停，防止切换应用或路由后继续占用解码和扬声器。
    // 监听器与实际 DOM 同生共死，不把 media 引用加入全局播放器缓存。
    // 先移除自己的监听，再清空 src/load，让旧资源主动退出浏览器解码队列。
    // 自己发出的播放通知携带自己的 DOM，只让别的会话暂停，不把自己立即停掉。
    // 对未知事件负载保守暂停，事件内容不会被当作路径、代码或节点属性执行。
    // 这是瞬时通知，不是新的共享播放 store，工程数据仍由已有 reducer 管理。
    const stop = (event: Event) => { if (!(event instanceof CustomEvent) || event.detail !== element) element?.pause(); };
    // visibilitychange 用当前 document.hidden 判定，不能靠上次通知缓存页面可见性。
    // 再次可见不会自动恢复声音，继续播放需要用户的新动作。
    // 系统选择框是否算隐藏由浏览器决定，本函数不猜测窗口失焦就删除媒体。
    const hidden = () => { if (document.hidden) element?.pause(); };
    host?.addEventListener("canvas-media-play", stop);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      // 先断开广播，防止释放来源过程中产生的事件再影响其他正在播放的卡片。
      // removeEventListener 只移除本会话回调，不用 removeAllListeners 破坏同类实例。
      // 图片没有 HTMLMediaElement，optional 分支保持监听释放与媒体释放各自安全。
      // load 在清空 src 后让浏览器放弃旧缓冲，不重新发起相同路径的读取。
      // 原生音量和进度是预览状态，卸载后不会写进用户文件或创建页参数。
      host?.removeEventListener("canvas-media-play", stop);
      document.removeEventListener("visibilitychange", hidden);
      if (element) { element.pause(); element.removeAttribute("src"); element.load(); }
    };
  }, [source]);
  // 选择状态只管理离开时暂停，不自动播放；浏览器拒绝播放不会被当作成功。
  // 可见播放进度来自原生媒体时钟，不写入作品或撤销记录。
  useEffect(() => { if (!selected) player.current?.pause(); }, [selected]);
  // 多选也不主动启动播放器；只有用户播放动作才会触发工作区的互斥通知。
  // 图片不参与音视频互斥，因为它没有播放状态，静态图不应被暂停操作隐藏。
  // 删除正在播放的节点与切换路由都走相同卸载清理，不等待媒体自然 ended。
  // 不恢复上次 currentTime，用户重新打开草稿得到可查看的源文件，不得到后台续播。
  // 媒体结束由原生 controls 表达，不把 ended 翻译成整个生成任务已完成。
  // 通知只在真正的 play 事件后发出，不在用户刚选中卡片时抢停其他来源。
  // 浏览器因为权限拒绝 play 时不会靠按钮文字制造假播放状态。
  // 没有向上层回报“生成成功”，媒体播放和生成服务仍是两条独立业务。
  const playback = () => {
    syncTransport();
    root.current?.closest("[data-infinite-canvas]")?.dispatchEvent(new CustomEvent("canvas-media-play", { detail: player.current }));
  };
  // auto 允许浏览器继续读取首帧；metadata 单独就绪不能证明已经读出画面。
  // loadeddata 表示已有可用媒体数据；不能用文件名后缀或选中文件时机代替它。
  // error 包括文件缺失、协议读取失败与不支持编码，统一给出可操作的更换入口。
  // 不在错误文案中转发浏览器底层异常路径或堆栈。
  // controls 保留真实播放、暂停、定位和音量能力，进度由原生媒体时钟驱动。
  // preload 不代表自动播放，本组件没有 autoplay，也没有效果里的 play 调用。
  // ref 回调只登记当前真实元素，不在渲染期间读取播放器进度。
  // 事件闭包属于当前会话，换源后整份组件卸载，旧源不能把新源错误清成 ready。
  const properties = { ref: (element: HTMLMediaElement | null) => { player.current = element; }, src: source, controls: media.kind === "audio", preload: "auto", onLoadedMetadata: syncTransport, onLoadedData: ready, onCanPlay: ready, onError: fail, onPlay: playback, onPause: syncTransport, onTimeUpdate: syncTransport, onEnded: syncTransport, onVolumeChange: syncTransport } as const;
  // 图片正文就是节点的抓取区域，不能和有播放控件的音视频一起禁止拖动。
  // 浏览器原生图片拖放仍由 draggable=false 关闭，避免拖出一个文件影子。
  // nopan 也随图片移除，让未被节点拖动消费的手势仍符合图引擎原有规则。
  // 不在图片上手写 pointermove 坐标，保持抓取偏移、缩放与撤销由同一引擎计算。
  // 因此缩小画布后的鼠标位移无需在此再次除以 zoom，避免双重换算。
  // 图片本身没有输入控件，正文抓取不会抢走视频进度或音频音量的交互。
  // 错误层文字不接收指针，加载失败后仍能从未被按钮占据的区域移动节点。
  // 恢复按钮自己的 nodrag 阻止把一次重试误当成一段节点位移。
  // 正常图的更换入口卸载而非透明隐藏，键盘不会落在用户看不见的按钮上。
  // 外部节点标题仍允许双击编辑，删除内层重复文件名不改变用户的自定义标题。
  // 图片 alt 继续使用真实基本名，移除视觉标题条不会让读屏失去来源名称。
  // 完整画面仍按 contain 显示，不为填满节点而裁掉用户导入的图像边缘。
  // 音视频的进度条继续隔离图引擎；错误恢复按钮单独隔离，不妨碍图片空白处抓取。
  return <div ref={root} className={`hy-local-media${media.kind === "image" ? "" : " nodrag nopan nowheel"}`} data-canvas-media={media.kind} data-media-status={status} onKeyDown={event => event.stopPropagation()}>
    {/* 节点内容：图片完整显示；视频和音频使用真实媒体元素，不用封面冒充播放。 */}
    {/* 图片 alt 使用原始基本名，文件缺失时读屏仍能识别此引用；完整目录不暴露到正文。 */}
    {/* draggable=false 阻止浏览器默认拖走图片文件，节点移动仍交给图引擎外壳。 */}
    {/* nodrag/nopan 让视频进度拖动留在原生控件，不把调播放时间误当作移动整张卡片。 */}
    {/* playsInline 保持视频在当前节点显示，不因预览操作强制进入移动端全屏。 */}
    {media.kind === "image" ? <img src={source} alt={media.name} draggable={false} onLoad={ready} onError={fail} /> : media.kind === "video" ? <video {...properties} playsInline /> : <audio {...properties} />}
    {/* 失败提示保留来源名，便于用户定位；不暴露绝对目录，也不清除已存引用。 */}
    {/* caption 的 title 保存完整文件名，视觉省略不影响用户查看真实来源。 */}
    {/* 状态文字使用 role=status 供辅助工具通知，普通成功不额外弹假完成通知。 */}
    {/* 预览加载失败也保留原生元素，用户可据此检查控件状态或选择更换文件。 */}
    {/* 状态层不盖住操作命中区域，不能让错误提示挡住修复错误所需的按钮。 */}
    {/* 图片只保留原有节点外标题，正文不再重复文件名或常驻更换按钮。 */}
    {media.kind === "audio" && <div className="hy-media-caption" title={media.name}>{media.name}</div>}
    {media.kind === "video" && <CanvasVideoControls player={player} transport={transport} media={media} ready={status === "ready"} onSeek={time => { if (player.current) player.current.currentTime = time; }} onMute={() => { if (player.current) player.current.muted = !player.current.muted; }} />}
    {status !== "ready" && <div className="hy-media-state" role="status">{t(status === "loading" ? "canvas.mediaLoading" : "canvas.mediaError")}</div>}
    {/* 重试只读原文件，更换才写回节点数据；两个动作分别拥有准确的副作用。 */}
    {/* retry 只有失败时出现，正常加载过程中重复点击不会并行创建更多解码会话。 */}
    {/* 两个动作沿用 CanvasChip，主题、焦点与细线悬停无需在媒体内容里再画一套。 */}
    {/* 操作区域参与键盘导航但不传播画布删除快捷键，避免按键控制文件时误删卡片。 */}
    {/* 缺图仍需可恢复入口；正常图片不挂载隐形按钮，也不额外占用 Tab 焦点。 */}
    {(media.kind !== "image" || status === "error") && <div className="hy-media-replace nodrag nopan" data-canvas-media-control>{status === "error" && <CanvasChip onClick={onRetry}>{t("canvas.retry")}</CanvasChip>}<CanvasChip onClick={onReplace}>{t("canvas.replaceMedia")}</CanvasChip></div>}
  </div>;
}
