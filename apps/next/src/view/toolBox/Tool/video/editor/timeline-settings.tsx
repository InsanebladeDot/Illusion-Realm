"use client";

/** 工程内轨道设置复用现有分组与数字字段；降低上限不删除已存在轨道。 */
import { Settings2 } from "lucide-react";
import { useRef, useState } from "react";
import { ContextMenuShell } from "@/components/context-menu-shell";
import { useTranslation } from "@/i18n";
import { EditorAction, EditorFloatField, EditorGroup } from "./editor-controls";
import { isVideoTrack, type TrackId, type TrackLimits } from "./timeline-track-model";
import styles from "./editor.module.css";

// 轨道设置嵌在原时间轴工具区，仍使用EditorAction、EditorGroup和EditorFloatField。
// 不为两个数字另写按钮、折叠动画或输入校验器，后续字段样式同步生效。
// open仅表示设置面板是否展开，不改变实际轨道、片段选择或节目播放头。
// 视频和音轨上限由父工程分别注入，这个组件不持有第二份limits草稿。
// 原数值字段仍允许未完成字符串，Enter或失焦才调用onChange。
// 整数精度禁止把2.5条轨道写进正式设置，拖数也按整数步进。
// 最小值不能小于现有同类轨道数，降低上限不会悄悄删除已有工程内容。
// 空同类集合最少允许一条，避免把素材入轨能力永久关掉。
// 最大二十条是本次编辑器保护界限，不宣称来自Premiere的固定上限。
// 默认五条由工程初始化提供，面板不会每次展开都重置用户改过的数字。
// 改video时展开旧limits保留audio，反方向同样保留video，防止两个设置互相覆盖。
// 上限只控制后续新建，已经存在的轨道在折叠或重新展开后仍然保留。
// 说明明确“本次会话”，不能让用户误以为已经保存到设置文件或项目工程。
// 现在未接工程保存，不额外建立localStorage或另一个JSON文件来记这一项。
// 展开时才挂载字段，收起内容不会保留不可见的Tab焦点入口。
// 组内的可折叠状态属于这一实例，A/B样板或另一编辑器不会跟着一起展开。
// 标题、字段名和范围说明使用同一toolBox命名空间，已同步中英文。
// 标签说明区不以颜色传达上限错误，非法输入由公共字段就地反馈。
// 显示轨道数以类型判定，不按当前位置或音轨是否有片段判断。
// 分离音轨自动新增也消耗同一个audio名额，不能绕过这里设定的数量。
// 设置变化不会重建媒体节点，因此调大轨道上限不应中断正在看的源视频。
// 点击关闭设置不触发任何“成功”提示，它只关闭一个纯UI面板。
// 设置浮层复用公共定位容器，工具栏横滚不会裁掉数字字段；关闭回到原图标。
// 数字范围与正式提交校验分层，界面限制不是后续命令可以省略验证的理由。
// 已有轨道数是调整下限而非已有片段数，空V2仍占一个视频轨名额。
// 同一轨道可容纳多段不重叠安排，所以不能把模型素材数误当轨道数。
// 音轨A1/A2默认已存在，下限因此是二，不能在保留两条轨道时确认一条上限。
// 视频默认只有V1，初始可以调低到一，随后向下拖动不再出现V2候选。
// 提高到六也不会立刻铺出六行，候选仍只在拖动中按需出现一条。
// 数字提示只说明允许创建多少，不代表已经检测机器可流畅播放这么多解码器。
// 五条默认是本产品约定，不引用Adobe作为这个数字的来源。
// 若要持久化这份设置，应以后接现有用户文档，不能在此偷偷新增存储文件。
// onChange只接收TrackLimits，不暴露clips的任意写入给设置面板。
// 父层保持自己的锁表，改上限不会自动解锁任何轨道。
// 关闭分组与关闭整个设置是两个局部UI动作，均不回滚已确认的上限。
// 没有确认成功toast，数值改变与后续候选出现就是可验证的真实反馈。
export function TimelineSettings({ tracks, limits, onChange }: { tracks: readonly TrackId[]; limits: TrackLimits; onChange: (limits: TrackLimits) => void }) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null), { t } = useTranslation();
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => { setPoint(null); trigger.current?.focus(); };
  const toggle = () => {
    if (point) return close();
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) setPoint({ x: rect.left, y: rect.bottom + 4 });
  };
  return <div className={styles.trackSettings} data-track-settings onPointerDown={event => event.stopPropagation()}>
    <EditorAction appearance="plain" compact icon={Settings2} label={t("toolBox.editorUi.trackSettings")} buttonRef={trigger} expanded={!!point} onClick={toggle} />
    {point && <ContextMenuShell x={point.x} y={point.y} label={t("toolBox.editorUi.trackSettings")} onClose={close} className="w-72"><div data-track-settings><EditorGroup title={t("toolBox.editorUi.trackLimits")}>
      {/* 工程设置：只改变可新增数量，不移动片段、不删除轨道、不暗示保存落盘。 */}
      <p>{t("toolBox.editorUi.trackLimitsHint")}</p>
      <EditorFloatField label={t("toolBox.editorUi.videoTrackLimit")} value={limits.video} precision={0} min={Math.max(1, tracks.filter(isVideoTrack).length)} max={20} onCommit={video => onChange({ ...limits, video })} scrub />
      <EditorFloatField label={t("toolBox.editorUi.audioTrackLimit")} value={limits.audio} precision={0} min={Math.max(1, tracks.filter(track => !isVideoTrack(track)).length)} max={20} onCommit={audio => onChange({ ...limits, audio })} scrub />
    </EditorGroup></div></ContextMenuShell>}
  </div>;
}
