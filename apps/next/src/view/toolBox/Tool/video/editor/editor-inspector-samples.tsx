"use client";

// 独立属性样板：重复使用正式检查器，只有这里提供尚未接入媒体的编辑回调。
// 像练字纸和正式合同共用格式，练习数值不会被写入真实工程。
import { useState } from "react";
import { useTranslation } from "@/i18n";
import { ClipInspector } from "./editor-inspector";
import { EditorAction } from "./editor-controls";
import { DEMO_ASSETS, DEMO_PROJECT } from "./editor-demo";
import { propertyDefaults, type InspectorTarget, type PropertyKey, type PropertyValues } from "./editor-property-model";
import styles from "./editor.module.css";

// 样板入口是公开samples页的一部分，不是测试专用的任意状态注入后门。
// 所有数值操作经过正式字段的同一草稿、精度和范围校验。
// 样板只提供一个局部覆盖值存放处，便于验证确认后的显示和多选传播。
// 不调用FFmpeg、不改原文件、不把参数写入正式工程的片段对象。
// 因此截图可以证明属性UI交互，不能作为真实画面缩放或声音淡入的证明。
// 两列分别调用InspectorSample，各自创建state，不共用一个提升到父层的对象。
// DEMO_ASSETS本身只读使用，更新时产生新target和values，不原地改静态资源。
// B可以作为A修改的反证，而不是再画一张没有真实状态的对照图。
// 样板按钮负责提供选择条件，正式检查器仍负责判断哪些属性有效。
// 不在按钮处理中预先过滤字段，否则会掩盖检查器交集算法错误。

// 每个实例各有覆盖值和类型选择，不借用正式片段数组或全局选择store。
// 两项视频故意使用不同缩放，能够验证“混合”而不是重复同一个默认值。
// 图片安排长度取演示片段十秒，不把图片源不存在的duration编成探测时长。
function sampleTargets(): InspectorTarget[] {
  // sampleTargets作为useState惰性初始化器使用，打字重渲染不重新创建初始集合。
  // 否则每次确认数字都会把上一字段覆盖还原成初始值，无法测试多字段累积编辑。
  // index===1只控制预设的混合条件，不作为后续提交目标的业务身份。
  // 后续更新始终使用ids.includes，数组顺序不构成编辑哪个对象的依据。
  // 目标duration无单位字符串，数值字段统一在显示层附加秒单位。
  // 没有值的默认字段不提前写成字符串，mixed比较仍是数值比较。
  // 这里的id可以借用素材ID，因为样板每个素材只构造一个目标。
  // 正式工程同源多实例必须用片段ID，不能照搬这个一对一数据关系。
  // 第一视频缩放默认100，第二视频覆盖为80，故意构成一个可观察混合值。
  // 不把两项都设80再声称覆盖了混合提交，那样无法发现代表值跳过回调的错误。
  // 图片安排十秒，是演示工程中的展示长度，不是探测结果或图片元数据。
  // 音频和视频已有duration沿用原演示事实，不能按文件名字数捏造时长。
  // 每次实例初始化都返回新数组，A改values不会通过共享对象引用影响B。
  // 默认值仍由propertyDefaults读取，这里不复制960/540等项目中心常量。
  // 初始覆盖只用于明确测试条件，正式会话绝不引用本函数建立工程。
  return DEMO_ASSETS.map((asset, index) => ({ id: asset.id, asset, duration: asset.duration ?? 10, values: index === 1 ? { scale: 80 } : {} }));
}

// 更新只针对所选ID，未选对象的覆盖值与默认来源都保留。
// 重置逐个写入当前项目默认值，不填一个固定960，也不沿用别的目标安排长度。
// 这里没有保存、媒体处理或成功通知，状态随样板卸载释放。
function InspectorSample({ id }: { id: string }) {
  // targets是已经确认的样板状态，ids只是当前查看的目标集合。
  // 改选择不清除targets，因此切回原对象仍能读到之前确认的80。
  // 草稿属于字段组件，切对象时通过目标key释放，未确认文本不会变成覆盖值。
  // 当前selected从稳定ID过滤，不用按钮下标直接保存当前对象引用。
  // 对象更新后引用会变化，按ID重新查找才能拿到最新确认值。
  // A/B的id仅用于界面和回归作用域，不作为全局缓存键或跨实例数据仓库。
  const { t } = useTranslation();
  const [targets, setTargets] = useState(sampleTargets), [ids, setIds] = useState<string[]>([DEMO_ASSETS[0].id]);
  const selected = targets.filter(target => ids.includes(target.id));
  // ids保存多个稳定身份，targets更新后selected立即读到新的values。
  // 不把selected本身存为state，避免值更新后仍持有旧对象引用。
  // ids为空时selected真为空，兼容接口不会给样板补上默认scene_02。
  // 三类组合可能没有公共字段，仍将完整集合传下去，让外壳说明数量与空交集。
  // 组重置更新targets但不改ids，选择集合不会因为恢复数值而自动跳成单选。
  // targets和ids都属于当前InspectorSample，A的setTargets拿不到B的setter。
  // 这比在组件外保存一个“上次参数”对象更可靠，后者会在两列间串值。
  // 样板不订阅正式timeline，也不会以真实素材导入数量初始化演示选择。
  function commit(key: PropertyKey, value: number) {
    // 一次字段提交作用于当前全部选择，多选代表值相同也不能跳过其他对象。
    // 例如首项已是80、另一项100，输入80应把后者也更新到80。
    // 保留未选target的原引用，避免一次输入重置整个样板。
    // values用对象合并保留其他已经确认字段，改X不能把缩放清回默认。
    // 接口只收一个字段键，不接任意JSON对象来绕过字段范围。
    // value已通过公共输入的有限数字校验，这里不再进行不同的取整或夹限。
    // 不在提交后显示“效果生效”，因为当前没有真实媒体效果处理。
    // 切到别的类型后旧目标的确认值仍在，这属于样板内状态，不是项目保存。
    setTargets(current => current.map(target => ids.includes(target.id) ? { ...target, values: { ...target.values, [key]: value } } : target));
  }
  function reset(keys: PropertyKey[]) {
    // 每个选中对象单独计算默认值，尤其duration可能因对象安排长度而不同。
    // 不能只计算第一个对象的默认值，再给所有对象写同一时长。
    // 未选对象直接保留，因此A重置两个视频不会清掉图片已确认的参数。
    // keys来自当前分组，重置变换不会触碰淡入或音量。
    // 对部分覆盖保留其他键，避免重置一组等于清空整张属性表。
    // 这里明确写入默认数值，不声称执行了删除工程效果节点或重建视频文件。
    // 重置后字段局部草稿由InspectorSection的epoch重新初始化。
    // 即使默认值与旧确认值相等，也不会留下用户尚未确认的非法文本。
    setTargets(current => current.map(target => {
      if (!ids.includes(target.id)) return target;
      const values: Partial<PropertyValues> = { ...target.values }, defaults = propertyDefaults(target, DEMO_PROJECT);
      for (const key of keys) values[key] = defaults[key];
      return { ...target, values };
    }));
  }
  return <section data-inspector-sample={id} className={`${styles.sampleInstance} ${styles.inspectorSample}`}><h2>{t("toolBox.editorUi.inspectorSamples")} {id}</h2><div className={styles.sampleActions}>
    {/* 单个目标按钮只变更样板选择；正式页不会显示这些演示选择器。 */}
    {/* pressed只用于单选，不能把多选中的第一个按钮误标成唯一选中目标。 */}
    {targets.map(target => <EditorAction key={target.id} label={target.asset.name} pressed={ids.length === 1 && ids[0] === target.id} onClick={() => setIds([target.id])} />)}
    <EditorAction label={t("toolBox.editorUi.noneSelected")} onClick={() => setIds([])} /><EditorAction label={t("toolBox.editorUi.mixedSelection")} onClick={() => setIds(targets.slice(0, 2).map(target => target.id))} />
    {/* 混合类型直接给同一个检查器传目标交集，不另造多选专用表单。 */}
    {/* 索引只描述此处固定演示组合，真正传给检查器的仍是稳定目标ID。 */}
    {/* 视频加图片检验共同变换，视频加音频检验共同淡入淡出。 */}
    {/* 图片加音频和三类组合检验空交集，不把第一项字段当成多选字段。 */}
    {/* 组合标签使用现有类型翻译，加入英文后无需再维护一套组合词条。 */}
    {/* 控件允许自然换行，样板窄列不会把按钮缩成难以点击的小块。 */}
    {([[0, 2], [0, 3], [2, 3], [0, 2, 3]] as const).map(indices => <span key={indices.join("-")} data-inspector-selection={indices.join("-")}><EditorAction label={indices.map(index => t(`toolBox.editorUi.${targets[index].asset.kind}`)).join(" + ")} onClick={() => setIds(indices.map(index => targets[index].id))} /></span>)}
  </div><ClipInspector targets={selected} project={DEMO_PROJECT} onCommit={commit} onReset={reset} /></section>;
}

// A/B共用组件但分别执行hook；操作A不应改变B的值、草稿、错误或折叠状态。
// 样板放在已有samples入口，正式工作区不会出现练习用类型切换按钮。
export function EditorInspectorSamples() {
  // 两实例并排只是样板布局；窄容器可变成纵向，不改变两份状态生命周期。
  // 无论排列方向如何，data-inspector-sample身份不变，断言不会因排序读错列。
  // 相同静态封面可共享资源地址，但确认值与展开状态不能共享。
  // 本入口不产生播放器，因此更改位置只显示确认数字，不伪造画布跟随效果。
  // 若未来真实效果接入，样板仍保留为表单状态回归，不能替代实机媒体验证。
  // 父层只排版两个实例，不持有共享选择或共享reset计数。
  // 对两个实例使用同一组件，才能发现公共字段修改是否导致状态互相污染。
  // B不会订阅A的提交回调；测试必须分别读取两列确认值而非只看按钮变色。
  // 样板卸载后局部状态自然释放，返回正式工作区不会带入练习值。
  // 不读取用户素材或已有工程，回归可反复运行且不会改动本地作品。
  return <div className={styles.sampleGrid}><InspectorSample id="A" /><InspectorSample id="B" /></div>;
}
