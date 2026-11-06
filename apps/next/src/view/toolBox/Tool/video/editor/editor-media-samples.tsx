"use client";

// 素材面板的独立状态样板，不参与默认演示工程或真实文件管理。
// 同时挂载两个实例，检验共享组件是否错误共用搜索或选中状态。
// 复用 UI-02 的行、按钮和占位；本文件只提供数据与场景开关。
// 所有资源来自随包图片，不读取用户路径，也不请求媒体探测服务。
// 样板控制是显式切换固定夹具，不是模拟异步导入成功。
// 场景离开后局部状态销毁，不写入工程或用户设置。
import { useState } from "react";
import { useTranslation } from "@/i18n";
import { EditorAction } from "./editor-controls";
import { DEMO_ASSETS } from "./editor-demo";
import { MediaPanel, type EditorMediaAsset } from "./editor-panels";
import styles from "./editor.module.css";

// 同一个长列表包含三种媒体，搜索和分类必须取交集。
// 第一个视频只在副本中改名，默认工程仍显示 scene_01.mp4。
// 超长名称保留完整 title，不能让文字撑宽缩略图槽或整个面板。
// loading 行固定等待，不会在几秒后假装探测成功。
// error 行固定不可用，即使列表存在也不能选择该行。
// 图片没有封面与整个文件不可用不同，缺封面仍允许选择。
// 音频没有封面属于正常展示，应继续使用同一个静态波形。
// 重复音频具有独立稳定 ID，选择其中一行不能高亮所有副本。
// 重复项用于让列表实际超出滚动槽，不增加默认工程素材数量。
// 这些条目不对应新磁盘文件，不应出现在真实最近导入记录。
// 数组中的旧对象只读复用，替换名称时用新对象，不修改共享常量。
// 编号只作为样例文件名的一部分，不被解释为帧号或时间线坐标。
// 数据定义在组件外避免输入每个字符时重新构造长列表。
// 不在这里缓存选中 ID，内容共享与交互状态共享是两回事。
// duration 为零或 null 的含义由行组件保留，不为样板另做格式化。
// 长列表末尾同样走 MediaItem 回调，滚动不会产生另一套选择实现。
// 显式类型保留可选 state，普通素材没有该字段时仍默认可用。
// 本数据不含绝对路径，因此不会把本机隐私文件名写入运行截图。
const EDGE_ASSETS: readonly EditorMediaAsset[] = [
  ...DEMO_ASSETS.map(asset => asset.id === "scene-01" ? { ...asset, name: "scene_01_long_filename_1920x1080_spring_landscape_final_revision_with_extended_location_camera_take_color_grade_version_and_original_source_reference_for_overflow_validation.mp4" } : asset),
  { ...DEMO_ASSETS[0], id: "probing", name: "probing.mp4", state: "loading" },
  { ...DEMO_ASSETS[0], id: "unavailable", name: "unavailable.mp4", state: "error" },
  { ...DEMO_ASSETS[2], id: "no-cover", name: "no_cover.png", cover: null },
  ...Array.from({ length: 12 }, (_, index) => ({ ...DEMO_ASSETS[3], id: `voice-${index}`, name: `voice_${index + 2}.wav` })),
];

// 固定场景用现有状态词条，不引入与真实媒体后端同名的命令。
// ready 恢复原五项，edge 专门展示异常行与滚动边界。
// empty 是真正传入空数组，与筛选后零结果分别验收。
// loading/error 属于整库状态，不能只改变一个素材缩略图。
// 每次场景切换都明确重新挂载本实例的面板，搜索回到确定起点。
// 这种重置只用于样板场景，默认面板筛选不会重新挂载或丢选择。
// 场景列表同时驱动按钮标签和 pressed，避免文案与实际样例不一致。
// 不用 setTimeout 把 loading 推进成 ready，避免伪造业务完成。
// 没有“重试成功”按钮，来源错误只作为可检查的静态状态。
// 场景 ID 是封闭联合，不接收 URL 或用户输入来读取任意文件。
const SCENARIOS = ["ready", "loading", "empty", "error", "edge"] as const;
const SCENARIO_LABELS = { ready: "mediaReady", loading: "loading", empty: "empty", error: "error", edge: "mediaEdge" } as const;

// A/B 各自保存场景，切换 A 不重置 B 的条件或选择。
// 面板内部保存查询与素材选择，样板只管理外部固定数据状态。
// 这像两个独立书架共用同款书签夹，每个夹子仍记自己的页码。
// 对应机制是分别挂载 MediaPanel，而不是在父组件共享 selected。
// 空库保留搜索工具外壳，真实导入按钮仍原生禁用。
// 整库等待/错误保留导入原因，不让场景切换启用真实业务。
// 场景按钮使用公共 EditorAction，焦点与主题外观同步主工作区。
// 素材区域高度由局部样板规则固定，只有结果槽滚动。
// 两实例使用可读 id 标记，测试无需依赖翻译或 CSS 哈希定位。
// key 只包含本实例场景，不因另一实例切换而改变。
// 选素材没有片段回调参数，不可能从样板误创建正式时间线片段。
// 这里不复用旧视频工具的真实导入状态，因为它有不同的副作用边界。
// 无封面素材仍传 onSelect 由面板处理，能验证异常与可用性的区别。
// 长列表只为 UI 验证，不声称覆盖大库分页、探测吞吐或媒体解码性能。
// JSX 装配沿用 sampleInstance 的公共边框，不创建无意义的卡片包装器。
// 组件卸载没有需要取消的请求、计时器或媒体播放资源。
function MediaPanelSample({ id }: { id: string }) {
  // 这里的场景值只决定传给面板的数据，不会改变面板的筛选算法。
  // ready 与 edge 的行集合不同，但两者都验证相同的 MediaItem 外壳。
  // loading/error 是整库状态，单行 state 则保留在 EDGE_ASSETS 中。
  // 选中状态由 MediaPanel 自己管理，父样板不读取或重写 selected ID。
  // key 让场景切换回到明确的演示起点，正式面板不会这样重置。
  // 场景按钮按下态来自这个局部状态，两个实例不会共享按下按钮。
  // 传空数组是空库的真实输入，不能用 CSS 隐藏五项来模拟空态。
  // 传入只读数组后，面板过滤不会修改 EDGE_ASSETS 的顺序或对象。
  // 每个场景都保留导入按钮，才能证明错误/空库没有误启用真实导入。
  // 面板高度由样式固定，结果槽滚动而不是让页面重复出现横向滚动条。
  // 这里不传 onSelect，素材选择仍在面板内部完成，不向工程广播。
  // 这说明展示组件可以在无业务接收方时独立呈现纯 UI 交互。
  // 场景标题和按钮使用翻译键，切换语言不会改变状态 ID。
  // 本函数没有异步副作用，卸载时不需要取消探测或播放任务。
  // 真实业务接入时可从外部传 assets 和回调，不应复制这套演示分支。
  const { t } = useTranslation();
  const [scenario, setScenario] = useState<typeof SCENARIOS[number]>("ready");
  return <section className={`${styles.sampleInstance} ${styles.mediaSample}`} data-editor-media-sample={id}>
    <h2>{t("toolBox.editorUi.media")} · {id}</h2>
    <div className={styles.sampleActions}>{SCENARIOS.map(value => <EditorAction key={value} label={t(`toolBox.editorUi.${SCENARIO_LABELS[value]}`)} pressed={scenario === value} onClick={() => setScenario(value)} />)}</div>
    <MediaPanel key={scenario} assets={scenario === "empty" ? [] : scenario === "edge" ? EDGE_ASSETS : DEMO_ASSETS} state={scenario === "loading" || scenario === "error" ? scenario : "ready"} />
  </section>;
}

// 此入口位于现有样板页，默认工作区不增加调试按钮或额外素材。
// 两实例渲染完全相同的组件，仅 id 和局部状态不同。
// 主题改变继续使用同一 DOM，不能靠两套深浅页面掩盖共享样式问题。
// 窄窗口由已有 sampleGrid 换成一列，不复制移动版素材面板。
// 每个实例内保留独立滚动槽，页面负责两个实例之间的纵向滚动。
// 顶部说明沿用样板页已有的业务边界声明，避免每行重复提醒。
// 标题使用双语词条，与 UI-02 的控件样板明确区分。
// 新样板放在原 A/B 之后，既有控件回归的定位与场景顺序不变。
// 返回默认编辑器仍使用页面原有入口，不额外创建另一套导航。
// 后续 UI-04 的节目状态不能因为这些素材样例通过就标为已完成。
export function EditorMediaSamples() {
  const { t } = useTranslation();
  return <section><h2>{t("toolBox.editorUi.mediaSamples")}</h2><div className={styles.sampleGrid}><MediaPanelSample id="A" /><MediaPanelSample id="B" /></div></section>;
}
