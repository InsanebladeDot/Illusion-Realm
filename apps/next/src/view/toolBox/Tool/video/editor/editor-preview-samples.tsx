"use client";

// UI-04 的独立节目样板复用同一个 ProgramPreview，不创建另一套预览容器。
// 场景只注入确定的演示参数，不读取文件或模拟媒体请求成功。
// 两个样板如同两台独立监看器，接同一份节目单仍各自选择查看哪一条。
// 对应机制是每个实例分别执行 hooks，片段 ID 和素材 ID 分开保存。
// 预览通过片段 assetId 查封面，素材高亮不参与这个查找。
// 控制区明确处于样板页，默认编辑器不出现场景开关。
// 加载、黑场和失败使用固定参数，不开计时器把等待推成成功。
// 原 UI-02 与 UI-03 样板保持原样，此文件只增加节目区验收入口。
import { useState } from "react";
import { useTranslation } from "@/i18n";
import { EditorAction } from "./editor-controls";
import { DEMO_ASSETS, DEMO_CLIPS, DEMO_PROJECT } from "./editor-demo";
import { MediaItem, ProgramPreview } from "./editor-panels";
import styles from "./editor.module.css";

// 场景名称映射到双语标签，不把内部状态字符串直接呈现给用户。
// ready 是静态封面，不能称为视频播放中或当前真实解码帧。
// missing 使用失联的 assetId，实际验证片段引用而不只手工传占位。
// broken 则给已有素材一个无法解码的封面，用于真实 onError 回落。
// 两种缺图来源分开，避免只验一种路径就声称完整覆盖缺失处理。
// empty 清除传入片段，不清除素材行高亮，能检查两类选择的独立性。
// long 只替换当前引用素材的名称，不改片段 ID 或封面。
// source 查看形态通过另一按钮切换，不混进状态联合。
// 这样 source 返回时能保留当前场景与所选片段。
// 状态样板无需网络访问，损坏地址只有固定坏字节。
// 场景列表保持固定顺序，测试按稳定 data 标记定位而不解析文案。
// 没有登记虚假的重试动作，恢复 ready 是用户显式切换演示场景。
const SCENARIOS = { ready: "previewReady", empty: "previewEmpty", loading: "loading", missing: "missing", error: "error", black: "previewBlack", broken: "previewBroken", long: "previewLong" } as const;
// 构建时固定坏图不依赖服务器 404，浏览器必须实际触发解码错误。
// 宽高描述仅满足静态图片展示契约，不伪造有效像素内容。
// 不使用用户文件路径，不把错误处理变成任意磁盘读取入口。
// 地址相同并不共用错误 state，ProgramPreview 每个实例自行记忆失败来源。
// 切回正常素材地址应恢复画面，而不是把整个实例永久标坏。
const BROKEN_COVER = { src: "data:image/webp;base64,YnJva2Vu", width: 1, height: 1 };

// 样板持有片段和素材两份 ID，任何一类操作都只更改自己的值。
// 片段按钮传引用 ID，不传文件名，改显示名称后仍可找到同一素材。
// 选片段只改变预览参数，不创建或删除 DEMO_CLIPS 中的记录。
// 当前工程时间从片段开始加两秒得到确定静态点，不运行真实时钟。
// source 模式将同一点映射成局部时间，返回节目后仍显示工程时间。
// 默认 clip-02 保留 12 秒与原图一致，音频/图片分别显示自己的静态状态。
// 音频片段不画假视频封面，ProgramPreview 会说明没有画面且播放未接通。
// 空场景保留素材区高亮，不能通过清空所有状态掩盖两者混用的问题。
// 缺引用场景使用未知 assetId，公共映射必须显示缺失而非第一个可用素材。
// 只在 broken 和 long 创建对象副本，原始共享数组不可修改。
// 损坏封面只替换当前片段引用的素材，不影响其他资源或另一个实例。
// 一个实例切场景时不改变另一个实例的模式、选择或图片失败记忆。
// 预览不依赖样板的片段按钮实现，正式宿主也注入同一份接口。
// 片段列表使用 EditorAction，沿用主题、焦点和 pressed 的公共外观。
// 素材列表使用 MediaItem，不手写另一套封面、长名省略或高亮边框。
// 下方素材行只负责样板高亮，未给它们传播放或时间线写入回调。
// 不创建工程 store，演示选择离开路由自然释放，也不写用户文档。
// mode 只属于查看状态，不给项目添加第二条输出或隐藏解码播放器。
// source 返回按钮使用明确回调，返回不会导航到其他应用页面。
// 标题的 A/B 只用于辨认实例，不能作为素材或片段的业务身份。
// 控件分组名称区分片段选择与预览状态，避免两组按钮被辅助阅读混淆。
// 五个片段共用同一个查找路径，测试应覆盖视频、图片和音频三个类型。
// 切换片段不应自动选中相应素材，反向切素材也不更新片段 ID。
// 素材行保留前三个视觉素材以便对比，音频类型通过片段按钮直接覆盖。
// 长名称场景在 source 和 program 都使用同一份标题结构，不各写 CSS。
// 场景 state=ready 不保证图片可解码，broken 必须走实际图片错误事件。
// 显式 loading/error 不挂图片，避免上一片段封面短暂冒充新预览成功。
// 没有真实异步任务，组件卸载时没有计时器、请求或文件句柄需要释放。
// 真实媒体接入后的取消与解码超时属于后续业务，不能由样板固定状态证明。
function PreviewSample({ id }: { id: string }) {
  // 这四份状态分别代表片段、素材、故障样例和查看形态，不共用一个 selected。
  // 选择音频片段后素材行仍可高亮图片，正是两类选择独立的合法状态。
  // 空场景只传 null 给预览，底部素材选择不会为了配合空态被清除。
  // 从 source 返回只改变 source 布尔值，故障样例和片段 ID 均保留。
  // 选择片段的按钮标签从同一 DEMO_ASSETS 查名称，不另写同名字符串表。
  // 片段引用缺失时标签回落到 assetId，不能静默显示其他素材的名称。
  // long 场景替换的是显示名称，不使用超长名称作为 React key。
  // 因此切换该场景不会创建新素材身份或丢失原来的片段选择。
  // 切 broken 后再选别的片段，会给新的引用素材注入坏封面，场景语义保持一致。
  // 程序没有导入文件动作，所以所有素材数量与片段数量始终确定。
  // 样板可组合场景与媒体类型，例如音频 error 表示明确失败而非默认无画面。
  // 这些组合仍通过公共 ProgramPreview 的优先级处理，不在样板另写占位。
  const { t } = useTranslation();
  const [selectedClip, setSelectedClip] = useState<string>("clip-02");
  const [selectedAsset, setSelectedAsset] = useState("scene-02");
  const [scenario, setScenario] = useState<keyof typeof SCENARIOS>("ready");
  const [source, setSource] = useState(false);
  const clip = DEMO_CLIPS.find(item => item.id === selectedClip) ?? null;
  // B 使用竖屏 24fps，证明画布比例与帧率来自参数，而非写死为默认 16:9/30fps。
  // B 的静态时间多四分之一秒，帧尾应为 06；源封面仍 contain，不裁切成竖屏。
  // A 保留确认稿的横屏 30fps 与整数秒，默认工作区不受样板参数影响。
  const project = id === "B" ? { ...DEMO_PROJECT, width: 1080, height: 1920, fps: 24 } : DEMO_PROJECT;
  const assets = DEMO_ASSETS.map(asset => asset.id !== clip?.assetId ? asset : { ...asset, cover: scenario === "broken" ? BROKEN_COVER : asset.cover, name: scenario === "long" ? "scene_with_a_very_long_filename_1920x1080_spring_landscape_final_revision_2026_storyboard_reference_colour_corrected_preview_take_00000042.mp4" : asset.name });
  const state = scenario === "loading" || scenario === "error" || scenario === "black" ? scenario : "ready";
  return <section data-editor-preview-sample={id} className={`${styles.sampleInstance} ${styles.previewSample}`}>
    <h2>{t("toolBox.editorUi.program")} · {id}</h2>
    {/* 片段控制：这里只注入选中 ID，不编辑轨道、属性或源素材选择。 */}
    <div role="group" aria-label={t("toolBox.editorUi.previewClipChoice")} data-preview-clip-choices className={styles.sampleActions}>{DEMO_CLIPS.map(item => <EditorAction key={item.id} label={DEMO_ASSETS.find(asset => asset.id === item.assetId)?.name ?? item.assetId} pressed={selectedClip === item.id} onClick={() => setSelectedClip(item.id)} />)}</div>
    {/* 状态控制：显式样例留在预览之外，不污染默认节目区布局。 */}
    <div role="group" aria-label={t("toolBox.editorUi.previewStateChoice")} data-preview-state-choices className={styles.sampleActions}>{(Object.keys(SCENARIOS) as (keyof typeof SCENARIOS)[]).map(value => <span key={value} data-preview-scenario={value}><EditorAction label={t(`toolBox.editorUi.${SCENARIOS[value]}`)} pressed={scenario === value} onClick={() => setScenario(value)} /></span>)}<EditorAction label={t("toolBox.editorUi.sourcePreview")} pressed={source} onClick={() => setSource(!source)} /></div>
    {/* 空样板的时间由样板归零；正式黑场仍允许保留独立工程书签。 */}
    <ProgramPreview clip={scenario === "empty" ? null : scenario === "missing" && clip ? { ...clip, assetId: "missing-asset" } : clip} assets={assets} project={project} currentTime={scenario !== "empty" && clip ? clip.start + 2 + (id === "B" ? .25 : 0) : 0} state={state} mode={source ? "source" : "program"} onBack={() => setSource(false)} />
    {/* 素材控制：共用行外壳，但不拿此处高亮决定上方节目画面。 */}
    <ul className={styles.previewSampleMedia}>{DEMO_ASSETS.slice(0, 3).map(asset => <MediaItem key={asset.id} asset={asset} selected={selectedAsset === asset.id} onSelect={() => setSelectedAsset(asset.id)} />)}</ul>
  </section>;
}

// 公共入口追加在 UI-02/UI-03 样板后，不重建路由或第二份 AppShell。
// 同一组件实例化两次，能发现模块级选中值或图片错误 state 串用。
// sampleGrid 已有窄列重排，无需复制一套移动版节目样板。
// 标题由当前 i18n 决议，主题仍沿用现有原生媒体查询信号。
// 两种主题呈现同一份 DOM 与选择值，不依靠重新挂载换皮肤。
// 样板 page 已说明演示边界，这里不重复弹窗或假成功提示。
// UI-04 验收停在此处，不因样板能切片段就开启默认时间轴拖拽或属性提交。
// 此处不传任意 className 给公共预览，稳定几何仍由公共 CSS Module 管理。
export function EditorPreviewSamples() {
  const { t } = useTranslation();
  return <section><h2>{t("toolBox.editorUi.previewSamples")}</h2><div className={styles.sampleGrid}><PreviewSample id="A" /><PreviewSample id="B" /></div></section>;
}
