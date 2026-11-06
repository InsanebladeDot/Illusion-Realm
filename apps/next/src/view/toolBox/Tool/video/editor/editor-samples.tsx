"use client";

// 独立样板页验证 UI-02 的公共契约，状态说明不堆入默认编辑器画面。
// 两个实例各自维护草稿、选择与分组开合，不写入任何正式工程状态。
// 演示按钮只改变本地布尔值，不模拟导入、播放、保存或导出成功。
// 这里与工作区使用同一个素材行、控件和片段外框，不复制相似 JSX。
import { useState } from "react";
import Link from "next/link";
import { MousePointer2, Save } from "lucide-react";
import { useTranslation } from "@/i18n";
import { EditorAction, EditorFloatField, EditorGroup, EditorPlaceholder } from "./editor-controls";
import { EditorClipShell } from "./editor-clip-shell";
import { DEMO_ASSETS } from "./editor-demo";
import { DemoWaveform, MediaItem } from "./editor-panels";
// 素材区状态通过同一个面板注入，不复制 UI-02 的行或占位组件。
// 放在原控件样板之后，原有 A/B 草稿与片段选择生命周期保持不变。
// 此处只装配显式演示入口，默认工程不带状态切换工具。
import { EditorMediaSamples } from "./editor-media-samples";
// UI-04 只追加节目状态样板，原两组 A/B 的局部状态继续独立。
// 预览样板引用正式 ProgramPreview，不在样板页复制播放器外壳。
// 入口仍是当前组件状态预览路由，不新增全窗口遮罩或隐藏测试页。
import { EditorPreviewSamples } from "./editor-preview-samples";
// 属性样板复用正式检查器，回调和状态仅属于本页两个独立实例。
import { EditorInspectorSamples } from "./editor-inspector-samples";
import styles from "./editor.module.css";

// 一个实例就是一个测试作用域，绝不使用模块级 selected/open 变量。
// 复用同一素材对象也不意味着共用选中状态，身份由实例和资源分别管理。
// 长名只替换展示名称，不创建磁盘文件、不声称实际导入了该媒体。
// loading/error 明确由固定状态参数提供，不通过网络超时制造样例。
// 字段范围仅适用于这个演示秒数，与真实音量或视频参数无关。
// 锁定的音频片段用同一外框，禁用时不能改变另一个实例的选择。
// 使用两个可选片段验证公共实现，真实主时间轴的业务选择仍等待 UI-06。
// 每处未接通动作都有原生 disabled 和原因，不显示虚假的完成 toast。
function SampleInstance({ id }: { id: string }) {
  // 四类公共组件放在同一实例域中，便于同时观察各状态的归属。
  // A/B 仍各自执行 hooks，不把状态提升到父页后按名称共享。
  // 静态素材常量只读，修改展示名时创建副本，不污染默认工作区。
  // 这里只保存本页短生命周期值，不能作为正式编辑工程的数据结构。
  const { t } = useTranslation();
  // 素材像货架上的原件，片段像摆到工作台上的副本，两种选择分别记账。
  // 选片段不反选素材，选素材也不移动片段边框；A/B 又各持有独立状态。
  // 这些局部选择不进入正式项目，更不会更新节目预览或工程撤销记录。
  // 稳定 ID 作为状态，切换布局和折叠不会因列表位置变化串到别的条目。
  // 数值与开关仍由当前样板持有，共用控件只通知用户操作。
  const [selectedAsset, setSelectedAsset] = useState("scene-02"), [selectedClip, setSelectedClip] = useState("video");
  const [number, setNumber] = useState(1.25), [pressed, setPressed] = useState(false);
  return <section data-editor-sample={id} className={styles.sampleInstance}><h2>{id}</h2>
    <div className={styles.sampleActions}><EditorAction icon={MousePointer2} label={t("toolBox.editorUi.select")} pressed={pressed} onClick={() => setPressed(!pressed)} /><EditorAction icon={Save} label={t("toolBox.editorUi.unsaved")} /><EditorAction label={t("toolBox.editorUi.loading")} busy /></div>
    {/* 样板：字段草稿与折叠状态归当前实例，两个页面块互不污染。 */}
    <EditorGroup title={t("toolBox.editorUi.fades")}><EditorFloatField label={t("toolBox.editorUi.fadeIn")} value={number} unit="s" precision={2} min={0} max={30} onCommit={setNumber} /><EditorFloatField label={t("toolBox.editorUi.fadeOut")} value={0} unit="s" /></EditorGroup>
    {/* 素材样板：图片无封面与图片解码失败均走真实组件回退，不手绘占位。 */}
    {/* 背景项取消封面仅影响样板副本，默认工程和静态资源保持原样。 */}
    {/* 缺图行传坏字节而不是直接指定 missing，能实际验证图片错误事件。 */}
    {/* data 地址只含固定坏字节，不访问网络或用户文件，也不产生修复成功提示。 */}
    <EditorGroup title={t("toolBox.editorUi.media")}><ul className={styles.mediaList}>{DEMO_ASSETS.slice(0, 3).map(asset => <MediaItem key={asset.id} asset={{ ...asset, cover: asset.kind === "image" ? null : asset.cover, name: asset.id === "scene-01" ? "scene_01_long_filename_1920x1080_spring_landscape.mp4" : asset.name }} selected={selectedAsset === asset.id} onSelect={() => setSelectedAsset(asset.id)} />)}
      {(["loading", "missing", "error"] as const).map(state => <MediaItem key={state} asset={{ ...DEMO_ASSETS[0], id: `${id}-${state}`, cover: state === "missing" ? {src:"data:image/webp;base64,YnJva2Vu",width:1,height:1} : DEMO_ASSETS[0].cover }} state={state === "missing" ? "ready" : state} />)}
    </ul></EditorGroup>
    {/* 样板：不同媒体内容复用同一片段壳，所有坐标仍按 30 秒工程计算。 */}
    {/* 片段样板：两个内容槽共用选中壳，选择与上方素材状态互不覆盖。 */}
    {/* 锁定段无回调，仍保留原生禁用；演示选择不代表已接通剪辑命令。 */}
    <div className={styles.sampleLane}><EditorClipShell id={`${id}-video`} label="scene_02.mp4" start={0} end={12} duration={30} kind="video" selected={selectedClip === "video"} onSelect={() => setSelectedClip("video")}><span /></EditorClipShell><EditorClipShell id={`${id}-audio`} label="voice_01.wav" start={14} end={26} duration={30} kind="audio" selected={selectedClip === "audio"} onSelect={() => setSelectedClip("audio")}><DemoWaveform /></EditorClipShell><EditorClipShell id={`${id}-locked`} label={t("toolBox.editorUi.lock")} start={27} end={30} duration={30} kind="audio" selected={false} locked><span /></EditorClipShell></div>
    <EditorPlaceholder state="empty" message={t("toolBox.editorUi.empty")} />
  </section>;
}
// 样板输入：A/B 只作为实例名称，不是工程 ID，也不映射到磁盘文件。
// selected 初始为 scene-02，复用默认工作区同一份素材描述。
// 点素材只演示行高亮，正式预览仍是静态画面，不宣称已切换解码器。
// 点音频片段演示共享片段壳的另一内容类型，不触发声音播放。
// 数值默认 1.25 用来检验浮点精度，而不是提供真实片段参数。
// 淡入可编辑、淡出禁用，展示同一个字段如何由回调表达可用性。
// 可编辑字段采用 0–30 秒的明确范围，非法输入应保留并提示。
// 重置字段通过 Escape 完成，不需要一颗绑定空函数的假重置按钮。
// 按钮 pressed 是独立布尔状态，不和素材或片段选中混为一谈。
// 保存按钮故意不传回调，检验默认禁用边界是否在公共组件内生效。
// busy 按钮是固定状态样例，不能自动一秒后显示“处理完成”。
// 长名来自现有静态资源的展示副本，资源 URL 与真实媒体身份没有改变。
// 缺图样例不请求无效网址，因此不会污染浏览器控制台或依赖网络故障。
// error 样例表示不可用素材行，不能点击改变选中对象。
// loading 同时传入忙碌语义，读屏可区分等待与素材缺失。
// 额外状态行没有选择回调，避免把错误状态变成可操作的假资源。
// ready 行复用 MediaItem 的键盘按钮，和默认素材区采用同一命中规则。
// 三个状态不复制整套素材 JSX，只在调用处注入状态参数。
// 锁定片段占用真实时间坐标，但本轮没有解锁操作或轨道状态历史。
// 使用短片段展示文字省略，不通过缩小字号改变默认片段外壳规范。
// 空态是明确独立块，不用空数组让用户猜测是否正在加载。
// 两个实例显示相同空态文案，状态归属仍由各自 DOM 容器决定。
// 组件没有 useEffect 请求，不会因折叠、重开而产生重复媒体任务。
// 没有订阅 useClipEditor，演示选择不会写进旧版视频或 GIF 的草稿。
// 独立 useState 生命周期在路由离开后结束，进入正式编辑器不继承它。
// 样板不创建 FFmpeg job，也不需要访问用户输出目录。
// 真实工程保存、导出和命令撤销仍归后续业务接入，不能以 UI 演示替代。
// 公共类来自同一个 CSS Module，修正焦点和测量应同时影响 A/B 与正式区。

// 样板独立路由仍沿用同一个 AppShell，只有内容区滚动，不增加窗口控制。
// 禁用原因节点与默认工作区同名但从不同时挂载，页面内 ID 保持唯一。
// 返回链接使用现有路由，离开后本地草稿自然释放，不保存演示结果。
// 深浅主题使用同一 DOM 和语义变量，无需额外主题开关或内联滤镜。
export function EditorSamples() {
  const { t } = useTranslation();
  return <main data-editor-samples className={`${styles.host} ${styles.samplePage}`}><Link href="/tools/video/editor" className={styles.navigation}>{t("toolBox.editorUi.backToEditor")}</Link><Link href="/tools/video/editor/samples/project" className={styles.navigation}>{t("toolBox.editorUi.staticProject")}</Link><h1>{t("toolBox.editorUi.samples")}</h1><p>{t("toolBox.editorUi.sampleNotice")}</p><span id="video-editor-unavailable" className="sr-only">{t("toolBox.editorUi.unavailable")}</span><div className={styles.sampleGrid}><SampleInstance id="A" /><SampleInstance id="B" /></div><EditorInspectorSamples /><EditorMediaSamples /><EditorPreviewSamples /></main>;
}
// 页面入口由项目工作栏显式提供，用户可随时回到默认演示工程。
// 返回链接使用编辑器专属双语词条，避免把实际目标误写成工具箱。
// main 只表示此路由的内容，AppShell 的导航和标题栏没有被复制。
// 工具框架 workspace 模式省去普通工具返回栏，样板自行提供一个返回入口。
// 同一路由只挂载一个隐藏禁用说明，按钮的 aria-describedby 不会重名。
// 顶部说明明确交互只在本页生效，避免把输入变化当作正式项目修改。
// 宽屏两列用于对照独立性，窄屏流式一列保留相同组件。
// 样板比默认编辑器内容更长，由 host 负责纵向滚动而非挤压控件高度。
// 不使用全屏遮罩，应用其他导航仍能正常离开这个页面。
// 主题切换只更改语义变量，状态值与实例 ID 不随颜色变化重置。
// loading 动画遵守系统减少动态效果偏好，固定文案仍能说明等待。
// 截图只能证明当前样板状态和主题，不能据此宣称已实现多轨合成。
// 这一路由不接收任意外部参数，不能拿查询字符串冒充真实项目数据。
// 演示数据与正式 store 隔离，是后续 UI-03 接入真实素材前的明确边界。
