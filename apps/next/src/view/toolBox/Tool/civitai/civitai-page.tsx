"use client";

// 在线库与本地库共享工作区、搜索和卡片，远端筛选与分页仍使用原请求 hook。
// 两个页面切换时各自卸载，不能让在线筛选或详情选择污染本地模型状态。
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Boxes, LoaderCircle } from "lucide-react";
import { SimpleSelect } from "@/components/SimpleSelect";
import { useTranslation } from "@/i18n";
import { CIVITAI_SOURCES, civitaiInput, type CivitaiFilters, type CivitaiModel } from "@/utils/civitai";
import { CivitaiCard } from "./civitai-card";
import { CivitaiDetails } from "./civitai-details";
import { CivitaiSidebar } from "./civitai-sidebar";
import { useCivitaiModels } from "./use-civitai-models";
import { LocalModelLibrary } from "./local-model-library";
import { useSettingsStore } from "@/stores/useSettingsStore";
// 名称与摘要使用同一纯数据匹配器，所有卡片共享一份本地证据集合。
// 元数据 hook 已处理每批上限、读取失败和卸载后的过期响应，不在页面复制请求循环。
import { findLocalCivitaiMatch, hasLocalCivitaiName, localModelHashes, localModelNamePairs } from "@/utils/civitai-local-models";
import { useLocalModelMetadata } from "@/hooks/use-local-model-metadata";
import { useCatalogScrollLoad } from "./use-catalog-scroll-load";
import { ModelLibraryWorkspace } from "./model-library-workspace";
import { ModelLibrarySearch, ModelLibraryViewModes } from "./model-library-controls";
import styles from "./local-model-library.module.css";

/**
 * 在线库的请求和选择生命周期：
 * useCivitaiModels 仍是唯一列表请求入口，公共工作区不重复获取同一批模型。
 * 类型、基础系列、名称、排序、来源和内容偏好都继续进入原请求条件。
 * 只改 UI 宿主不能跳过原 hook 的请求取消、旧响应隔离和错误状态。
 * INITIAL_FILTERS 保留原默认 LoRA 与下载量排序，不用本地目录作为远端默认值。
 * INITIAL_BASES 只是已知快捷选项，不是远端全部支持系列的权威枚举。
 * 结果出现其他系列时会合并到 bases，避免已显示卡片的系列无法从侧栏选中。
 * 当前 filters.base 也参与合并，翻页没返回该系列时仍保留用户选项。
 * 工具栏 query 是未提交草稿，不因修改排序就隐式提交正在输入的名字。
 * 提交时 civitaiInput 继续识别原站点链接，不能用新外观破坏直达模型功能。
 * 转换后的 query 回写输入框，用户能看到实际提交的文字而不是另一份隐藏条件。
 * 排序 SimpleSelect 只发送接口支持的枚举，本地日期和大小比较不参与远端结果。
 * 更新筛选先清阅读对象，防止当前站点变化后旧模型仍留在详情可下载。
 * 清阅读对象不会强制展开第三列，用户关闭后的空间分配应持续有效。
 * 选中卡片同时指定模型和展开状态，因此关闭后可以点同一个模型恢复。
 * 详情以 model.id 为 key，换模型不能继承上一个模型正在编辑的下载草稿。
 * 同一模型内的版本选择仍归 CivitaiDetails，公共层不代替它决定封面与文件。
 * selected 的生命周期在当前在线页内，本地模型选择不会与网站 ID 混在一起。
 * 模型库切换卸载当前业务页面，传入的 switcher 只是同一组按钮的展示位置。
 * 内容偏好使用 key 触发在线页重建，旧详情和在途结果不能留给新偏好继续展示。
 * 目录保留 data-civitai-catalog，滚动 hook 仍测量这个真实可滚动元素。
 * 固定页头不是滚动容器，不能把 wheel 监听错误接到整个应用外壳。
 * useCatalogScrollLoad 负责按用户向下浏览继续分页，不因为初始空余空间自动翻完整库。
 * next 仍来自原请求结果，公共卡片和网格不自己猜下一页 URL。
 * 错误保留重试入口与已拿到的卡片，不把第二页失败渲染成整个库为空。
 * 加载指示位于目录尾部，用户能区分还在请求和已经显示完毕。
 * 只有 ready 且没有模型时展示无结果，loading 阶段不提前显示一个假的空库结论。
 * 固定计数是已加载模型数，不冒充远端匹配的总记录数。
 * 本地匹配标签读取同一个 settings.models 快照，不逐张卡片重新扫描模型目录。
 * 匹配集合用 useMemo 随索引变化更新，下载完成后仍沿原扫描链更新标记。
 * 远端 CivitaiImage 继续执行内容过滤和缺图回退，三栏布局不能绕过原图片策略。
 * 卡片统计由在线适配器提供，公共卡片不直接消费整个网站响应对象。
 * 页头返回入口使用现有工具路由，不新建另一个应用导航或窗口控制栏。
 * 共享外壳只改变几何，本地移动、在线下载和来源密钥仍分别属于原业务模块。
 * 如果后续增加线上筛选项，应修改请求条件与原 hook，不在 Card 点击时临时请求补丁。
 * 本页没有新的全局状态容器，搜索条件不会污染创建页当前正在使用的主模型。
 * 验证远端请求映射可以用本地响应夹具，但网站连通性仍须真实网络另行验证。
 */
/**
 * 目录页组件分工与状态恢复说明：
 * ModelToolbar 只组织标题、输入草稿、远端排序和提交动作。
 * 模型库的 view 存在 OnlineModelLibrary，切本地后不会覆盖本地网格密度。
 * ModelCatalog 负责结果网格和分页尾部，不负责模型详情选择。
 * useCivitaiModels 仍拥有请求加载状态和分页游标，组件卸载由 hook 清理请求。
 * 滚动分页观察当前 catalog 元素，不读取侧栏或 app main 的滚动位置。
 * CivitaiSidebar 只输出来源和筛选意图，搜索提交由工具栏草稿单独负责。
 * ModelLibraryWorkspace 只负责容器位置，传入的 switcher 与本地入口保持一致。
 * 单个 CivitaiDetails 拥有版本切换、预览和下载表单，不在页级复制其状态。
 * 菜单内的顺序选项仍是网站支持字段，不传本地文件修改时间或 SHA256。
 * 切换基础模型筛选后清除旧选中项，不让选中状态悬挂到过滤结果之外。
 * 用户关闭面板后，分页加载、搜索和来源变化都不会抢回已释放列宽。
 * 在线结果选中后详情重新显示；关闭它后同一个卡片可以再次打开。
 * 窄屏弹窗与宽屏第三列使用同一 details 节点，减少文件选择表单出现两个副本的风险。
 * 偏好变化触发本页 key 变化，旧网络请求即使返回也不能覆盖新的内容权限状态。
 * 接口失败保留已有模型，重试继续使用原 next 游标而不是回到假第一页。
 * 当次结果数只能表示已载入数量，底部不显示未经接口返回的全站总量。
 * 浅色和深色都使用共享面板变量，在线页不再保留旧的独立白色卡片调色板。
 * 远端侧栏折叠只收拾导航可见面积，不提交新过滤条件或启动新的请求。
 * 页面没有本地生成业务，点击模型卡只打开来源详情，不会启动 ComfyUI。
 * 点击下载仍在详情中选择版本和目的分类，外观复用不改变写文件的安全边界。
 * 全量下载生命周期不由显示布局决定，详情关闭不会删除或暂停全局下载任务。
 * 无图模型仍渲染同尺寸卡片，视觉空白由 CivitaiImage 原组件负责。
 * 统计标题走翻译表，数字格式按当前 locale 转换成紧凑计数。
 * 网站分类的 badge 只提供识别提示，实际搜索过滤始终由官方参数接口负责。
 * 来源受限列表仍由 CIVITAI_SOURCES 管理，UI 重排不能开放任意 URL 输入。
 * 共享内容检查以原偏好快照为准，当前任务只改变边栏和卡片的展示结构。
 * 当同一个 ID 在新分页再次出现时 React key 会稳定复用该模型，而非产生重复卡片。
 * 卡片顺序由服务器响应决定，本页不再单独执行名称或系列排序。
 * 如果用户快速更换条件，请求 hook 的竞态处理继续负责丢弃过期结果。
 * 初始静态导出只包含页面骨架，数据仍在客户端按原 hook 加载并展示加载状态。
 * 这几种局部状态分散在拥有它们的组件中，能避免单一“模型库状态”跨业务污染。
 * 在线截图测试拦截远端响应，仅检查 UI 条件映射，不声称实时 Civitai 服务通过。
 * 模型图片的网络访问也使用测试协议夹具，真实用户请求依然由原图像组件发起。
 * 返回工作台保持原路由，折叠侧栏状态不影响全局 Sidebar 展开宽度。
 * 更换业务来源时先更新过滤再由 React 重绘，不能把上一来源的详情当作成功结果。
 * 页面组织层不依赖新 CSS className 规则覆盖子组件，视觉由共用模块负责。
 */
const INITIAL_FILTERS: CivitaiFilters = { source: CIVITAI_SOURCES[0], query: "", type: "LORA", base: "", sort: "Most Downloaded" };
const INITIAL_BASES = ["Anima", "Krea 2", "ZImageTurbo", "Illustrious", "Flux.1 D", "Pony"];
interface ToolbarProps { filters: CivitaiFilters; onChange: (filters: CivitaiFilters) => void; view: string; onView: (view: string) => void }
function ModelToolbar({ filters, onChange, view, onView }: ToolbarProps) {
  const { t } = useTranslation(), [query, setQuery] = useState(filters.query);
  function submit() { const next = civitaiInput({ ...filters, query }); setQuery(next.query); onChange(next); }
  return <header className={styles.catalogHeader}>
    {/* 在线目录页头：与本地同一层级和搜索控件，远端排序注入自己的有效选项。 */}
    {/* 输入保留草稿，只有提交才发送请求；侧栏筛选不会读取未提交文本。 */}
    <div className={styles.catalogTitle}><Boxes size={19} /><h1>{t("toolBox.civitai.title")}</h1><Link href="/tools" className={styles.back}><ArrowLeft size={13} />{t("toolBox.civitai.workspaceBack")}</Link></div>
    <ModelLibrarySearch online query={query} onChange={setQuery} label={t("toolBox.civitai.search")} placeholder={t("toolBox.civitai.searchPlaceholder")} onSubmit={submit}
      trailing={<SimpleSelect value={filters.sort} onChange={sort => onChange({ ...filters, sort })} ariaLabel={t("toolBox.civitai.sort")} options={[{ value: "Most Downloaded", label: t("toolBox.civitai.popular") }, { value: "Newest", label: t("toolBox.civitai.newest") }, { value: "Highest Rated", label: t("toolBox.civitai.rated") }]} className="w-32 shrink-0" triggerClassName="!rounded-none !border-0 !border-l !bg-transparent !text-xs" />}
      action={<button type="submit" className="bg-primary text-primary-foreground">{t("toolBox.civitai.search")}</button>} />
    <div className={styles.actionRow}><ModelLibraryViewModes view={view} onChange={onView} /></div>
  </header>;
}
function ModelCatalog({ models, selected, select, status, next, load, view }: ReturnType<typeof useCivitaiModels> & { selected: CivitaiModel | null; select: (model: CivitaiModel) => void; view: string }) {
  const { t } = useTranslation();
  const localModels = useSettingsStore(state => state.models);
  // 先用扫描器已有的目录和文件名，不能只比较 basename 误认其他模型。
  // 标题与文件前缀都满足时立即标为严格同名，不等待摘要来源读取。
  // 这份集合按本地索引更新复用，切换网格、选中卡片不会重复扫描。
  const localNames = useMemo(() => localModelNamePairs(localModels), [localModels]);
  // 只有当前远端结果里存在名称不匹配项，才需要读取已有来源 JSON 做摘要回退。
  // 没有远端结果时不打开本地来源文件；不为模型列表的骨架阶段付出读取成本。
  // 所有名称都严格一致时也无需读取 JSON，保留用户要求的名称优先路径。
  // 已改名模型的来源可能位于任何本地分组，因此摘要回退不能仅限同名目录。
  const needsHashes = models.some(model => !hasLocalCivitaiName(model, localNames));
  // 扫描时间在下载或批量补全收尾后变化，同路径下新写的 JSON 也能重新读取。
  // 不监听每条批量进度去重读全库，避免一个批次变成模型数平方级的来源读取。
  // 用户手工修改 JSON 后可重新扫描或重新进入在线页，不引入文件监视器。
  const scannedAt = useSettingsStore(state => state.lastScannedAt) || 0;
  // 这里只传已扫描的真实文件路径，主进程仍会复核目录授权和来源大小。
  // 文件列表使用权重作为 sidecar 身份，但只读接口不会读取权重内容。
  // 同路径去重和每批最多 200 项继续由 useLocalModelMetadata 处理。
  // 不能只读取本页同名文件：哈希回退就是为了识别目录和文件都已改名的模型。
  // 来源读取与远端列表请求各有生命周期，某个来源不存在不应取消网站搜索。
  // 多个版本的 sidecar 分别绑定到文件，不能使用目录里的第一份 JSON 代表整组。
  const metadataPaths = needsHashes ? localModels.flatMap(model => model.versions.map(version => version.filePath)) : [];
  const metadata = useLocalModelMetadata(metadataPaths, scannedAt);
  // 等待、失败或来源缺失时集合为空，不沿用上一个扫描版本的成功证据。
  // 远端分页和排序不改变本地路径集合时，hook 的请求键不变，不重复读取。
  // 摘要集合仅保存字符串，卡片间共享，不为每一张卡片发一次 IPC。
  // 匹配提示不会触发 recoverLocalModelMetadata，也不会自动补资料或计算 SHA256。
  // 临时隐藏哈希角标比保留旧角标可靠：用户删除模型后不能还看到上次的拥有状态。
  // 来源回退只从当前配置读取，切换到另一模型根后旧集合不能继续作为证据。
  // 这份本地证据没有包含绝对路径的 DOM 属性，卡片只接收判定类型。
  const localHashes = useMemo(() => localModelHashes(metadata.entries), [metadata.entries]);
  const container = useCatalogScrollLoad({ next, status, load });
  // 本地证据状态独立于远端请求状态，失败不影响浏览或下载。
  // 等待 JSON 时不显示哈希匹配；自动化也据此避免在结果尚未读取时误判未命中。
  // 扫描与来源读取是两个阶段；空路径的 ready 不能说明启动扫描已经结束。
  // 单独保留扫描完成标记，让回归能等到真实本地索引，而不是只看到远端卡片。
  return <div ref={container} data-civitai-catalog data-civitai-local-scanned={scannedAt > 0} data-civitai-local-state={metadata.loading ? "loading" : metadata.failed ? "error" : "ready"} aria-busy={status === "loading"} className={styles.catalogScroll}>
    {/* 在线结果：相同网格与 Card 保留远端身份，目录没有伪装成本地文件夹。 */}
    {/* 分页仍由原滚动 hook 驱动，换成三面板不应自动遍历整个远端库。 */}
    {models.length === 0 && status === "ready" && <p className="py-12 text-center text-sm text-muted-foreground">{t("toolBox.civitai.empty")}</p>}
    {/* 在线标记：严格同名与已保存摘要一致分别注入，不把显示状态当作安装或生成动作。 */}
    {/* 摘要读取失败只隐藏未确认标记，网站结果、详情和下载入口保持可用。 */}
    <div className={styles.modelGrid} data-model-library-grid data-view={view}>{models.map(model => <CivitaiCard key={model.id} model={model} localMatch={findLocalCivitaiMatch(model, localNames, localHashes)} selected={selected?.id === model.id} onSelect={() => select(model)} />)}</div>
    <div data-civitai-pagination role="status" className="flex min-h-12 items-center justify-center gap-2 py-4 text-xs text-muted-foreground">{status === "error" ? <button type="button" onClick={() => { void load(next); }} className="rounded-lg border border-border px-4 py-2 hover:bg-muted">{t("toolBox.civitai.retry")}</button> : status === "loading" ? <><LoaderCircle size={14} className="animate-spin" aria-hidden="true" />{t("toolBox.civitai.loading")}</> : next ? t("toolBox.civitai.scrollMore") : models.length > 0 ? t("toolBox.civitai.allLoaded") : null}</div>
  </div>;
}
function OnlineModelLibrary({ switcher, allowNsfw }: { switcher: ReactNode; allowNsfw: boolean }) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [selected, setSelected] = useState<CivitaiModel | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(true), [view, setView] = useState("grid");
  const requestFilters = useMemo(() => ({ ...filters, allowNsfw }), [filters, allowNsfw]);
  const catalog = useCivitaiModels(requestFilters);
  const bases = useMemo(() => [...new Set([...INITIAL_BASES, filters.base, ...catalog.models.flatMap(model => model.baseModels)])].filter(Boolean).sort(), [catalog.models, filters.base]);
  function updateFilters(next: CivitaiFilters) { setSelected(null); setFilters(next); }
  function select(model: CivitaiModel) { setSelected(model); setDetailsVisible(true); }
  return <ModelLibraryWorkspace visible={detailsVisible} hasSelection={!!selected} onClose={() => { setSelected(null); setDetailsVisible(false); }}
    sidebar={<CivitaiSidebar switcher={switcher} filters={filters} bases={bases} onChange={updateFilters} />}
    // 在线计数与网络状态仍由原查询提供，公共底栏只负责右侧对齐。
    // 左下角开合按钮与本地同一份实现，不在来源适配器再建另一套开合状态。
    // 请求状态变化只更新文字，不重置侧栏和模型区的滚动位置。
    footer={<>{t("toolBox.civitai.count", { count: catalog.models.length })} · {t(catalog.status === "loading" ? "toolBox.civitai.loading" : catalog.status === "ready" ? "toolBox.civitai.ready" : "toolBox.civitai.requestFailed")}</>}
    details={selected ? <CivitaiDetails key={selected.id} model={selected} source={filters.source} /> : <p className="px-6 py-12 text-center text-xs text-muted-foreground">{t("toolBox.civitai.choose")}</p>}>
    {/* 共享宿主只接收已确定的业务插槽，不接管远端请求或下载队列。 */}
    {/* 空详情可以关闭，后续搜索保留关闭状态，直到用户明确点一张卡。 */}
    <ModelToolbar filters={filters} onChange={updateFilters} view={view} onView={setView} />
    <ModelCatalog {...catalog} selected={selected} select={select} view={view} />
  </ModelLibraryWorkspace>;
}

export function CivitaiPage() {
  const { t } = useTranslation();
  const allowNsfw = useSettingsStore((state) => state.civitaiContentAccess.enabled);
  const [view, setView] = useState("online");
  const switcher = <div className="flex w-fit shrink-0 gap-1 rounded-lg border border-border bg-muted/40 p-1">{["online", "local"].map((value) => <button key={value} type="button" data-model-library={value} aria-pressed={view === value} onClick={() => setView(value)} className={`whitespace-nowrap rounded-md px-3 py-2 text-xs ${view === value ? "bg-background text-sky-700 shadow-sm dark:text-sky-300" : "text-muted-foreground hover:text-foreground"}`}>{t(value === "online" ? "toolBox.civitai.online" : "toolBox.civitai.local")}</button>)}</div>;
  return <div className="flex h-full min-h-0 min-w-0 flex-col">
    {/* 界面：模型库共用标题栏与切换入口 */}
    {/* 内容偏好变化时重新挂载在线库，立即清空旧封面、详情与在途请求。 */}
    {view === "online" ? <OnlineModelLibrary key={String(allowNsfw)} allowNsfw={allowNsfw} switcher={switcher} /> : <LocalModelLibrary switcher={switcher} />}
  </div>;
}
