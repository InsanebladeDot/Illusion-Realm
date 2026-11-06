"use client";

// 标尺和播放头共用轨道内容矩形；横向滚动已经反映在left中，不能再加scrollLeft。
// 播放头焦点使用preventScroll，避免拖动到内容边缘时浏览器主动滚动父容器。
// 标尺坐标仍由实际内容矩形和每秒像素共同计算，不扣一次旧导航宽度。
// 焦点可见不等于必须把按钮居中滚入视口，拖动期间滚动应由时间轴视口负责。
// 连续定位产生多个seek版本，每个版本只应用一次到当前解码器。
// 真实播放报告不增加版本，不能反向触发新一轮定位。
// 暂停后的迟到事件由媒体桥隔离，标尺无需伪造进度或加防抖延迟。
// 此处不保存构图候选，画布拖动与播放头拖动是两种独立手势。
// 方向键的帧精度继续来自工程fps，不受预览缩放影响。
// 横滚后内容矩形会变化，读取当前几何比缓存窗口起点更可靠。
// 没有新增时间线数组，片段、标尺和蓝线仍沿用已有共同时间模型。
import { useRef, type PointerEvent, type KeyboardEvent } from "react";
import { useTranslation } from "@/i18n";
import { timelineDropTime } from "./live-timeline-model";
import styles from "./editor.module.css";

// 标尺是时间轴公共内容列的一部分，不是固定在整个窗口顶部的独立尺子。
// lane、标尺和竖线共用range；缩放只改变它们的像素密度，不改变工程秒数。
// 鼠标位置使用clientX，与getBoundingClientRect.left属于同一坐标系。
// 横滚已经改变矩形left，若再加scrollLeft，落点会被多算一次滚动距离。
// 比如每秒32px，左边从400滚到240，同一个560px鼠标位置应从5秒变成10秒。
// 这里不减应用nav或轨道头宽度，真实内容列矩形已经包含这些外部占位。
// 当前定位作用于单源工程书签，不代表具备多轨节目合成播放。
// 宿主根据书签决定当前可预览的一段，空隙则显示明确黑场。
// 标尺不会从片段选择反向改写start/end，移动播放头不是移动片段。

// 实际定位能力由宿主提供；静态样板保留刻度，不假装拥有媒体播放器。
// range是视口时间范围，duration是工程总长，二者不能因为缩放而互相覆盖。
interface RulerProps { range: number; duration: number; fps: number; currentTime: number; onSeek?: (time: number) => void; }

// range可以比duration长，例如三秒工程仍保留三十秒编辑视口。
// 刻度使用range铺满整个编辑空间，滑块最大值则是实际duration。
// onSeek缺省的静态样板只有标尺，没有可用滑块，不承诺真实播放定位。
// currentTime由宿主控制，这里不另起计时器维护第二份“播放进度”。
// fps是工程帧率，24fps源放到30fps工程后仍按工程帧定位。
// 范围夹限属于宿主共同seek入口，指针和键盘都会经过它。
// 本组件只计算用户意图，不能把传入项目总长改成点击时的秒数。

// 指针位置先换项目帧，再由工程定位夹在真实时长内，拖到负区域不会出现负播放时间。
// 抓取的是标尺自身，按钮小三角不会把offset误当成片段内部抓取偏移。
// 这与片段拖动使用同一时间换算方法，缩放与导航开合不需要补一个固定偏移。
function rulerTime(event: PointerEvent<HTMLDivElement>, range: number, fps: number) {
  // offset传零，因为标尺定位以鼠标所在位置为目标，而非保留片段内部抓取位置。
  // 与片段移动共用timelineDropTime只共用坐标换算，不共用创建或碰撞语义。
  // 函数可以返回负时间或超出时长的时间，随后由宿主夹到实际工程边界。
  // 这样从右侧空白点击不会把工程时长扩充成视口range。
  // 取矩形发生在事件时，导航开合或横滚后不使用上一帧缓存left。
  // width/range才是当前实际每秒像素，不能写死成默认32。
  // 适合全部会改变width，时间模型不变，定位依然用同一个换算入口。
  const box = event.currentTarget.getBoundingClientRect();
  return timelineDropTime(event.clientX, box.left, box.width / range, 0, fps);
}

// 小三角是唯一可聚焦滑块，贯穿轨道的细线保持不拦截片段点击。
// 指针捕获让拖出标尺后仍能继续定位；松手/取消都会释放捕获。
// Escape恢复本次拖动前的书签；键盘箭头一帧、Shift一秒，Home/End到工程边界。
// 不绑定全局播放或删除快捷键，属性框中的方向键不会被这套逻辑抢走。
export function EditorTimeRuler({ range, duration, fps, currentTime, onSeek }: RulerProps) {
  // origin只记录一次定位手势开始前的书签，供Escape或pointercancel恢复。
  // 普通媒体timeupdate更新currentTime时不改origin，回滚仍能回到真正起点。
  // 主刻度步长按数量级选取，长工程不会每秒都绘制一个重叠标签。
  // 最小步长一帧，短时间范围也不会产生比工程精度更细的刻度。
  // ticks是展示数据，不会作为片段坐标的离散吸附点。
  // 当前没有磁吸功能，不把点击靠近标签自动跳整秒。
  // 秒数标签保留必要小数，避免长二进制小数尾巴挤满标尺。
  // 真正提交用未格式化的帧时间，显示到三位小数不影响工程精度。
  const { t } = useTranslation(), origin = useRef<number | null>(null);
  const step = Math.max(1 / fps, Math.pow(10, Math.floor(Math.log10(range / 8))));
  const ticks = Array.from({ length: Math.floor(range / step) + 1 }, (_, index) => index * step);
  // 30秒范围通常步长一秒，较长范围按十倍数量级增加，主标签数量有自然上限。
  // 刻度列表不按媒体帧率生成全部帧，避免一分钟视频渲染上千个DOM标签。
  // 细刻度背景由CSS使用同一range绘制，主标签只提供读取参照。
  // 最后一个标签不一定恰好是工程末尾，因为range与duration本来可以不同。
  // 标签不承担按钮职责，不逐个进入Tab路径；滑块才是可操作时间位置。
  // Home/End改变滑块值，不自动水平滚到最右端，当前不宣称播放头自动跟随滚动。
  // 当播放头在可见范围之外，用户可通过同一横向滚动体找到它。
  // 这里没有给每个片段生成一根自己的播放线，工程只有一个统一书签。
  // 指针定位不挑最近的片段边界，碰撞贴边策略只属于安排移动。
  // 这保证空隙内的蓝线可以精确停留，不被强行吸回上一段。
  // 把当前位置格式化为两位秒数只用于aria提示，不降低实际项目帧精度。
  // 例如1/30秒保存在数值里仍是约0.0333，提示0.03不等于把工程改成0.03。
  // 指针移出左边界会产生负意图，宿主夹零，不把屏幕负坐标当成非法素材。
  // 移出右边界夹到真实duration，不让用户在空视口继续延长播放时间。
  // 片段移动则允许越过旧末端扩展工程，两种操作不能混用同一范围限制。
  // 导航宽度变化会更新内容矩形，下一次定位不继承旧的屏幕起点。
  // 标尺不保存项目数据，离开路由后没有单独残留的书签缓存。
  // 手势取消只恢复origin，不修改clip数组，也不恢复素材高亮。
  // 指针抬起后的普通Escape没有origin，不制造一次没有目标的seek。
  // 模式切换由宿主选择source或program，本组件不会用文件名推断该看哪份时钟。
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    // 无onSeek时完全不捕获指针，静态图不会制造可拖动的假反馈。
    // 右键也不定位，以免用户试图打开菜单却改了播放起点。
    // 按下就保存旧书签，然后发布首个位置，用户无需移动鼠标才能定位。
    // 捕获让拖出标尺区域仍能收到结束事件，避免origin永久停在活跃状态。
    // 焦点给唯一滑块按钮，后续方向键和Escape可以接续同一次操作。
    // preventDefault避免拖动时选择刻度文字，也不会启动HTML片段拖放。
    // 不向DataTransfer写入载荷，标尺拖动与素材入轨是不同的浏览器手势。
    if (!onSeek || event.button !== 0) return;
    event.preventDefault(); origin.current = currentTime;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    onSeek(rulerTime(event, range, fps));
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    // 只有拥有该pointerId的标尺才处理结束，另一个触点不能取消当前定位。
    // 普通松手保留当前书签，不再次从松手坐标产生重复版本。
    // 系统取消则恢复origin，宿主仍会按当前工程时长夹限。
    // 如果过程中工程变短，恢复不会把书签送回已经不存在的末尾。
    // 清origin后任何迟到move都不会继续seek。
    // 释放捕获让下一次手势正常交给其实际目标，不留下整条标尺的隐形拖动。
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    if (event.type === "pointercancel" && origin.current !== null) onSeek?.(origin.current);
    origin.current = null; event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    // 只在滑块拥有焦点时接箭头，不劫持属性输入中的左右移动光标。
    // 普通箭头一帧，Shift一秒，与片段键盘步长保持同一工程fps来源。
    // Home/End到真实工程开头结尾，不是滚动视口的可见左右端。
    // Ctrl/Alt/Meta组合留给系统和应用已有快捷键，避免扩大本组件职责。
    // Escape仅在指针定位未结束时有origin，平时不改变用户书签。
    // 未识别按键返回null，Tab仍能离开滑块前往轨道头或片段。
    // preventDefault阻止箭头又触发页面滚动，让一次输入只做一次定位。
    // 恢复后清origin，后续pointermove不再覆盖取消结果，松手仍释放捕获。
    if (!onSeek || event.altKey || event.ctrlKey || event.metaKey) return;
    const time = event.key === "Home" ? 0 : event.key === "End" ? duration : event.key === "ArrowLeft" ? currentTime - (event.shiftKey ? 1 : 1 / fps) : event.key === "ArrowRight" ? currentTime + (event.shiftKey ? 1 : 1 / fps) : event.key === "Escape" ? origin.current : null;
    if (time === null) return;
    event.preventDefault(); onSeek(time);
    if (event.key === "Escape") origin.current = null;
  }
  // 滑块位于标尺层，贯穿轨道的细线保持pointer-events:none。
  // 点击细线覆盖的片段仍能选中和拖动，不能被一个透明大滑块抢走。
  // 三角形可见范围小，但按钮本身保留较大的命中盒与可见焦点。
  // role=slider对应一维连续时间，aria值用工程秒，辅助文字标明秒单位。
  // 位置百分比除以range，最大值却为duration，这两个量不是同一职责。
  // 静态样板不传onSeek就不生成按钮，避免disabled滑块误导能力已经接入。
  // 动态currentTime改变只更新位置和aria，不会给浏览器设置媒体currentTime。
  // 真正的媒体定位在播放器适配层，版本号用于区分用户seek和正常进度回流。
  return <div data-editor-region="R07" data-timeline-range={range} className={styles.ruler} onPointerDown={pointerDown} onPointerMove={event => { if (origin.current !== null && event.currentTarget.hasPointerCapture(event.pointerId)) onSeek?.(rulerTime(event, range, fps)); }} onPointerUp={finish} onPointerCancel={finish}>
    {ticks.map(seconds => <span key={seconds} style={{ left: `${seconds / range * 100}%` }}>{Number(seconds.toFixed(3))}s</span>)}
    {onSeek && <button type="button" role="slider" data-editor-playhead-handle className={styles.playheadHandle} style={{ left: `${currentTime / range * 100}%` }} aria-label={t("toolBox.editorUi.playhead")} aria-valuemin={0} aria-valuemax={duration} aria-valuenow={currentTime} aria-valuetext={`${currentTime.toFixed(2)}s`} onKeyDown={keyDown} />}
  </div>;
}
