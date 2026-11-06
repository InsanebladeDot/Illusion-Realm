"use client";

// 候选构图只服务一次画布手势；确认数据继续归原时间线工程，不新增全局仓库。
import { useState } from "react";
import { defaultTransform, evaluateTransform, isTransformKey, TRANSFORM_KEYS, type ClipTransform } from "./clip-transform-model";
import type { LiveTimelineClip } from "./live-timeline-model";
import type { CanvasEdit } from "./clip-canvas";
import type { EditorPreviewProject } from "./editor-panels";
import type { PropertyKey } from "./editor-property-model";

// 仅依赖片段身份、当前锁与变换命令，不获得时间安排/导入/媒体文件的写入权限。
// 同源两次入轨各有独立clip.id，不能以assetId作为候选草稿归属。
// 画布当前播放片段可以不同于属性选中项，必须按各自ID查候选而非全局“当前值”。
// selectedClip用于属性目标，节目中的多个有效图层分别取得canvas回调。
// 素材查看不传canvas回调，仍显示原始源；这里不读取素材列表的高亮。
// 接口不暴露update整个项目的方法，候选层只能请求修改构图或改变片段选择。
// 这种窄接口让时间线仍是唯一确认数据拥有者，避免出现两个工程仓库互相覆盖。
// 图层由实际clip.id建立编辑回调，不从assetId构造一个假的选中片段。
// selectedClip可以为空，此时属性只显示项目事实，不能默认编辑首个素材。
// 锁状态按完整轨道表传入，不能仅让时间线按钮变灰而属性仍可写。
// 视频多轨仍由时间线会话管理，构图接口不能自行申请轨道或修改时间安排。
interface TransformSession {
  currentTime: number;
  selectedClip: LiveTimelineClip | null; lockedTracks: readonly string[];
  speed: (id: string, value: number) => void;
  resetTransform: (id: string, patch: Partial<ClipTransform>) => void;
  transform: (id: string, patch: Partial<ClipTransform>) => void; selectCanvas: (id: string) => void;
}
// 草稿记录原始clip对象引用，不只记录id，可识别同ID已被新确认快照替换。
// 例如字段先确认了新缩放，旧手势的origin不再有效，应立即停止显示旧候选。
// 这种失效检查比只比较数值更稳，确认相同值也可能代表一次新的提交边界。
// 候选完整保留五个值，X/Y移动时不会让旋转和透明度暂时恢复默认。
// 它不保存时间线秒数，手势取消不能意外把片段移回另一个时间。
// 候选也不保存源文件路径，生命周期结束不需要删除用户文件。
// 一次只允许当前选中画面的候选有效，不让上一对象的透明纸盖住新对象。
// 真正提交以timeline最新权限为准，候选有效不代表锁定后还有写入权。
// 鼠标移动没有工程成功通知，松手后的共享命令才决定是否接受补丁。
// 外部重置造成对象替换后，旧候选自然失效，不覆盖已经重置的画面。
// 组件退出时局部state销毁，没有全局缓存需要跨页面手动清除。
// 片段身份与源身份分开，重复入轨的第二份对象不会沿用第一份手势基准。
// 播放器时间更新不替换片段对象，所以正常播放不会让当前候选无故失效。
// 切换主题同样不换clip引用，外观变化不属于工程确认命令。
// 锁表另行判定，锁操作无需伪造一个新transform才能使旧候选失效。
interface TransformDraft { original: LiveTimelineClip; value: ClipTransform; }

// 像在透明纸上临时描一份新位置，松手才把它抄回工程，取消只拿走透明纸。
// draft持有开始时的片段引用，确认片段换了就自动失效，不用反向修补旧工程。
// 锁表或选择变化后也不采用旧候选，避免隐藏面板里的草稿继续改画面。
// candidate值同时给预览与属性读取，所以拖动时X/Y变化不是另一份假的数值。
// 属性提交会先丢掉手势候选，再调用同一transform命令，避免候选覆盖新确认值。
// 回调按当前选中ID绑定；切换到另一个实例时不能使用上一实例闭包写入。
// 构图参数与速度分流到各自命令，音量和淡入淡出仍按真实能力禁用。
// 轨道锁的视觉禁用不是最终权限，transform纯模型还会再检一次当前锁表。
// 本Hook不写本地JSON、不修改源文件，也不建立第二套时间线数据。
// 选择对象改变时，旧draft的original仍是旧引用，因此读取新对象会自然回到确认值。
// 同一对象被别的编辑确认后引用也变化，旧手势草稿不能覆盖新确认数据。
// 这像给草稿写上订单编号和原版本，只有仍对应同一张订单时才拿来预览。
// 候选只存在页面hook状态，React刷新画面不等于已经提交工程或保存文件。
// 轨道锁定会让value忽略候选，画布组件随后取消指针捕获，避免旧手势迟到松手。
// 主题切换不改片段引用，因而普通浅深切换不会丢掉确认构图。
// 预览尺寸变化不参与defaultTransform，窗口改变后X/Y数值不重新计算。
// 属性的临时字符串仍由EditorFloatField拥有，候选层只接收已经解析的数值。
// 非法字符串不会进入这里，模型仍保留有限数和范围复核作为最后门槛。
// 构图拖动不维护第二份工程时间，松手后仅替换某条片段的transform对象。
// 没有选择素材的回调，所以画布点击不能覆盖素材列表当前高亮。
// 没有seek回调，所以画布选择和构图不会把节目书签跳回片段起点。
// 与时间线选片段不同，画布选中对象是就地选中，当前正在看的帧保持不变。
// 如果节目当前是黑场，活动层为空，不会构造可编辑画面。
// 音轨不进入节目画面栈，不能为音轨创建可移动视频选框。
// 候选记录只保存小对象，拖动不会复制封面Base64或视频字节。
// 值对象用展开生成，不能将指针变化原地写进clip.transform。
// 这样取消只移除draft，不需要记住一串反向修改来恢复原构图。
export function useClipTransform(timeline: TransformSession, project: EditorPreviewProject) {
  const [draft, setDraft] = useState<TransformDraft | null>(null);
  const locked = (clip: LiveTimelineClip) => timeline.lockedTracks.includes(clip.track);
  const value = (clip: LiveTimelineClip): ClipTransform => draft?.original === clip && !locked(clip) && timeline.selectedClip?.id === clip.id ? draft.value : evaluateTransform(clip.transform ?? defaultTransform(project), clip.keyframes, Math.max(0, (timeline.currentTime - clip.start) * project.fps));
// 字段提交会明确结束旧候选，防止用户先拖一半再输入X时旧候选还盖住新确认值。
// 字段名来自共用PropertyKey集合，先缩窄到TransformKey才能构造片段补丁。
// 速度走独立时间映射；音量和淡入淡出不会被当成构图字段写入。
// 这里不把超范围数强行夹到边界，字段负责就地错误，模型负责拒绝非法确认。
// 使用当前selectedClip，让属性目标不被节目书签浏览偷换。
// 若对象已经取消选中，回调只清候选，不默认修改另一份片段。
// 锁定是否允许写入由timeline.transform最终复核，不只依赖此刻输入框是否disabled。
// 构图与倍速从同一个字段回调分流，但进入不同业务校验。
// speed不是ClipTransform的一部分，不能为了方便把它混进坐标对象。
// 时间线speed命令会检查碰撞，坐标命令只检查画面范围与轨道锁。
// 两种命令都按当前selectedClip绑定，素材查看不改变属性的工程目标。
// 清掉旧画布草稿以后再确认数值，避免屏上仍显示拖动一半的候选。
// 返回确认值从工程重新读取，失败的速度请求不会停留为假成功显示。
// 数值框草稿source与确认value不同就显示原值，状态条保留业务拒绝原因。
// 音频字段不在构图键集合，不能从这个入口获得画面坐标。
  function commitField(key: PropertyKey, number: number) {
    const clip = timeline.selectedClip;
    setDraft(null);
    if (clip && key === "speed") timeline.speed(clip.id, number);
    if (clip && isTransformKey(key)) timeline.transform(clip.id, { [key]: number });
  }
// 重置按当前组的字段键生成补丁，不把变换重置扩大成所有效果参数清零。
// 基础适配由项目决定，因此重置不是把位置设到源宽高的一半。
// scale恢复100时仍保持contain定义，不会变成按源像素一比一显示。
// 旋转与透明度回到零/一百，X/Y回项目中心，这是一组可预测的无额外构图。
// 组内尚未确认的字符串草稿由InspectorSection的epoch重建清理，业务层只处理确认值。
// 音频的组没有五个构图键，所以不会通过重置意外得到一份视频变换对象。
// 对锁定组的重置同样会被模型拒绝，不因为这是默认值就绕过锁。
// 重置播放速度需要重新计算时长，所以不能只把输入框写成1。
// 如果恢复1倍速会撞上同轨邻居，命令同样可以拒绝并保持原安排。
// 速度组与构图组分开，重置一组不能悄悄影响另一组。
// 构图默认值由项目像素定义，预览窗口大小变化不能改变重置中心。
// 锁轨后的重置仍走工程复核，不因目标是默认值而获得例外权限。
// 被复制片段按自己的id重置，不能把同源所有副本一并重置。
  function reset(keys: PropertyKey[]) {
    const clip = timeline.selectedClip;
    setDraft(null);
    if (!clip) return;
    if (keys.includes("speed")) { timeline.speed(clip.id, 1); return; }
    timeline.resetTransform(clip.id, resetTransform(keys, project));
  }
// 每个CanvasEdit绑定具体实例，不能用最近拖过的assetId找到所有同源记录一起改。
// preview(null)用于结束草稿，不等于把片段删除，也不取消素材列表的选中。
// 画布点击只通知selectCanvas，不重新调用时间线select造成不必要的媒体seek。
// 指针候选保留完整五个值，移动X/Y时缩放、旋转和不透明度不丢失。
// 最终commit仍调用与字段相同的timeline.transform，因此范围、锁和数值精度一致。
// 选框是否选中是展示信息，绝不用于决定视频轨谁盖住谁。
  function canvas(clip: LiveTimelineClip): CanvasEdit {
    return { value: value(clip), selected: timeline.selectedClip?.id === clip.id, locked: locked(clip), select: () => timeline.selectCanvas(clip.id), preview: candidate => setDraft(candidate ? { original: clip, value: candidate } : null), commit: candidate => timeline.transform(clip.id, candidate) };
  }
  return { value: (clip: LiveTimelineClip) => ({ ...value(clip), speed: clip.speed ?? 1 }), canvas, commitField, reset, editable: timeline.selectedClip && !timeline.selectedClip.audioOnly && !locked(timeline.selectedClip) ? [...TRANSFORM_KEYS, "speed" as const] : [], locked: !!timeline.selectedClip && locked(timeline.selectedClip) };
}

// 重置构图只组装当前组允许的字段，速度重置由独立时间映射命令负责。
// 默认值按项目中心生成，不能取源分辨率中心或拿播放器屏幕尺寸代替。
function resetTransform(keys: PropertyKey[], project: EditorPreviewProject) {
  const defaults = defaultTransform(project), patch: Partial<ClipTransform> = {};
  for (const key of keys) if (isTransformKey(key)) patch[key] = defaults[key];
  return patch;
}
