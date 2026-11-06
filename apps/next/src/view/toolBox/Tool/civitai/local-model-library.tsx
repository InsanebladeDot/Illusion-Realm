"use client";

// 本地模型库只改浏览与选择适配，不另建扫描服务或改变创建页模型列表。
// 官方根是 ComfyUI 分类；其下所有真实目录组成“我的分类”。
// 类比文件管理器：导航选择位置，卡片选择文件，两者不能共用目录作为身份。
// 搜索、资料补全和批量管理仍复用原业务，不能把切换目录当成模型加载。
// 三个面板分别滚动，宽屏常驻详情，窄屏继续使用既有 ResourceDialogShell。
// 目录里多份权重共享封面是现有规则，来源元数据仍按每个文件读取。
// 页面不直接访问磁盘；所有写操作继续经 preload 的固定业务接口。
// 外部文件管理器的修改需要重新扫描，不伪造实时文件监视能力。
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Boxes, ChevronRight, FolderInput, ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import type { LocalModelBatchResult } from "@illusion-realm/shared";
import { ResourceCoverImage } from "@/components/ResourceCoverImage";
import { useAppMainInset } from "@/hooks/use-app-main-inset";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useTranslation } from "@/i18n";
import { LocalModelSort, useSortedLocalModels, type ModelSortOrder } from "./local-model-sort";
import { publishModelLibraryLocation } from "@/stores/use-model-library-location-store";
import styles from "./local-model-library.module.css";
import { ModelLibraryWorkspace } from "./model-library-workspace";
import { ModelLibrarySearch, ModelLibraryViewModes } from "./model-library-controls";
import { ModelLibraryCard } from "./model-library-card";
import { ImagePreviewTrigger } from "@/components/ImagePreviewOverlay";
import { useLocalModelMetadata } from "@/hooks/use-local-model-metadata";
import type { LocalModelMetadata } from "@illusion-realm/shared";
import { getModelDisplayName } from "@/utils/localModelScanner";
import { formatBytes } from "@/utils/format";
import { formatShortDateTime } from "@/utils/dateTimeFormat";
import { modelDownloadApi, downloadErrorMessage } from "@/utils/model-downloads";
import { unwrapIpc } from "@/utils/ipcResult";
import { invalidateLocalImageSrc } from "@/utils/localImageSrcCache";
import { useToastStore } from "@/stores/useToastStore";
import { localLibraryFiles, modelFolderTree, type LocalLibraryFile } from "@/utils/local-model-tree";
import { ModelFolderNavigation } from "./model-folder-navigation";
import { LocalModelCategoryEditor } from "./local-model-category-editor";
import { LocalModelBatchDialog } from "./local-model-batch-dialog";
import { LocalModelMetadataDetails } from "./local-model-metadata-details";
// 批量面板共享当前筛选结果，不维护第二套本地模型卡片或扫描来源。
// 队列状态位于页面之外，返回本地模型页时可以继续查看执行结果。
// revision 同步详情读取，避免仅刷新列表而详情仍停在缺失 JSON 状态。
import { LocalModelRecoveryBatch } from "./local-model-recovery-batch";
// 两个入口按单个版本返回的结果同步 UI，避免同名模型之间串用资料。
// running 保护页面内的移动/删除入口，主进程目录锁继续负责跨入口互斥。
// 订阅原始标量，扫描对象更新不会重新创建批量队列。
// 不把进度写回 settings，用户数据落盘仍只发生在主进程来源保存器。
import { useModelRecoveryBatchStore } from "@/stores/use-model-recovery-batch-store";

import { modelRootLabel } from "./model-library-labels";
/**
 * 共享本地浏览的状态边界：
 * 扫描仍由现有设置 store 完成，不创建第二份目录扫描缓存。
 * 模型列表是扫描快照的适配结果，空态不能伪称磁盘里没有隐藏目录。
 * 重新扫描期间保留旧索引，让用户能看见当前内容而不是闪成空白页。
 * 扫描错误只展示错误提示，不擦除上次有效数据或重置搜索条件。
 * 官方分类先筛 rootCategory，再对完整相对目录做包含范围匹配。
 * 父目录命中全部后代权重，搜索文字不能把未选官方分类的模型带入结果。
 * 排序用新列表，不调整 settings.models 顺序，创建和 Agent 的消费者不受影响。
 * selectedPath 保留真实目录身份，详情渲染前再检查它仍属于过滤结果。
 * 筛选后对象消失时不展示旧详情，避免用户误操作当前看不见的模型文件。
 * detailsVisible 单独记录列布局，空态同样允许关闭而不是等选中卡片。
 * 关闭会清除阅读选择，但不会清理批量恢复 store 或取消已经开始的工作。
 * 切换目录只清理详情，不擅自展开此前关闭的面板或启动新的扫描。
 * showDetails 只由真实卡片点击调用，因此用户动作是恢复详情的唯一来源。
 * 移动成功后先刷新扫描，再从新路径反查根分类与完整目录层级。
 * 旧移动接口返回的末级 category 不足以重建嵌套路径，不能直接作为完整路径。
 * 如果扫描刷新失败，外层操作错误可见，不能显示假装目录已同步的成功状态。
 * logo 更换取消是正常分支，不弹错误提示，也不清理旧 logo。
 * 写入确实完成后才失效图片缓存，再触发扫描把新图回填至卡片。
 * 本地文件写权限由 preload 的窄接口校验，渲染层不拼任意 IPC 通道。
 * 批量恢复运行状态来自独立 store，页面切换后无需靠隐藏的卡片继续挂载。
 * 批量操作使用过滤后当前范围快照，搜索改变范围时旧勾选会清除。
 * 排序只改变显示顺序，不改变所选模型集合和文件身份。
 * 进入多选模式的选择与平常浏览点卡片打开详情是互斥交互。
 * 管理确认和风险判断继续沿用原 hook、对话框与主进程，不移入共享 Card。
 * 卡片路径文本已移除，但目录树、面包屑和资料页仍保留定位所需的真实目录。
 * 标题仅用于显示和读屏，所有磁盘操作回调都携带原扫描记录而非重建路径。
 * 内容详情的 revision 合并扫描、手动更新和批次结果，避免来源资料显示旧状态。
 * 只读路径不会触发 SHA-256 读取，用户打开详情不应意外对大文件做完整哈希。
 * 全选和清空按钮只操作当前可见范围，最终删除仍要求原确认步骤。
 * 组件卸载时原订阅 effect 会清理目录门牌，不留一个指向旧页面的全局标题。
 * 本次卡片文字精简不改变文件夹移动、删除、补全或创建页模型加载契约。
 */
function placeholderName(model: LocalLibraryFile) { return model.versions[0]?.filePath.split(/[/\\]/).pop() || model.name; }
type LocalLibraryModel = LocalLibraryFile;

// 浏览状态只属于本地库，筛选变化不改写全局扫描结果或真实目录。
// root 是 ComfyUI 官方类别，category 是该类别下的完整相对路径。
// 目录选择像给搜索划定书架：当前书架和所有下层书架的模型一起展示。
// 搜索与目录范围相交；名称命中不能把别的目录模型带进当前范围。
// 根切换重置目录，避免 LoRA 中的 Anima 路径误带到 Checkpoint。
// 分类层级不依赖 localLibraryCategory 的旧标签，不再跳过系列目录。
// 当前目录删除后仍允许通过面包屑退回，不自动跳进其他同名目录。
// 三个浏览条件采用交集：先定官方分类，再定目录，最后才匹配关键词。
// 例如选中 loras/Anima 后搜索 Base，checkpoints 中同名文件不能混进来。
// 父目录命中的是所有后代权重，而不是目录名称本身变成一张模型卡片。
// 全部类别的空根不是缺省 LoRA，它明确表示读取整个当前扫描索引。
// category 为空则包含该官方根的全部模型，保留直接放在根下的权重。
// 名称排序在 filter 创建的新数组上执行，不打乱 settings 中创建页的分组顺序。
// 升降序仅改变视图，文件完整 ID 不变，因此详情不会跳到另一张同名卡片。
// 搜索文本不用于文件系统路径拼接，也不会作为删除或移动的目标路径。
// 模型目录被外部改名后，需要原扫描器刷新；这里不假装实现文件系统监听。
// tree 与 filtered 读取相同的 rootModels，导航计数不会来自另一个扫描时间点。
// 目录树不受关键词影响，搜索无结果时用户仍可直接选择其他文件夹。
// 空关键词去掉过滤但不清目录，查找失败后仍能知道当前所在范围。
function useLocalLibraryFilters(models: LocalLibraryModel[]) {
  const roots = useMemo(() => [...new Set(models.map(model => model.rootCategory))].sort(), [models]);
  const [rootCategory, setRootCategory] = useState(""), [query, setQuery] = useState(""), [category, setCategory] = useState("");
  const rootModels = models.filter(model => !rootCategory || model.rootCategory === rootCategory);
  const tree = modelFolderTree(rootCategory ? rootModels : []);
  const needle = query.trim().toLowerCase();
  // 排序偏好是本地库视图状态，不回写 settings.models 的原始顺序。
  // 创建页和 Agent 读取同一个扫描索引，但不应继承这里临时的倒序排列。
  // 改目录保留排序习惯，进入下一层时仍按用户上一次选定的字段比较。
  // 改方向不改变 scope，所以已经勾选的模型不会因为位置变化而丢失。
  // 类别、目录和查询会改变 scope，确切目标范围变化时才重置多选。
  // view 继续只控制 CSS 密度，列表模式并不是另一套排序或数据来源。
  const [sort, setSort] = useState<ModelSortOrder>({ field: "name", direction: "asc" }), [view, setView] = useState("grid");
  const filtered = rootModels.filter(model => (!category || model.folder === category || model.folder.startsWith(category + "/")) && (!needle || `${model.name} ${model.folder}`.toLowerCase().includes(needle)));
  // 排序旁车只在用户选择标记时读取，扫描和补全 revision 决定何时刷新。
  // 数据更新沿用原 store，不因排序创建另一个补全任务或磁盘监视器。
  const scannedAt = useSettingsStore(state => state.lastScannedAt) || 0;
  const recovered = useModelRecoveryBatchStore(state => state.revision);
  // lastScannedAt 变化覆盖文件属性刷新，recovered 覆盖批量来源刚写入的变化。
  // 不用模型数量作为 revision，相同文件集的日期或触发词也可能发生变化。
  // 切换字段仍沿同一 filtered 范围，排序不能扩大到未选官方目录。
  // 已经提交的补全批次拥有独立快照，不读取这里后续改变的数组次序。
  // 标记读取只影响辅助排序状态，不能误改全局 scanning 或队列 running。
  // 失败由头部文字明确呈现，列表保留名称回退供用户继续浏览和重扫。
  // hook 返回新数组，settings 中创建页与 Agent 使用的分组顺序保持独立。
  const sorted = useSortedLocalModels(filtered, sort, scannedAt + recovered);
  function changeRoot(value: string) { setRootCategory(value); setCategory(""); }
  return { roots, rootCategory, query, category, filtered: sorted.models, sortLoading: sorted.loading, sortFailed: sorted.failed, tree, sort, setSort, view, setView, changeRoot, setQuery, setCategory };
}
// 模型列表永远只包含权重文件，文件夹入口统一放在左边目录树。
// 首次进入展示扫描到的所有文件，不需要先打开数层目录才能看到模型。
// 当前目录采用带斜杠的前缀匹配，style 不会错误包含 style-old。
// 空目录状态与没有配置任何模型的空库分别提示，不创造假文件夹。
// 分类、目录、搜索只是索引过滤，不会因为点击树而重新扫描硬盘。
// 名称、文件修改日期和大小来自真实扫描；标记只读本地已保存触发词。
// 视图密度只改变布局，卡片身份、模型顺序和选中状态保持不变。
// 全库目录尚未选择时也能搜索，选定官方分类后搜索范围随之收窄。
// 筛选器和目录树共用 changeRoot，根切换必定清空旧目录条件。
// 叶目录和父目录使用同一过滤规则，不维护第二种隐藏的直属文件模式。
// 展示数量取最终文件结果，不将分组数或文件夹数混作模型数。
// 搜索清空后仍留在当前目录，避免用户在大量模型中丢失浏览位置。

// 两个插槽只注入已接线的操作，头部不需要知道补全 store 的内部结构。
// management 保持独立选择生命周期，搜索组件本身不移动或删除任何文件。
// recovery 复用原有批量面板，位置改变不改变失败原因和停止语义。
// 详情不再持有管理入口，宽屏和窄屏因此都能用相同的两行工具栏。
// 官方类型的重复下拉已移除，左树仍保留全部类型入口和可见计数。
// 空关键词不等于全库，当前目录交集一直由过滤 hook 负责。
interface LocalLibraryFiltersProps {
  filters: ReturnType<typeof useLocalLibraryFilters>;
  onRootChange: (root: string) => void;
  recovery: ReactNode;
  management: ReactNode;
}
// 侧边导航和面包屑共用同一目录状态，输入框只负责搜索，不另存结果。
// 本地列表使用真正的相对路径分段，树节点不手写 Anima 或 Minimax 数据。
// 查询为空时按目录访问，查询非空时明示搜索仍在当前官方分类内。
// 所有按钮原生可聚焦，长路径视觉省略但保留完整 title，不只用图标表达层级。
function LocalLibraryFilters({ filters, onRootChange, recovery, management }: LocalLibraryFiltersProps) {
  const { t } = useTranslation();
  const title = filters.category.split("/").pop() || filters.rootCategory || t("toolBox.civitai.localTitle");
  return <header className={styles.catalogHeader} data-local-sort-status={filters.sortLoading ? "loading" : filters.sortFailed ? "failed" : "ready"}>
    {/* 中间页头：名称、真实层级和返回入口共用一行，不再显示营销介绍。 */}
    {/* 面包屑只修改浏览状态；返回工作台走既有工具页路由。 */}
    {/* 长目录名只截断外观，title 和辅助名称仍保留完整路径。 */}
    <div className={styles.catalogTitle}><Boxes size={19} /><h1 title={title}>{title}</h1><nav aria-label={t("toolBox.civitai.folderPath")}><button type="button" onClick={() => onRootChange("")}>{t("toolBox.civitai.myFolders")}</button>{[filters.rootCategory, ...filters.category.split("/")].filter(Boolean).map((name, index, all) => <span key={all.slice(0, index + 1).join("/")}><ChevronRight size={12} /><button type="button" title={name} onClick={() => filters.setCategory(all.slice(1, index + 1).join("/"))}>{name}</button></span>)}</nav><Link href="/tools" className={styles.back}><ArrowLeft size={13} />{t("toolBox.civitai.workspaceBack")}</Link></div>
    {/* 工具栏第一行：搜索和排序共用边框，批量入口独立放到右边。 */}
    {/* 官方分类继续由左树控制，移除重复下拉但不移除真实筛选条件。 */}
    {/* 搜索只过滤当前索引；打开排序菜单也不会启动模型匹配。 */}
    <ModelLibrarySearch query={filters.query} onChange={filters.setQuery} label={t("toolBox.civitai.localSearch")} placeholder={t("toolBox.civitai.localSearch")} trailing={<LocalModelSort order={filters.sort} onChange={filters.setSort} />} action={recovery} />
    {/* 工具栏第二行：移动和删除复用原多选流程，视图密度固定在最右。 */}
    {/* 两行都属于中心面板头部，不随详情滚动或窄屏隐藏而丢失入口。 */}
    {/* 三种密度复用同一张卡片，改变密度不改排序或当前选择。 */}
    <div className={styles.actionRow}>{management}<ModelLibraryViewModes view={filters.view} onChange={filters.setView} /></div>
    {filters.sortLoading && <p role="status" className="mt-2 text-xs text-muted-foreground">{t("toolBox.civitai.localSort.loading")}</p>}
    {filters.sortFailed && <p role="alert" className="mt-2 text-xs text-muted-foreground">{t("toolBox.civitai.localSort.failed")}</p>}
  </header>;
}

// 详情把“当前文件是什么”和“它在 C 站的资料”拆成连续两组，读取来源仍只有一套。
// 例如同目录两份权重共享 logo，但各自的文件名、触发词和来源版本不可互相借用。
// 文件名来自当前 versions 适配后的 model.name，显示后缀便于核对量化格式。
// 封面采用裁切填充参考图的横向区域，不让竖图在两边留下大块空白。
// 封面区域有固定比例，读取本地图时不会先把详情压扁再撑高。
// 文件信息尚无大小、日期字段，因此只展示真实名称和官方类型，绝不填演示数字。
// 来源模块的 sourceHeading 是外观参数，其内部 SHA-256 和恢复流程仍由原 hook 负责。
// 原生更换封面取消时返回空值，不算异常，也不会显示更换成功。
// 接口真正返回文件后才失效图片缓存与重扫，磁盘失败保留旧索引供重试。
// 分类按钮只展开原分类编辑器，点击它并不会立即移动模型或写用户设置。
// 多文件目录和含后代模型的目录都禁用该分类入口，防止移动整树误伤其他模型。
// 下方原始路径只用于用户核对，不把它变成一个可编辑的任意文件访问输入框。
// 宽屏详情滚动由外部面板拥有，弹窗详情滚动由 ResourceDialogShell 拥有。
// 组件自身不再设置视口最大高度，否则嵌套滚动会把底部管理按钮推离正确位置。
// 所有写操作异步异常都转换为现有用户文案，finally 保证恢复入口可用。
// 文件详情中的 SHA-256 只是读取数据展示，不会因为打开卡片就自动哈希大权重。
// 批量读取只在用户明确开始后执行，不能为填满详情而触发无感的全库网络访问。
// 资料或封面恢复会通过 revision 重读，保留已经挂载的 DOM 不等于读取永远不更新。
function LocalModelDetails({ model, revision, onMoved }: { model: LocalLibraryModel; revision: number; onMoved: (folder: string, category: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function changeLogo() {
    setBusy(true); setError("");
    try {
      const logo = unwrapIpc(await modelDownloadApi().changeModelLogo(model.filePath));
      if (logo) {
        await invalidateLocalImageSrc(logo);
        await useSettingsStore.getState().scanAllModels();
        useToastStore.getState().show(t("toolBox.civitai.transfer.logoChanged"), "success");
      }
    } catch (reason) { setError(downloadErrorMessage(reason)); }
    finally { setBusy(false); }
  }
  return <div className={styles.detailsBody} data-local-model-details>
    {/* 右侧详情：缩略图铺满固定预览框，避免竖图只占中间一小块。 */}
    {/* 填充只影响缩略图；点击后共享大图层仍完整展示原始图片比例。 */}
    {/* 沿用 ResourceCoverImage 的默认 cover，缺图占位和本地缓存保持原机制。 */}
    <div className="relative aspect-[2/1] overflow-hidden rounded-lg bg-muted"><ImagePreviewTrigger items={[{ key: model.id, filePath: model.iconPath, alt: model.name }]} index={0} className="absolute inset-0"><ResourceCoverImage cover={model.iconPath || ""} alt={model.name} placeholder={placeholderName(model)} fill /></ImagePreviewTrigger></div>
    <h3 className="break-words text-sm font-semibold">{model.name}</h3>
    <p className="text-xs text-muted-foreground">{model.folder || model.rootCategory} · {modelRootLabel(model.rootCategory) || model.rootCategory}</p>
    {/* 界面：按具体文件版本读取下载时保存的来源、触发词和简介。 */}
    {/* 文件信息：优先显示当前权重名称，完整路径放在下方文件详情中。 */}
    {/* 没有大小或日期字段时不从名字猜数字，资料来自同一个文件版本。 */}
    {/* 来源继续复用既有面板，标题通过参数注入，不复制另一套恢复 hook。 */}
    <section className="space-y-3 border-t border-border pt-4 text-xs"><h4 className="font-semibold">{t("toolBox.civitai.fileInfo")}</h4><dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-3"><dt className="text-muted-foreground">{t("toolBox.civitai.fileName")}</dt><dd className="break-all">{model.name}</dd><dt className="text-muted-foreground">{t("toolBox.civitai.localType")}</dt><dd>{modelRootLabel(model.rootCategory)}</dd></dl></section>
    <LocalModelMetadataDetails versions={model.versions} revision={revision} sourceHeading />
    {/* 界面：更换本地模型 logo，复用原生文件选择器 */}
    <button data-local-change-logo type="button" disabled={busy} onClick={() => { void changeLogo(); }} className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted disabled:opacity-50"><ImagePlus size={14} />{t("toolBox.civitai.transfer.changeLogo")}</button>
    {/* 界面：切换模型分类，移动整个文件夹；跨大分类只提供资源管理器入口 */}
    {model.folderFileCount > 1 && <p role="status" className="text-xs text-muted-foreground">{t("toolBox.civitai.folderOperationOnly")}</p>}
    <LocalModelCategoryEditor folderPath={model.filePath} disabled={busy || model.folderFileCount > 1} onBusyChange={setBusy} onMoved={onMoved} />
    {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    <div data-local-model-tags className="flex flex-wrap gap-1"><span className="rounded-full bg-sky-500/10 px-2 py-1 text-[10px] font-medium text-sky-700 dark:text-sky-300">{model.rootCategory}</span>{model.category && model.category !== model.rootCategory && <span className="rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground">{model.category}</span>}</div>
    <h4 className="text-xs font-medium">{t("toolBox.civitai.localFiles")}</h4>
    <ul className="space-y-2">{model.versions.map((version) => <li key={version.filePath} className="rounded-lg border border-border bg-muted/30 p-3"><p className="break-all text-xs">{version.name}</p><p className="mt-1 break-all text-[10px] text-muted-foreground">{version.filePath}</p></li>)}</ul>
  </div>;
}
// 详情 key 使用单文件 ID，同目录切换文件会卸载旧来源请求与旧下拉状态。
// revision 沿用扫描和补全的版本信号，落盘完成后允许读取更新的 sidecar。
// 修改 logo 仍是目录级封面动作，界面不会承诺每个版本独立封面。
// logo 变更成功后先清理本地图片缓存，再刷新索引，避免旧图残留。
// 用户取消选择图片不显示“更换成功”，只有返回真实路径才刷新。
// 错误文本通过已有错误转换处理，不把原生堆栈排进详情区。
// busy 的 finally 无论成功、失败、取消都会解除当前入口占用。
// 原分类编辑器只支持整目录移动，不适合直接绑定任意单文件卡片。
// 含兄弟或后代权重时禁用该入口，并在附近展示真实限制原因。
// 这项保护不禁用资料阅读、哈希补全或查看当前文件路径。
// 文件列表只呈现当前卡片的版本，不借用同目录其他模型的来源信息。
// 宽屏和弹窗使用相同详情组件，不维护两套可能不同步的编辑状态。

/**
 * 本地 Card 接入共享展示时保留以下区分：
 * model.id 是单个权重文件身份，model.filePath 是原业务管理目录，二者不能互换。
 * 两份模型共享同一文件夹封面时仍是两张文件卡片，不按图片相同合并它们。
 * 卡片标题使用扫描得到的文件名，文件夹名字不替代模型真实版本名称。
 * 本轮移除的是标题下面的路径说明，不是扫描索引中的 folder 或 filePath 字段。
 * 搜索仍能按目录命中，隐藏副标题不能让已有文件夹搜索能力消失。
 * 目录层级仍可从左树、顶部面包屑和模型详情核对，不需要每张卡片重复展示。
 * 图片缺失时仍由 ResourceCoverImage 提供文件名占位，卡片保持可点击。
 * 官方类型标记由 modelRootLabel 适配，不从 safetensors 后缀猜 LoRA 或主模型。
 * 用户开始多选前，卡片打开详情；开始管理后，同一区域只修改勾选集合。
 * 独立复选框与主按钮使用同一个 onSelect，避免看似选中却未进入实际批量目标。
 * 浏览态仍可以用键盘打开详情，不依赖图片加载完成或鼠标悬停事件。
 * 详情关闭后不取消扫描订阅，重新打开时还会读取最新 revision 的资料。
 * 模型补全结果保存在原 store，卡片共享不创建第二份补全进度。
 * 修改共享封面比例时要回归本地缺图和在线缺图，不能只验证有封面的主模型。
 * 卡片本身没有重命名、移动或删除入口，这些写操作仍需要原管理工具栏确认。
 * 搜索或排序后仍使用 model.id 作为 key，已选文件不会按它的新数组位置错配。
 * 排序切换不触发 showDetails，所以不会自动重新展开被用户关闭的第三列。
 * 局部展示去掉路径后，回调仍闭包携带完整模型对象，不从屏幕标题反推文件。
 * 共享 Card 不持久化选中项，父级卸载后的恢复规则沿用原页面状态边界。
 */
function LocalModelCard({ model, selected, selecting, onSelect, onDetails, summary }: { model: LocalLibraryModel; selected: boolean; selecting: boolean; onSelect: () => void; onDetails: () => void; summary?: LocalModelMetadata | null }) {
  const { t, locale } = useTranslation();
  const displayName = getModelDisplayName(model.name);
  // 基础系列只取已补全元数据，不用名称、目录或体积推测兼容关系。
  // 扫描版本就是当前卡片的单个文件，不能把同目录所有权重的体积相加。
  // 老文档可能尚未记录 bytes；只在实际有数值时使用既有格式化工具。
  // 触发词与长介绍继续留在右侧详情，列表只回答“是什么、属于哪类、多大”。
  // 文件后缀的隐藏只是展示规则，操作回调仍持有 model.id 与完整路径。
  // 排列顺序固定，缺失基础系列时省略，不凭空填成 Anima 或 SDXL。
  // 单独扫描的零字节文件允许显示 0 B，未知大小与零字节不是同一个状态。
  // 元数据尚在读取时先显示分类和大小，不阻塞整行可点击性。
  // 补全失败的反馈沿用原详情与批量补全面板，不在摘要里伪造成功标记。
  // 该组合没有额外副作用，切换排序只重排已有文件，不重新读取大型模型内容。
  // 若多个权重共享同一预览，摘要体积仍按每张卡片自己的版本记录显示。
  // 基础模型声明不会反向修改扫描器的 type，避免展示调整影响创建页可用模型。
  // 文件修改后的体积刷新仍需原扫描动作，本段代码不宣称提供实时文件监视。
  const bytes = model.versions[0]?.bytes;
  // 日期与排序采用同一份磁盘修改时间，不借用 C 站发布或资料补全时间。
  // 现有短日期工具按界面语言格式化，切换语言时不需要重新扫描。
  // 它对非法时间返回 null，旧索引缺字段时不会出现 Invalid Date。
  // 大小和日期都标明含义，避免将修改日期误读成基础模型版本号。
  // 文件体积仍来自当前版本，不能因为共用封面而借用相邻模型的大小。
  // 两个字段直接加入现有属性行，不新增第三行或改变紧凑缩略图高度。
  // 窄面板省略后的完整属性仍可通过共享卡片原有 title 查看。
  // 扫描后的外部文件修改仍需点重新扫描，这里不另建文件监听。
  // 显示日期不会修改扫描快照、文件时间或任何模型来源 JSON。
  // 未知体积继续省略；零字节保留真实 0 B，不能混为同一种状态。
  // 同一个 locale 同时决定文案与日期格式，避免中英文信息混排。
  // 短日期沿用项目已有的月日与时分；完整文件属性仍属于详情和系统文件信息。
  // 日期的本地化显示不参与排序，排序始终比较原始毫秒数。
  // 换句话说，显示是给文件贴标签，不能因为标签样式改变就调整文件的先后次序。
  // 只读属性的渲染没有异步操作，不会触发额外的磁盘或网络请求。
  // 补全元数据只负责前面的基础模型字段，不覆盖后面的大小和文件修改时间。
  // 旧索引缺少时间时不生成当前日期，避免看起来像刚下载的新文件。
  // 共享 Card 仍负责两行布局和点击回调，本地适配器只提供这组真实属性。
  const modified = formatShortDateTime(model.versions[0]?.modifiedAt, locale);
  const size = typeof bytes === "number" && Number.isFinite(bytes) && bytes >= 0 ? `${t("toolBox.civitai.localSort.size")} ${formatBytes(bytes)}` : "";
  const date = modified ? `${t("toolBox.civitai.localSort.date")} ${modified}` : "";
  const details = [summary?.baseModel, modelRootLabel(model.rootCategory), size, date].filter(Boolean).join(" · ");
  // 本地浏览像先选中书再看详情：封面与名称都只更新右侧资料。
  // 不传 previewItems，复用公共 Card 已有的普通点击分支，不另造本地卡片。
  // 有图、缺图、网格和列表使用同一回调，避免图片加载状态改变点击含义。
  // 管理模式仍由 selecting 选择原勾选回调，点击封面不会打开预览干扰批量操作。
  // 右侧 LocalModelDetails 保留共享预览触发器，查看大图只从详情图进入。
  return <ModelLibraryCard name={model.name} displayName={displayName} subtitle={details} overlay={<p>{displayName}</p>} listAttributes={details} selected={selected} onSelect={selecting ? onSelect : onDetails} pressed={selecting ? selected : undefined} label={selecting ? t("toolBox.civitai.batch.select", { name: displayName }) : `${t("toolBox.civitai.batch.details")} · ${displayName}`} attributes={{"data-local-model-card": "", "data-local-model-file": model.id}}
    cover={<ResourceCoverImage cover={model.iconPath || ""} alt={model.name} placeholder={placeholderName(model)} fill />}
    badges={<span data-local-model-tags className="rounded-full bg-slate-900/70 px-2 py-1 text-[9px] font-semibold text-white backdrop-blur-md">{modelRootLabel(model.rootCategory)}</span>}
    selectionControl={selecting ? <input data-local-model-checkbox type="checkbox" checked={selected} onChange={onSelect} aria-label={t("toolBox.civitai.batch.select", { name: model.name })} className="absolute right-2 top-2 h-4 w-4 accent-sky-600" /> : undefined} />;
}
// 单文件卡片继续复用原 ResourceCoverImage，缺封面仍有文件名占位。
// 没有另做模型图片缓存，避免本地索引刷新时创建重复的媒体实例。
// 文件名截断只影响外观，操作名称包含完整名字以供辅助阅读。
// 官方类型留在图片角标；完整目录可从详情核对，不在名称下面重复铺路径。
// data-local-model-file 保留确切文件身份，测试不再靠目录名猜选中了谁。
// 浏览状态点卡片打开详情，进入明确的移动或删除模式后才改为选中。
// 详情由整张卡片打开，移除重复文字入口，给封面和名称更多空间。
// 多选 checkbox 是受控值，不能出现视觉勾选但回调仍指向上一目录。
// 卡片 key 同样使用文件 ID，目录排序或搜索变化不会复用错误组件状态。
// 主卡片没有直接删除动作，必须先进入带确认的原批量业务。

// 搜索下方管理区只组织现有操作，不自己读取、移动或删除文件。
// 移动与删除仍保留各自确认流程，不能因视觉合并就跳过安全校验。
// 管理入口固定在中心头部，右侧长介绍滚动不会移动这些按钮。
// 多选辅助按钮只在进入明确模式后出现，浏览时不占中心网格空间。
// unsafe 仅阻止目录级写操作；退出、清空始终保留以免用户被锁在多选中。
// 批量补全的目标来自当前筛选快照，不悄悄处理整个模型根。
// 浏览状态仍由模型卡片打开详情，不需要在管理区重复一个详情按钮。
// 删除沿用红色文字和原确认流程，不在此处绕过回收站契约。
interface BatchToolbarProps {
  count: number; disabled: boolean; unsafe: boolean; mode: "move" | "delete" | null;
  onAll: () => void; onClear: () => void; onExit: () => void; onAction: (action: "move" | "delete") => void;

}
function LocalModelBatchToolbar({ count, disabled, unsafe, mode, onAll, onClear, onExit, onAction }: BatchToolbarProps) {
  const { t } = useTranslation();
  // 此处不通过 selectedPath 推断批量目标，右侧详情对象只供阅读。
  // 用户点移动或删除进入显式多选后，第二次点击才进入原确认弹窗。
  // 目录共享保护继续在实际动作入口复核，不能仅靠按钮视觉禁用。
  // 读取补全期间会阻止移动删除，但清空和退出不改变正在执行的任务。
  // 多选辅助区域只在当前模式存在时渲染，普通浏览时不挤占搜索高度。
  // 危险操作继续有文字说明，不能只凭红色图标让用户猜点击后果。
  return <div data-local-batch-toolbar data-local-selection-mode={mode || "browse"} className={styles.management}>
    {/* 中心管理区：选择状态属于当前范围，不与右侧当前详情对象混用。 */}
    {/* 三个辅助操作不受 unsafe 影响，选中共享目录后仍能取消或退出。 */}
    {mode && <div className={styles.selection}><p>{t("toolBox.civitai.batch.selected", {count})}</p><button type="button" data-local-select-all disabled={disabled} onClick={onAll}>{t("toolBox.civitai.batch.selectAll")}</button><button type="button" data-local-select-clear disabled={!count || disabled} onClick={onClear}>{t("toolBox.civitai.batch.clear")}</button><button type="button" data-local-select-exit onClick={onExit}>{t("toolBox.civitai.batch.exit")}</button></div>}
    {unsafe && <p role="status" className="mb-2 text-xs text-muted-foreground">{t("toolBox.civitai.folderOperationOnly")}</p>}
    {/* 第二行左侧仅保留移动和删除；补全入口已移到上方搜索旁边。 */}
    {/* 继续移动/删除仍要用户第二次确认，不能第一次切多选就改动磁盘。 */}
    <div className={styles.managementGrid}><button type="button" data-local-batch-move disabled={disabled || unsafe || mode === "delete" || (mode === "move" && !count)} onClick={() => onAction("move")}><FolderInput size={14} />{t(mode === "move" ? "toolBox.civitai.batch.continueMove" : "toolBox.civitai.batch.move")}</button><button type="button" data-local-batch-delete disabled={disabled || unsafe || mode === "move" || (mode === "delete" && !count)} onClick={() => onAction("delete")} className={styles.danger}><Trash2 size={14} />{t(mode === "delete" ? "toolBox.civitai.batch.continueDelete" : "toolBox.civitai.batch.delete")}</button></div>
  </div>;
}
// 两类写操作互斥，但不会因此阻止用户搜索、浏览或切换应用导航。
// 目录操作是否安全还会由选择 hook 和主进程再次检查，禁用样式不是授权。
// 批量补全通过上方独立插槽注入，管理组件不会持有补全队列。
// 组件不持有模型数组，确保另一个实例不会继承本实例的多选结果。
// disabled 源于扫描和补全真实状态，不能通过显示“完成”来解除忙碌。
// 原有卡片详情继续使用相同内容组件，不复制一份元数据缓存。
// 辅助行可自然换行，不挤压右边固定命中宽度的密度按钮。
// 稳定的 data 标记保留原操作回归，视觉重排不改变业务定位方式。


function useLocalModelSelection(filtered: LocalLibraryModel[], scope: string) {
  const [selection, setSelection] = useState<{ scope: string; paths: string[]; mode: "move" | "delete" | null }>({ scope, paths: [], mode: null });
  const [batch, setBatch] = useState<{ action: "move" | "delete"; models: LocalLibraryModel[] } | null>(null);
  const mode = selection.scope === scope ? selection.mode : null;
  const checked = filtered.filter((model) => !!mode && selection.paths.includes(model.id));
  function toggle(folder: string) { if (mode) setSelection({ scope, mode, paths: checked.some((model) => model.id === folder) ? checked.filter((model) => model.id !== folder).map((model) => model.id) : [...checked.map((model) => model.id), folder] }); }
  function finish(result: LocalModelBatchResult) {
    const failed = filtered.filter(model => result.items.some(item => !item.success && item.folderPath === model.filePath)).map(model => model.id);
    setSelection({ scope, paths: failed, mode: failed.length ? mode : null });
  }
  function open(action: "move" | "delete") {
    if (mode !== action) setSelection({ scope, mode: action, paths: [] });
    else if (checked.length && checked.every(model => model.folderFileCount === 1)) setBatch({ action, models: checked });
  }
  return { mode, checked, toggle, batch, finish, open, close: () => setBatch(null), all: () => { if (mode) setSelection({ scope, mode, paths: filtered.map((model) => model.id) }); }, clear: () => setSelection({ scope, mode, paths: [] }), exit: () => setSelection({ scope, mode: null, paths: [] }) };
}
// scope 同时覆盖官方根、目录、关键词，旧范围的勾选不会带进新范围。
// 选中保存在文件 ID 集合中，不能继续用目录路径合并兄弟模型。
// checked 从当前可见过滤结果还原，列表刷新后失效文件自动不参与操作。
// 切入移动或删除时先置空选择，避免上一种操作的目标被默默复用。
// 第二次点击“继续”才生成批次，用户有机会检查确切范围。
// 禁用多文件目录操作是 UI 保护，open 内也复核，不能只靠按钮变灰。
// 全选覆盖当前递归结果，侧栏分支收起不等于把后代移出搜索范围。
// 清空与退出继续可用，安全保护不能把用户锁在多选模式中。
// 批次拥有它开始时的目标快照，后续搜索不改写已经确认的任务。
// 部分失败以原生返回的目录重新映射到文件 ID，失败项可保留选择。
// 成功项不会留在错误选择中，防止重试时重复删除已完成目标。
// 目录级结果和文件级选择在此边界适配，不修改公共批量接口。

function useLocalLibraryData() {
  const scannedModels = useSettingsStore((state) => state.models);
  const paths = useSettingsStore((state) => state.paths);
  const models = useMemo(() => localLibraryFiles(scannedModels, paths), [scannedModels, paths]);
  const scanning = useSettingsStore((state) => state.scanning);
  const scan = useSettingsStore((state) => state.scanAllModels);
  return { models, scanning, scan };
}
// settings 的原分组供创建页继续使用，本地库只订阅并计算独立视图。
// useMemo 的输入包含 paths，修改检索根后不会继续沿用旧根分类。
// 扫描标志取自同一 store，工具栏和列表不会各显示一套忙碌状态。
// scanAllModels 的异常由页面操作边界接住，允许用户重新扫描。
// 初始加载和手动重新扫描不创建第二个下载或资料补全队列。
// 资料补全队列在 store 中拥有独立生命周期，切页不会被导航状态取消。
// 补全正在读文件时暂禁移动/删除，避免当前页把其目标提前移走。
// 这不是跨进程磁盘锁，其他入口和外部工具仍由主进程复核处理。
// 页面恢复时读取当前 revision，避免保留旧 DOM 才能维持补全结果。
// 没有真实模型路径时显示空态与设置入口，不提供虚构分类和文件。
export function LocalModelLibrary({ switcher }: { switcher: ReactNode }) {
  const { t } = useTranslation();
  const { models, scanning, scan } = useLocalLibraryData();
  const filters = useLocalLibraryFilters(models);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  // 空详情也能关闭；重新点模型才展开，扫描或切目录不会擅自抢回第三列。
  // 这个状态只控制阅读几何，不停止已经启动的补全、下载或扫描任务。
  const [detailsVisible, setDetailsVisible] = useState(true);
  const [detailsRevision, setDetailsRevision] = useState(0);
  // 门牌只跟随目录发布，搜索或排序不能让窗口标题反复跳动。
  // 发布者清理继续由公共 store 负责，页面不保留第二份路径草稿。
  useEffect(() => publishModelLibraryLocation([filters.rootCategory, ...filters.category.split("/")].filter(Boolean)), [filters.rootCategory, filters.category]);
  const scannedAt = useSettingsStore(state => state.lastScannedAt) || 0;
  // 批量每一项返回后递增 revision，资料部分保存时也允许详情读取。
  // 批量运行不依赖页面挂载，切回后从 store 获取最新的当前值。
  // 原有详情选择及扫描 revision 继续参与，保持手动补全的刷新行为。
  const recoveryRevision = useModelRecoveryBatchStore(state => state.revision);
  const recovering = useModelRecoveryBatchStore(state => state.running);
  const metadataRevision = detailsRevision + scannedAt + recoveryRevision;
  const { filtered } = filters;
  // 列表模式需要旁车摘要，网格模式不读取卡片暂时不会展示的文字资料。
  // 复用详情相同的批量读取接口，每批最多 200 个文件，不读取权重内容。
  // filtered 就像当前书架上的可见书目，先确定范围再读取对应的资料卡。
  const listMetadataPaths = filters.view === "list" ? filtered.map(model => model.versions[0]?.filePath).filter((value): value is string => !!value) : [];
  const listMetadata = useLocalModelMetadata(listMetadataPaths, metadataRevision);
  const metadataByPath = new Map(listMetadata.entries.map(entry => [entry.filePath, entry.metadata]));
  function showDetails(folder: string) { setSelectedPath(folder); setDetailsRevision(value => value + 1); setDetailsVisible(true); }
  const [error, setError] = useState(false);
  // 窄屏弹窗量真实 main 左边界，不能沿用公共外壳历史的 220px 导航常量。
  // 与 Agent 弹窗复用同一测量器，导航开合后各自读取当前布局而非猜测偏移。
  // 宽屏居中分支不使用此值，因此不改变确认图的三面板尺寸。
  const compactLeft = useAppMainInset();
  const selection = useLocalModelSelection(filtered, JSON.stringify([filters.rootCategory, filters.category, filters.query]));
  // 详情对象必须还在当前筛选里，避免改目录后留下一个不可见但可删除的目标。
  // 无匹配时保留用户选择的面板开关，不因结果变空而反复改变列宽。
  // metadataRevision 将扫描、手动读取与批量补全的更新合并为同一读取信号。
  // 恢复任务每完成一份文件即可刷新来源，不必等全部文件完成后才看到资料。
  // 扫描异常只标记扫描错误，不撤回已经持久化成功的补全资料或封面。
  // 批量补全占用期间禁用当前页目录写入，防止正在哈希的目标被页面移走。
  // 外部资源管理器改动仍可能发生，所以真正写操作仍要主进程再次核实路径。
  // 点“返回工作台”只路由导航，不会调用 selection.exit 或停止会话任务。
  const selected = filtered.find((model) => model.id === selectedPath);
  async function rescan() { setError(false); try { await scan(); } catch { setError(true); } }
  // 移动接口返回最终目录；重新扫描后从同一适配器还原完整层级。
  // 旧接口的 category 只是末级标签，不能用它跳转到 Anima 等父层之外。
  async function modelMoved(folder: string) {
    await scan();
    const state = useSettingsStore.getState();
    const moved = localLibraryFiles(state.models, state.paths).find(model => model.filePath === folder);
    if (moved) { filters.changeRoot(moved.rootCategory); filters.setCategory(moved.folder); }
    setSelectedPath(null);
  }
  async function batchFinished(result: LocalModelBatchResult) { selection.finish(result); setSelectedPath(null); await scan(); }
  return <ModelLibraryWorkspace local visible={detailsVisible} hasSelection={!!selected} onClose={() => { setDetailsVisible(false); setSelectedPath(null); }}
    sidebar={<><div className={styles.librarySwitch}>{switcher}</div><ModelFolderNavigation roots={filters.roots} models={models} root={filters.rootCategory} folder={filters.category} tree={filters.tree} onRoot={root => { filters.changeRoot(root); setSelectedPath(null); }} onFolder={folder => { filters.setCategory(folder); setSelectedPath(null); }} /><div className={styles.scanActions}><Link href="/settings">{t("toolBox.civitai.configure")}</Link><button type="button" onClick={() => { void rescan(); }} disabled={scanning}><RefreshCw size={13} className={scanning ? "animate-spin" : ""} />{t(scanning ? "toolBox.civitai.scanning" : "toolBox.civitai.scan")}</button></div></>}
    // 模型数量交给公共底栏放到右下角，开合按钮与分类状态由宿主独立维护。
    // 这里只传本地筛选后的计数，不把在线网络状态或扫描副作用混进展示组件。
    // 移除原来的第二份 footer，避免数量和状态提示在页面上重复出现。
    footer={t("toolBox.civitai.count", { count: filtered.length })}
    details={selected ? <LocalModelDetails key={selected.id} model={selected} revision={metadataRevision} onMoved={modelMoved} /> : <p className="px-6 py-12 text-center text-xs text-muted-foreground">{t("toolBox.civitai.localChoose")}</p>}>

      {/* 中心页头传入同一份 filtered，批量补全范围与眼前模型卡片一致。 */}
      {/* 排序只调整提交顺序，不添加或删除补全目标，也不重新启动队列。 */}
      {/* 进入移动/删除模式后禁用新补全，避免同时组织互相冲突的目录操作。 */}
      {/* 已在运行的补全仍可查看结果，不因现在搜索没有命中而变成孤儿任务。 */}
      {/* compactLeft 继续量真实 main，窄屏弹窗不会侵占应用导航区域。 */}
      {/* 后续写操作沿用原批量确认，不让搜索右边的小按钮绕过安全边界。 */}
      <LocalLibraryFilters filters={filters} onRootChange={root => {filters.changeRoot(root); setSelectedPath(null);}}
        recovery={<LocalModelRecoveryBatch models={filtered} disabled={scanning || !!selection.mode} compact compactLeft={compactLeft} />}
        management={<LocalModelBatchToolbar count={selection.checked.length} mode={selection.mode} disabled={scanning || recovering} unsafe={selection.checked.some(model => model.folderFileCount > 1)} onAll={selection.all} onClear={selection.clear} onExit={selection.exit} onAction={action => selection.open(action)} />} />
      {error && <p role="alert" className="px-4 text-xs text-red-600 dark:text-red-400">{t("toolBox.civitai.scanFailed")}</p>}
      {/* 模型列表：只滚动网格，页头工具栏和下方结果数量保持在面板边界内。 */}
      {/* 重新扫描保留旧索引供查看，aria-busy 说明数据正在更新而非假装空库。 */}
      <div className={styles.catalogScroll} aria-busy={scanning || listMetadata.loading}><div className={styles.modelGrid} data-local-model-grid data-view={filters.view}>{filtered.map(model => <LocalModelCard key={model.id} model={model} summary={metadataByPath.get(model.versions[0]?.filePath || "")} selecting={!!selection.mode} selected={selection.mode ? selection.checked.some(item => item.id === model.id) : selectedPath === model.id} onSelect={() => selection.toggle(model.id)} onDetails={() => showDetails(model.id)} />)}</div>{filtered.length === 0 && <p role="status" className="px-4 py-12 text-center text-xs text-muted-foreground">{t(models.length ? "toolBox.civitai.empty" : "toolBox.civitai.localEmpty")}</p>}</div>
    {selection.batch && <LocalModelBatchDialog {...selection.batch} onClose={selection.close} onFinished={batchFinished} />}
  </ModelLibraryWorkspace>;
}
// 导航和面包屑共用 filters 的回调，目录切换同步清除打开的文件详情。
// 当前文件不在过滤结果中时不渲染旧详情，避免搜索后误操作隐形目标。
// 移动完成后从最终扫描路径还原完整层级，不使用旧接口的末级标签跳转。
// 批量结果完成先清除详情，防止已删除文件继续保留可点击的动作。
// 重新扫描失败时显示就地错误，旧索引可继续查看但不伪称已经更新。
// 初始官方页计数使用全体文件数，不能因为尚未选分类就显示零模型。
// 当前目录只要后代存在模型就展示，只有范围确实为空才显示空态。
// 搜索确实没有命中才显示查询空态，和没有设置模型目录的空库区分。
// 窄屏详情沿用已有对话框焦点机制，本页不复制窗口级模态框。
// 小窗口先缩短侧栏，再将详情移入弹窗，绝不覆盖全局 nav。
// 中间面包屑和左侧目录树读取同一相对路径，不维护另一份文件系统。
// 分类修改与资料补全仍是独立业务，浏览组件只负责选定它们的输入对象。
