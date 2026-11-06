"use client";

// 属性外壳、分组和数值字段是正式工作区与样板的同一实现。
// 这里组合展示模型，媒体效果、工程提交与持久化均由外部决定。
import { Diamond, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useTranslation, t } from "@/i18n";
import { EditorAction, EditorFloatField, EditorGroup, EditorPlaceholder } from "./editor-controls";
import type { EditorMediaAsset, EditorPreviewProject } from "./editor-panels";
import { DEMO_ASSETS, DEMO_CLIPS, DEMO_PROJECT } from "./editor-demo";
import { inspectorFields, propertyGroup, propertyValue, type InspectorTarget, type PropertyField, type PropertyKey } from "./editor-property-model";
import styles from "./editor.module.css";
import { TRANSFORM_KEYS, type TransformKey } from "./clip-transform-model";

// 检查器像一张按对象类型裁剪的表单，不是素材浏览器的第二个详情页。
// 外层决定当前选择有哪些片段，内层只组合这些目标能共同使用的字段。
// 视频、图片和音频共用同一组外观，不代表它们的效果处理流程已经共用。
// 正式页按构图能力清单提供回调，独立样板继续演示其他字段的草稿行为。
// 展示默认值时同时说明来源，避免用户把100%误读成已读到真实工程效果。
// 素材库高亮与这里的targets没有绑定，浏览素材不会抢走属性目标。
// 多选目标必须有各自身份，不能把相同文件名当成同一个片段去重。
// 内容滚动归propertyBody，标题、选中名称和来源说明保留在外侧。
// 空选择仍保留R04外壳，紧凑面板打开时不会因为没有字段而高度塌陷。
// 这里不查文件、不读取浏览器视频尺寸，也不推断当前画面有没有成功解码。
// 探测事实已经在asset里，效果默认值则由property-model根据项目决定。
// 这两个来源分开，可以在媒体坏掉时仍保留可理解的选择与项目参数。

// 兼容 asset/clipId 的旧调用处仍显式适配成目标，不再解析固定显示字符串。
// 新调用处传 targets，空数组明确表示无选择，不能回落到演示片段。
// 提交与重置都只通知意图，真实效果未接通时不传回调，字段自动禁用。
interface InspectorProps {
  asset?: EditorMediaAsset | null; clipId?: string; targets?: readonly InspectorTarget[];
  project?: EditorPreviewProject;
  editableKeys?: readonly PropertyKey[]; locked?: boolean; live?: boolean;
  onCommit?: (key: PropertyKey, value: number) => void;
  onReset?: (keys: PropertyKey[]) => void;
  currentFrame?: number | null; onToggleKeyframe?: (key: TransformKey, frame: number, value: number) => void;
}

// targets显式传空数组时优先级高于兼容asset，不能用length判断后退回样例。
// 旧样板还用asset/clipId传单个目标，所以兼容入口在本文件统一适配。
// 正式宿主始终传targets与project，不依赖DEMO默认参数。
// onCommit只传字段键与有限数，不能接收任意数组来改时间线安排。
// onReset接一组当前可见字段，音频重置不会顺便重置画面位置。
// 调用者拥有目标集合，回调不再传文件名来要求它做模糊查找。
// 没有工程保存回调，也没有“应用成功”通知槽，避免表单样板冒充真实效果。
// 这里的可选回调表示明确能力，不应传空函数只为了把disabled去掉。
// 标签映射沿用功能域词条，X/Y明确写出项目像素方向，避免合成一个不可编辑字符串。
// 普通模块的 t 在渲染时调用，语言切换后不会保留模块加载时的旧文字。
const LABELS = { scale: "scale", x: "positionX", y: "positionY", rotation: "rotation", opacity: "opacity", speed: "speed", volume: "volume", fadeIn: "fadeIn", fadeOut: "fadeOut", duration: "duration" } as const;

// 标签表只做字段键到翻译键的映射，范围和精度不在这里重新定义。
// 这样切到英文仍提交同一个scale，而不是把“Scale”文字作为业务字段名。
// 标题和单位分别传给公共字段，数字草稿不需要解析带px的输入文本。
// positionX和positionY是两个独立字段，错误可以准确标到其中一个方向。
// 原来合并成“960,540”的字符串无法独立提交，也无法表达单方向混合值。
// 保留原功能域词条，语言集合继续由项目i18n决定，不新增编辑器专用Context。

// 同一个淡入淡出组同时服务视频与音频，回调绑定的是当前选中目标集合。
// key由选择ID和字段键构成，换对象不会保留前一片段的未提交草稿。
// 分组折叠仍交给 EditorGroup，A/B不共享展开值或字段错误。
// 重置按钮只在有真实样板回调时启用，不用空函数冒充正式效果重置。
// 速度字段继续使用同一数值输入，不另建只有视频可用的第二套草稿逻辑。
// 字段单位和精度由PropertyField配置，当前速度显示两位小数与×单位。
// 范围只在最终确认时校验，用户先输入0仍可继续组成0.5。
// Enter或失焦提交，Escape恢复确认值，不把输入中间态写进片段时长。
// 锁轨让速度、构图与组重置同时禁用，不能让其中一个入口留下旁路。
// 速度组重置通过工程命令恢复1倍，碰撞失败仍保留已确认倍速。
// 淡入淡出继续只读，不能因为组内出现可编辑速度就误开放所有属性。
// 选择不同片段会重建字段草稿，不把上一实例输入到一半的速度带过去。
// 读取实际values后显示确认速度，默认1仅用于没有显式speed的旧片段。
// 业务失败的状态条与非法数值的字段错误属于两个不同边界，不混报成功。
function InspectorSection({ fields, targets, project, onCommit, onReset, editableKeys, locked, currentFrame, onToggleKeyframe }: { editableKeys?: readonly PropertyKey[]; locked?: boolean; fields: PropertyField[]; targets: readonly InspectorTarget[]; project: EditorPreviewProject; onCommit?: InspectorProps["onCommit"]; onReset?: InspectorProps["onReset"]; currentFrame?: number | null; onToggleKeyframe?: InspectorProps["onToggleKeyframe"] }) {
  // 本分组只接非空fields，外层按有效字段的组名生成它，fields[0]因而有来源。
  // 单个分组共享一次重置意图，重置按钮与折叠按钮是兄弟，不嵌套button。
  // 字段key包含目标身份集合，换片段时销毁旧草稿，不把旧输入带到新对象。
  // 顺序也纳入key，因为代表值依赖首目标；改顺序时旧混合草稿不能继续代表原集合。
  // epoch只处理显式重置，不因每次render变化，普通打字不会反复卸载输入。
  // 如果确认值本来是默认值，外层回填相同数字并不足以清掉本地错误草稿。
  // 所以重置后让字段重新初始化，但不更换EditorGroup，展开状态仍保留。
  // 例如缩放确认100时输入abc，再点重置，必须回到100.00而不是继续保留abc。
  // 多选重置逐个目标使用默认值，字段再重新比较是否仍为混合。
  // 分组回调只收到本组字段，不能无意重置用户在另一个分组改好的样板值。
  // 正式页没有onReset，按钮原生禁用，epoch不可能被用户绕过业务边界更新。
  // reason和字段禁用说明来自同一词条，鼠标提示与读屏原因保持一致。
  // onCommit存在时逐字段注入目标明确的函数，公共输入无需认识片段列表。
  // propertyValue对每个字段独立计算mixed，不能因缩放不同让所有字段都显示横线。
  const group = propertyGroup(fields[0].key), reason = t(locked ? "toolBox.editorUi.trackLocked" : "toolBox.editorUi.effectUnavailable");
  const canEdit = (key: PropertyKey) => !locked && (!editableKeys || editableKeys.includes(key));
  const resetEnabled = !!onReset && fields.some(field => canEdit(field.key));
  // 重置既还原确认值，也丢弃本组未确认草稿；默认值没变时仍需一次新的输入生命周期。
  // 只更新字段的key，分组自身不卸载，用户的折叠选择不会因此复原。
  const [epoch, setEpoch] = useState(0);
  // 重置按钮被点击前，浏览器可能先触发字段blur；非法草稿仍会保留错误。
  // 随后reset意图重建字段，错误与草稿才一起被丢弃，不依赖blur校验成功。
  // 如果只setError(false)，非法文本还在，下一次失焦又会重复报错。
  // 如果把整个EditorGroup重新key掉，用户刚收起的组又会被强制打开。
  // 当前只重建组内字段，避免把数值恢复和面板展开混成一份状态。
  // epoch不进入values或项目文档，它是表单生命周期标记，不是媒体参数版本。
  // 目标集合的key与epoch组合，重置后再切对象也不会复用前一目标草稿。
  // 淡入和淡出在同一组，重置本组会同时恢复两者，其他组仍保留。
  // 多选类型交集变化由外层重组fields，不能对已消失字段继续调用重置回调。
  // 正式组还需通过能力和锁校验，不能只因onReset存在就显示可用重置。
  function reset() { onReset?.(fields.map(field => field.key)); setEpoch(value => value + 1); }
  return <EditorGroup title={t(`toolBox.editorUi.${group}`)} action={<EditorAction icon={RotateCcw} label={t("toolBox.editorUi.reset")} compact onClick={resetEnabled ? reset : undefined} disabledReason={!resetEnabled ? reason : undefined} />}>
    {/* 属性组仍通过fields配置渲染同一EditorFloatField，拖值不是X/Y专属控件。 */}
    {/* canEdit先按实际能力和锁定裁剪回调，未接速度效果的输入继续disabled。 */}
    {/* 每个字段key包含目标ID与重置epoch，切换对象和重置会丢弃旧字符串草稿。 */}
    {/* scrub仅把纯UI拖值能力交给公共字段，正式写入仍回调当前组的onCommit。 */}
    {/* focusTone明确使用细线，样板和正式工程不会因不同调用方产生粗细分叉。 */}
    {fields.map(({ key, ...field }) => <InspectorField key={`${targets.map(target => target.id).join("|")}:${key}:${epoch}`} field={{ key, ...field }} targets={targets} project={project} onCommit={onCommit} canEdit={canEdit(key)} disabledReason={reason} currentFrame={currentFrame} onToggleKeyframe={onToggleKeyframe} />)}
  </EditorGroup>;
}

// 菱形和数值框并排属于同一属性行；未定位到该片段时只显示空心状态。
// 点击只切换当前字段当前帧的标记，插值规则由纯构图模型统一负责。
function InspectorField({ field, targets, project, onCommit, canEdit, disabledReason, currentFrame, onToggleKeyframe }: { field: PropertyField; targets: readonly InspectorTarget[]; project: EditorPreviewProject; onCommit?: InspectorProps["onCommit"]; canEdit: boolean; disabledReason: string; currentFrame?: number | null; onToggleKeyframe?: InspectorProps["onToggleKeyframe"] }) {
  const { t } = useTranslation(), value = propertyValue(targets, project, field.key);
  const key = TRANSFORM_KEYS.find(item => item === field.key), points = key ? targets[0]?.keyframes?.[key] ?? [] : [];
  const active = currentFrame != null && points.some(point => point.frame === currentFrame);
  const frameEnabled = targets.length === 1 && !!key && canEdit && currentFrame != null && !!onToggleKeyframe;
  const numberField = <EditorFloatField scrub focusTone="subtle" {...field} {...value} label={t(`toolBox.editorUi.${LABELS[field.key]}`)} disabledReason={disabledReason} onCommit={onCommit && canEdit ? number => onCommit(field.key, number) : undefined} />;
  if (!key || !onToggleKeyframe) return numberField;
  return <div className={styles.keyframeField} data-property-key={key}>{numberField}<EditorAction icon={Diamond} label={t(active ? "toolBox.editorUi.keyframeRemove" : "toolBox.editorUi.keyframeAdd")} compact pressed={active} disabledReason={!frameEnabled ? t("toolBox.editorUi.keyframeUnavailable") : undefined} onClick={frameEnabled ? () => onToggleKeyframe(key, currentFrame, value.value) : undefined} /></div>;
}

// 无选中展示项目事实，不能继续显示scene_02或上一个对象的默认效果参数。
// 分辨率/帧率来自项目，项目时长来自片段最晚结束点，不对素材库时长求和。
// 只读文字不是可编辑输入，避免给项目设置开一个尚未接通的提交入口。
function ProjectProperties({ project }: { project: EditorPreviewProject }) {
  // 项目事实是只读dl，不能将其包装成无回调但看似可调的数值字段。
  // 分辨率决定将来变换的坐标单位，不是当前节目画布的屏幕尺寸。
  // fps取工程时间模型，不因用户最后浏览了24fps素材而自动变成24。
  // 总时长从宿主project传入，删除末段后的缩短应随参数更新展示。
  // 空选择不意味着空工程，因此项目时长可能仍大于零。
  // “未选片段”的提示与“没有共同字段”分开，避免用户误以为工程丢了素材。
  // 数字格式仅影响读取，不提供保存、重新探测或项目设置修改能力。
  // 组件没有缓存上一个片段，因此空态不会残留scene_02的文件名。
  const { t } = useTranslation();
  return <><EditorPlaceholder state="empty" message={t("toolBox.editorUi.noClipSelected")} /><dl className={styles.projectFacts}><dt>{t("toolBox.editorUi.projectParameters")}</dt><dd>{project.width} × {project.height}</dd><dt>{t("toolBox.editorUi.frameRate")}</dt><dd>{project.fps}fps</dd><dt>{t("toolBox.editorUi.duration")}</dt><dd>{project.duration.toFixed(2)}s</dd></dl></>;
}

// 外壳保留 R04 与稳定片段标记，素材选择不能通过传入素材高亮改变属性目标。
// 文件名不承担身份，两个同源实例在目标数组里仍有不同的id。
// 多选只展示类型交集；没有共同字段就明确提示，不随机借用第一项全部属性。
// 正式片段没有覆盖值时提示默认来源，样板有values时说明其只是独立确认值。
// 头部不再依赖可能破损的封面，缺图不会把属性名挤到错误位置。
// editableKeys是已接通的效果清单，live只是说明文字，不能充当写入权限。
// 正式传入五个构图键，样板不传清单时保留原有演示编辑能力。
// 这使同一个FloatField仍能验证速度草稿，而正式速度字段保持只读。
// locked在组级别合并权限，不能仅让画布拒绝拖动而数字仍能修改。
// 组重置以该组至少一个有效可编辑字段为前提，不按onReset存在与否直接启用。
// 音频类型由inspectorFields排除构图组，不用CSS把视频字段藏起来。
// 分离音轨的源素材虽然仍是视频文件，宿主传入的类型已经适配为audio。
// 因此是否显示X/Y由安排通道决定，不由文件扩展名决定。
// 默认中心来自project，正式确认值来自target.values，两者不能互换。
// 多选的混合值继续由原propertyValue计算，不能拿首项确认值盖住混合状态。
// 输入控件持有字符串草稿，检查器只向外回报合法数值。
// Enter和失焦复用同一个字段提交机制，未输入完整的负号不会写工程。
// 字段错误在控件旁显示，不用全局通知打断连续调整。
// Escape恢复当前确认值；画布手势的Escape则由活跃捕获优先处理。
// 重置epoch仍只重建本组字段，另一组草稿不会因构图重置被清空。
// 切换目标集合改变字段key，上一片段未提交的文字不能带到下一片段。
// 主题切换不改变目标key，所以不会无故丢失正在编辑的草稿。
// 无目标时显示工程尺寸和时长，不把默认中心伪装成已选片段属性。
// 错误回调和保存能力没有加入这个展示组件，工程写入仍由宿主命令负责。
// 选择、字段草稿、展开状态分别拥有生命周期，共用外壳不等于共用状态。
export function ClipInspector({ asset = DEMO_ASSETS[1], clipId, targets, project = DEMO_PROJECT, onCommit, onReset, editableKeys, locked, live = false, currentFrame, onToggleKeyframe }: InspectorProps) {
  // 选择集合每次由参数构造，组件不维护第二份selectedId来和时间线竞争。
  // undefined表示旧调用接口，[]表示明确无选择，两者必须区别对待。
  // group集合来自交集结果，用Set去重保持首出现顺序，不按翻译标题排序。
  // 共有变换仍是一组，视频与图片不各生成一份重复的X/Y字段。
  // 单选标题显示原文件名，多选显示数量，不伪装成第一项就是全部目标。
  // 长名称通过title保留全名，视觉省略不会更改对象身份。
  // data-editor-inspector-clip保留首项标记供现有回归观察，数量另有count表达。
  // 这份标记不是写入接口，自动化仍须通过公开操作检查实际显示结果。
  // 有目标但交集为空时，仍显示选择数量与说明，让用户理解为什么没有输入框。
  // 没目标时直接显示项目事实，不先生成默认视频字段再靠CSS隐藏。
  // 正式来源说明区分构图已接通与速度等未接通；样板说明指出数值只属于演示。
  // 不通过按钮颜色判断是否为样板，能力来自是否注入回调。
  // 所有组共享同一字段实现，输入精度和错误规则修改后会同时作用于淡入与变换。
  // 组与字段状态却各归自己的React实例，A的折叠和错误不能传播到B。
  // 主动重置或切对象才更新字段身份，主题切换不会清掉当前草稿。
  // 正式构图由宿主传已确认值和字段能力，速度与淡入淡出不因有回调就自动开放。
  // 检查器只提交数值意图；画布变换在媒体适配层，保存和导出依旧独立。
  const { t } = useTranslation();
  const selected = targets ?? (asset ? [{ id: clipId ?? DEMO_CLIPS[1].id, asset, duration: asset.duration ?? 0 }] : []);
  const fields = inspectorFields(selected), groups = [...new Set(fields.map(field => propertyGroup(field.key)))];
  const name = selected.length > 1 ? t("toolBox.editorUi.selectedCount", { count: selected.length }) : selected[0]?.asset.name;
  return <aside data-editor-region="R04" data-editor-inspector-clip={selected[0]?.id} data-editor-inspector-count={selected.length} className={styles.inspector} aria-label={t("toolBox.editorUi.inspector")}><h2 className={styles.panelTitle}>{t("toolBox.editorUi.inspector")}</h2>
    {selected.length ? <><div className={styles.selectedClip}><strong title={name}>{name}</strong></div><p className={styles.propertyNotice}>{t(live ? "toolBox.editorUi.transformLive" : onCommit ? "toolBox.editorUi.propertySampleOnly" : "toolBox.editorUi.propertyDefaults")}</p><div className={styles.propertyBody}>
      {groups.map(group => <InspectorSection key={group} fields={fields.filter(field => propertyGroup(field.key) === group)} targets={selected} project={project} onCommit={onCommit} onReset={onReset} editableKeys={editableKeys} locked={locked} currentFrame={currentFrame} onToggleKeyframe={onToggleKeyframe} />)}
      {!fields.length && <EditorPlaceholder state="empty" message={t("toolBox.editorUi.noCommonProperties")} />}
    </div></> : <div className={styles.propertyBody}><ProjectProperties project={project} /></div>}
  </aside>;
}
